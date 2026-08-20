'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/providers/toast-provider';

export function PrivacyPanel({ deletionEffectiveAt }: { deletionEffectiveAt: string | null }) {
  const t = useTranslations('profile');
  const tc = useTranslations('common');
  const toast = useToast();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function request(kind: 'EXPORT' | 'DELETE') {
    setPending(true);
    try {
      await api('/me/data-requests', { method: 'POST', body: { kind } });
      toast.show(tc('saved'), 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : tc('errorTitle'), 'error');
    } finally {
      setPending(false);
      setConfirmOpen(false);
    }
  }

  async function cancelDeletion() {
    setPending(true);
    try {
      await api('/me/data-requests', { method: 'DELETE' });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" full loading={pending} onClick={() => void request('EXPORT')}>
        {t('exportData')}
      </Button>

      {deletionEffectiveAt ? (
        <div className="rounded-lg bg-warning/15 p-4">
          <p className="text-sm font-semibold">{t('deleteRequested', { date: deletionEffectiveAt })}</p>
          <Button variant="quiet" className="mt-3" loading={pending} onClick={() => void cancelDeletion()}>
            {tc('cancel')}
          </Button>
        </div>
      ) : (
        <Button variant="destructive" full onClick={() => setConfirmOpen(true)}>
          {t('deleteAccount')}
        </Button>
      )}

      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent title={t('deleteAccount')} description={t('deleteExplainer')}>
          <div className="flex gap-2">
            <Button variant="destructive" loading={pending} onClick={() => void request('DELETE')}>
              {t('deleteAccount')}
            </Button>
            <Button variant="quiet" onClick={() => setConfirmOpen(false)}>
              {tc('cancel')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
