'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { SwitchField } from '@/components/ui/switch';
import { useToast } from '@/components/providers/toast-provider';
import { PushOptIn } from './push-opt-in';

export type PreferenceRow = { kind: string; channel: string; enabled: boolean; locked: boolean };

/**
 * docs/11-notifications.md §2 — critical types are rendered in their own
 * section, switched on and disabled, with the reason spelled out. The server
 * drops any attempt to change them regardless of what the UI sends.
 */
export function NotificationPreferences({ initial }: { initial: PreferenceRow[] }) {
  const t = useTranslations('profile');
  const tk = useTranslations('notificationKinds');
  const tc = useTranslations('common');
  const toast = useToast();
  const [rows, setRows] = useState(initial);

  async function toggle(kind: string, channel: string, enabled: boolean) {
    const previous = rows;
    setRows((current) =>
      current.map((row) => (row.kind === kind && row.channel === channel ? { ...row, enabled } : row)),
    );
    try {
      await api('/me/notification-preferences', {
        method: 'PUT',
        body: { preferences: [{ kind, channel, enabled }] },
      });
    } catch {
      setRows(previous);
      toast.show(tc('errorTitle'), 'error');
    }
  }

  const optional = rows.filter((row) => !row.locked);
  const locked = rows.filter((row) => row.locked);

  const byKind = (list: PreferenceRow[]) => {
    const map = new Map<string, PreferenceRow[]>();
    for (const row of list) map.set(row.kind, [...(map.get(row.kind) ?? []), row]);
    return [...map.entries()];
  };

  return (
    <div className="flex flex-col gap-5">
      <PushOptIn />

      <section className="rounded-lg bg-surface px-5">
        {byKind(optional).map(([kind, entries]) => (
          <div key={kind} className="border-b border-divider py-1 last:border-0">
            <p className="pt-3 text-sm font-bold">{tk(kind as never)}</p>
            {entries.map((row) => (
              <SwitchField
                key={`${row.kind}-${row.channel}`}
                label={row.channel === 'push' ? 'Push' : 'Email'}
                checked={row.enabled}
                onCheckedChange={(value) => void toggle(row.kind, row.channel, value)}
              />
            ))}
          </div>
        ))}
      </section>

      <section className="rounded-lg bg-surface px-5 py-1">
        <p className="pt-4 text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">
          {t('criticalNotifications')}
        </p>
        <p className="pb-2 pt-1 text-xs text-ink-muted">{t('criticalExplainer')}</p>
        {byKind(locked).map(([kind, entries]) => (
          <div key={kind} className="border-t border-divider py-1">
            <p className="pt-3 text-sm font-bold">{tk(kind as never)}</p>
            {entries.map((row) => (
              <SwitchField
                key={`${row.kind}-${row.channel}`}
                label={row.channel === 'push' ? 'Push' : 'Email'}
                checked
                disabled
                onCheckedChange={() => undefined}
              />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
