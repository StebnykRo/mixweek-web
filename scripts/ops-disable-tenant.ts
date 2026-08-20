import { PrismaClient } from '@prisma/client';

/**
 * `pnpm ops:disable-tenant --id=<tenantId>`
 *
 * docs/12-security.md §13 — suspends a tenant and signs everyone in it out.
 * Content is left untouched; this is a containment action, not a deletion.
 */
const prisma = new PrismaClient();

async function main() {
  const id = process.argv.find((value) => value.startsWith('--id='))?.split('=')[1];
  if (!id) {
    console.error('Usage: pnpm ops:disable-tenant --id=<tenantId>');
    process.exit(1);
  }

  const tenant = await prisma.tenant.update({
    where: { id },
    data: { status: 'SUSPENDED' },
    select: { slug: true },
  });

  const memberships = await prisma.membership.findMany({ where: { tenantId: id }, select: { userId: true } });
  const revoked = await prisma.session.updateMany({
    where: { userId: { in: memberships.map((membership) => membership.userId) }, revokedAt: null },
    data: { revokedAt: new Date(), revokedReason: 'tenant_suspended' },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: id,
      action: 'ops.disable_tenant',
      entityType: 'Tenant',
      entityId: id,
      diff: { sessionsRevoked: revoked.count },
    },
  });

  console.log(`Suspended ${tenant.slug}; revoked ${revoked.count} session(s).`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
