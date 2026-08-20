'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/providers/toast-provider';

export function CancelOrderButton({ orderId }: { orderId: string }) {
  const tc = useTranslations('common');
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="quiet"
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api(`/orders/${orderId}`, { method: 'DELETE' });
          router.refresh();
        } catch {
          toast.show(tc('errorTitle'), 'error');
        } finally {
          setPending(false);
        }
      }}
    >
      {tc('cancel')}
    </Button>
  );
}
