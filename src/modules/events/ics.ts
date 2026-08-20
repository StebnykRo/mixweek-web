/**
 * docs/06-events.md §6 — .ics export. Without a native app this is how a
 * personal schedule reaches the phone's calendar, so it has to import cleanly
 * into both Google Calendar and Apple Calendar.
 */

export type IcsEvent = {
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  startsAt: Date;
  endsAt: Date;
  url?: string | null;
  status?: 'CONFIRMED' | 'CANCELLED' | 'TENTATIVE';
  sequence?: number;
};

function stamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/** RFC 5545 escaping: backslash, semicolon, comma and newline. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** Lines must be folded at 75 octets or some parsers reject the file. */
function fold(line: string): string {
  if (Buffer.byteLength(line, 'utf8') <= 75) return line;
  const out: string[] = [];
  let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > 74) {
      out.push(current);
      current = ` ${char}`;
    } else {
      current += char;
    }
  }
  if (current) out.push(current);
  return out.join('\r\n');
}

export function buildIcs(events: IcsEvent[], calendarName: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Mix Week//Event Platform//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${stamp(new Date())}`);
    lines.push(`DTSTART:${stamp(event.startsAt)}`);
    lines.push(`DTEND:${stamp(event.endsAt)}`);
    lines.push(`SUMMARY:${escapeText(event.title)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
    if (event.url) lines.push(`URL:${escapeText(event.url)}`);
    lines.push(`STATUS:${event.status ?? 'CONFIRMED'}`);
    lines.push(`SEQUENCE:${event.sequence ?? 0}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}
