import { describe, expect, it } from 'vitest';
import {
  canDisable,
  CRITICAL_KINDS,
  defaultEnabled,
  jitterFor,
  KIND_POLICY,
  PUSH_LIMITS,
  shouldDeliver,
  THROUGHPUT,
  truncateForPush,
} from '@/modules/notifications/policy';

/** docs/11-notifications.md §2 and §4 — defaults, opt-outs and pacing. */

describe('critical kinds', () => {
  it('matches the list in docs/11 §2', () => {
    expect([...CRITICAL_KINDS].sort()).toEqual(['REGISTRATION', 'SCHEDULE_CHANGE', 'SYSTEM']);
  });

  it('cannot be switched off', () => {
    for (const kind of CRITICAL_KINDS) expect(canDisable(kind)).toBe(false);
  });

  it('leaves the rest optional', () => {
    expect(canDisable('REMINDER')).toBe(true);
    expect(canDisable('ANNOUNCEMENT')).toBe(true);
    expect(canDisable('MEDIA_READY')).toBe(true);
  });
});

describe('shouldDeliver', () => {
  it('honours an opt-out for an optional kind', () => {
    expect(shouldDeliver('REMINDER', 'push', { enabled: false })).toBe(false);
    expect(shouldDeliver('REMINDER', 'push', { enabled: true })).toBe(true);
  });

  it('ignores an opt-out for a critical kind — that is the whole point', () => {
    expect(shouldDeliver('SCHEDULE_CHANGE', 'push', { enabled: false })).toBe(true);
    expect(shouldDeliver('REGISTRATION', 'email', { enabled: false })).toBe(true);
    expect(shouldDeliver('SYSTEM', 'email', { enabled: false })).toBe(true);
  });

  it('always delivers to the in-app history', () => {
    expect(shouldDeliver('REMINDER', 'inapp', { enabled: false })).toBe(true);
  });

  it('falls back to the documented default with no stored preference', () => {
    expect(shouldDeliver('REMINDER', 'push', null)).toBe(true);
    expect(shouldDeliver('REMINDER', 'email', null)).toBe(false);
  });
});

describe('defaults per kind', () => {
  it('matches the table in docs/11 §2', () => {
    expect(defaultEnabled('SCHEDULE_CHANGE', 'push')).toBe(true);
    expect(defaultEnabled('SCHEDULE_CHANGE', 'email')).toBe(true);
    expect(defaultEnabled('REMINDER', 'email')).toBe(false);
    expect(defaultEnabled('SYSTEM', 'push')).toBe(false);
    expect(defaultEnabled('SYSTEM', 'email')).toBe(true);
  });
});

describe('jitter', () => {
  it('is zero for urgent kinds so a schedule change is not delayed', () => {
    expect(jitterFor('SCHEDULE_CHANGE', 500, 1000)).toBe(0);
    expect(jitterFor('REGISTRATION', 500, 1000)).toBe(0);
  });

  it('spreads a non-urgent blast across the window', () => {
    expect(jitterFor('ANNOUNCEMENT', 0, 1000)).toBe(0);
    expect(jitterFor('ANNOUNCEMENT', 999, 1000)).toBeGreaterThan(80);
    expect(jitterFor('ANNOUNCEMENT', 999, 1000)).toBeLessThanOrEqual(90);
  });

  it('is deterministic, so a retry lands in the same slot', () => {
    expect(jitterFor('ANNOUNCEMENT', 42, 1000)).toBe(jitterFor('ANNOUNCEMENT', 42, 1000));
  });

  it('is zero for a single recipient', () => {
    expect(jitterFor('ANNOUNCEMENT', 0, 1)).toBe(0);
  });
});

describe('push copy', () => {
  it('truncates where the platform would', () => {
    const long = truncateForPush('t'.repeat(80), 'b'.repeat(200));
    expect(long.title).toHaveLength(50);
    expect(long.body).toHaveLength(120);
    expect(long.title.endsWith('…')).toBe(true);
  });

  it('leaves short copy untouched', () => {
    expect(truncateForPush('Gala Night', 'Starts at 20:00')).toEqual({
      title: 'Gala Night',
      body: 'Starts at 20:00',
    });
  });
});

describe('limits', () => {
  it('keeps the documented ceilings', () => {
    expect(PUSH_LIMITS).toEqual({ perHour: 5, perDay: 15 });
    expect(THROUGHPUT.messagesPerSecond).toBe(200);
  });

  it('covers every notification kind in the policy table', () => {
    const kinds = Object.keys(KIND_POLICY);
    expect(kinds).toContain('PROGRAMME_UPDATE');
    expect(kinds).toHaveLength(8);
  });
});
