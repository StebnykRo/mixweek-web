'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckboxField } from '@/components/ui/checkbox';
import { LOCALE_COOKIE, LOCALE_LABELS, isLocale, type Locale } from '@/i18n/config';

type Profile = { name: string; jobTitle: string; department: string; team: string; locale: string };

/**
 * docs/07-screens.md §2 — four short steps: consent, profile, language, install.
 *
 * Notification permission is deliberately NOT requested here (docs/11 §3): the
 * browser gives one chance, and spending it before the person has seen anything
 * useful all but guarantees a refusal.
 */
export function OnboardingFlow({
  locales,
  legalVersion,
  profile: initialProfile,
}: {
  locales: string[];
  legalVersion: string;
  profile: Profile;
}) {
  const t = useTranslations('onboarding');
  const tc = useTranslations('common');
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  const [pending, setPending] = useState(false);

  const availableLocales = locales.filter(isLocale) as Locale[];

  async function finish() {
    setPending(true);
    try {
      // docs/03 §2 step 4 — the acceptance is recorded with its document
      // version before anything else, so the consent trail is complete even if
      // the profile write later fails.
      await api('/me/consents', {
        method: 'POST',
        body: {
          documentVersion: legalVersion,
          consents: [
            { kind: 'TERMS', granted: terms },
            { kind: 'PRIVACY', granted: privacy },
          ],
        },
      });
      await api('/me', {
        method: 'PATCH',
        body: {
          name: profile.name.trim(),
          jobTitle: profile.jobTitle.trim() || null,
          department: profile.department.trim() || null,
          team: profile.team.trim() || null,
          locale: profile.locale,
        },
      });
      document.cookie = `${LOCALE_COOKIE}=${profile.locale}; path=/; max-age=31536000; samesite=lax`;
      router.replace('/events');
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const steps = [
    {
      title: t('termsTitle'),
      body: t('termsBody'),
      content: (
        <div className="flex flex-col gap-3">
          <CheckboxField
            checked={terms}
            onCheckedChange={setTerms}
            label={
              <Link href="/legal/terms" className="font-semibold text-primary-700 underline">
                Terms of Use ({legalVersion})
              </Link>
            }
          />
          <CheckboxField
            checked={privacy}
            onCheckedChange={setPrivacy}
            label={
              <Link href="/legal/privacy" className="font-semibold text-primary-700 underline">
                Privacy Policy ({legalVersion})
              </Link>
            }
          />
        </div>
      ),
      canContinue: terms && privacy,
    },
    {
      title: t('profileTitle'),
      body: t('profileBody'),
      content: (
        <div className="flex flex-col gap-4">
          <Input
            label={t('name')}
            required
            value={profile.name}
            onChange={(e) => setProfile({ ...profile, name: e.target.value })}
            autoComplete="name"
          />
          <Input
            label={t('jobTitle')}
            value={profile.jobTitle}
            onChange={(e) => setProfile({ ...profile, jobTitle: e.target.value })}
          />
          <Input
            label={t('department')}
            value={profile.department}
            onChange={(e) => setProfile({ ...profile, department: e.target.value })}
          />
          <Input label={t('team')} value={profile.team} onChange={(e) => setProfile({ ...profile, team: e.target.value })} />
        </div>
      ),
      canContinue: profile.name.trim().length > 0,
    },
    {
      title: t('localeTitle'),
      body: '',
      content: (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t('localeTitle')}</legend>
          {availableLocales.map((locale) => (
            <label
              key={locale}
              className="flex h-12 cursor-pointer items-center gap-3 rounded-md border border-divider bg-surface px-4"
            >
              <input
                type="radio"
                name="locale"
                value={locale}
                checked={profile.locale === locale}
                onChange={() => setProfile({ ...profile, locale })}
                className="h-5 w-5 accent-[var(--color-primary-500)]"
              />
              {LOCALE_LABELS[locale]}
            </label>
          ))}
        </fieldset>
      ),
      canContinue: true,
    },
    {
      title: t('installTitle'),
      body: t('installBody'),
      content: <InstallHint />,
      canContinue: true,
    },
  ];

  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs font-bold uppercase tracking-[2px] text-ink-muted">
        {step + 1} / {steps.length}
      </p>
      <div>
        <h1 className="font-display text-3xl">{current.title}</h1>
        {current.body ? <p className="mt-2 text-[15px] text-ink-muted">{current.body}</p> : null}
      </div>

      {current.content}

      <div className="flex gap-3">
        {step > 0 ? (
          <Button variant="quiet" size="lg" onClick={() => setStep(step - 1)}>
            {tc('back')}
          </Button>
        ) : null}
        <Button
          size="lg"
          full
          loading={pending}
          disabled={!current.canContinue}
          onClick={() => (isLast ? void finish() : setStep(step + 1))}
        >
          {isLast ? t('finish') : tc('continue')}
        </Button>
      </div>
    </div>
  );
}

function InstallHint() {
  const t = useTranslations('install');
  const isIos = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
  return (
    <div className="rounded-md bg-surface p-4 text-sm text-ink-muted">{isIos ? t('ios') : t('android')}</div>
  );
}
