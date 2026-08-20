import type { NotificationKind } from '@prisma/client';

/**
 * docs/11-notifications.md §2 — defaults per type, and which types a person may
 * switch off. SCHEDULE_CHANGE, REGISTRATION and SYSTEM are not optional: they
 * concern someone's bookings and the security of their account.
 */

export type Channel = 'push' | 'email' | 'inapp';

export type KindPolicy = {
  push: boolean;
  email: boolean;
  optional: boolean;
  /** Urgent types skip the jitter window and quiet hours. */
  urgent: boolean;
};

export const KIND_POLICY: Record<NotificationKind, KindPolicy> = {
  SCHEDULE_CHANGE: { push: true, email: true, optional: false, urgent: true },
  PROGRAMME_UPDATE: { push: true, email: false, optional: true, urgent: false },
  REMINDER: { push: true, email: false, optional: true, urgent: false },
  ANNOUNCEMENT: { push: true, email: false, optional: true, urgent: false },
  REGISTRATION: { push: true, email: true, optional: false, urgent: true },
  MEDIA_READY: { push: true, email: true, optional: true, urgent: false },
  MERCH: { push: true, email: false, optional: true, urgent: false },
  SYSTEM: { push: false, email: true, optional: false, urgent: true },
};

export const CRITICAL_KINDS: NotificationKind[] = Object.entries(KIND_POLICY)
  .filter(([, policy]) => !policy.optional)
  .map(([kind]) => kind as NotificationKind);

export function canDisable(kind: NotificationKind): boolean {
  return KIND_POLICY[kind].optional;
}

export function defaultEnabled(kind: NotificationKind, channel: Channel): boolean {
  if (channel === 'inapp') return true;
  const policy = KIND_POLICY[kind];
  return channel === 'push' ? policy.push : policy.email;
}

/**
 * Resolves whether one delivery should happen. A stored preference only counts
 * for optional kinds — a critical notification ignores `enabled: false`.
 */
export function shouldDeliver(
  kind: NotificationKind,
  channel: Channel,
  preference: { enabled: boolean } | null | undefined,
): boolean {
  if (channel === 'inapp') return true;
  if (!canDisable(kind)) return defaultEnabled(kind, channel) || channel === 'email';
  if (preference) return preference.enabled;
  return defaultEnabled(kind, channel);
}

/** docs/11 §4.7 — 5 pushes an hour, 15 a day, criticals excepted. */
export const PUSH_LIMITS = { perHour: 5, perDay: 15 } as const;

/** docs/11 §4.1 — the send rate that keeps a 3 000-person blast from spiking. */
export const THROUGHPUT = { messagesPerSecond: 200, concurrency: 10 } as const;

/** docs/11 §4.2 — non-urgent deliveries are spread over 0–90 s. */
export const JITTER_SECONDS = 90;

export function jitterFor(kind: NotificationKind, index: number, total: number): number {
  if (KIND_POLICY[kind].urgent) return 0;
  if (total <= 1) return 0;
  // Deterministic spread, so a retry of the same job lands in the same slot.
  return Math.round((index / total) * JITTER_SECONDS);
}

/** docs/11 §6 — push copy is truncated where the platform would truncate it. */
export function truncateForPush(title: string, body: string): { title: string; body: string } {
  return {
    title: title.length > 50 ? `${title.slice(0, 49)}…` : title,
    body: body.length > 120 ? `${body.slice(0, 119)}…` : body,
  };
}
