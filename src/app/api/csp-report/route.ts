import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { clientIpFrom } from '@/lib/http/context';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 8 * 1024;

/**
 * POST /api/csp-report
 *
 * docs/09 §6.1 — reports are logged and alerted on, never stored in the
 * database. The body is capped and rate limited because this endpoint is
 * unauthenticated by necessity.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const ip = clientIpFrom(request.headers) ?? 'unknown';
  const limit = await checkRateLimit('csp.report', ip);
  if (!limit.ok) return new NextResponse(null, { status: 429, headers: { 'cache-control': 'no-store' } });

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('csp-report') && !contentType.includes('application/json')) {
    return new NextResponse(null, { status: 415 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 413 });

  try {
    const parsed = JSON.parse(raw) as { 'csp-report'?: Record<string, unknown> };
    const report = parsed['csp-report'] ?? parsed;
    const field = (name: string, max = 200): string =>
      String((report as Record<string, unknown>)[name] ?? '').slice(0, max);

    // blocked-uri is the only field that says what was actually refused —
    // "inline" for an inline block, or the URL otherwise. Without it a report
    // names the rule that fired and nothing you can act on.
    logger.warn(
      {
        kind: 'csp',
        route: field('document-uri'),
        reason: field('violated-directive', 120),
        blocked: field('blocked-uri'),
        source: field('source-file'),
        line: (report as Record<string, unknown>)['line-number'] ?? null,
        sample: field('script-sample', 120),
      },
      'csp-violation',
    );
  } catch {
    // A malformed report is not worth an error response.
  }

  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
