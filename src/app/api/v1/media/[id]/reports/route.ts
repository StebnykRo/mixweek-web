import { route } from '@/lib/http/handler';
import { rateLimit } from '@/lib/rate-limit';
import { CuidSchema } from '@/modules/events/schemas';
import { MediaReportSchema } from '@/modules/media/schemas';
import { reportMedia } from '@/modules/media/service';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/media/{id}/reports
 *
 * docs/08 §7 — we do not moderate somebody else's gallery, but a participant
 * needs a channel and the organiser needs a record of the reaction.
 */
export const POST = route(
  { auth: { mode: 'session' }, body: MediaReportSchema, personal: true, mutates: true },
  async ({ params, body, session }) => {
    await rateLimit('media.report', session.userId);
    const report = await reportMedia({
      tenantId: session.tenantId as string,
      mediaLinkId: CuidSchema.parse(params.id),
      reporterId: session.userId,
      reason: body.reason,
      comment: body.comment,
    });
    return { ok: true, id: report.id };
  },
);
