'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/providers/toast-provider';

/**
 * docs/03-auth.md §5 — regenerating recovery codes is a step-up action: the
 * server refuses it without a second factor confirmed in the last 15 minutes,
 * so the dialog asks for a code first.
 */
export function SecurityPanel({ mfaEnrolled, recoveryLeft }: { mfaEnrolled: boolean; recoveryLeft: number }) {
  const t = useTranslations('profile');
  const tm = useTranslations('mfa');
  const toast = useToast();

  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function confirmStepUp() {
    setPending(true);
    try {
      await api('/auth/mfa/verify', { method: 'POST', body: { code } });
      const result = await api<{ recoveryCodes: string[] }>('/auth/recovery-codes', { method: 'POST' });
      setCodes(result.recoveryCodes);
      setStepUpOpen(false);
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : tm('invalid'), 'error');
    } finally {
      setPending(false);
      setCode('');
    }
  }

  return (
    <section className="rounded-lg bg-surface p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">{t('security')}</h2>
      <p className="mt-2 font-semibold">
        {t('twoFactor')}: {mfaEnrolled ? t('twoFactorOn') : t('twoFactorOff')}
      </p>
      {mfaEnrolled ? (
        <>
          <p className="mt-1 text-xs text-ink-muted">{tm('recoveryTitle')}: {recoveryLeft}</p>
          <Button variant="outline" className="mt-3" onClick={() => setStepUpOpen(true)}>
            {t('regenerateRecovery')}
          </Button>
        </>
      ) : (
        <Button variant="outline" className="mt-3" asChild>
          <a href="/login/mfa">{tm('setupTitle')}</a>
        </Button>
      )}

      {codes ? (
        <ul className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-bg p-4 font-mono text-sm">
          {codes.map((value) => (
            <li key={value}>{value}</li>
          ))}
        </ul>
      ) : null}

      <Sheet open={stepUpOpen} onOpenChange={setStepUpOpen}>
        <SheetContent title={tm('stepUpTitle')} description={tm('stepUpBody')}>
          <Input
            label={tm('codeLabel')}
            inputMode="numeric"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            className="text-center text-2xl tracking-[10px]"
          />
          <Button className="mt-4" full loading={pending} disabled={code.length !== 6} onClick={confirmStepUp}>
            {tm('verify')}
          </Button>
        </SheetContent>
      </Sheet>
    </section>
  );
}
