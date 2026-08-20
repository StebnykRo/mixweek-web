/**
 * docs/06-events.md §2 — the event phase is computed, never stored, and always
 * in the event's own timezone. This is the single most common source of bugs in
 * a scheduling app, so everything time-related lives here and is unit-tested
 * against Asia/Nicosia, Europe/Kyiv and America/New_York (docs/14 §2.4).
 */

export type EventPhase = 'upcoming' | 'live' | 'past';

export type EventWindow = { startsAt: Date; endsAt: Date; timezone: string };

export function eventPhase(event: EventWindow, now: Date = new Date()): EventPhase {
  // Instants are absolute; the timezone matters for day boundaries and
  // formatting, not for this comparison.
  if (now.getTime() < event.startsAt.getTime()) return 'upcoming';
  if (now.getTime() > event.endsAt.getTime()) return 'past';
  return 'live';
}

const partsCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${timezone}|${JSON.stringify(options)}`;
  let cached = partsCache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, ...options });
    partsCache.set(key, cached);
  }
  return cached;
}

/** The calendar day (YYYY-MM-DD) that an instant falls on, in a given zone. */
export function dayKey(instant: Date, timezone: string): string {
  return formatter(timezone, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
}

/** Minutes since local midnight, in a given zone. Used by the time-of-day filter. */
export function minutesOfDay(instant: Date, timezone: string): number {
  const parts = formatter(timezone, { hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(instant);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  // Intl can render midnight as "24" in some locales; normalise it.
  return (hour % 24) * 60 + minute;
}

/** Every calendar day the event spans, in the event's zone. */
export function eventDays(event: EventWindow): string[] {
  const days: string[] = [];
  const oneDayMs = 24 * 60 * 60 * 1000;
  const lastKey = dayKey(event.endsAt, event.timezone);
  let cursor = event.startsAt;
  let guard = 0;
  while (guard < 400) {
    const key = dayKey(cursor, event.timezone);
    if (!days.includes(key)) days.push(key);
    if (key === lastKey) break;
    cursor = new Date(cursor.getTime() + oneDayMs);
    guard += 1;
  }
  return days;
}

/** docs/07 §6 — the four time-of-day presets, in the event's zone. */
export const TIME_PRESETS = {
  morning: { from: '06:00', to: '12:00' },
  afternoon: { from: '12:00', to: '17:00' },
  evening: { from: '17:00', to: '22:00' },
  night: { from: '22:00', to: '06:00' },
} as const;

export type TimePreset = keyof typeof TIME_PRESETS;

export function parseHhMm(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * A half-open window [from, to) in the event's zone. A range that wraps past
 * midnight (night: 22:00–06:00) is handled explicitly rather than by accident.
 */
export function withinTimeOfDay(instant: Date, timezone: string, from: string, to: string): boolean {
  const start = parseHhMm(from);
  const end = parseHhMm(to);
  if (start === null || end === null) return true;
  const value = minutesOfDay(instant, timezone);
  if (start === end) return true;
  if (start < end) return value >= start && value < end;
  return value >= start || value < end;
}

/** docs/11 §4.8 — quiet hours 23:00–08:00 in the event's zone. */
export function isQuietHour(instant: Date, timezone: string): boolean {
  return withinTimeOfDay(instant, timezone, '23:00', '08:00');
}

/** The next instant at which quiet hours end, so a job can be deferred to it. */
export function nextQuietHourEnd(instant: Date, timezone: string): Date {
  let cursor = new Date(instant.getTime());
  for (let i = 0; i < 24 * 60; i += 15) {
    if (!isQuietHour(cursor, timezone)) return cursor;
    cursor = new Date(cursor.getTime() + 15 * 60 * 1000);
  }
  return cursor;
}

export function formatTimeInZone(instant: Date, timezone: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(instant);
}

export function formatDateInZone(instant: Date, timezone: string, locale = 'en'): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(instant);
}

/**
 * "UTC+3" style label, so the schedule can say which clock it is using.
 *
 * Intl returns "GMT+03:00"; the padding and the trailing ":00" are noise next
 * to a list of session times, so both are trimmed.
 */
export function zoneOffsetLabel(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, timeZoneName: 'longOffset' }).formatToParts(instant);
  const raw = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(raw);
  if (!match) return 'UTC';
  const [, sign, hours, minutes] = match as unknown as [string, string, string, string];
  const hour = Number(hours);
  return minutes === '00' ? `UTC${sign}${hour}` : `UTC${sign}${hour}:${minutes}`;
}

export function durationLabel(ms: number, locale = 'en'): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const rtf = new Intl.NumberFormat(locale);
  if (hours === 0) return `${rtf.format(minutes)} min`;
  if (minutes === 0) return `${rtf.format(hours)} h`;
  return `${rtf.format(hours)} h ${rtf.format(minutes)} min`;
}

/** The start of a calendar day (YYYY-MM-DD) in a zone, as a UTC instant. */
export function zonedDayStart(day: string, timezone: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  if (!year || !month || !date) return new Date(NaN);
  // Probe UTC midnight, then correct by the zone offset at that moment. Two
  // passes settle DST transitions without pulling in a full tz library.
  let guess = Date.UTC(year, month - 1, date, 0, 0, 0);
  for (let i = 0; i < 2; i += 1) {
    const offset = zoneOffsetMinutes(new Date(guess), timezone);
    guess = Date.UTC(year, month - 1, date, 0, 0, 0) - offset * 60_000;
  }
  return new Date(guess);
}

export function zonedDayEnd(day: string, timezone: string): Date {
  const start = zonedDayStart(day, timezone);
  const nextDay = new Date(start.getTime() + 26 * 60 * 60 * 1000);
  return zonedDayStart(dayKey(nextDay, timezone), timezone);
}

export function zoneOffsetMinutes(instant: Date, timezone: string): number {
  const parts = formatter(timezone, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUtc - instant.getTime()) / 60_000);
}
