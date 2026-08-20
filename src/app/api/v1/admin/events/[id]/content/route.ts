import { z } from 'zod';
import { route } from '@/lib/http/handler';
import { withTenant } from '@/lib/db/tenant-client';
import { auditLog } from '@/lib/audit';
import { CuidSchema } from '@/modules/events/schemas';

export const dynamic = 'force-dynamic';

const SECTIONS = ['EVENT_STYLE', 'TRAVEL', 'HELP', 'FAQ', 'RULES', 'ONBOARDING'] as const;

const ContentSchema = z.strictObject({
  section: z.enum(SECTIONS),
  key: z.string().trim().min(1).max(40).regex(/^[a-z0-9-]+$/),
  title: z.string().trim().min(1).max(120),
  /** Markdown; sanitised at render, never at save (docs/12 §6). */
  body: z.string().max(20000),
  icon: z.string().max(40).nullable().optional(),
  imageUrl: z.string().url().max(500).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).default(0),
  isPublished: z.boolean().default(true),
});

export const GET = route(
  { auth: { mode: 'permission', action: 'content:read' }, limit: 'admin.mutation', personal: true },
  async ({ params, session }) => ({
    items: await withTenant(session.tenantId as string, (db) =>
      db.contentBlock.findMany({
        where: { eventId: CuidSchema.parse(params.id), deletedAt: null },
        orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }],
      }),
    ),
    sections: SECTIONS,
  }),
);

export const PUT = route(
  {
    auth: { mode: 'permission', action: 'content:write' },
    limit: 'admin.mutation',
    body: ContentSchema,
    personal: true,
    mutates: true,
  },
  async ({ params, body, session }) => {
    const tenantId = session.tenantId as string;
    const eventId = CuidSchema.parse(params.id);

    const block = await withTenant(tenantId, (db, scopedTenantId) =>
      db.contentBlock.upsert({
        where: { eventId_section_key: { eventId, section: body.section, key: body.key } },
        create: {
          tenantId: scopedTenantId,
          eventId,
          section: body.section,
          key: body.key,
          title: body.title,
          body: body.body,
          icon: body.icon ?? null,
          imageUrl: body.imageUrl ?? null,
          sortOrder: body.sortOrder,
          isPublished: body.isPublished,
          deletedAt: null,
        },
        update: {
          title: body.title,
          body: body.body,
          icon: body.icon ?? null,
          imageUrl: body.imageUrl ?? null,
          sortOrder: body.sortOrder,
          isPublished: body.isPublished,
          deletedAt: null,
        },
        select: { id: true },
      }),
    );

    await auditLog({
      tenantId,
      actorId: session.userId,
      actorEmail: session.user.email,
      actorRole: session.role,
      action: 'content.upsert',
      entityType: 'ContentBlock',
      entityId: block.id,
      diff: { section: body.section, key: body.key },
    });

    return block;
  },
);
