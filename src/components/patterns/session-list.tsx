'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export type SessionListItem = { id: string; label: string; lastSeen: string; current: boolean };

export function SessionList({ sessions }: { sessions: SessionListItem[] }) {
  const t = useTranslations('profile');
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-2">
      {sessions.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 rounded-md bg-surface p-4">
          <div className="min-w-0">
            <p className="font-semibold">{item.label}</p>
            <p className="text-xs text-ink-muted">{t('lastSeen', { time: item.lastSeen })}</p>
          </div>
          {item.current ? (
            <Badge tone="success">{t('currentSession')}</Badge>
          ) : (
            <Button
              variant="quiet"
              size="sm"
              loading={pending === item.id}
              onClick={async () => {
                setPending(item.id);
                try {
                  await api(`/auth/sessions/${item.id}`, { method: 'DELETE' });
                  router.refresh();
                } finally {
                  setPending(null);
                }
              }}
            >
              {t('endSession')}
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
