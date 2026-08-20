import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { HexSchema } from '@/modules/branding/schemas';
import { generateRamp } from '@/modules/admin/brands';

export const dynamic = 'force-dynamic';

const BodySchema = z.strictObject({ base: HexSchema });

/** docs/04 §4.2 — one base colour in, a coherent 50…900 ramp out. */
export const POST = route(
  {
    auth: { mode: 'permission', action: 'brand:write' },
    limit: 'admin.mutation',
    body: BodySchema,
    personal: true,
  },
  async ({ body }) => generateRamp(body.base),
);
