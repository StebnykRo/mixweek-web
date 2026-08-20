import { withTenant } from '@/lib/db/tenant-client';
import { AppError, notFound } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { invalidateTenant } from '@/lib/cache';
import { MEDIA_GROUP_ORDER } from './schemas';
import { inspectExternalUrl, providerFor, DEFAULT_DOMAIN_ALLOWLIST } from './url';

/**
 * docs/08-media.md — we store link cards, never photographs. The cover is the
 * one image in our storage, and it is mandatory.
 */

const MEDIA_SELECT = {
  id: true,
  kind: true,
  title: true,
  description: true,
  url: true,
  coverUrl: true,
  coverBlurhash: true,
  provider: true,
  authorName: true,
  authorUrl: true,
  accessNote: true,
  acceptsUploads: true,
  itemCountHint: true,
  sortOrder: true,
  publishedAt: true,
  createdBy: true,
} as const;

export async function listPublishedMedia(tenantId: string, eventId: string) {
  const rows = await withTenant(tenantId, (db) =>
    db.mediaLink.findMany({
      where: { eventId, status: 'PUBLISHED', deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      select: MEDIA_SELECT,
    }),
  );

  const groups = MEDIA_GROUP_ORDER.map((kind) => ({
    kind,
    items: rows.filter((row) => row.kind === kind),
  })).filter((group) => group.items.length > 0);

  return { groups, total: rows.length };
}

export type MediaWriteInput = {
  tenantId: string;
  eventId: string;
  actor: { userId: string; email: string; role: string | null; stepUpValid: boolean };
  data: {
    kind: string;
    title: string;
    description?: string | null;
    url: string;
    coverUrl: string;
    authorName?: string | null;
    authorUrl?: string | null;
    accessNote?: string | null;
    acceptsUploads: boolean;
    itemCountHint?: number | null;
    sortOrder: number;
  };
  allowlist?: readonly string[];
};

/**
 * A host outside the allowlist is not silently accepted: it needs a
 * TENANT_ADMIN with a fresh second factor, and the decision is audited
 * (docs/08 §4.2).
 */
export async function assertUrlAcceptable(
  url: string,
  actor: { role: string | null; stepUpValid: boolean },
  allowlist: readonly string[] = DEFAULT_DOMAIN_ALLOWLIST,
): Promise<{ host: string; offAllowlist: boolean }> {
  const verdict = inspectExternalUrl(url, allowlist);
  if (!verdict.ok) {
    throw new AppError('VALIDATION_FAILED', 'Only https links are accepted');
  }
  if (!verdict.onAllowlist) {
    const privileged = actor.role === 'TENANT_ADMIN' || actor.role === 'SUPER_ADMIN';
    if (!privileged || !actor.stepUpValid) {
      throw new AppError(
        'FORBIDDEN',
        `${verdict.host} is not on the approved list. A tenant admin can approve it after confirming their second factor.`,
      );
    }
  }
  return { host: verdict.host, offAllowlist: !verdict.onAllowlist };
}

export async function createMediaLink(input: MediaWriteInput) {
  const { offAllowlist, host } = await assertUrlAcceptable(input.data.url, input.actor, input.allowlist);

  const created = await withTenant(input.tenantId, (db, tenantId) =>
    db.mediaLink.create({
      data: {
        tenantId,
        eventId: input.eventId,
        kind: input.data.kind as never,
        title: input.data.title,
        description: input.data.description ?? null,
        url: input.data.url,
        coverUrl: input.data.coverUrl,
        provider: providerFor(input.data.url) as never,
        authorName: input.data.authorName ?? null,
        authorUrl: input.data.authorUrl ?? null,
        accessNote: input.data.accessNote ?? null,
        acceptsUploads: input.data.acceptsUploads,
        itemCountHint: input.data.itemCountHint ?? null,
        sortOrder: input.data.sortOrder,
        createdBy: input.actor.userId,
        status: 'DRAFT',
      },
      select: { id: true },
    }),
  );

  await auditLog({
    tenantId: input.tenantId,
    actorId: input.actor.userId,
    actorEmail: input.actor.email,
    actorRole: input.actor.role,
    action: 'media.create',
    entityType: 'MediaLink',
    entityId: created.id,
    diff: { host, offAllowlist, kind: input.data.kind },
  });

  return created;
}

/** docs/08 §3 — publication is blocked without a cover, at the API level. */
export async function publishMediaLink(
  tenantId: string,
  mediaLinkId: string,
  actor: { userId: string; email: string; role: string | null },
) {
  const updated = await withTenant(tenantId, async (db) => {
    const media = await db.mediaLink.findFirst({
      where: { id: mediaLinkId, deletedAt: null },
      select: { id: true, coverUrl: true, eventId: true },
    });
    if (!media) throw notFound({ mediaLinkId });
    if (!media.coverUrl) throw new AppError('VALIDATION_FAILED', 'A cover image is required before publishing');

    return db.mediaLink.update({
      where: { id: media.id },
      data: { status: 'PUBLISHED', publishedAt: new Date() },
      select: { id: true, eventId: true, title: true },
    });
  });

  await invalidateTenant(tenantId, 'media');
  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'media.publish',
    entityType: 'MediaLink',
    entityId: updated.id,
  });

  return updated;
}

export async function reportMedia(input: {
  tenantId: string;
  mediaLinkId: string;
  reporterId: string | null;
  reason: string;
  comment?: string;
}) {
  return withTenant(input.tenantId, async (db, tenantId) => {
    const media = await db.mediaLink.findFirst({
      where: { id: input.mediaLinkId, deletedAt: null },
      select: { id: true },
    });
    if (!media) throw notFound({ mediaLinkId: input.mediaLinkId });

    return db.mediaReport.create({
      data: {
        tenantId,
        mediaLinkId: media.id,
        reporterId: input.reporterId,
        reason: input.reason as never,
        comment: input.comment ?? null,
      },
      select: { id: true },
    });
  });
}
