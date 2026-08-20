import { describe, expect, it } from 'vitest';
import { computeNowNext, findConflicts } from '@/modules/programme/now-next';

/** docs/06-events.md §8 and §5 — "Now / Next" priority and schedule conflicts. */

const at = (hour: number, minute = 0) => new Date(Date.UTC(2026, 9, 22, hour, minute));

const base = { status: 'SCHEDULED', isFeatured: false };

const activities = [
  { id: 'breakfast', startsAt: at(8), endsAt: at(9, 30), ...base },
  { id: 'workshop', startsAt: at(10), endsAt: at(11, 30), ...base },
  { id: 'lunch', startsAt: at(12), endsAt: at(13), ...base },
  { id: 'gala', startsAt: at(20), endsAt: at(23), ...base, isFeatured: true },
];

describe('computeNowNext', () => {
  it('returns whatever is running right now', () => {
    const result = computeNowNext(activities, new Set(), new Set(), at(10, 30));
    expect(result.now.map((activity) => activity.id)).toEqual(['workshop']);
  });

  it('includes the boundaries', () => {
    expect(computeNowNext(activities, new Set(), new Set(), at(10)).now[0]?.id).toBe('workshop');
    expect(computeNowNext(activities, new Set(), new Set(), at(11, 30)).now[0]?.id).toBe('workshop');
  });

  it('returns the next three, in order', () => {
    const result = computeNowNext(activities, new Set(), new Set(), at(9, 45));
    expect(result.next.map((activity) => activity.id)).toEqual(['workshop', 'lunch', 'gala']);
  });

  it('puts a booked session ahead of a saved one, and both ahead of featured', () => {
    const overlapping = [
      { id: 'featured', startsAt: at(10), endsAt: at(12), ...base, isFeatured: true },
      { id: 'saved', startsAt: at(10), endsAt: at(12), ...base },
      { id: 'booked', startsAt: at(10), endsAt: at(12), ...base },
      { id: 'other', startsAt: at(10), endsAt: at(12), ...base },
    ];
    const result = computeNowNext(overlapping, new Set(['saved']), new Set(['booked']), at(11));
    expect(result.now.map((activity) => activity.id)).toEqual(['booked', 'saved', 'featured', 'other']);
  });

  it('never shows a cancelled session as running or coming up', () => {
    const withCancelled = [
      { id: 'cancelled', startsAt: at(10), endsAt: at(12), status: 'CANCELLED', isFeatured: false },
      { id: 'later', startsAt: at(14), endsAt: at(15), status: 'CANCELLED', isFeatured: false },
    ];
    const result = computeNowNext(withCancelled, new Set(), new Set(), at(11));
    expect(result.now).toHaveLength(0);
    expect(result.next).toHaveLength(0);
  });

  it('returns nothing running in a gap', () => {
    expect(computeNowNext(activities, new Set(), new Set(), at(9, 45)).now).toHaveLength(0);
  });
});

describe('findConflicts', () => {
  it('flags an overlap', () => {
    const conflicts = findConflicts([
      { id: 'a', startsAt: at(10), endsAt: at(11, 30) },
      { id: 'b', startsAt: at(11), endsAt: at(12) },
    ]);
    expect([...conflicts].sort()).toEqual(['a', 'b']);
  });

  it('does not flag back-to-back sessions', () => {
    const conflicts = findConflicts([
      { id: 'a', startsAt: at(10), endsAt: at(11) },
      { id: 'b', startsAt: at(11), endsAt: at(12) },
    ]);
    expect(conflicts.size).toBe(0);
  });

  it('flags all three when three overlap', () => {
    const conflicts = findConflicts([
      { id: 'a', startsAt: at(10), endsAt: at(13) },
      { id: 'b', startsAt: at(11), endsAt: at(12) },
      { id: 'c', startsAt: at(11, 30), endsAt: at(12, 30) },
    ]);
    expect(conflicts.size).toBe(3);
  });

  it('handles an unsorted input', () => {
    const conflicts = findConflicts([
      { id: 'late', startsAt: at(11), endsAt: at(12) },
      { id: 'early', startsAt: at(10), endsAt: at(11, 30) },
    ]);
    expect(conflicts.size).toBe(2);
  });
});
