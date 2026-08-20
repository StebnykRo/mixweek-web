import { PrismaClient } from '@prisma/client';
import { PLATFORM_DEFAULT_TOKENS } from '../src/modules/branding/default-brand';

/**
 * `pnpm ops:provision-tenant --slug=acme --name="Acme" --domain=acme.com --admin=you@acme.com`
 *
 * Creates the first real tenant on a fresh installation: the tenant, its
 * default brand, the email domain that resolves to it, and one TENANT_ADMIN.
 *
 * The platform super-admin UI is not built (docs/DELIVERY-NOTES.md §3), so
 * this is the supported way to bring a tenant into existence in production.
 * It is idempotent — re-running with the same slug updates rather than
 * duplicates, so it is safe to use to add a second admin later.
 *
 * Sign-in is by emailed link. The admin must be reachable at --admin, and
 * SMTP must be configured, or nobody can log in.
 */
const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

const USAGE =
  'Usage: pnpm ops:provision-tenant --slug=<slug> --name="<name>" --domain=<email-domain> --admin=<email> [--locale=en] [--timezone=Asia/Nicosia]';

async function main() {
  const slug = arg('slug')?.trim().toLowerCase();
  const name = arg('name')?.trim();
  const domain = arg('domain')?.trim().toLowerCase();
  const admin = arg('admin')?.trim().toLowerCase();
  const locale = arg('locale')?.trim() ?? 'en';
  const timezone = arg('timezone')?.trim() ?? 'Asia/Nicosia';

  if (!slug || !name || !domain || !admin) {
    console.error(USAGE);
    process.exit(1);
  }
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) {
    console.error(`Invalid slug "${slug}": lowercase letters, digits and hyphens, 3–40 characters.`);
    process.exit(1);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(admin)) {
    console.error(`Invalid admin email "${admin}".`);
    process.exit(1);
  }
  // The admin has to be inside the tenant's own email domain, otherwise the
  // domain-based tenant resolution will never route their sign-in here.
  const adminDomain = admin.split('@')[1];
  if (adminDomain !== domain) {
    console.error(`--admin must be at @${domain}; tenants are resolved by email domain (docs/04 §2).`);
    process.exit(1);
  }

  const existingDomain = await prisma.tenantDomain.findUnique({
    where: { domain },
    select: { tenantId: true, tenant: { select: { slug: true } } },
  });
  if (existingDomain && existingDomain.tenant.slug !== slug) {
    console.error(`Domain ${domain} already belongs to tenant "${existingDomain.tenant.slug}".`);
    process.exit(1);
  }

  const tenant = await prisma.tenant.upsert({
    where: { slug },
    update: { name, defaultLocale: locale, timezone },
    create: { slug, name, defaultLocale: locale, locales: [locale], timezone },
    select: { id: true, slug: true },
  });

  const existingBrand = await prisma.brand.findFirst({
    where: { tenantId: tenant.id, key: 'default' },
    select: { id: true },
  });
  const brand = existingBrand
    ? await prisma.brand.update({
        where: { id: existingBrand.id },
        data: { name, appName: name },
        select: { id: true },
      })
    : await prisma.brand.create({
        data: {
          tenantId: tenant.id,
          key: 'default',
          name,
          appName: name,
          isDefault: true,
          tokens: PLATFORM_DEFAULT_TOKENS,
          status: 'PUBLISHED',
          publishedAt: new Date(),
        },
        select: { id: true },
      });

  await prisma.tenantDomain.upsert({
    where: { domain },
    update: { tenantId: tenant.id, brandId: brand.id, isPrimary: true, verifiedAt: new Date() },
    create: {
      tenantId: tenant.id,
      domain,
      hostType: 'EMAIL',
      isPrimary: true,
      autoJoin: true,
      brandId: brand.id,
      verifiedAt: new Date(),
    },
  });

  const user = await prisma.user.upsert({
    where: { email: admin },
    update: { primaryTenantId: tenant.id },
    create: { email: admin, locale, primaryTenantId: tenant.id },
    select: { id: true },
  });

  await prisma.membership.upsert({
    where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } },
    update: { role: 'TENANT_ADMIN', status: 'ACTIVE' },
    create: { userId: user.id, tenantId: tenant.id, role: 'TENANT_ADMIN', status: 'ACTIVE' },
  });

  await prisma.auditLog.create({
    data: {
      tenantId: tenant.id,
      action: 'ops.provision_tenant',
      entityType: 'Tenant',
      entityId: tenant.id,
      diff: { slug, domain, admin },
    },
  });

  console.log(`Tenant "${tenant.slug}" ready.`);
  console.log(`  email domain : ${domain}`);
  console.log(`  admin        : ${admin} (TENANT_ADMIN)`);
  console.log('  Sign in with that address; the link arrives by email.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
