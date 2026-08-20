'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiCallError, idempotencyKey } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckboxField } from '@/components/ui/checkbox';
import { CapacityMeter } from './capacity-meter';
import { useToast } from '@/components/providers/toast-provider';

export type FormFieldDef = {
  key: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multiselect' | 'boolean' | 'consent';
  label?: Record<string, string>;
  help?: Record<string, string>;
  options?: string[];
  required?: boolean;
  maxLength?: number;
};

export type RegistrationFormProps = {
  eventSlug: string;
  fields: FormFieldDef[];
  capacity: number | null;
  registeredCount: number;
  waitlistEnabled: boolean;
  locale: string;
};

type Answers = Record<string, string | number | boolean | string[]>;

/**
 * docs/07-screens.md §5 — one step per screen on mobile, one page with sections
 * from `lg`. Client validation is a convenience; the server re-validates the
 * answers against the event's own form definition (docs/06 §4.2).
 */
export function RegistrationForm({
  eventSlug,
  fields,
  capacity,
  registeredCount,
  waitlistEnabled,
  locale,
}: RegistrationFormProps) {
  const t = useTranslations('registration');
  const tc = useTranslations('common');
  const router = useRouter();
  const toast = useToast();

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({});
  const [photoConsent, setPhotoConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ status: string; waitlistPosition: number | null } | null>(null);

  const full = capacity !== null && registeredCount >= capacity;
  // With no questions to ask, three screens of headings is ceremony rather
  // than a form: confirm, consent and submit all fit on one.
  const steps = fields.length > 0 ? ['confirm', 'fields', 'consents', 'summary'] : ['single'];

  async function submit() {
    setPending(true);
    try {
      const response = await api<{ status: string; waitlistPosition: number | null }>(
        `/events/${eventSlug}/registrations`,
        {
          method: 'POST',
          body: { answers, photoConsent },
          idempotencyKey: idempotencyKey(`register:${eventSlug}`),
        },
      );
      setResult(response);
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : tc('errorTitle'), 'error');
    } finally {
      setPending(false);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <h2 className="font-display text-3xl">
          {result.status === 'WAITLISTED' ? t('successWaitlist') : t('success')}
        </h2>
        {result.waitlistPosition ? (
          <p className="text-[15px] text-ink-muted">{t('position', { position: result.waitlistPosition })}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/events/${eventSlug}/programme`}>{t('goToProgramme')}</Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={`/api/v1/events/${eventSlug}/my-schedule.ics`}>.ics</a>
          </Button>
        </div>
      </div>
    );
  }

  const currentStep = steps[step]!;

  return (
    <div className="flex flex-col gap-6">
      {steps.length > 1 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-bold uppercase tracking-[2px] text-ink-muted">
            {t('step', { current: step + 1, total: steps.length })}
          </p>
          {/* A bar rather than only a number: on a phone the count alone
              gives no sense of how much is left. */}
          <div className="flex gap-1.5" aria-hidden="true">
            {steps.map((name, index) => (
              <span
                key={name}
                className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-primary-500' : 'bg-divider'}`}
              />
            ))}
          </div>
        </div>
      ) : null}

      {capacity !== null ? (
        <CapacityMeter
          taken={registeredCount}
          total={capacity}
          labels={{
            capacity: `${registeredCount} / ${capacity}`,
            waitlist: '',
          }}
        />
      ) : null}

      {currentStep === 'single' ? (
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-2xl">{full && waitlistEnabled ? t('joinWaitlist') : t('confirmTitle')}</h2>
          {full && waitlistEnabled ? <p className="text-[15px] text-ink-muted">{t('waitlistExplainer')}</p> : null}
          <CheckboxField label={t('photoConsent')} checked={photoConsent} onCheckedChange={setPhotoConsent} />
        </div>
      ) : null}

      {currentStep === 'confirm' ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl">{full && waitlistEnabled ? t('joinWaitlist') : t('confirmTitle')}</h2>
          {full && waitlistEnabled ? <p className="text-[15px] text-ink-muted">{t('waitlistExplainer')}</p> : null}
        </div>
      ) : null}

      {currentStep === 'fields' ? (
        <div className="flex flex-col gap-4">
          <h2 className="font-display text-2xl">{t('details')}</h2>
          {fields.map((field) => (
            <FieldInput
              key={field.key}
              field={field}
              locale={locale}
              value={answers[field.key]}
              onChange={(value) => setAnswers((current) => ({ ...current, [field.key]: value }))}
            />
          ))}
        </div>
      ) : null}

      {currentStep === 'consents' ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl">{t('consents')}</h2>
          {/* docs/08 §7 — photo consent is its own checkbox, never folded into Terms. */}
          <CheckboxField label={t('photoConsent')} checked={photoConsent} onCheckedChange={setPhotoConsent} />
        </div>
      ) : null}

      {currentStep === 'summary' ? (
        <div className="flex flex-col gap-3">
          <h2 className="font-display text-2xl">{t('summary')}</h2>
          <dl className="rounded-md bg-surface p-4 text-sm">
            {fields.map((field) => (
              <div key={field.key} className="flex justify-between gap-4 py-1">
                <dt className="text-ink-muted">{labelFor(field, locale)}</dt>
                <dd className="font-semibold">{formatAnswer(answers[field.key])}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-ink-muted">{t('photoConsent')}</dt>
              <dd className="font-semibold">{photoConsent ? tc('yes') : tc('no')}</dd>
            </div>
          </dl>
        </div>
      ) : null}

      {currentStep === 'fields' && missingFields(fields, answers).length > 0 ? (
        <p className="text-sm text-ink-muted">
          {t('stillNeeded', {
            fields: missingFields(fields, answers)
              .map((field) => labelFor(field, locale))
              .join(', '),
          })}
        </p>
      ) : null}

      <div className="flex gap-3">
        {step > 0 ? (
          <Button variant="quiet" size="lg" onClick={() => setStep(step - 1)}>
            {tc('back')}
          </Button>
        ) : null}
        {step < steps.length - 1 ? (
          <Button size="lg" full onClick={() => setStep(step + 1)} disabled={!canAdvance(currentStep, fields, answers)}>
            {tc('continue')}
          </Button>
        ) : (
          <Button size="lg" full loading={pending} onClick={submit}>
            {full && waitlistEnabled ? t('joinWaitlist') : t('submit')}
          </Button>
        )}
      </div>
    </div>
  );
}

function missingFields(fields: FormFieldDef[], answers: Answers): FormFieldDef[] {
  return fields.filter((field) => {
    if (!field.required) return false;
    const value = answers[field.key];
    if (value === undefined || value === '') return true;
    if (Array.isArray(value)) return value.length === 0;
    // A required consent must be ticked. A required yes/no question is
    // answered by "no" just as much as by "yes" — treating false as blank
    // made such a question impossible to get past.
    if (field.type === 'consent') return value === false;
    return false;
  });
}

function canAdvance(step: string, fields: FormFieldDef[], answers: Answers): boolean {
  if (step !== 'fields') return true;
  return missingFields(fields, answers).length === 0;
}

function labelFor(field: FormFieldDef, locale: string): string {
  return field.label?.[locale] ?? field.label?.en ?? field.key;
}

function formatAnswer(value: Answers[string] | undefined): string {
  if (value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function FieldInput({
  field,
  locale,
  value,
  onChange,
}: {
  field: FormFieldDef;
  locale: string;
  value: Answers[string] | undefined;
  onChange: (value: Answers[string]) => void;
}) {
  const label = labelFor(field, locale);
  const help = field.help?.[locale] ?? field.help?.en;

  if (field.type === 'boolean' || field.type === 'consent') {
    return <CheckboxField label={label} checked={value === true} onCheckedChange={onChange} />;
  }

  if (field.type === 'select') {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor={`field-${field.key}`}>
          {label}
        </label>
        <select
          id={`field-${field.key}`}
          value={(value as string) ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="h-12 w-full rounded-md border border-divider bg-surface px-4 text-[15px]"
        >
          <option value="">—</option>
          {field.options?.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {help ? <p className="text-xs text-ink-muted">{help}</p> : null}
      </div>
    );
  }

  if (field.type === 'textarea') {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor={`field-${field.key}`}>
          {label}
        </label>
        <textarea
          id={`field-${field.key}`}
          maxLength={field.maxLength ?? 500}
          rows={4}
          value={(value as string) ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-md border border-divider bg-surface p-4 text-[15px]"
        />
        {help ? <p className="text-xs text-ink-muted">{help}</p> : null}
      </div>
    );
  }

  return (
    <Input
      label={label}
      hint={help}
      type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
      required={field.required}
      value={(value as string) ?? ''}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
