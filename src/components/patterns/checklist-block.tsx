'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { CheckboxField } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { queueOfflineAction } from '@/lib/offline-queue';

export type ChecklistBlockProps = {
  items: Array<{ id: string; label: string; checked: boolean }>;
};

/** docs/07-screens.md §12 — the state is stored server-side so it follows the person between devices. */
export function ChecklistBlock({ items }: ChecklistBlockProps) {
  const t = useTranslations('style');
  const [state, setState] = useState(() => new Map(items.map((item) => [item.id, item.checked])));

  const done = [...state.values()].filter(Boolean).length;

  async function toggle(id: string, checked: boolean) {
    setState((current) => new Map(current).set(id, checked));
    try {
      await api(`/checklist/${id}`, { method: 'PUT', body: { checked } });
    } catch {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        queueOfflineAction({ path: `/checklist/${id}`, method: 'PUT', body: { checked } });
        return;
      }
      setState((current) => new Map(current).set(id, !checked));
    }
  }

  return (
    <section className="rounded-lg bg-surface p-5">
      <h2 className="font-display text-xl">{t('checklist')}</h2>
      <p className="mt-1 text-xs text-ink-muted">{t('checklistDone', { done, total: items.length })}</p>
      <Progress value={done} max={items.length} label={t('checklist')} className="mt-2" />
      <ul className="mt-4 flex flex-col gap-1">
        {items.map((item) => (
          <li key={item.id}>
            <CheckboxField
              label={item.label}
              checked={state.get(item.id) ?? false}
              onCheckedChange={(checked) => void toggle(item.id, checked)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
