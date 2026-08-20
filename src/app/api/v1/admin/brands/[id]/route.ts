import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { CuidSchema } from '@/modules/events/schemas';
import { BrandTokensSchema } from '@/modules/branding/schemas';
import { getBrand, saveDraft } from '@/modules/admin/brands';

export const dynamic = 'force-dynamic';

export const GET = route(
  { auth: { mode: 'permission', action: 'brand:read' }, limit: 'admin.mutation', personal: true },
  async ({ params, session }) => getBrand(session.tenantId as string, CuidSchema.parse(params.id)),
);

const DraftSchema = z.strictObject({
  name: z.string().min(1).max(80),
  appName: z.string().min(1).max(40),
  kicker: z.string().max(40).nullable().optional(),
  logoLightUrl: z.string().url().max(500).nullable().optional(),
  logoDarkUrl: z.string().url().max(500).nullable().optional(),
  logoMarkUrl: z.string().url().max(500).nullable().optional(),
  ogImageUrl: z.string().url().max(500).nullable().optional(),
  tokens: BrandTokensSchema,
});

/** PATCH saves a draft and returns the contrast report the editor renders. */
export const PATCH = route(
  {
    auth: { mode: 'permission', action: 'brand:write' },
    limit: 'admin.mutation',
    body: DraftSchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) =>
    saveDraft(session.tenantId as string, CuidSchema.parse(params.id), body, {
      userId: session.userId,
      email: session.user.email,
      role: session.role,
    }),
);
