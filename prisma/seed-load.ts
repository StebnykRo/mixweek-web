import { PrismaClient } from '@prisma/client';

/**
 * `pnpm db:seed:load` — 3 000 users and 3 000 registrations for the load
 * scenarios in docs/13 §1.
 *
 * Kept separate from the ordinary seed so a developer's database stays small.
 * Refuses to run against production data.
 */
const prisma = new PrismaClient();

const COUNT = Number(process.env.LOAD_USERS ?? 3000);
const BATCH = 500;

async function main() {
  if ((process.env.APP_ENV ?? process.env.NODE_ENV) === 'production') {
    throw new Error('The load seed must never run against production.');
  }

  const tenant = await prisma.tenant.findFirst({ where: { slug: 'softswiss' }, select: { id: true } });
  if (!tenant) throw new Error('Run `pnpm db:seed` first.');

  const event = await prisma.event.findFirst({
    where: { tenantId: tenant.id, slug: 'mix-week-2026' },
    select: { id: true },
  });
  if (!event) throw new Error('Mix Week is missing; run `pnpm db:seed` first.');

  console.log(`Creating ${COUNT} load-test users…`);

  for (let offset = 0; offset < COUNT; offset += BATCH) {
    const size = Math.min(BATCH, COUNT - offset);
    const users = Array.from({ length: size }, (_, index) => ({
      email: `load${offset + index}@example.test`,
      name: `Load ${offset + index}`,
      emailVerifiedAt: new Date(),
      primaryTenantId: tenant.id,
      department: ['Engineering', 'Marketing', 'People', 'Finance', 'Product'][(offset + index) % 5]!,
    }));

    await prisma.user.createMany({ data: users, skipDuplicates: true });

    const created = await prisma.user.findMany({
      where: { email: { in: users.map((user) => user.email) } },
      select: { id: true },
    });

    await prisma.membership.createMany({
      data: created.map((user) => ({ userId: user.id, tenantId: tenant.id, role: 'PARTICIPANT' as const })),
      skipDuplicates: true,
    });

    await prisma.eventRegistration.createMany({
      data: created.map((user) => ({
        tenantId: tenant.id,
        eventId: event.id,
        userId: user.id,
        status: 'CONFIRMED' as const,
      })),
      skipDuplicates: true,
    });

    process.stdout.write(`\r  ${Math.min(offset + size, COUNT)} / ${COUNT}`);
  }

  console.log('\nDone. Addresses are load0@example.test … — all on a SEED_DOMAINS domain.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
