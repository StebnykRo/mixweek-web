import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, type PrismaClient } from '@prisma/client';
import { prisma } from './client';
import { isTenantScoped, NULLABLE_TENANT_MODELS, type TenantScopedModel } from './models';

/**
 * CLAUDE.md §5.1 — every query against a tenant-scoped table carries a
 * tenantId, and that tenantId comes from the server session only.
 *
 * Two layers, deliberately redundant:
 *   1. this Prisma extension injects `where: { tenantId }` / `data.tenantId`
 *      and refuses to run an unscoped query at all;
 *   2. `SET LOCAL app.tenant_id` plus the Postgres RLS policies mean the
 *      database returns nothing even if layer 1 is ever bypassed.
 *
 * The extension is applied to the base client and the transaction is opened
 * from the *extended* client, so every delegate reached inside the transaction
 * carries the guard. Extending a transaction client is not possible — it has no
 * `$extends` — and doing it the other way round would silently drop the guard.
 */

export class MissingTenantScopeError extends Error {
  constructor(model: string, operation: string) {
    super(`Query on tenant-scoped model ${model}.${operation} ran without a tenant scope`);
    this.name = 'MissingTenantScopeError';
  }
}

export class UnsafeUniqueLookupError extends Error {
  constructor(model: string) {
    super(
      `${model} allows platform-level rows, so findUnique cannot be tenant-filtered safely. Use findFirst instead.`,
    );
    this.name = 'UnsafeUniqueLookupError';
  }
}

type Args = Record<string, unknown>;

/**
 * Prisma's extendedWhereUnique (GA since v5) lets findUnique / update / delete
 * take extra scalar filters alongside the unique field, so the tenant filter can
 * be merged in without rewriting the operation.
 */
function scopeWhere(args: Args, tenantId: string, model: TenantScopedModel, allowComposite: boolean): void {
  const existing = (args.where ?? {}) as Args;
  if (NULLABLE_TENANT_MODELS.has(model)) {
    if (!allowComposite) throw new UnsafeUniqueLookupError(model);
    // Platform-level rows (tenantId = null) stay visible: feature-flag
    // defaults, platform secrets, platform audit entries.
    args.where = { AND: [existing, { OR: [{ tenantId }, { tenantId: null }] }] };
    return;
  }
  args.where = { ...existing, tenantId };
}

function applyTenant(model: TenantScopedModel, operation: string, rawArgs: unknown, tenantId: string): unknown {
  const args: Args = { ...((rawArgs ?? {}) as Args) };

  switch (operation) {
    case 'findUnique':
    case 'findUniqueOrThrow':
      scopeWhere(args, tenantId, model, false);
      return args;
    case 'findFirst':
    case 'findFirstOrThrow':
    case 'findMany':
    case 'count':
    case 'aggregate':
    case 'groupBy':
    case 'updateMany':
    case 'deleteMany':
      scopeWhere(args, tenantId, model, true);
      return args;
    case 'update':
    case 'delete':
      scopeWhere(args, tenantId, model, false);
      return args;
    case 'create': {
      args.data = { ...((args.data ?? {}) as Args), tenantId };
      return args;
    }
    case 'createMany':
    case 'createManyAndReturn': {
      const stamp = (row: unknown) => ({ ...(row as Args), tenantId });
      const data = args.data;
      args.data = Array.isArray(data) ? data.map(stamp) : stamp(data);
      return args;
    }
    case 'upsert': {
      scopeWhere(args, tenantId, model, false);
      args.create = { ...((args.create ?? {}) as Args), tenantId };
      return args;
    }
    default:
      return args;
  }
}

function tenantGuard(tenantId: string) {
  return Prisma.defineExtension({
    name: 'tenantGuard',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!isTenantScoped(model)) return query(args);
          if (!tenantId) throw new MissingTenantScopeError(model, operation);
          return query(applyTenant(model, operation, args, tenantId) as typeof args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof buildClient>;

function buildClient(tenantId: string) {
  return prisma.$extends(tenantGuard(tenantId));
}

/** One extended client per tenant; building it on every query is wasteful. */
const clientCache = new Map<string, TenantDb>();
const MAX_CACHED_CLIENTS = 64;

function clientFor(tenantId: string): TenantDb {
  let client = clientCache.get(tenantId);
  if (!client) {
    if (clientCache.size >= MAX_CACHED_CLIENTS) clientCache.clear();
    client = buildClient(tenantId);
    clientCache.set(tenantId, client);
  }
  return client;
}

type Scope = { tenantId: string; platform: boolean; db: unknown };

const storage = new AsyncLocalStorage<Scope>();

/**
 * Runs `fn` inside a transaction bound to one tenant. Nested calls join the
 * transaction already open for that tenant rather than starting a second one.
 */
export async function withTenant<T>(
  tenantId: string,
  fn: (db: TenantDb, tenantId: string) => Promise<T>,
  options?: { timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel },
): Promise<T> {
  if (!tenantId) throw new MissingTenantScopeError('*', 'withTenant');

  const current = storage.getStore();
  if (current && current.tenantId === tenantId && !current.platform) {
    return fn(current.db as TenantDb, tenantId);
  }

  return clientFor(tenantId).$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
      const scope: Scope = { tenantId, platform: false, db: tx };
      return storage.run(scope, () => fn(tx as unknown as TenantDb, tenantId));
    },
    {
      timeout: options?.timeout ?? 15_000,
      maxWait: 5_000,
      ...(options?.isolationLevel ? { isolationLevel: options.isolationLevel } : {}),
    },
  );
}

type SessionLike = { tenantId?: string | null };

/**
 * The only sanctioned way to reach tenant data. `tenantId` is read from the
 * server session — never from a body, query string or header.
 */
export function getTenantDb(session: SessionLike) {
  const tenantId = session.tenantId;
  if (!tenantId) throw new MissingTenantScopeError('*', 'getTenantDb');
  return {
    tenantId,
    run: <T>(fn: (db: TenantDb, scopedTenantId: string) => Promise<T>, options?: Parameters<typeof withTenant>[2]) =>
      withTenant(tenantId, fn, options),
  };
}

/**
 * Identity and configuration reads that necessarily happen BEFORE a tenant is
 * known, or that span tenants by definition.
 *
 * Resolving which tenant an email domain belongs to cannot itself be
 * tenant-scoped — that lookup is what produces the tenant. The same is true of
 * the session's membership row and of platform-level settings, feature flags
 * and secrets.
 *
 * The bypass is deliberately narrow:
 *   - reads and writes keyed by an exact identifier (domain, id, userId +
 *     tenantId, secret key);
 *   - never used for participant content — events, programme, registrations,
 *     media and orders all go through withTenant();
 *   - the call sites are enumerated in docs/02 §4.2.
 *
 * RLS therefore still catches an ORM-level mistake everywhere it matters.
 */
export async function withSystemScope<T>(reason: string, fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  void reason; // Documented at the call site; in the signature so it cannot be omitted.
  const current = storage.getStore();
  if (current?.platform) return fn(current.db as PrismaClient);

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.platform_scope', 'on', true)`;
    const scope: Scope = { tenantId: '', platform: true, db: tx };
    return storage.run(scope, () => fn(tx as unknown as PrismaClient));
  });
}

/**
 * docs/02 §4.2 — the explicit cross-tenant escape hatch for SUPER_ADMIN
 * platform operations. Every caller writes an AuditLog entry (see modules/admin).
 */
export async function withPlatformScope<T>(fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  return withSystemScope('super-admin platform operation', fn);
}

export { Prisma };
