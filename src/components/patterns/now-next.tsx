'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MapPin } from 'lucide-react';
import { computeNowNext } from '@/modules/programme/now-next';
import { cn } from '@/lib/cn';

export type NowNextActivity = {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  status: string;
  isFeatured: boolean;
  placeName: string | null;
  track: string;
};

export type NowNextProps = {
  activities: NowNextActivity[];
  saved: string[];
  booked: string[];
  eventSlug: string;
  timezone: string;
  /** The server's clock, so a wrong device time cannot skew the answer. */
  serverTime: string;
  eventStartsAt: string;
  eventEndsAt: string;
  mediaHref?: string | null;
};

/**
 * docs/06-events.md §8 — "Now" and "Next".
 *
 * Computed on the client from the cached programme plus the server's `now`, and
 * refreshed every minute. The offset between the two clocks is measured once,
 * so a device with a wrong time still shows the right thing.
 */
export function NowNext({
  activities,
  saved,
  booked,
  eventSlug,
  timezone,
  serverTime,
  eventStartsAt,
  eventEndsAt,
  mediaHref,
}: NowNextProps) {
  const t = useTranslations('home');
  const tp = useTranslations('programme');

  // The offset between the server clock and this device is measured once, so a
  // phone with the wrong time still sees the right "Now" (docs/06 §8).
  const [offsetMs] = useState(() => new Date(serverTime).getTime() - Date.now());
  const [now, setNow] = useState(() => new Date(Date.now() + offsetMs));

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date(Date.now() + offsetMs)), 60_000);
    return () => clearInterval(timer);
  }, [offsetMs]);

  const parsed = useMemo(
    () =>
      activities.map((activity) => ({
        ...activity,
        startsAt: new Date(activity.startsAt),
        endsAt: new Date(activity.endsAt),
      })),
    [activities],
  );

  const { now: live, next } = useMemo(
    () => computeNowNext(parsed, new Set(saved), new Set(booked), now),
    [parsed, saved, booked, now],
  );

  const eventStart = new Date(eventStartsAt);
  const eventEnd = new Date(eventEndsAt);

  if (now < eventStart) {
    return (
      <section aria-live="polite" className="rounded-lg bg-neutral-900 p-5 text-neutral-50">
        <p className="text-[11px] font-bold uppercase tracking-[2px] opacity-70">{t('nextTitle')}</p>
        <p className="mt-2 font-display text-2xl">{t('eventStartsIn', { duration: until(eventStart, now) })}</p>
      </section>
    );
  }

  if (now > eventEnd) {
    return (
      <section className="rounded-lg bg-neutral-900 p-5 text-neutral-50">
        <p className="font-display text-2xl">{t('eventEnded')}</p>
        {mediaHref ? (
          <Link href={mediaHref} className="mt-3 inline-block font-semibold underline">
            {t('seePhotos')}
          </Link>
        ) : null}
      </section>
    );
  }

  const formatTime = (value: Date) =>
    new Intl.DateTimeFormat(undefined, { timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false }).format(value);

  return (
    <div className="flex flex-col gap-4">
      <section aria-live="polite" aria-label={t('nowTitle')}>
        <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">{t('nowTitle')}</h2>
        {live.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {live.map((activity) => (
              <li key={activity.id}>
                <Link
                  href={`/events/${eventSlug}/programme/${activity.id}`}
                  className="block rounded-lg bg-neutral-900 p-5 text-neutral-50"
                >
                  <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[1px]">
                    <span aria-hidden="true" className="live-pulse inline-block h-2 w-2 rounded-pill bg-secondary-500" />
                    {formatTime(activity.startsAt)} – {formatTime(activity.endsAt)}
                  </p>
                  <p className="mt-2 font-display text-2xl leading-tight">{activity.title}</p>
                  {activity.placeName ? (
                    <p className="mt-2 inline-flex items-center gap-1 text-sm opacity-80">
                      <MapPin size={14} aria-hidden="true" />
                      {activity.placeName}
                    </p>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-lg bg-surface p-5">
            <p className="text-sm text-ink-muted">{t('nothingNow')}</p>
            {next[0] ? (
              <p className="mt-1 font-semibold">{t('startsIn', { duration: until(next[0].startsAt, now) })}</p>
            ) : null}
          </div>
        )}
      </section>

      {next.length > 0 ? (
        <section aria-label={t('nextTitle')}>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">{t('nextTitle')}</h2>
            <Link href={`/events/${eventSlug}/programme`} className="text-sm font-semibold text-primary-700">
              {t('wholeProgramme')}
            </Link>
          </div>
          <ul className="flex flex-col gap-1.5">
            {next.map((activity) => (
              <li key={activity.id}>
                <Link
                  href={`/events/${eventSlug}/programme/${activity.id}`}
                  className={cn('flex items-start gap-3 rounded-md bg-surface px-4 py-3')}
                >
                  <span className="w-14 shrink-0 text-sm font-bold tabular-nums">{formatTime(activity.startsAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{activity.title}</span>
                    {activity.placeName ? (
                      <span className="mt-0.5 block text-xs text-ink-muted">{activity.placeName}</span>
                    ) : null}
                  </span>
                  {booked.includes(activity.id) ? (
                    <span className="text-xs font-bold text-success">✓ {tp('booked')}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function until(target: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((target.getTime() - now.getTime()) / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${mins} min`;
  return `${mins} min`;
}
