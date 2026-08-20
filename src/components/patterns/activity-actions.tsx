'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CalendarPlus, Heart, Share2 } from 'lucide-react';
import { api, ApiCallError, idempotencyKey } from '@/lib/api-client';
import { useToast } from '@/components/providers/toast-provider';
import { Button } from '@/components/ui/button';
import { CapacityMeter } from './capacity-meter';
import { queueOfflineAction } from '@/lib/offline-queue';

export type ActivityActionsProps = {
  activityId: string;
  eventSlug: string;
  bookingRequired: boolean;
  capacity: number | null;
  bookedCount: number;
  waitlistCount: number;
  cancelled: boolean;
  initialSaved: boolean;
  initialBooked: boolean;
  initialWaitlisted: boolean;
  title: string;
  startsAt: string;
  endsAt: string;
};

/** docs/07 §7 — ♥, booking, calendar and share, with the capacity meter. */
export function ActivityActions({
  activityId,
  eventSlug,
  bookingRequired,
  capacity,
  bookedCount,
  waitlistCount,
  cancelled,
  initialSaved,
  initialBooked,
  initialWaitlisted,
  title,
  startsAt,
  endsAt,
}: ActivityActionsProps) {
  const t = useTranslations('programme');
  const toast = useToast();
  const router = useRouter();

  const [saved, setSaved] = useState(initialSaved);
  const [booked, setBooked] = useState(initialBooked);
  const [waitlisted, setWaitlisted] = useState(initialWaitlisted);
  const [pending, setPending] = useState(false);

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    try {
      await api(`/activities/${activityId}/save`, { method: next ? 'PUT' : 'DELETE' });
    } catch {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        queueOfflineAction({ path: `/activities/${activityId}/save`, method: next ? 'PUT' : 'DELETE' });
        return;
      }
      setSaved(!next);
      toast.show(t('empty'), 'error');
    }
  }

  async function book() {
    setPending(true);
    try {
      const result = await api<{ status: string; waitlistPosition: number | null }>(
        `/activities/${activityId}/bookings`,
        { method: 'POST', idempotencyKey: idempotencyKey(`book:${activityId}`) },
      );
      if (result.status === 'WAITLISTED') {
        setWaitlisted(true);
        toast.show(t('waitlisted', { position: result.waitlistPosition ?? 1 }), 'info');
      } else {
        setBooked(true);
        toast.show(t('booked'), 'success');
      }
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : t('empty'), 'error');
    } finally {
      setPending(false);
    }
  }

  async function cancelBooking() {
    setPending(true);
    try {
      await api(`/activities/${activityId}/bookings`, { method: 'DELETE' });
      setBooked(false);
      setWaitlisted(false);
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : t('empty'), 'error');
    } finally {
      setPending(false);
    }
  }

  async function share() {
    const url = `${window.location.origin}/events/${eventSlug}/programme/${activityId}`;
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(url).catch(() => undefined);
    toast.show('Copied', 'success');
  }

  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(singleEventIcs(activityId, title, startsAt, endsAt))}`;

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-surface p-4">
      {bookingRequired && capacity !== null ? (
        <CapacityMeter
          taken={bookedCount}
          total={capacity}
          waitlist={waitlistCount}
          labels={{
            capacity: t('capacity', { taken: bookedCount, total: capacity }),
            waitlist: t('waitlistCount', { count: waitlistCount }),
          }}
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant={saved ? 'quiet' : 'outline'} onClick={toggleSave} aria-pressed={saved}>
          <Heart
            size={18}
            aria-hidden="true"
            className={saved ? 'fill-[var(--color-danger)] text-[var(--color-danger)]' : ''}
          />
          {saved ? t('unsave') : t('save')}
        </Button>

        {bookingRequired && !cancelled ? (
          booked || waitlisted ? (
            <Button variant="quiet" loading={pending} onClick={cancelBooking}>
              {t('cancelBooking')}
            </Button>
          ) : (
            <Button loading={pending} onClick={book}>
              {capacity !== null && bookedCount >= capacity ? t('joinWaitlist') : t('book')}
            </Button>
          )
        ) : null}

        <Button variant="outline" asChild>
          <a href={icsHref} download={`${title.replace(/[^\w-]+/g, '-')}.ics`}>
            <CalendarPlus size={18} aria-hidden="true" />
            {t('addToCalendar')}
          </a>
        </Button>

        <Button variant="ghost" onClick={share} aria-label="Share">
          <Share2 size={18} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

/** A single-event .ics, built client-side so the button works offline too. */
function singleEventIcs(id: string, title: string, startsAt: string, endsAt: string): string {
  const stamp = (value: string) => `${new Date(value).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
  const escaped = title.replace(/([,;\\])/g, '\\$1');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mix Week//Event Platform//EN',
    'BEGIN:VEVENT',
    `UID:${id}@mixweek`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(startsAt)}`,
    `DTEND:${stamp(endsAt)}`,
    `SUMMARY:${escaped}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
