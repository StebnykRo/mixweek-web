import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { deleteSecret, isSecretKey, listSecrets, setSecret, SECRET_KEYS } from '@/lib/crypto/secrets';

export const dynamic = 'force-dynamic';

/**
 * docs/12-security.md §2.2 — the admin sees a mask, a rotation date and an
 * author. There is deliberately no endpoint that returns a stored value: not an
 * omission, a decision.
 */
export const GET = route(
  { auth: { mode: 'permission', action: 'secret:read' }, limit: 'admin.mutation', personal: true },
  async ({ session }) => ({
    items: await listSecrets({ tenantId: session.tenantId }),
    knownKeys: SECRET_KEYS,
  }),
);

const BodySchema = z.strictObject({
  key: z.string().min(3).max(80),
  value: z.string().min(1).max(4000),
  expiresAt: z.coerce.date().nullable().optional(),
});

export const PUT = route(
  {
    auth: { mode: 'permission', action: 'secret:write' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session, ctx }) => {
    if (!isSecretKey(body.key)) throw new AppError('VALIDATION_FAILED', 'Unknown secret key');

    await setSecret({ tenantId: session.tenantId }, body.key, body.value, { userId: session.userId }, {
      expiresAt: body.expiresAt ?? null,
    });

    // The value never appears in the audit entry — only that it changed.
    await auditLog({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'secret.set',
      entityType: 'SecretSetting',
      entityId: body.key,
      ip: ctx.ip,
    });

    return { ok: true };
  },
);

const DeleteSchema = z.strictObject({ key: z.string().min(3).max(80) });

export const DELETE = route(
  {
    auth: { mode: 'permission', action: 'secret:delete' },
    limit: 'admin.mutation',
    body: DeleteSchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session, ctx }) => {
    await deleteSecret({ tenantId: session.tenantId }, body.key);
    await auditLog({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'secret.delete',
      entityType: 'SecretSetting',
      entityId: body.key,
      ip: ctx.ip,
    });
    return { ok: true };
  },
);
