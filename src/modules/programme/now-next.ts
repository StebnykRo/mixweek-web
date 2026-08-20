/**
 * Pure scheduling helpers. Kept free of any server import so that client
 * components can use exactly the same logic the server does — "Now / Next" must
 * not drift between the two.
 */

/**
 * docs/06-events.md §8 — "Now" and "Next".
 *
 * Priority in "Now": booked → saved → featured → the rest, so the card shows
 * what the person actually signed up for rather than whatever started last.
 */
export function computeNowNext<T extends { id: string; startsAt: Date; endsAt: Date; status: string; isFeatured: boolean }>(
  activities: T[],
  saved: Set<string>,
  booked: Set<string>,
  now: Date,
): { now: T[]; next: T[] } {
  const live = activities.filter(
    (a) => a.status !== 'CANCELLED' && a.startsAt.getTime() <= now.getTime() && now.getTime() <= a.endsAt.getTime(),
  );
  const rank = (a: T) => (booked.has(a.id) ? 0 : saved.has(a.id) ? 1 : a.isFeatured ? 2 : 3);
  live.sort((a, b) => rank(a) - rank(b) || a.startsAt.getTime() - b.startsAt.getTime());

  const upcoming = activities
    .filter((a) => a.status !== 'CANCELLED' && a.startsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, 3);

  return { now: live, next: upcoming };
}

/** docs/06 §5 — overlapping items are flagged, never blocked. */
export function findConflicts<T extends { id: string; startsAt: Date; endsAt: Date }>(items: T[]): Set<string> {
  const sorted = [...items].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const conflicting = new Set<string>();
  for (let i = 0; i < sorted.length; i += 1) {
    for (let j = i + 1; j < sorted.length; j += 1) {
      const a = sorted[i];
      const b = sorted[j];
      if (!a || !b) continue;
      if (b.startsAt.getTime() >= a.endsAt.getTime()) break;
      conflicting.add(a.id);
      conflicting.add(b.id);
    }
  }
  return conflicting;
}
