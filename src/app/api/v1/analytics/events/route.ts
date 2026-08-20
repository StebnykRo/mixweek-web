import { route } from '@/lib/http/handler';
import { AnalyticsBatchSchema, recordBatch } from '@/modules/analytics/service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/analytics/events
 *
 * docs/13-nfr.md §8 — batched, no cookie, no third party. The payload schema
 * rejects free text, so a stray field cannot smuggle PII into the table.
 */
export const POST = route(
  {
    auth: { mode: 'session' },
    limit: 'analytics.ingest',
    body: AnalyticsBatchSchema,
    personal: true,
    // sendBeacon cannot set headers, so the Origin check is relaxed here; the
    // endpoint only ever writes pseudonymous counters for the caller's own id.
    csrf: false,
  },
  async ({ body, session }) => {
    const stored = await recordBatch(session.tenantId as string, session.userId, body);
    return { ok: true, stored };
  },
);
