import { z } from 'zod';

export const CuidSchema = z.string().regex(/^[a-z0-9]{20,32}$/, 'invalid identifier');
export const SlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{1,80}$/, 'invalid slug');

export const EventScopeSchema = z.enum(['upcoming', 'past', 'mine']);

export const EventListQuerySchema = z.object({
  scope: EventScopeSchema.default('upcoming'),
  q: z.string().trim().max(80).optional(),
  cursor: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  year: z.coerce.number().int().min(2000).max(2100).optional(),
  city: z.string().trim().max(80).optional(),
});

const csv = (max: number) =>
  z
    .string()
    .max(500)
    .transform((value) => value.split(',').map((v) => v.trim()).filter(Boolean).slice(0, max));

export const TrackSchema = z.enum(['WORKSHOP', 'SPORT', 'PARTY', 'TEAM', 'LOGISTICS']);

export const ProgrammeQuerySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  track: csv(10).optional(),
  place: csv(30).optional(),
  from: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  to: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  q: z.string().trim().max(80).optional(),
  added: z.enum(['recent']).optional(),
});

export type ProgrammeQuery = z.infer<typeof ProgrammeQuerySchema>;

export const EventInputSchema = z.strictObject({
  slug: SlugSchema,
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(160).nullable().optional(),
  description: z.string().max(8000).nullable().optional(),
  coverUrl: z.string().url().max(500).nullable().optional(),
  brandId: CuidSchema.nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  timezone: z.string().min(3).max(64),
  city: z.string().trim().max(80).nullable().optional(),
  country: z.string().trim().max(80).nullable().optional(),
  venueName: z.string().trim().max(120).nullable().optional(),
  visibility: z.enum(['TENANT', 'INVITE_ONLY', 'GROUP']).default('TENANT'),
  audienceRules: z
    .object({
      departments: z.array(z.string().max(80)).max(100).optional(),
      teams: z.array(z.string().max(80)).max(100).optional(),
      roles: z.array(z.string().max(30)).max(10).optional(),
      userIds: z.array(CuidSchema).max(500).optional(),
    })
    .nullable()
    .optional(),
  registrationEnabled: z.boolean().default(true),
  registrationOpensAt: z.coerce.date().nullable().optional(),
  registrationClosesAt: z.coerce.date().nullable().optional(),
  capacity: z.number().int().positive().max(100000).nullable().optional(),
  waitlistEnabled: z.boolean().default(true),
  approvalRequired: z.boolean().default(false),
  registrationForm: z.unknown().nullable().optional(),
}).refine((v) => v.endsAt >= v.startsAt, { message: 'endsAt must not precede startsAt', path: ['endsAt'] });

export const ActivityInputSchema = z.strictObject({
  title: z.string().trim().min(1).max(140),
  description: z.string().max(8000).nullable().optional(),
  track: TrackSchema.default('WORKSHOP'),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  placeId: CuidSchema.nullable().optional(),
  locationText: z.string().trim().max(120).nullable().optional(),
  speakers: z
    .array(
      z.object({
        name: z.string().trim().max(80),
        role: z.string().trim().max(80).optional(),
        avatarUrl: z.string().url().max(500).optional(),
      }),
    )
    .max(20)
    .nullable()
    .optional(),
  bookingRequired: z.boolean().default(false),
  capacity: z.number().int().positive().max(100000).nullable().optional(),
  waitlistEnabled: z.boolean().default(true),
  bookingOpensAt: z.coerce.date().nullable().optional(),
  bookingClosesAt: z.coerce.date().nullable().optional(),
  isFeatured: z.boolean().default(false),
  isMandatory: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).default(0),
}).refine((v) => v.endsAt > v.startsAt, { message: 'endsAt must be after startsAt', path: ['endsAt'] });
