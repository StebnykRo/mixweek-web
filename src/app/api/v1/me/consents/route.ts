import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';
import { hmac } from '@/lib/crypto/hash';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({
  documentVersion: z.string().max(32),
  consents: z
    .array(
      z.strictObject({
        kind: z.enum(['TERMS', 'PRIVACY', 'PUSH_NOTIFICATIONS', 'PHOTO_USAGE', 'MARKETING']),
        granted: z.boolean(),
      }),
    )
    .min(1)
    .max(5),
});

/**
 * POST /api/v1/me/consents
 *
 * docs/12-security.md §10 — Consent records are append-only: each answer is a
 * new row carrying the document version and the time, so it is always possible
 * to show what a person agreed to and when.
 */
export const POST = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', body: BodySchema, personal: true, mutates: true },
  async ({ body, session, ctx }) => {
    const tenantId = session.tenantId as string;

    await withTenant(tenantId, (db, scopedTenantId) =>
      db.consent.createMany({
        data: body.consents.map((consent) => ({
          tenantId: scopedTenantId,
          userId: session.userId,
          kind: consent.kind,
          documentVersion: body.documentVersion,
          granted: consent.granted,
          ipHash: ctx.ip ? hmac(ctx.ip) : null,
        })),
      }),
    );

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      action: 'consent.record',
      diff: { version: body.documentVersion, kinds: body.consents.map((c) => `${c.kind}:${c.granted}`) },
      ip: ctx.ip,
    });

    return { ok: true, recorded: body.consents.length };
  },
);

/** GET — what this person has agreed to, most recent first. */
export const GET = route(
  { auth: { mode: 'session' }, limit: 'api.authenticated', personal: true },
  async ({ session }) => {
    const items = await withTenant(session.tenantId as string, (db) =>
      db.consent.findMany({
        where: { userId: session.userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { kind: true, documentVersion: true, granted: true, createdAt: true },
      }),
    );
    return { items };
  },
);
