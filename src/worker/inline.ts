import { registerInlineHandler, QUEUE_NAMES, type JobPayloads, type QueueName } from '@/lib/queue';
import { processNotification } from './processors/notifications';
import { processMaintenance, processReminders } from './processors/maintenance';

/**
 * The same handlers the BullMQ worker runs, exposed for in-process execution.
 *
 * docs/13-nfr.md §6 — with no Redis, or with no separate worker deployed, the
 * app still delivers notifications rather than dropping them. This module is
 * imported lazily by `enqueue()` so its dependencies never reach a client or
 * Edge bundle.
 */
export const HANDLERS: { [K in QueueName]: (payload: JobPayloads[K]) => Promise<unknown> } = {
  notifications: (payload) => processNotification(payload),
  reminders: async () => processReminders(),
  waitlist: async () => ({ ok: true }),
  media: async () => ({ ok: true }),
  exports: async () => ({ ok: true }),
  maintenance: (payload) => processMaintenance(payload),
  digest: async () => ({ ok: true }),
};

export function registerInlineFallbacks(): void {
  for (const name of QUEUE_NAMES) registerInlineHandler(name, HANDLERS[name] as never);
}
