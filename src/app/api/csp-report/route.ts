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
    logger.warn(
      {
        kind: 'csp',
        route: String((report as Record<string, unknown>)['document-uri'] ?? '').slice(0, 200),
        reason: String((report as Record<string, unknown>)['violated-directive'] ?? '').slice(0, 120),
      },
      'csp-violation',
    );
  } catch {
    // A malformed report is not worth an error response.
  }

  return new NextResponse(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}
