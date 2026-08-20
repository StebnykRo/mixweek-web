import { describe, expect, it } from 'vitest';
import { buildIcs } from '@/modules/events/ics';

/** docs/06-events.md §6 and docs/14 §3 C — the .ics has to import cleanly. */

const event = {
  uid: 'abc123@mixweek',
  title: 'Gala Night',
  description: 'Black tie optional',
  location: 'Main Stage',
  startsAt: new Date('2026-10-26T17:00:00Z'),
  endsAt: new Date('2026-10-26T20:59:00Z'),
  url: 'https://app.example.com/events/mix-week-2026',
};

describe('buildIcs', () => {
  it('produces a well-formed calendar', () => {
    const ics = buildIcs([event], 'Mix Week — my schedule');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:abc123@mixweek');
    expect(ics).toContain('SUMMARY:Gala Night');
    expect(ics).toContain('LOCATION:Main Stage');
  });

  it('writes timestamps in UTC with the Z suffix', () => {
    const ics = buildIcs([event], 'cal');
    expect(ics).toContain('DTSTART:20261026T170000Z');
    expect(ics).toContain('DTEND:20261026T205900Z');
  });

  it('uses CRLF, which some parsers insist on', () => {
    expect(buildIcs([event], 'cal').split('\n').every((line) => line === '' || line.endsWith('\r'))).toBe(true);
  });

  it('escapes commas, semicolons and newlines in text', () => {
    const ics = buildIcs(
      [{ ...event, title: 'Dinner, drinks; then dancing', description: 'Line one\nLine two' }],
      'cal',
    );
    expect(ics).toContain('SUMMARY:Dinner\\, drinks\; then dancing');
    expect(ics).toContain('Line one\\nLine two');
  });

  it('folds a long line to 75 octets', () => {
    const ics = buildIcs([{ ...event, title: 'x'.repeat(300) }], 'cal');
    for (const line of ics.split('\r\n')) {
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });

  it('marks a cancelled session as cancelled rather than dropping it', () => {
    const ics = buildIcs([{ ...event, status: 'CANCELLED' as const }], 'cal');
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('handles an empty schedule', () => {
    const ics = buildIcs([], 'cal');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
