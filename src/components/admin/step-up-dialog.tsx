'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';

/**
 * docs/03-auth.md §5 — sensitive actions need a second factor confirmed in the
 * last 15 minutes. The dialog only refreshes that confirmation; the server
 * still decides whether the action itself is allowed.
 */
export function StepUpDialog({
  open,
  onOpenChange,
  onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmed: () => void;
}) {
  const t = useTranslations('mfa');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      await api('/auth/mfa/verify', { method: 'POST', body: { code } });
      setCode('');
      onConfirmed();
    } catch (caught) {
      setError(caught instanceof ApiCallError ? caught.error.message : t('invalid'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={t('stepUpTitle')} description={t('stepUpBody')}>
        <Input
          label={t('codeLabel')}
          inputMode="numeric"
          maxLength={6}
          value={code}
          error={error ?? undefined}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          className="text-center text-2xl tracking-[10px]"
        />
        <Button className="mt-4" full loading={pending} disabled={code.length !== 6} onClick={confirm}>
          {t('verify')}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
