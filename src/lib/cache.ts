import { kvDelByPrefix, kvGet, kvSet } from './redis';

/**
 * docs/04-white-label.md §6.4 — every cache key carries the tenantId, so a
 * mis-scoped read cannot pull another tenant's payload out of Redis.
 */
export function tenantKey(tenantId: string, ...parts: (string | number | undefined)[]): string {
  return ['t', tenantId, ...parts.filter((p) => p !== undefined)].join(':');
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  produce: () => Promise<T>,
): Promise<T> {
  const hit = await kvGet(key);
  if (hit !== null) {
    try {
      return JSON.parse(hit) as T;
    } catch {
      // Corrupt entry: fall through and recompute.
    }
  }
  const value = await produce();
  await kvSet(key, JSON.stringify(value), ttlSeconds);
  return value;
}

export async function invalidateTenant(tenantId: string, ...parts: string[]): Promise<void> {
  await kvDelByPrefix(tenantKey(tenantId, ...parts));
}
