'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api-client';
import { useToast } from '@/components/providers/toast-provider';
import { ActivityRow } from './activity-row';
import { EmptyState } from '@/components/ui/empty-state';
import { queueOfflineAction } from '@/lib/offline-queue';

export type ProgrammeItem = {
  id: string;
  title: string;
  timeLabel: string;
  durationLabel: string;
  hourGroup: string;
  dayGroup: string;
  placeName: string | null;
  track: string;
  status: string;
  changeNote: string | null;
};

export type ProgrammeListProps = {
  items: ProgrammeItem[];
  eventSlug: string;
  saved: string[];
  booked: string[];
  waitlisted: string[];
  conflicts: string[];
  emptyTitle: string;
  emptyBody: string;
};

/**
 * docs/07-screens.md §6 — "♥" is optimistic and rolls back on failure.
 * When the device is offline the change is queued and replayed on reconnect
 * (docs/13 §4), so tapping a heart on a hotel lift still works.
 */
export function ProgrammeList({
  items,
  eventSlug,
  saved,
  booked,
  waitlisted,
  conflicts,
  emptyTitle,
  emptyBody,
}: ProgrammeListProps) {
  const t = useTranslations('programme');
  const tc = useTranslations('common');
  const tt = useTranslations('tracks');
  const toast = useToast();
  const [savedSet, setSavedSet] = useState(() => new Set(saved));

  /**
   * The state flips first and is rolled back only if the server disagrees.
   * Waiting for a round trip on a hotel Wi-Fi would make the heart feel broken.
   */
  async function toggleSave(id: string, next: boolean) {
    const previous = new Set(savedSet);
    setSavedSet((current) => {
      const updated = new Set(current);
      if (next) updated.add(id);
      else updated.delete(id);
      return updated;
    });

    try {
      await api(`/activities/${id}/save`, { method: next ? 'PUT' : 'DELETE' });
    } catch {
      // Offline: keep the change on screen and replay it on reconnect.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        queueOfflineAction({ path: `/activities/${id}/save`, method: next ? 'PUT' : 'DELETE' });
        return;
      }
      setSavedSet(previous);
      toast.show(tc('errorTitle'), 'error');
    }
  }

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} body={emptyBody} className="mx-4 lg:mx-8" />;
  }

  const bookedSet = new Set(booked);
  const waitlistedSet = new Set(waitlisted);
  const conflictSet = new Set(conflicts);

  let lastDay = '';
  let lastHour = '';

  return (
    <ul className="flex flex-col gap-1.5 px-4 pb-8 lg:px-8">
      {items.map((item) => {
        const showDay = item.dayGroup !== lastDay;
        const showHour = showDay || item.hourGroup !== lastHour;
        lastDay = item.dayGroup;
        lastHour = item.hourGroup;

        return (
          <li key={item.id}>
            {showDay ? (
              <h2 className="sticky top-0 z-10 -mx-4 bg-bg px-4 pb-1 pt-4 text-[11px] font-bold uppercase tracking-[2px] text-ink-muted lg:-mx-8 lg:px-8">
                {item.dayGroup}
              </h2>
            ) : null}
            {showHour && !showDay ? <div className="h-2" aria-hidden="true" /> : null}
            <ActivityRow
              id={item.id}
              href={`/events/${eventSlug}/programme/${item.id}`}
              title={item.title}
              timeLabel={item.timeLabel}
              durationLabel={item.durationLabel}
              placeName={item.placeName}
              track={item.track}
              trackLabel={tt(item.track as never)}
              status={item.status}
              changeNote={item.changeNote}
              saved={savedSet.has(item.id)}
              booked={bookedSet.has(item.id)}
              waitlisted={waitlistedSet.has(item.id)}
              conflict={conflictSet.has(item.id)}
              onToggleSave={(activityId, next) => void toggleSave(activityId, next)}
              saveLabel={t('save')}
              unsaveLabel={t('unsave')}
              movedLabel={t('moved')}
              cancelledLabel={t('cancelled')}
              bookedLabel={t('booked')}
              waitlistedLabel={t('joinWaitlist')}
              conflictLabel={t('conflict')}
            />
          </li>
        );
      })}
    </ul>
  );
}
