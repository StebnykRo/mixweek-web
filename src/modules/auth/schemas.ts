import { z } from 'zod';

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email()
  .max(254);

export const AuthStartSchema = z.strictObject({
  email: EmailSchema,
  locale: z.enum(['en', 'ru', 'uk']).optional(),
});

export const AuthVerifySchema = z.strictObject({
  email: EmailSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'six digits expected'),
});

export const MfaVerifySchema = z.strictObject({
  code: z.string().trim().regex(/^\d{6}$/),
  trustDevice: z.boolean().optional(),
});

export const MfaConfirmSchema = z.strictObject({
  factorId: z.string().min(10).max(40),
  code: z.string().trim().regex(/^\d{6}$/),
});

export const RecoverySchema = z.strictObject({
  code: z.string().trim().min(6).max(24),
});

export const LogoutSchema = z.strictObject({
  allDevices: z.boolean().optional(),
});

export const ProfilePatchSchema = z.strictObject({
  name: z.string().trim().min(1).max(80).optional(),
  jobTitle: z.string().trim().max(80).nullable().optional(),
  department: z.string().trim().max(80).nullable().optional(),
  team: z.string().trim().max(80).nullable().optional(),
  locale: z.enum(['en', 'ru', 'uk']).optional(),
});

export const ConsentSchema = z.strictObject({
  terms: z.literal(true),
  privacy: z.literal(true),
  documentVersion: z.string().max(32),
  marketing: z.boolean().optional(),
});
