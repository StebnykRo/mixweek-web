'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type VerifyResponse = { next: string };

/**
 * Shown when a sign-in link is opened somewhere other than the browser that
 * asked for it.
 *
 * The previous behaviour was to say "go back to the tab where you started" and
 * offer nothing else, which is sound advice for a link that arrived by email
 * and useless for one handed over directly — there is no such tab, so the
 * person had no way in at all.
 *
 * Nothing is loosened here. consumeCode() still decides: a link bound to a
 * browser demands that browser, so a forwarded email is still not enough on
 * its own. A link issued out of band by an operator (ops:signin-link) carries
 * no binding, and for it the six-digit code is the second factor.
 */
export function UnboundCodeForm() {
  const t = useTranslations('login');
  const router = useRouter();
  const codeRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await api<VerifyResponse>('/auth/verify', {
        method: 'POST',
        body: { email: email.trim().toLowerCase(), code: code.trim() },
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

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <Input
        label={t('emailLabel')}
        type="email"
        autoComplete="email"
        inputMode="email"
        placeholder={t('emailPlaceholder')}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <Input
        ref={codeRef}
        label={t('codeLabel')}
        // A numeric keypad on a phone, and the browser's own one-time-code
        // autofill where the platform offers it.
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        required
      />
      {error ? (
        <p className="text-sm font-semibold text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" size="lg" full loading={pending} disabled={code.length !== 6 || !email.trim()}>
        {t('codeSubmit')}
      </Button>
    </form>
  );
}
