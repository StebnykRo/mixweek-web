import { headers } from 'next/headers';
import { getSession } from './http/context';
import { resolveBrand } from '@/modules/branding/service';
import { resolveTenantByHost } from '@/modules/tenancy/service';
import { isFeatureEnabled } from '@/modules/tenancy/settings';
import type { PublicBrand } from '@/modules/branding/default-brand';

/**
 * docs/04-white-label.md §2.2 — after sign-in the tenant and brand come from
 * the session; before it, from the host (when tenant.custom_host is on) or the
 * neutral platform brand.
 */
export async function getBrandForRequest(options?: { eventBrandId?: string | null }): Promise<PublicBrand> {
  const session = await getSession().catch(() => null);
  if (session?.tenantId) {
    return resolveBrand({ tenantId: session.tenantId, eventBrandId: options?.eventBrandId ?? null });
  }

  const host = (await headers()).get('host');
  if (host) {
    const byHost = await resolveTenantByHost(host).catch(() => null);
    if (byHost && (await isFeatureEnabled('tenant.custom_host', { tenantId: byHost.tenantId }))) {
      return resolveBrand({ tenantId: byHost.tenantId, domainBrandId: byHost.brandId });
    }
  }

  return resolveBrand({ tenantId: null });
}

export async function getNonce(): Promise<string> {
  return (await headers()).get('x-nonce') ?? '';
}
