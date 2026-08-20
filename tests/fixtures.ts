import { PrismaClient, type Role } from '@prisma/client';
import { PLATFORM_DEFAULT_TOKENS, ACME_TOKENS } from '@/modules/branding/default-brand';

/**
 * Integration fixtures.
 *
 * These use a privileged connection on purpose: setting up two tenants is
 * exactly the operation that must NOT be tenant-scoped. Everything under test
 * then runs through the ordinary app path.
 */
const adminUrl =
  process.env.TEST_DIRECT_DATABASE_URL ?? 'postgresql://app_admin:app_admin_dev@localhost:5432/mixweek_test?schema=public';

export const adminDb = new PrismaClient({ datasources: { db: { url: adminUrl } } });

export type TenantFixture = {
  tenantId: string;
  slug: string;
  brandId: string;
  domain: string;
  eventId: string;
  eventSlug: string;
  activityId: string;
  users: Array<{ id: string; email: string }>;
};

let counter = 0;

/**
 * Every fixture registers itself here so cleanup can be scoped to the file that
 * created it. A blanket "delete everything" would race with any other spec file
 * sharing the database.
 */
const createdTenantIds = new Set<string>();
const createdUserIds = new Set<string>();
const createdDomains = new Set<string>();

/** A fresh, isolated tenant with one published event and one session. */
export async function createTenantFixture(options?: {
  slug?: string;
  userCount?: number;
  capacity?: number | null;
  role?: Role;
  activityCapacity?: number | null;
}): Promise<TenantFixture> {
  counter += 1;
  const slug = options?.slug ?? `t${Date.now().toString(36)}${counter}`;
  const domain = `${slug}.test`;

  const tenant = await adminDb.tenant.create({
    data: { slug, name: slug.toUpperCase(), timezone: 'Asia/Nicosia', locales: ['en'] },
  });
  createdTenantIds.add(tenant.id);

  const brand = await adminDb.brand.create({
    data: {
      tenantId: tenant.id,
      key: `${slug}-default`,
      name: slug,
      isDefault: true,
      appName: slug,
      tokens: (counter % 2 === 0 ? ACME_TOKENS : PLATFORM_DEFAULT_TOKENS) as never,
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });

  await adminDb.tenantDomain.create({
    data: { tenantId: tenant.id, domain, brandId: brand.id, verifiedAt: new Date(), isPrimary: true },
  });
  createdDomains.add(domain);

  const now = Date.now();
  const event = await adminDb.event.create({
    data: {
      tenantId: tenant.id,
      slug: `${slug}-event`,
      title: `${slug} event`,
      startsAt: new Date(now + 7 * 24 * 3600_000),
      endsAt: new Date(now + 9 * 24 * 3600_000),
      timezone: 'Asia/Nicosia',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      registrationEnabled: true,
      waitlistEnabled: true,
      capacity: options?.capacity ?? null,
      brandId: brand.id,
    },
  });

  const activity = await adminDb.activity.create({
    data: {
      tenantId: tenant.id,
      eventId: event.id,
      title: 'Workshop',
      track: 'WORKSHOP',
      startsAt: new Date(now + 7 * 24 * 3600_000 + 3600_000),
      endsAt: new Date(now + 7 * 24 * 3600_000 + 2 * 3600_000),
      bookingRequired: options?.activityCapacity !== undefined,
      capacity: options?.activityCapacity ?? null,
      waitlistEnabled: true,
    },
  });

  const users = [];
  for (let index = 0; index < (options?.userCount ?? 3); index += 1) {
    const user = await adminDb.user.create({
      data: {
        email: `user${index}@${domain}`,
        name: `User ${index}`,
        emailVerifiedAt: new Date(),
        primaryTenantId: tenant.id,
        department: index % 2 === 0 ? 'Engineering' : 'People',
      },
    });
    await adminDb.membership.create({
      data: { userId: user.id, tenantId: tenant.id, role: options?.role ?? 'PARTICIPANT', status: 'ACTIVE' },
    });
    createdUserIds.add(user.id);
    users.push({ id: user.id, email: user.email });
  }

  return {
    tenantId: tenant.id,
    slug,
    brandId: brand.id,
    domain,
    eventId: event.id,
    eventSlug: event.slug,
    activityId: activity.id,
    users,
  };
}

/** Removes only what this spec file created; cascades take care of the rest. */
export async function resetDatabase(): Promise<void> {
  const tenantIds = [...createdTenantIds];
  const userIds = [...createdUserIds];

  if (tenantIds.length > 0) {
    await adminDb.auditLog.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await adminDb.secretSetting.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await adminDb.featureFlag.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await adminDb.hrAssignment.deleteMany({ where: { tenantId: { in: tenantIds } } });
    await adminDb.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  }
  // Users created indirectly (first sign-in, imports) share the fixture's
  // domain, so they are removed by address rather than by id.
  for (const domain of createdDomains) {
    await adminDb.verificationToken.deleteMany({ where: { identifier: { endsWith: `@${domain}` } } });
    await adminDb.user.deleteMany({ where: { email: { endsWith: `@${domain}` } } });
  }
  if (userIds.length > 0) await adminDb.user.deleteMany({ where: { id: { in: userIds } } });
  createdDomains.clear();

  createdTenantIds.clear();
  createdUserIds.clear();
}

/** Runs a raw query as `app_user` with a chosen tenant scope, like the app does. */
export async function asAppUser<T>(tenantId: string | null, fn: (db: PrismaClient) => Promise<T>): Promise<T> {
  const { prisma } = await import('@/lib/db/client');
  return prisma.$transaction(async (tx) => {
    if (tenantId) await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx as unknown as PrismaClient);
  });
}
