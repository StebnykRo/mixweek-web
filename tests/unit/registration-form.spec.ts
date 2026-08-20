import { describe, expect, it } from 'vitest';
import { answersSchemaFor, parseRegistrationForm, validateAnswers } from '@/modules/registrations/form';

/** docs/06-events.md §4.2 — the form definition drives server-side validation. */

const form = {
  fields: [
    { key: 'arrivalDate', type: 'date' as const, required: true },
    { key: 'dietary', type: 'select' as const, options: ['none', 'vegetarian', 'vegan'] },
    { key: 'needsTransfer', type: 'boolean' as const },
    { key: 'notes', type: 'textarea' as const, maxLength: 50 },
    { key: 'photoOk', type: 'consent' as const, required: true },
  ],
};

describe('validateAnswers', () => {
  it('accepts a complete, valid set', () => {
    const answers = validateAnswers(form, {
      arrivalDate: '2026-10-21',
      dietary: 'vegan',
      needsTransfer: true,
      notes: 'Arriving late',
      photoOk: true,
    });
    expect(answers.dietary).toBe('vegan');
  });

  it('rejects a missing required field', () => {
    expect(() => validateAnswers(form, { photoOk: true })).toThrow();
  });

  it('rejects a value outside the declared options', () => {
    expect(() =>
      validateAnswers(form, { arrivalDate: '2026-10-21', dietary: 'pescatarian', photoOk: true }),
    ).toThrow();
  });

  it('rejects a malformed date', () => {
    expect(() => validateAnswers(form, { arrivalDate: 'tomorrow', photoOk: true })).toThrow();
  });

  it('rejects text longer than the declared maximum', () => {
    expect(() =>
      validateAnswers(form, { arrivalDate: '2026-10-21', notes: 'x'.repeat(51), photoOk: true }),
    ).toThrow();
  });

  it('rejects an extra field rather than silently dropping it', () => {
    // docs/09 §8 — strictObject: unknown keys are an error, not noise.
    expect(() =>
      validateAnswers(form, { arrivalDate: '2026-10-21', photoOk: true, isAdmin: true }),
    ).toThrow();
  });

  it('requires a required consent to be actually granted', () => {
    expect(() => validateAnswers(form, { arrivalDate: '2026-10-21', photoOk: false })).toThrow();
  });

  it('returns an empty object when the event has no form', () => {
    expect(validateAnswers(null, { anything: 'goes' })).toEqual({});
    expect(validateAnswers({ fields: [] }, undefined)).toEqual({});
  });
});

describe('parseRegistrationForm', () => {
  it('falls back to an empty form for malformed definitions', () => {
    expect(parseRegistrationForm('not a form')).toEqual({ fields: [] });
    expect(parseRegistrationForm({ fields: 'nope' })).toEqual({ fields: [] });
  });

  it('accepts the seeded Mix Week definition', () => {
    const parsed = parseRegistrationForm({
      fields: [
        { key: 'arrivalDate', type: 'date', label: { en: 'Arrival date' }, required: true },
        { key: 'tshirtSize', type: 'select', options: ['S', 'M', 'L', 'XL'] },
      ],
    });
    expect(parsed.fields).toHaveLength(2);
  });
});

describe('answersSchemaFor', () => {
  it('makes optional fields genuinely optional', () => {
    const schema = answersSchemaFor({ fields: [{ key: 'notes', type: 'text' }] });
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('coerces a numeric string and enforces the range', () => {
    const schema = answersSchemaFor({ fields: [{ key: 'guests', type: 'number', min: 0, max: 3, required: true }] });
    expect(schema.parse({ guests: '2' })).toEqual({ guests: 2 });
    expect(schema.safeParse({ guests: 9 }).success).toBe(false);
  });
});
