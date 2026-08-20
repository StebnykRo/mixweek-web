import { NextResponse } from 'next/server';
import { pingDatabase } from '@/lib/db/client';
import { redisAvailable } from '@/lib/redis';
import { getSession } from '@/lib/http/context';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health
 *
 * docs/09-api.md §6.1 — the public answer is `{ status }` and nothing else.
 * Versions and service names are reconnaissance, so the detailed view is only
 * for a SUPER_ADMIN or an internal caller.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const database = await pingDatabase();

  const redis = redisAvailable();
  const healthy = database;

  const session = await getSession().catch(() => null);
  const internal = request.headers.get('x-internal-probe') === '1';
  const detailed = internal || session?.role === 'SUPER_ADMIN';

  const body = detailed ? { status: healthy ? 'ok' : 'degraded', database, redis } : { status: healthy ? 'ok' : 'degraded' };

  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { 'cache-control': 'no-store' },
  });
}
