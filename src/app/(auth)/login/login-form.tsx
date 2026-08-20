'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckboxField } from '@/components/ui/checkbox';
import { BrandLogo } from '@/components/patterns/brand-logo';
import { brandToCssVars } from '@/modules/branding/tokens';

type BrandSummary = { appName: string; kicker: string | null; logoMarkUrl: string | null };

type StartResponse = {
  ok: true;
  brand: (BrandSummary & { id: string; key: string; tokens: unknown }) | null;
};

type VerifyResponse = { ok: true; mfaRequired: boolean; next: string };

const RESEND_SECONDS = 60;

/**
 * docs/07-screens.md §1 — email, then a six-digit code, then the second factor
 * if the tenant's policy asks for it.
 *
 * The brand switches the moment the domain is known (docs/04 §2.1) — that is
 * the whole white-label promise, visible before the person has even opened
 * their mail.
 */
export function LoginForm({ initialBrand, googleEnabled }: { initialBrand: BrandSummary; googleEnabled: boolean }) {
  const t = useTranslations('login');
  const tc = useTranslations('common');
  const router = useRouter();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [brand, setBrand] = useState<BrandSummary>(initialBrand);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = setTimeout(() => setResendIn((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const emailValid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());

  async function submitEmail(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api<StartResponse>('/auth/start', { method: 'POST', body: { email: email.trim() } });
      if (result.brand) {
        setBrand({
          appName: result.brand.appName,
          kicker: result.brand.kicker,
          logoMarkUrl: result.brand.logoMarkUrl,
        });
        // Applying the variables straight onto the document swaps the theme
        // without a reload and without a flash of the neutral brand.
        const css = brandToCssVars(result.brand.tokens);
        for (const declaration of css.split(';')) {
          const [name, value] = declaration.split(':');
          if (name?.startsWith('--') && value) document.documentElement.style.setProperty(name.trim(), value.trim());
        }
      }
      setStep('code');
      setResendIn(RESEND_SECONDS);
    } catch (caught) {
      setError(caught instanceof ApiCallError ? caught.error.message : t('genericError'));
    } finally {
      setPending(false);
    }
  }

  async function submitCode(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api<VerifyResponse>('/auth/verify', {
        method: 'POST',
        body: { email: email.trim(), code: code.trim() },
      });
      router.replace(result.next);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiCallError ? caught.error.message : t('wrongCode'));
      setCode('');
      codeRef.current?.focus();
    } finally {
      setPending(false);
    }
  }

  const maskedEmail = email.replace(/^(.).*(@.*)$/, '$1***$2');

  return (
    <div className="flex flex-col gap-7">
      <BrandLogo appName={brand.appName} kicker={brand.kicker} markUrl={brand.logoMarkUrl} size={74} showText={false} />

      <div>
        {brand.kicker ? (
          <p className="text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">{brand.kicker}</p>
        ) : null}
        <h1 className="mt-1 font-display text-[44px] leading-[1.05]">{step === 'email' ? brand.appName : t('codeTitle')}</h1>
        <p className="mt-3 text-[15px] text-ink-muted">
          {step === 'email' ? t('subtitle') : t('codeSent', { email: maskedEmail })}
        </p>
      </div>

      {step === 'email' ? (
        <form onSubmit={submitEmail} className="flex flex-col gap-5" noValidate>
          <Input
            label={t('emailLabel')}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder={t('emailPlaceholder')}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={error ?? undefined}
          />

          <CheckboxField
            checked={accepted}
            onCheckedChange={setAccepted}
            label={
              <>
                {t.rich('consent', {
                  terms: (chunks) => (
                    <Link href="/legal/terms" className="font-semibold text-primary-700 underline">
                      {chunks}
                    </Link>
                  ),
                  privacy: (chunks) => (
                    <Link href="/legal/privacy" className="font-semibold text-primary-700 underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </>
            }
          />

          <Button type="submit" size="lg" full disabled={!accepted || !emailValid} loading={pending}>
            {t('submit')}
          </Button>

          {googleEnabled ? (
            <Button type="button" variant="outline" size="lg" full>
              {t('google')}
            </Button>
          ) : null}
        </form>
      ) : (
        <form onSubmit={submitCode} className="flex flex-col gap-5" noValidate>
          <Input
            ref={codeRef}
            label={t('codeLabel')}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            error={error ?? undefined}
            className="text-center text-2xl tracking-[10px]"
          />

          <Button type="submit" size="lg" full disabled={code.length !== 6} loading={pending}>
            {t('codeSubmit')}
          </Button>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              className="font-semibold text-primary-700 disabled:opacity-50"
              disabled={resendIn > 0 || pending}
              onClick={(e) => submitEmail(e as unknown as React.FormEvent)}
            >
              {resendIn > 0 ? t('resendIn', { seconds: resendIn }) : t('resend')}
            </button>
            <button
              type="button"
              className="text-ink-muted underline"
              onClick={() => {
                setStep('email');
                setCode('');
                setError(null);
              }}
            >
              {t('changeEmail')}
            </button>
          </div>
        </form>
      )}

      <p className="text-xs text-ink-muted">
        {t('footnote')} · {tc('appName')}
      </p>
    </div>
  );
}
