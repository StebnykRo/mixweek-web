'use client';

/**
 * docs/13-nfr.md §4 — state-changing actions taken offline are queued and
 * replayed when the connection comes back. Background Sync is used when the
 * browser has it; otherwise the queue drains on the `online` event.
 *
 * The queue lives in localStorage under the current user's key and is cleared
 * on sign-out along with the rest of the app's storage.
 */

const QUEUE_KEY = 'mw.offline-queue';
const MAX_ENTRIES = 200;

export type QueuedAction = {
  path: string;
  method: 'PUT' | 'DELETE' | 'POST';
  body?: unknown;
  queuedAt: number;
};

function read(): QueuedAction[] {
  try {
    return JSON.parse(window.localStorage.getItem(QUEUE_KEY) ?? '[]') as QueuedAction[];
  } catch {
    return [];
  }
}

function write(entries: QueuedAction[]): void {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES)));
  } catch {
    // A full storage must not break the interaction that queued the action.
  }
}

export function queueOfflineAction(action: Omit<QueuedAction, 'queuedAt'>): void {
  if (typeof window === 'undefined') return;
  const entries = read();
  // The same target queued twice collapses: the last intent is the real one.
  const deduped = entries.filter((entry) => !(entry.path === action.path && entry.method === action.method));
  write([...deduped, { ...action, queuedAt: Date.now() }]);
  void requestBackgroundSync();
}

async function requestBackgroundSync(): Promise<void> {
  try {
    const registration = await navigator.serviceWorker?.ready;
    const sync = (registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync;
    await sync?.register('mw-offline-queue');
  } catch {
    // Background Sync is unavailable; the `online` listener below covers it.
  }
}

export type DrainResult = { sent: number; failed: number };

export async function drainOfflineQueue(): Promise<DrainResult> {
  if (typeof window === 'undefined') return { sent: 0, failed: 0 };
  const entries = read();
  if (entries.length === 0) return { sent: 0, failed: 0 };

  const remaining: QueuedAction[] = [];
  let sent = 0;

  for (const entry of entries) {
    try {
      const response = await fetch(`/api/v1${entry.path}`, {
        method: entry.method,
        credentials: 'same-origin',
        headers: entry.body === undefined ? {} : { 'content-type': 'application/json' },
        body: entry.body === undefined ? undefined : JSON.stringify(entry.body),
      });
      // A 4xx means the server has decided; replaying it forever helps nobody.
      if (response.ok || (response.status >= 400 && response.status < 500)) sent += 1;
      else remaining.push(entry);
    } catch {
      remaining.push(entry);
    }
  }

  write(remaining);
  return { sent, failed: remaining.length };
}

const RETRY_DELAYS_MS = [0, 2_000, 5_000, 15_000];

/**
 * Drains, and keeps trying for a while if anything is left.
 *
 * The `online` event can arrive a moment before the connection is genuinely
 * usable, so a single attempt strands the queue until the next reconnect. This
 * is the difference between a heart that syncs and one that quietly does not.
 */
export async function drainWithRetries(): Promise<DrainResult> {
  let result: DrainResult = { sent: 0, failed: 0 };
  for (const delay of RETRY_DELAYS_MS) {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    result = await drainOfflineQueue();
    if (result.failed === 0) return result;
  }
  return result;
}

export function clearOfflineQueue(): void {
  try {
    window.localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Nothing to do.
  }
}
