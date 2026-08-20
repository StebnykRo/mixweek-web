import { PrismaClient } from '@prisma/client';

/**
 * `pnpm ops:revoke-sessions --user=<id> | --tenant=<id> | --all`
 *
 * docs/12-security.md §13 — incident containment. Database sessions exist so
 * that this takes effect immediately rather than on the next token expiry.
 */
const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=')[1];
}

async function main() {
  const userId = arg('user');
  const tenantId = arg('tenant');
  const all = process.argv.includes('--all');
  const reason = arg('reason') ?? 'ops_revoke';

  if (!userId && !tenantId && !all) {
    console.error('Usage: pnpm ops:revoke-sessions --user=<id> | --tenant=<id> | --all [--reason=text]');
    process.exit(1);
  }

  let userIds: string[] | undefined;
  if (tenantId) {
    const memberships = await prisma.membership.findMany({ where: { tenantId }, select: { userId: true } });
    userIds = memberships.map((membership) => membership.userId);
  }

  const result = await prisma.session.updateMany({
    where: {
      revokedAt: null,
      ...(userId ? { userId } : {}),
      ...(userIds ? { userId: { in: userIds } } : {}),
    },
    data: { revokedAt: new Date(), revokedReason: reason },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenantId ?? null,
      action: 'ops.revoke_sessions',
      entityType: 'Session',
      diff: { scope: userId ? 'user' : tenantId ? 'tenant' : 'all', count: result.count, reason },
    },
  });

  console.log(`Revoked ${result.count} session(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
