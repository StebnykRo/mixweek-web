import { PrismaClient } from '@prisma/client';

/**
 * `pnpm db:anonymize`
 *
 * docs/01-architecture.md §2 — production data never reaches a lower
 * environment with real names and addresses attached. Run this immediately
 * after restoring a copy, before anyone connects to it.
 */
const prisma = new PrismaClient();

async function main() {
  if ((process.env.APP_ENV ?? process.env.NODE_ENV) === 'production') {
    throw new Error('Refusing to anonymise a production database.');
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  console.log(`Anonymising ${users.length} user(s)…`);

  for (const [index, user] of users.entries()) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        email: `user${index}@example.test`,
        name: `User ${index}`,
        jobTitle: null,
        avatarUrl: null,
        hrContactId: null,
      },
    });
  }

  // Anything that could still identify someone, or let someone in, goes.
  await prisma.session.deleteMany();
  await prisma.verificationToken.deleteMany();
  await prisma.trustedDevice.deleteMany();
  await prisma.recoveryCode.deleteMany();
  await prisma.authFactor.deleteMany();
  await prisma.account.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.loginAttempt.deleteMany();
  await prisma.secretSetting.deleteMany();
  await prisma.eventRegistration.updateMany({ data: { answers: undefined } });

  console.log('Done. Sessions, tokens, factors, subscriptions and secrets were removed.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
