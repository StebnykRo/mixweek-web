import { z } from 'zod';

/**
 * docs/06-events.md §4.2 — the registration form is stored as JSON and the Zod
 * schema is generated from it on the SERVER. Client-side validation is a
 * duplicate for UX, never the only check. Unknown fields are rejected, not
 * ignored (docs/09 §8).
 */

export const FormFieldSchema = z.object({
  key: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,40}$/),
  type: z.enum(['text', 'textarea', 'number', 'date', 'select', 'multiselect', 'boolean', 'consent']),
  label: z.record(z.string().max(200)).optional(),
  help: z.record(z.string().max(400)).optional(),
  options: z.array(z.string().max(80)).max(50).optional(),
  required: z.boolean().optional(),
  maxLength: z.number().int().min(1).max(2000).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const RegistrationFormSchema = z.object({
  fields: z.array(FormFieldSchema).max(40),
});

export type FormField = z.infer<typeof FormFieldSchema>;
export type RegistrationForm = z.infer<typeof RegistrationFormSchema>;

export function parseRegistrationForm(raw: unknown): RegistrationForm {
  const parsed = RegistrationFormSchema.safeParse(raw ?? { fields: [] });
  return parsed.success ? parsed.data : { fields: [] };
}

/** Builds the answer validator for one event's form definition. */
export function answersSchemaFor(form: RegistrationForm): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of form.fields) {
    let schema: z.ZodTypeAny;
    switch (field.type) {
      case 'textarea':
      case 'text':
        schema = z.string().trim().max(field.maxLength ?? 500);
        break;
      case 'number':
        schema = z.coerce.number().min(field.min ?? -1e9).max(field.max ?? 1e9);
        break;
      case 'date':
        schema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
        break;
      case 'select':
        schema = field.options?.length ? z.enum(field.options as [string, ...string[]]) : z.string().max(80);
        break;
      case 'multiselect':
        schema = z
          .array(field.options?.length ? z.enum(field.options as [string, ...string[]]) : z.string().max(80))
          .max(field.options?.length ?? 50);
        break;
      case 'boolean':
        schema = z.boolean();
        break;
      case 'consent':
        // A consent field that is required must be actively granted.
        schema = field.required ? z.literal(true) : z.boolean();
        break;
      default:
        schema = z.string().max(200);
    }
    shape[field.key] = field.required && field.type !== 'consent' ? schema : schema.optional();
  }

  return z.strictObject(shape);
}

export function validateAnswers(rawForm: unknown, answers: unknown): Record<string, unknown> {
  const form = parseRegistrationForm(rawForm);
  if (form.fields.length === 0) return {};
  return answersSchemaFor(form).parse(answers ?? {});
}
