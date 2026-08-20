import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { changeRole, listMembers } from '@/modules/admin/users';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({ q: z.string().max(80).optional() });

export const GET = route(
  { auth: { mode: 'permission', action: 'user:read' }, limit: 'admin.mutation', query: QuerySchema, personal: true },
  async ({ query, session }) => ({ items: await listMembers(session.tenantId as string, query.q) }),
);

const RoleSchema = z.strictObject({
  userId: z.string().min(10).max(40),
  role: z.enum(['PARTICIPANT', 'GUEST', 'SUPPORT', 'CONTENT_EDITOR', 'EVENT_MANAGER', 'TENANT_ADMIN']),
});

/** docs/10 §2 — a role change is step-up, revokes sessions and emails both sides. */
export const PATCH = route(
  {
    auth: { mode: 'permission', action: 'user:write' },
    limit: 'admin.mutation',
    body: RoleSchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session }) => {
    await changeRole(session.tenantId as string, body.userId, body.role, {
      userId: session.userId,
      email: session.user.email,
      role: session.role,
    });
    return { ok: true };
  },
);
