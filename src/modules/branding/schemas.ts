import { z } from 'zod';

/**
 * docs/04-white-label.md §3.1 — BrandTokensSchema.
 *
 * The hex regex is not cosmetic. Brand tokens end up inside a `<style>` block,
 * so this is the choke point for CSS injection: anything that is not a literal
 * colour, pixel value or allow-listed font name never reaches the document.
 */
export const HexSchema = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'must be a 6- or 8-digit hex colour');

export const ColorRampSchema = z.object({
  50: HexSchema,
  100: HexSchema,
  200: HexSchema,
  300: HexSchema,
  400: HexSchema,
  500: HexSchema,
  600: HexSchema,
  700: HexSchema,
  800: HexSchema,
  900: HexSchema,
});

export const PxSchema = z.string().regex(/^\d{1,4}px$/, 'must be a pixel value');

const ShadowSchema = z
  .string()
  .max(120)
  .regex(/^[0-9a-zA-Z\s.,%()#/-]+$/, 'contains characters that are not allowed in a shadow value');

/** docs/04 §4.4 — fonts come from a fixed allowlist, never an arbitrary URL. */
export const ALLOWED_GOOGLE_FONTS = [
  'Caprasimo',
  'Figtree',
  'Inter',
  'Manrope',
  'Playfair Display',
  'Space Grotesk',
  'Source Sans 3',
  'Rubik',
  'Lora',
  'IBM Plex Sans',
] as const;

const FontNameSchema = z
  .string()
  .max(48)
  .regex(/^[A-Za-z0-9 ]+$/, 'font name may contain letters, digits and spaces only');

export const BrandTokensSchema = z.object({
  mode: z.enum(['light', 'dark', 'auto']).default('light'),
  colors: z.object({
    primary: ColorRampSchema,
    secondary: ColorRampSchema,
    neutral: ColorRampSchema,
    bg: HexSchema,
    surface: HexSchema,
    ink: HexSchema,
    inkMuted: HexSchema,
    divider: HexSchema,
    success: HexSchema,
    warning: HexSchema,
    danger: HexSchema,
  }),
  radius: z.object({ sm: PxSchema, md: PxSchema, lg: PxSchema, pill: PxSchema }),
  font: z.object({
    display: FontNameSchema,
    body: FontNameSchema,
    source: z.enum(['google', 'self-hosted', 'system']),
    displayUrl: z.string().url().optional(),
    bodyUrl: z.string().url().optional(),
    scale: z.number().min(0.9).max(1.15).default(1),
  }),
  shadow: z.object({ sm: ShadowSchema, md: ShadowSchema, lg: ShadowSchema }).optional(),
});

export type BrandTokens = z.infer<typeof BrandTokensSchema>;

export const BrandInputSchema = z.strictObject({
  key: z.string().min(2).max(48).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(80),
  appName: z.string().min(1).max(40),
  kicker: z.string().max(40).nullable().optional(),
  logoLightUrl: z.string().url().max(500).nullable().optional(),
  logoDarkUrl: z.string().url().max(500).nullable().optional(),
  logoMarkUrl: z.string().url().max(500).nullable().optional(),
  ogImageUrl: z.string().url().max(500).nullable().optional(),
  tokens: BrandTokensSchema,
  isDefault: z.boolean().optional(),
});
