import type { NotificationKind } from '@prisma/client';
import { withTenant } from '@/lib/db/tenant-client';
import { canDisable, defaultEnabled, KIND_POLICY, type Channel } from './policy';

const KINDS = Object.keys(KIND_POLICY) as NotificationKind[];
const CHANNELS: Channel[] = ['push', 'email'];

export type PreferenceRow = {
  kind: NotificationKind;
  channel: Channel;
  enabled: boolean;
  locked: boolean;
};

/** docs/07 §15 — the critical block is rendered separately, and disabled. */
export async function getPreferences(tenantId: string, userId: string): Promise<PreferenceRow[]> {
  const stored = await withTenant(tenantId, (db) =>
    db.notificationPreference.findMany({ where: { userId }, select: { kind: true, channel: true, enabled: true } }),
  );
  const index = new Map(stored.map((row) => [`${row.kind}:${row.channel}`, row.enabled]));

  return KINDS.flatMap((kind) =>
    CHANNELS.filter((channel) => defaultEnabled(kind, channel) || index.has(`${kind}:${channel}`)).map((channel) => ({
      kind,
      channel,
      enabled: canDisable(kind) ? (index.get(`${kind}:${channel}`) ?? defaultEnabled(kind, channel)) : true,
      locked: !canDisable(kind),
    })),
  );
}

export async function setPreferences(
  tenantId: string,
  userId: string,
  updates: Array<{ kind: NotificationKind; channel: Channel; enabled: boolean }>,
): Promise<void> {
  // A request to switch off a critical type is dropped, not honoured — the UI
  // shows it locked, and the API must not be a way around that.
  const allowed = updates.filter((update) => canDisable(update.kind));

  await withTenant(tenantId, async (db, scopedTenantId) => {
    for (const update of allowed) {
      await db.notificationPreference.upsert({
        where: {
          userId_tenantId_kind_channel: {
            userId,
            tenantId: scopedTenantId,
            kind: update.kind,
            channel: update.channel,
          },
        },
        create: { tenantId: scopedTenantId, userId, kind: update.kind, channel: update.channel, enabled: update.enabled },
        update: { enabled: update.enabled },
      });
    }
  });
}
