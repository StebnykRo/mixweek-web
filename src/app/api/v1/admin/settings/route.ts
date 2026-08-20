import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { auditLog } from '@/lib/audit';
import { getSetting, setSetting, SETTING_DEFAULTS, type SettingKey } from '@/modules/tenancy/settings';

export const dynamic = 'force-dynamic';

const KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

export const GET = route(
  { auth: { mode: 'permission', action: 'setting:read' }, limit: 'admin.mutation', personal: true },
  async ({ session }) => {
    const entries = await Promise.all(
      KEYS.map(async (key) => [key, await getSetting(key, { tenantId: session.tenantId })] as const),
    );
    return { settings: Object.fromEntries(entries), defaults: SETTING_DEFAULTS };
  },
);

const BodySchema = z.strictObject({
  key: z.string().max(80),
  value: z.union([z.string().max(500), z.number(), z.boolean()]),
});

export const PUT = route(
  {
    auth: { mode: 'permission', action: 'setting:write' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session, ctx }) => {
    // Only keys the platform knows about; an arbitrary string is not a setting.
    if (!KEYS.includes(body.key as SettingKey)) {
      return { ok: false, error: 'unknown setting' };
    }
    await setSetting(session.tenantId as string, body.key as SettingKey, body.value);
    await auditLog({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'setting.update',
      entityId: body.key,
      diff: { value: body.value },
      ip: ctx.ip,
    });
    return { ok: true };
  },
);
