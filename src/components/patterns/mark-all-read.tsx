'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

export function MarkAllReadButton({ label }: { label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="ghost"
      size="sm"
      loading={pending}
      onClick={async () => {
        setPending(true);
        try {
          await api('/me/notifications/all/read', { method: 'POST' });
          router.refresh();
        } finally {
          setPending(false);
        }
      }}
    >
      {label}
    </Button>
  );
}
