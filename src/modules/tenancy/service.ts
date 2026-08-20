import { globalDb } from '@/lib/db/client';
import { cached, tenantKey } from '@/lib/cache';
import { withSystemScope } from '@/lib/db/tenant-client';

export type ResolvedTenant = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  brandId: string | null;
  autoJoin: boolean;
  verified: boolean;
  locales: string[];
  defaultLocale: string;
  timezone: string;
};

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1).toLowerCase().trim();
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * docs/04-white-label.md §2 — the corporate email domain picks the tenant, and
 * with it the brand. An unknown domain resolves to null; the caller must still
 * behave identically to a known one (docs/03 §2, no enumeration).
 */
export async function resolveTenantByEmailDomain(email: string): Promise<ResolvedTenant | null> {
  const domain = emailDomain(normaliseEmail(email));
  if (!domain) return null;

  // Pre-authentication: this lookup is what produces the tenant, so it runs
  // in the system scope (docs/02 §4.2). It is keyed by an exact domain.
  const record = await withSystemScope('resolve tenant by email domain', (db) =>
    db.tenantDomain.findFirst({
    where: { domain, hostType: 'EMAIL' },
    select: {
      brandId: true,
      autoJoin: true,
      verifiedAt: true,
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          locales: true,
          defaultLocale: true,
          timezone: true,
          brands: { where: { isDefault: true }, select: { id: true }, take: 1 },
        },
      },
    },
    }),
  );

  if (!record || record.tenant.status !== 'ACTIVE') return null;

  return {
    tenantId: record.tenant.id,
    tenantSlug: record.tenant.slug,
    tenantName: record.tenant.name,
    brandId: record.brandId ?? record.tenant.brands[0]?.id ?? null,
    autoJoin: record.autoJoin,
    verified: record.verifiedAt !== null,
    locales: record.tenant.locales,
    defaultLocale: record.tenant.defaultLocale,
    timezone: record.tenant.timezone,
  };
}

/** Sub-domain or custom host entry point (docs/04 §2.3), behind tenant.custom_host. */
export async function resolveTenantByHost(host: string): Promise<ResolvedTenant | null> {
  const clean = host.split(':')[0]?.toLowerCase();
  if (!clean) return null;
  const record = await withSystemScope('resolve tenant by host', (db) =>
    db.tenantDomain.findFirst({
    where: { domain: clean, hostType: 'HOST' },
    select: {
      brandId: true,
      autoJoin: true,
      verifiedAt: true,
      tenant: {
        select: {
          id: true,
          slug: true,
          name: true,
          status: true,
          locales: true,
          defaultLocale: true,
          timezone: true,
          brands: { where: { isDefault: true }, select: { id: true }, take: 1 },
        },
      },
    },
    }),
  );
  if (!record || record.tenant.status !== 'ACTIVE') return null;
  return {
    tenantId: record.tenant.id,
    tenantSlug: record.tenant.slug,
    tenantName: record.tenant.name,
    brandId: record.brandId ?? record.tenant.brands[0]?.id ?? null,
    autoJoin: record.autoJoin,
    verified: record.verifiedAt !== null,
    locales: record.tenant.locales,
    defaultLocale: record.tenant.defaultLocale,
    timezone: record.tenant.timezone,
  };
}

export async function getTenant(tenantId: string) {
  // Tenant itself is not RLS-scoped, but the read is cached per tenant key.
  return cached(tenantKey(tenantId, 'tenant'), 300, () =>
    globalDb.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        name: true,
        status: true,
        locales: true,
        defaultLocale: true,
        timezone: true,
      },
    }),
  );
}
