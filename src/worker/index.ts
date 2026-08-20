import { Worker, type Job } from 'bullmq';
import { getRedis, redisAvailable } from '@/lib/redis';
import { logger, reportError } from '@/lib/logger';
import { RETRY_DELAYS_MS, QUEUE_NAMES } from '@/lib/queue';
import { HANDLERS, registerInlineFallbacks } from './inline';
import {
  processAccountDeletions,
  processMaintenance,
  processProgrammeAnnouncements,
  processReminders,
} from './processors/maintenance';

/**
 * The background worker (docs/01-architecture.md §6).
 *
 * Every handler is idempotent, so a retry or a duplicated job is safe. The same
 * handlers are registered as inline fallbacks, which is what lets the app keep
 * working — degraded, not broken — when Redis is unavailable (docs/13 §6).
 */

export async function startWorker(): Promise<Worker[]> {
  registerInlineFallbacks();

  if (!redisAvailable()) {
    logger.warn({ queue: 'all' }, 'worker-inline-mode-no-redis');
    return [];
  }

  const connection = getRedis();
  if (!connection) return [];

  const workers = QUEUE_NAMES.map((name) => {
    const worker = new Worker(
      name,
      async (job: Job) => {
        const started = Date.now();
        try {
          const result = await HANDLERS[name](job.data as never);
          logger.info({ queue: name, jobId: job.id ?? '', durationMs: Date.now() - started }, 'job-complete');
          return result;
        } catch (error) {
          reportError(error, { queue: name, jobId: job.id ?? '', attempt: job.attemptsMade });
          throw error;
        }
      },
      {
        connection,
        concurrency: name === 'notifications' ? 10 : 4,
        settings: {
          // docs/11 §4.5 — 1 min, 5 min, 30 min.
          backoffStrategy: (attemptsMade: number) =>
            RETRY_DELAYS_MS[Math.min(attemptsMade, RETRY_DELAYS_MS.length - 1)] ?? 60_000,
        },
      },
    );

    worker.on('failed', (job, error) => {
      // A job that has used all its attempts is a dead letter and must alert.
      if (job && job.attemptsMade >= (job.opts.attempts ?? 3)) {
        logger.error({ queue: name, jobId: job.id ?? '', reason: error.message }, 'job-dead-lettered');
      }
    });

    return worker;
  });

  logger.info({ count: workers.length }, 'worker-started');
  return workers;
}

/** docs/01 §6 — the cron-driven jobs, run in-process by the worker. */
export function startSchedules(): NodeJS.Timeout[] {
  const every = (ms: number, task: () => Promise<unknown>, label: string) =>
    setInterval(() => {
      void task().catch((error: unknown) => reportError(error, { queue: label }));
    }, ms);

  return [
    every(5 * 60_000, processReminders, 'reminders'),
    every(30 * 60_000, processProgrammeAnnouncements, 'programme-announcements'),
    every(60 * 60_000, () => processMaintenance({ task: 'purge-tokens' }), 'maintenance'),
    every(6 * 60 * 60_000, () => processMaintenance({ task: 'purge-sessions' }), 'maintenance'),
    every(24 * 60 * 60_000, () => processMaintenance({ task: 'purge-analytics' }), 'maintenance'),
    every(24 * 60 * 60_000, () => processMaintenance({ task: 'expire-orders' }), 'maintenance'),
    every(24 * 60 * 60_000, processAccountDeletions, 'gdpr-deletions'),
  ];
}

if (process.argv[1]?.includes('worker')) {
  void (async () => {
    const workers = await startWorker();
    const timers = startSchedules();

    const shutdown = async () => {
      logger.info({}, 'worker-shutting-down');
      for (const timer of timers) clearInterval(timer);
      await Promise.all(workers.map((worker) => worker.close()));
      process.exit(0);
    };

    process.on('SIGTERM', () => void shutdown());
    process.on('SIGINT', () => void shutdown());
  })();
}
