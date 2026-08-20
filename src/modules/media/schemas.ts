import { z } from 'zod';
import { ExternalUrlSchema } from './url';

export const MediaKindSchema = z.enum([
  'PARTICIPANT_UPLOAD',
  'PHOTOGRAPHER_GALLERY',
  'VIDEO',
  'PRESS',
  'AFTERMOVIE',
  'MATERIALS',
]);

export const MediaInputSchema = z.strictObject({
  kind: MediaKindSchema,
  title: z.string().trim().min(1).max(120),
  description: z.string().max(2000).nullable().optional(),
  url: ExternalUrlSchema,
  /** docs/08 §3 — a card cannot be published without its own cover. */
  coverUrl: z.string().url().max(500),
  authorName: z.string().trim().max(80).nullable().optional(),
  authorUrl: ExternalUrlSchema.nullable().optional(),
  accessNote: z.string().trim().max(160).nullable().optional(),
  acceptsUploads: z.boolean().default(false),
  itemCountHint: z.number().int().min(0).max(1_000_000).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).default(0),
});

export const MediaReportSchema = z.strictObject({
  reason: z.enum(['PRIVACY', 'INAPPROPRIATE', 'BROKEN_LINK', 'WRONG_ACCESS', 'OTHER']),
  comment: z.string().trim().max(1000).optional(),
});

/** docs/08 §5 — the fixed display order of the groups. */
export const MEDIA_GROUP_ORDER = [
  'PARTICIPANT_UPLOAD',
  'PHOTOGRAPHER_GALLERY',
  'AFTERMOVIE',
  'VIDEO',
  'MATERIALS',
  'PRESS',
] as const;
