'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckboxField } from '@/components/ui/checkbox';

type SetupResponse = { factorId: string; otpauthUrl: string; secret: string; qrSvg: string };
type ConfirmResponse = { ok: true; recoveryCodes: string[] };

export function MfaForm({ enrolled, accountLabel }: { enrolled: boolean; accountLabel: string }) {
  const t = useTranslations('mfa');
  const router = useRouter();

  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (enrolled) return;
    let cancelled = false;
    void api<SetupResponse>('/auth/mfa/setup', { method: 'POST' })
      .then((result) => {
        if (!cancelled) setSetup(result);
      })
      .catch(() => setError(t('invalid')));
    return () => {
      cancelled = true;
    };
  }, [enrolled, t]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      if (!enrolled && setup) {
        const result = await api<ConfirmResponse>('/auth/mfa/confirm', {
          method: 'POST',
          body: { factorId: setup.factorId, code },
        });
        setRecoveryCodes(result.recoveryCodes);
      } else if (mode === 'recovery') {
        await api('/auth/mfa/recovery', { method: 'POST', body: { code: code.trim() } });
        router.replace('/events');
        router.refresh();
      } else {
        await api('/auth/mfa/verify', { method: 'POST', body: { code, trustDevice } });
        router.replace('/events');
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof ApiCallError ? caught.error.message : t('invalid'));
      setCode('');
    } finally {
      setPending(false);
    }
  }

  if (recoveryCodes) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-3xl">{t('recoveryTitle')}</h1>
          <p className="mt-2 text-[15px] text-ink-muted">{t('recoveryBody')}</p>
        </div>
        <ul className="grid grid-cols-2 gap-2 rounded-md bg-surface p-4 font-mono text-sm">
          {recoveryCodes.map((recoveryCode) => (
            <li key={recoveryCode}>{recoveryCode}</li>
          ))}
        </ul>
        <Button
          size="lg"
          full
          onClick={() => {
            router.replace('/onboarding');
            router.refresh();
          }}
        >
          {t('verify')}
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6" noValidate>
      <div>
        <h1 className="font-display text-3xl">{enrolled ? t('title') : t('setupTitle')}</h1>
        <p className="mt-2 text-[15px] text-ink-muted">{enrolled ? t('required') : t('setupBody')}</p>
      </div>

      {!enrolled && setup ? (
        <div className="flex flex-col items-center gap-3 rounded-md bg-surface p-4">
          {/* Rendered server-side by the qrcode library; no canvas, no CSP exception. */}
          <div className="w-[220px]" dangerouslySetInnerHTML={{ __html: setup.qrSvg }} />
          <p className="text-xs text-ink-muted">{t('manualEntry')}</p>
          <code className="break-all text-center text-xs font-semibold">{setup.secret}</code>
          <p className="text-xs text-ink-muted">{accountLabel}</p>
        </div>
      ) : null}

      <Input
        label={mode === 'recovery' ? t('recoveryLabel') : t('codeLabel')}
        inputMode={mode === 'recovery' ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        maxLength={mode === 'recovery' ? 24 : 6}
        required
        value={code}
        onChange={(e) => setCode(mode === 'recovery' ? e.target.value.toUpperCase() : e.target.value.replace(/\D/g, ''))}
        error={error ?? undefined}
        className={mode === 'recovery' ? '' : 'text-center text-2xl tracking-[10px]'}
      />

      {enrolled && mode === 'totp' ? (
        <CheckboxField label={t('trustDevice')} checked={trustDevice} onCheckedChange={setTrustDevice} />
      ) : null}

      <Button type="submit" size="lg" full loading={pending} disabled={code.length < (mode === 'recovery' ? 6 : 6)}>
        {t('verify')}
      </Button>

      {enrolled ? (
        <button
          type="button"
          className="text-sm text-ink-muted underline"
          onClick={() => {
            setMode(mode === 'totp' ? 'recovery' : 'totp');
            setCode('');
            setError(null);
          }}
        >
          {mode === 'totp' ? t('recoveryLink') : t('title')}
        </button>
      ) : null}
    </form>
  );
}
