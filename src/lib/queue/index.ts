import { Queue, type JobsOptions } from 'bullmq';
import { getRedis, redisAvailable } from '../redis';
import { logger, reportError } from '../logger';

/**
 * docs/01-architecture.md §6 — background work runs on BullMQ.
 *
 * Every job is idempotent and carries a deterministic jobId, so a retry or a
 * duplicated enqueue collapses into one execution. When Redis is unavailable
 * the job runs inline instead of being lost: the platform degrades rather than
 * silently dropping a notification (docs/13 §6).
 */

export const QUEUE_NAMES = [
  'notifications',
  'reminders',
  'waitlist',
  'media',
  'exports',
  'maintenance',
  'digest',
] as const;

export type QueueName = (typeof QUEUE_NAMES)[number];

export type JobPayloads = {
  notifications: { tenantId: string; notificationId: string; timezone: string };
  reminders: { tenantId: string; eventId: string };
  waitlist: { tenantId: string; eventId: string };
  media: { tenantId: string; mediaLinkId: string };
  exports: { tenantId: string; eventId: string; requestedBy: string; format: 'csv' | 'xlsx' };
  maintenance: { task: 'purge-tokens' | 'purge-sessions' | 'purge-analytics' | 'expire-orders' | 'rotate-secrets' };
  digest: { tenantId: string; eventId: string };
};

const queues = new Map<QueueName, Queue>();

/**
 * Inline fallbacks. The processors are pulled in lazily, the first time a job
 * actually needs to run in-process: importing them eagerly would drag the push
 * and mail libraries into every bundle, including the Edge one.
 */
type Handler<K extends QueueName> = (payload: JobPayloads[K]) => Promise<unknown>;
const inlineHandlers = new Map<QueueName, Handler<QueueName>>();
let loadingProcessors: Promise<void> | null = null;

export function registerInlineHandler<K extends QueueName>(name: K, handler: Handler<K>): void {
  inlineHandlers.set(name, handler as Handler<QueueName>);
}

async function ensureInlineHandlers(): Promise<void> {
  if (inlineHandlers.size > 0) return;
  if (!loadingProcessors) {
    loadingProcessors = import('@/worker/inline').then((module) => module.registerInlineFallbacks());
  }
  await loadingProcessors;
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  // docs/11 §4.5 — 1 min, 5 min, 30 min.
  backoff: { type: 'custom' },
  removeOnComplete: { age: 24 * 3600, count: 5000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000];

function queueFor(name: QueueName): Queue | null {
  if (!redisAvailable()) return null;
  const connection = getRedis();
  if (!connection) return null;
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
    queues.set(name, queue);
  }
  return queue;
}

export type EnqueueOptions = { jobId: string; delaySeconds?: number };

export async function enqueue<K extends QueueName>(
  name: K,
  payload: JobPayloads[K],
  options: EnqueueOptions,
): Promise<'queued' | 'inline' | 'dropped'> {
  const queue = queueFor(name);
  if (queue) {
    try {
      await queue.add(name, payload, {
        jobId: options.jobId,
        ...(options.delaySeconds ? { delay: options.delaySeconds * 1000 } : {}),
      });
      return 'queued';
    } catch (error) {
      reportError(error, { queue: name, jobId: options.jobId });
    }
  }

  await ensureInlineHandlers();
  const handler = inlineHandlers.get(name);
  if (!handler) {
    logger.warn({ queue: name, jobId: options.jobId }, 'job-dropped-no-handler');
    return 'dropped';
  }

  // Inline execution keeps the request fast by not awaiting the whole fan-out.
  void handler(payload).catch((error: unknown) => reportError(error, { queue: name, jobId: options.jobId }));
  return 'inline';
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((queue) => queue.close().catch(() => undefined)));
  queues.clear();
}
