import { PrismaClient } from '@prisma/client';

/**
 * The raw client. Direct use is confined to `src/lib/db/*`, the seed and
 * migration scripts — everything else goes through `getTenantDb()`. The lint
 * rule `no-restricted-imports` enforces that boundary.
 */
const globalForPrisma = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  globalForPrisma.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.__prisma = prisma;

/**
 * The tables that are deliberately NOT tenant-scoped (docs/02 §4.1): Tenant,
 * User, Session, Account, AuthFactor, RecoveryCode, VerificationToken,
 * TrustedDevice and LoginAttempt — a person can belong to several tenants, so
 * a tenant column would be wrong on them. Access is authorised through
 * Membership and policies.ts instead.
 *
 * Also the right client for genuinely global objects such as the order-number
 * sequence and the liveness probe.
 */
export const globalDb = prisma;

/** Cheap liveness probe for /api/health. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export type Db = PrismaClient;
