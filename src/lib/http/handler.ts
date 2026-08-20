import { NextResponse } from 'next/server';
import { z } from 'zod';
import { AppError, type ErrorCode } from '../errors';
import { RateLimitedError, rateLimit, type LimitScope } from '../rate-limit';
import { logger, reportError } from '../logger';
import { kvGet, kvSetNx, kvSet } from '../redis';
import { getRequestContext, subnetOf, type RequestContext } from './context';
import { can, type Action, type Resource } from '@/modules/auth/policies';
import { getSetting } from '@/modules/tenancy/settings';
import type { SessionContext } from '@/modules/auth/session';

/**
 * docs/09-api.md §1 — one wrapper so the order can never drift:
 *   authorize() → rateLimit() → zod.parse() → service() → serialise
 *
 * Every route handler and every Server Action goes through this. A Server
 * Action is a public endpoint, not an internal call (docs/12 §5).
 */

export type Auth =
  | { mode: 'public' }
  | { mode: 'session' }
  | { mode: 'permission'; action: Action; resource?: (input: { params: Record<string, string> }) => Resource };

export type HandlerContext<TBody, TQuery> = {
  request: Request;
  body: TBody;
  query: TQuery;
  params: Record<string, string>;
  ctx: RequestContext;
  session: SessionContext;
};

export type PublicHandlerContext<TBody, TQuery> = Omit<HandlerContext<TBody, TQuery>, 'session'> & {
  session: SessionContext | null;
};

export type RouteConfig<TBody, TQuery> = {
  auth: Auth;
  limit?: LimitScope;
  /** Chooses the rate-limit subject; defaults to user id, else client IP. */
  limitSubject?: (ctx: RequestContext) => string;
  body?: z.ZodType<TBody, z.ZodTypeDef, unknown>;
  query?: z.ZodType<TQuery, z.ZodTypeDef, unknown>;
  /** POST/PATCH/DELETE require a same-origin request unless explicitly opted out. */
  csrf?: boolean;
  /** Requires an Idempotency-Key header and replays the stored result. */
  idempotent?: boolean;
  /** Personal data — forces private, no-store, Vary: Cookie. */
  personal?: boolean;
  /** Blocked while platform.readonly is on. */
  mutates?: boolean;
  /**
   * Derives an ETag from the result. When the request carries a matching
   * If-None-Match the wrapper answers 304 with no body (docs/09 §7).
   */
  etagOf?: (result: unknown) => string | null;
  /** Cache-Control for non-personal responses that may be revalidated. */
  cacheControl?: string;
};

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function errorResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof RateLimitedError) {
    return NextResponse.json(
      { error: { code: 'RATE_LIMITED', message: error.message, requestId } },
      {
        status: 429,
        headers: {
          'retry-after': String(error.retryAfter),
          'ratelimit-limit': String(error.result.limit),
          'ratelimit-remaining': '0',
          'ratelimit-reset': String(error.result.resetSeconds),
          'cache-control': 'no-store',
        },
      },
    );
  }

  if (error instanceof AppError) {
    if (error.internal) logger.warn({ code: error.code, requestId }, 'app-error');
    return NextResponse.json(
      { error: { code: error.code, message: error.message, requestId, ...(error.details ? { details: error.details } : {}) } },
      { status: error.status, headers: { 'cache-control': 'no-store' } },
    );
  }

  if (error instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_FAILED' satisfies ErrorCode,
          message: 'Request payload is invalid',
          requestId,
          details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      { status: 422, headers: { 'cache-control': 'no-store' } },
    );
  }

  reportError(error, { requestId });
  return NextResponse.json(
    { error: { code: 'INTERNAL', message: 'Something went wrong', requestId } },
    { status: 500, headers: { 'cache-control': 'no-store' } },
  );
}

function sameOrigin(request: Request): boolean {
  const site = request.headers.get('sec-fetch-site');
  if (site && (site === 'same-origin' || site === 'none')) return true;
  const origin = request.headers.get('origin');
  if (!origin) return site === null; // Non-browser client without an Origin.
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

async function parseBody(request: Request): Promise<unknown> {
  const type = request.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) return {};
  const raw = await request.text();
  if (raw.length > 256 * 1024) throw new AppError('VALIDATION_FAILED', 'Request body is too large');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError('VALIDATION_FAILED', 'Request body is not valid JSON');
  }
}

function queryObject(request: Request): Record<string, string> {
  const url = new URL(request.url);
  return Object.fromEntries(url.searchParams.entries());
}

export type RouteHandler = (
  request: Request,
  segment: { params: Promise<Record<string, string>> },
) => Promise<NextResponse>;

/**
 * Two overloads so the handler's `session` type follows the auth mode: nullable
 * for a public route, guaranteed for anything that requires a session.
 */
export function route<TBody = unknown, TQuery = unknown>(
  config: RouteConfig<TBody, TQuery> & { auth: { mode: 'public' } },
  handler: (ctx: PublicHandlerContext<TBody, TQuery>) => Promise<unknown>,
): RouteHandler;
export function route<TBody = unknown, TQuery = unknown>(
  config: RouteConfig<TBody, TQuery>,
  handler: (ctx: HandlerContext<TBody, TQuery>) => Promise<unknown>,
): RouteHandler;
export function route<TBody = unknown, TQuery = unknown>(
  config: RouteConfig<TBody, TQuery>,
  rawHandler:
    | ((ctx: PublicHandlerContext<TBody, TQuery>) => Promise<unknown>)
    | ((ctx: HandlerContext<TBody, TQuery>) => Promise<unknown>),
): RouteHandler {
  // Safe by construction: the non-public overload only reaches the handler
  // after the authorize step has proved `session` is present.
  const handler = rawHandler as (ctx: PublicHandlerContext<TBody, TQuery>) => Promise<unknown>;
  return async (request, segment) => {
    const ctx = await getRequestContext();
    const requestId = ctx.requestId;
    const startedAt = Date.now();

    try {
      // `params` is a promise in Next 15; the segment itself may be absent when
      // a route has no dynamic parts.
      const params = segment?.params === undefined ? {} : await segment.params;

      // ── 1. authorize ────────────────────────────────────────────────
      if (config.auth.mode !== 'public') {
        if (!ctx.session) throw new AppError('UNAUTHENTICATED');
        if (!ctx.session.mfaSatisfied) throw new AppError('MFA_REQUIRED');
      }
      if (config.auth.mode === 'permission') {
        const resource = config.auth.resource?.({ params }) ?? {};
        if (!can(ctx.session, config.auth.action, resource)) {
          // Missing permission and missing object are indistinguishable.
          throw new AppError('NOT_FOUND');
        }
      }

      if (!SAFE_METHODS.has(request.method) && config.csrf !== false && !sameOrigin(request)) {
        throw new AppError('FORBIDDEN', 'Cross-origin request rejected');
      }

      if (config.mutates && ctx.session?.tenantId) {
        const readOnly = await getSetting('platform.readonly', { tenantId: ctx.session.tenantId });
        if (readOnly === true) throw new AppError('READ_ONLY');
      }

      // ── 2. rateLimit ────────────────────────────────────────────────
      let limitHeaders: Record<string, string> = {};
      if (config.limit) {
        const subject = config.limitSubject
          ? config.limitSubject(ctx)
          : (ctx.session?.userId ?? ctx.ip ?? subnetOf(ctx.ip));
        const result = await rateLimit(config.limit, subject);
        limitHeaders = {
          'ratelimit-limit': String(result.limit),
          'ratelimit-remaining': String(result.remaining),
          'ratelimit-reset': String(result.resetSeconds),
        };
      }

      // ── 3. zod.parse ────────────────────────────────────────────────
      const body = config.body ? config.body.parse(await parseBody(request)) : ({} as TBody);
      const query = config.query ? config.query.parse(queryObject(request)) : ({} as TQuery);

      // Idempotency-Key replay (docs/09 §1), keyed per user so keys cannot collide.
      let idempotencyKey: string | null = null;
      if (config.idempotent) {
        const header = request.headers.get('idempotency-key');
        if (!header || header.length < 8 || header.length > 128) {
          throw new AppError('VALIDATION_FAILED', 'Idempotency-Key header is required');
        }
        idempotencyKey = `idem:${ctx.session?.userId ?? ctx.ip}:${header}`;
        const stored = await kvGet(idempotencyKey);
        if (stored) {
          return json(JSON.parse(stored), { requestId, personal: true, headers: limitHeaders, replayed: true });
        }
        const claimed = await kvSetNx(`${idempotencyKey}:lock`, '1', 60);
        if (!claimed) throw new AppError('CONFLICT', 'A request with this Idempotency-Key is in flight');
      }

      // ── 4. service ──────────────────────────────────────────────────
      const result = await handler({ request, body, query, params, ctx, session: ctx.session });

      if (idempotencyKey) {
        await kvSet(idempotencyKey, JSON.stringify(result ?? null), 24 * 60 * 60);
      }

      const etag = config.etagOf?.(result) ?? null;
      if (etag && request.headers.get('if-none-match') === etag) {
        return new NextResponse(null, {
          status: 304,
          headers: {
            etag,
            'x-request-id': requestId,
            ...(config.cacheControl ? { 'cache-control': config.cacheControl } : {}),
            ...limitHeaders,
          },
        });
      }

      logger.info(
        {
          requestId,
          route: new URL(request.url).pathname,
          method: request.method,
          status: 200,
          durationMs: Date.now() - startedAt,
          tenantId: ctx.session?.tenantId ?? undefined,
        },
        'request',
      );

      return json(result, {
        requestId,
        personal: config.personal !== false,
        headers: {
          ...limitHeaders,
          ...(etag ? { etag } : {}),
          ...(config.cacheControl ? { 'cache-control': config.cacheControl } : {}),
        },
      });
    } catch (error) {
      const response = errorResponse(error, requestId);
      logger.info(
        {
          requestId,
          route: new URL(request.url).pathname,
          method: request.method,
          status: response.status,
          durationMs: Date.now() - startedAt,
        },
        'request',
      );
      return response;
    }
  };
}

export function json(
  payload: unknown,
  options: { requestId: string; personal?: boolean; headers?: Record<string, string>; status?: number; replayed?: boolean },
): NextResponse {
  const headers: Record<string, string> = {
    'x-request-id': options.requestId,
    ...(options.headers ?? {}),
  };
  if (options.personal !== false) {
    // docs/01 §3 — anything personal is private, never cached, and varies by cookie.
    headers['cache-control'] = 'private, no-store';
    headers.vary = 'Cookie';
  }
  if (options.replayed) headers['idempotent-replay'] = 'true';
  return NextResponse.json(payload ?? null, { status: options.status ?? 200, headers });
}
