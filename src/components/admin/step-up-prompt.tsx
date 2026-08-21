'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Refreshes the step-up confirmation, then returns to the page that needed it. */
export function StepUpPrompt({ next }: { next: string }) {
  const t = useTranslations('mfa');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await api('/auth/mfa/verify', { method: 'POST', body: { code: code.trim() } });
      router.replace(next);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof ApiCallError ? caught.error.message : t('invalid'));
      setCode('');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex max-w-md flex-col gap-4" onSubmit={confirm} noValidate>
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-2xl">Confirm it is you</h1>
        <p className="text-[15px] text-ink-muted">
          This section holds sensitive settings, so it needs your authenticator code again. Confirmations last fifteen
          minutes.
        </p>
      </div>
      <Input
        label={t('codeLabel')}
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
      <Button type="submit" size="lg" loading={pending} disabled={code.length !== 6}>
        {t('verify')}
      </Button>
    </form>
  );
}
