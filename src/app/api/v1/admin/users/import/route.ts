import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { analyseImport, applyImport } from '@/modules/admin/users';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({
  csv: z.string().min(10).max(2_000_000),
  /** The wizard always previews first; `apply` is the second, explicit step. */
  mode: z.enum(['dry-run', 'apply']).default('dry-run'),
});

/** docs/10-admin.md §3.10 — CSV import: upload → map → dry run → apply. */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'user.import:write' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
    mutates: true,
  },
  async ({ body, session }) => {
    const tenantId = session.tenantId as string;
    if (body.mode === 'dry-run') return { mode: 'dry-run', ...(await analyseImport(tenantId, body.csv)) };
    return {
      mode: 'apply',
      ...(await applyImport(tenantId, body.csv, {
        userId: session.userId,
        email: session.user.email,
        role: session.role,
      })),
    };
  },
);
