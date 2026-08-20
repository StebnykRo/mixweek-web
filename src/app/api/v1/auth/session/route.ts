import { route } from '@/lib/http/handler';
import { AppError } from '@/lib/errors';
import { getTenant } from '@/modules/tenancy/service';
import { resolveBrand } from '@/modules/branding/service';
import { hasConfirmedTotp } from '@/modules/auth/totp';
import { unreadCount } from '@/modules/notifications/service';
import { PERMISSIONS } from '@/modules/auth/policies';

export const dynamic = 'force-dynamic';

/** GET /api/v1/auth/session — the current session, tenant, brand and rights. */
export const GET = route({ auth: { mode: 'public' }, personal: true }, async ({ ctx }) => {
  if (!ctx.session) return { authenticated: false };
  const session = ctx.session;

  const [tenant, brand, mfaEnrolled, unread] = await Promise.all([
    session.tenantId ? getTenant(session.tenantId) : null,
    resolveBrand({ tenantId: session.tenantId }),
    hasConfirmedTotp(session.userId),
    session.tenantId && session.mfaSatisfied ? unreadCount(session.tenantId, session.userId) : Promise.resolve(0),
  ]);

  return {
    authenticated: true,
    mfaSatisfied: session.mfaSatisfied,
    mfaEnrolled,
    user: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      locale: session.user.locale,
      department: session.user.department,
      team: session.user.team,
      jobTitle: session.user.jobTitle,
      avatarUrl: session.user.avatarUrl,
    },
    tenant: tenant ? { id: tenant.id, slug: tenant.slug, name: tenant.name, locales: tenant.locales } : null,
    role: session.role,
    permissions: session.role ? PERMISSIONS[session.role] : null,
    brand: {
      id: brand.id,
      key: brand.key,
      appName: brand.appName,
      kicker: brand.kicker,
      logoLightUrl: brand.logoLightUrl,
      logoMarkUrl: brand.logoMarkUrl,
    },
    unreadNotifications: unread,
    serverTime: new Date().toISOString(),
  };
});

/** A session endpoint must never be reachable with an unsafe method. */
export const POST = route({ auth: { mode: 'session' } }, async () => {
  throw new AppError('NOT_FOUND');
});
