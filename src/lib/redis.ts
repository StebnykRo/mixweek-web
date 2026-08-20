import Redis from 'ioredis';
import { logger } from './logger';

/**
 * docs/13-nfr.md §6 — degrade, do not fall over. If Redis is unreachable the
 * process keeps serving content from an in-process fallback; the auth rate
 * limiter is the one place that fails closed instead (see rate-limit.ts).
 */

type Value = { value: string; expiresAt: number | null };

class MemoryStore {
  private readonly map = new Map<string, Value>();

  private live(key: string): Value | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return entry;
  }

  get(key: string): string | null {
    return this.live(key)?.value ?? null;
  }

  set(key: string, value: string, ttlSeconds?: number): void {
    this.map.set(key, { value, expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null });
  }

  del(...keys: string[]): void {
    for (const key of keys) this.map.delete(key);
  }

  incrWithTtl(key: string, ttlSeconds: number): number {
    const current = Number(this.get(key) ?? '0') + 1;
    const existing = this.live(key);
    this.map.set(key, {
      value: String(current),
      expiresAt: existing?.expiresAt ?? Date.now() + ttlSeconds * 1000,
    });
    return current;
  }

  ttl(key: string): number {
    const entry = this.live(key);
    if (!entry || entry.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  keys(prefix: string): string[] {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix));
  }
}

const memory = new MemoryStore();

let client: Redis | null = null;
let healthy = false;

function connection(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (client) return client;
  client = new Redis(url, {
    maxRetriesPerRequest: 2,
    enableOfflineQueue: false,
    lazyConnect: false,
    retryStrategy: (times) => Math.min(times * 200, 3000),
  });
  client.on('ready', () => {
    healthy = true;
  });
  client.on('error', (error: Error) => {
    if (healthy) logger.warn({ reason: error.message }, 'redis-unavailable');
    healthy = false;
  });
  return client;
}

export function redisAvailable(): boolean {
  return connection() !== null && healthy;
}

export async function kvGet(key: string): Promise<string | null> {
  const c = connection();
  if (c && healthy) {
    try {
      return await c.get(key);
    } catch {
      healthy = false;
    }
  }
  return memory.get(key);
}

export async function kvSet(key: string, value: string, ttlSeconds?: number): Promise<void> {
  const c = connection();
  if (c && healthy) {
    try {
      if (ttlSeconds) await c.set(key, value, 'EX', ttlSeconds);
      else await c.set(key, value);
      return;
    } catch {
      healthy = false;
    }
  }
  memory.set(key, value, ttlSeconds);
}

/** Set only if absent — the primitive behind Idempotency-Key handling. */
export async function kvSetNx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  const c = connection();
  if (c && healthy) {
    try {
      const result = await c.set(key, value, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch {
      healthy = false;
    }
  }
  if (memory.get(key) !== null) return false;
  memory.set(key, value, ttlSeconds);
  return true;
}

export async function kvDel(...keys: string[]): Promise<void> {
  const c = connection();
  if (c && healthy) {
    try {
      await c.del(...keys);
      return;
    } catch {
      healthy = false;
    }
  }
  memory.del(...keys);
}

export async function kvDelByPrefix(prefix: string): Promise<void> {
  const c = connection();
  if (c && healthy) {
    try {
      const stream = c.scanStream({ match: `${prefix}*`, count: 200 });
      const batch: string[] = [];
      for await (const keys of stream) batch.push(...(keys as string[]));
      if (batch.length) await c.del(...batch);
      return;
    } catch {
      healthy = false;
    }
  }
  memory.del(...memory.keys(prefix));
}

export type CounterResult = { count: number; ttlSeconds: number };

export async function kvIncr(key: string, ttlSeconds: number): Promise<CounterResult> {
  const c = connection();
  if (c && healthy) {
    try {
      const pipeline = c.multi().incr(key).ttl(key);
      const results = await pipeline.exec();
      const count = Number(results?.[0]?.[1] ?? 0);
      let ttl = Number(results?.[1]?.[1] ?? -1);
      if (ttl < 0) {
        await c.expire(key, ttlSeconds);
        ttl = ttlSeconds;
      }
      return { count, ttlSeconds: ttl };
    } catch {
      healthy = false;
    }
  }
  return { count: memory.incrWithTtl(key, ttlSeconds), ttlSeconds: memory.ttl(key) };
}

export function getRedis(): Redis | null {
  return connection();
}

export async function closeRedis(): Promise<void> {
  await client?.quit().catch(() => undefined);
  client = null;
  healthy = false;
}
