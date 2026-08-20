import { describe, expect, it } from 'vitest';
import {
  dayKey,
  eventDays,
  eventPhase,
  isQuietHour,
  minutesOfDay,
  nextQuietHourEnd,
  parseHhMm,
  withinTimeOfDay,
  zoneOffsetLabel,
  zonedDayEnd,
  zonedDayStart,
} from '@/modules/events/time';

/**
 * docs/14-qa.md §2.4 — the timezone suite.
 *
 * Every assertion pins `now` explicitly. Anything that depends on the machine's
 * clock or its local zone would pass in one place and fail in another, which is
 * exactly the class of bug this file exists to prevent.
 */

const NICOSIA = 'Asia/Nicosia';
const KYIV = 'Europe/Kyiv';
const NEW_YORK = 'America/New_York';

const event = {
  startsAt: new Date('2026-10-21T06:00:00Z'), // 09:00 in Nicosia
  endsAt: new Date('2026-10-27T20:59:59Z'),
  timezone: NICOSIA,
};

describe('eventPhase', () => {
  it('is upcoming before the start', () => {
    expect(eventPhase(event, new Date('2026-10-20T23:59:59Z'))).toBe('upcoming');
  });

  it('is live between the boundaries, inclusive', () => {
    expect(eventPhase(event, event.startsAt)).toBe('live');
    expect(eventPhase(event, new Date('2026-10-24T12:00:00Z'))).toBe('live');
    expect(eventPhase(event, event.endsAt)).toBe('live');
  });

  it('is past one millisecond after the end', () => {
    expect(eventPhase(event, new Date(event.endsAt.getTime() + 1))).toBe('past');
  });
});

describe('dayKey', () => {
  it('uses the event timezone, not UTC', () => {
    // 22:30 UTC is already the next day in Nicosia (UTC+3).
    const instant = new Date('2026-10-21T22:30:00Z');
    expect(dayKey(instant, 'UTC')).toBe('2026-10-21');
    expect(dayKey(instant, NICOSIA)).toBe('2026-10-22');
    expect(dayKey(instant, NEW_YORK)).toBe('2026-10-21');
  });

  it('agrees with Kyiv across a midnight boundary', () => {
    expect(dayKey(new Date('2026-10-21T21:00:00Z'), KYIV)).toBe('2026-10-22');
    expect(dayKey(new Date('2026-10-21T20:59:00Z'), KYIV)).toBe('2026-10-21');
  });
});

describe('eventDays', () => {
  it('lists every calendar day the event spans in its own zone', () => {
    const days = eventDays(event);
    expect(days[0]).toBe('2026-10-21');
    expect(days.at(-1)).toBe('2026-10-27');
    expect(days).toHaveLength(7);
  });

  it('returns a single day for a same-day event', () => {
    expect(
      eventDays({
        startsAt: new Date('2026-10-21T07:00:00Z'),
        endsAt: new Date('2026-10-21T15:00:00Z'),
        timezone: NICOSIA,
      }),
    ).toEqual(['2026-10-21']);
  });
});

describe('minutesOfDay', () => {
  it('reads the local clock, not the UTC one', () => {
    expect(minutesOfDay(new Date('2026-10-21T06:30:00Z'), NICOSIA)).toBe(9 * 60 + 30);
    expect(minutesOfDay(new Date('2026-10-21T06:30:00Z'), 'UTC')).toBe(6 * 60 + 30);
  });

  it('treats local midnight as zero, never 1440', () => {
    expect(minutesOfDay(new Date('2026-10-21T21:00:00Z'), NICOSIA)).toBe(0);
  });
});

describe('withinTimeOfDay', () => {
  it('matches a normal daytime range', () => {
    const at15 = new Date('2026-10-21T12:00:00Z'); // 15:00 Nicosia
    expect(withinTimeOfDay(at15, NICOSIA, '12:00', '17:00')).toBe(true);
    expect(withinTimeOfDay(at15, NICOSIA, '17:00', '22:00')).toBe(false);
  });

  it('handles a range that wraps past midnight', () => {
    const at23 = new Date('2026-10-21T20:00:00Z'); // 23:00 Nicosia
    const at02 = new Date('2026-10-21T23:00:00Z'); // 02:00 next day, Nicosia
    const at12 = new Date('2026-10-21T09:00:00Z'); // 12:00 Nicosia

    expect(withinTimeOfDay(at23, NICOSIA, '22:00', '06:00')).toBe(true);
    expect(withinTimeOfDay(at02, NICOSIA, '22:00', '06:00')).toBe(true);
    expect(withinTimeOfDay(at12, NICOSIA, '22:00', '06:00')).toBe(false);
  });

  it('is half-open: the start is included, the end is not', () => {
    const at17 = new Date('2026-10-21T14:00:00Z'); // 17:00 Nicosia
    expect(withinTimeOfDay(at17, NICOSIA, '17:00', '22:00')).toBe(true);
    expect(withinTimeOfDay(at17, NICOSIA, '12:00', '17:00')).toBe(false);
  });

  it('gives a different answer for the same instant in a different zone', () => {
    const instant = new Date('2026-10-21T14:00:00Z'); // 17:00 Nicosia, 10:00 New York
    expect(withinTimeOfDay(instant, NICOSIA, '17:00', '22:00')).toBe(true);
    expect(withinTimeOfDay(instant, NEW_YORK, '17:00', '22:00')).toBe(false);
  });
});

describe('parseHhMm', () => {
  it('accepts a valid time and rejects nonsense', () => {
    expect(parseHhMm('09:30')).toBe(570);
    expect(parseHhMm('24:00')).toBeNull();
    expect(parseHhMm('9:30')).toBeNull();
    expect(parseHhMm('')).toBeNull();
  });
});

describe('quiet hours', () => {
  it('covers 23:00 to 08:00 in the event zone', () => {
    expect(isQuietHour(new Date('2026-10-21T20:30:00Z'), NICOSIA)).toBe(true); // 23:30
    expect(isQuietHour(new Date('2026-10-22T02:00:00Z'), NICOSIA)).toBe(true); // 05:00
    expect(isQuietHour(new Date('2026-10-22T06:00:00Z'), NICOSIA)).toBe(false); // 09:00
  });

  it('returns the same instant when it is not a quiet hour', () => {
    const noon = new Date('2026-10-21T09:00:00Z');
    expect(nextQuietHourEnd(noon, NICOSIA).getTime()).toBe(noon.getTime());
  });

  it('moves a quiet-hour instant forward to the morning', () => {
    const lateNight = new Date('2026-10-21T21:30:00Z'); // 00:30 Nicosia
    const end = nextQuietHourEnd(lateNight, NICOSIA);
    expect(end.getTime()).toBeGreaterThan(lateNight.getTime());
    expect(isQuietHour(end, NICOSIA)).toBe(false);
    expect(minutesOfDay(end, NICOSIA)).toBeGreaterThanOrEqual(8 * 60);
  });
});

describe('zonedDayStart / zonedDayEnd', () => {
  it('spans exactly one local day', () => {
    const start = zonedDayStart('2026-10-22', NICOSIA);
    const end = zonedDayEnd('2026-10-22', NICOSIA);
    expect(dayKey(start, NICOSIA)).toBe('2026-10-22');
    expect(dayKey(new Date(end.getTime() - 1), NICOSIA)).toBe('2026-10-22');
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it('produces a 23-hour day when the clocks go forward', () => {
    // Kyiv moves to summer time on 29 March 2026.
    const start = zonedDayStart('2026-03-29', KYIV);
    const end = zonedDayEnd('2026-03-29', KYIV);
    expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('produces a 25-hour day when the clocks go back', () => {
    // Kyiv returns to winter time on 25 October 2026.
    const start = zonedDayStart('2026-10-25', KYIV);
    const end = zonedDayEnd('2026-10-25', KYIV);
    expect(end.getTime() - start.getTime()).toBe(25 * 60 * 60 * 1000);
  });
});

describe('zoneOffsetLabel', () => {
  it('renders the offset the schedule is expressed in', () => {
    expect(zoneOffsetLabel(new Date('2026-10-21T12:00:00Z'), NICOSIA)).toBe('UTC+3');
    expect(zoneOffsetLabel(new Date('2026-01-15T12:00:00Z'), NEW_YORK)).toBe('UTC-5');
  });
});
