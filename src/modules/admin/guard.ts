import { redirect } from 'next/navigation';
import { getSession } from '@/lib/http/context';
import { can, hasPermission, requiresStepUp, stepUpSatisfied, type Action } from '@/modules/auth/policies';
import type { SessionContext } from '@/modules/auth/session';

/**
 * The admin-side authorisation helper for pages.
 *
 * Route handlers use `route({ auth: { mode: 'permission' } })`; this is the
 * equivalent for React Server Components, so a page cannot render data the
 * caller is not allowed to see. Both go through the same `can()` (docs/12 §5).
 */
export type AdminSession = SessionContext & { tenantId: string };

export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.mfaSatisfied) redirect('/login/mfa');
  if (!session.tenantId) redirect('/login');
  // Any admin section requires at least read on the dashboard.
  if (!hasPermission(session.role, 'dashboard:read')) redirect('/events');
  return session as AdminSession;
}

export async function requirePermission(action: Action): Promise<AdminSession> {
  const session = await requireAdminSession();

  /**
   * Two different refusals, which used to look identical.
   *
   * No permission stays a 404, deliberately: someone who cannot use a section
   * should not learn it exists. But a sensitive section such as Secrets also
   * needs a second factor confirmed in the last fifteen minutes, and when only
   * that had lapsed the page still claimed not to exist — to a person who does
   * have the permission and was there minutes earlier. That is a dead end
   * rather than a prompt, so it is now a step-up instead.
   */
  const allowed = hasPermission(session.role, action);
  const needsStepUp = allowed && requiresStepUp(action) && !stepUpSatisfied(session);

  if (needsStepUp) {
    const { redirect } = await import('next/navigation');
    const { headers } = await import('next/headers');
    const back = (await headers()).get('x-pathname') ?? '/admin';
    redirect(`/admin/step-up?next=${encodeURIComponent(back)}`);
  }

  if (!can(session, action, { tenantId: session.tenantId })) {
    const { notFound } = await import('next/navigation');
    notFound();
  }
  return session;
}

/** For rendering: hides a control the person cannot use. Not a security check. */
export function allows(session: SessionContext, action: Action): boolean {
  return hasPermission(session.role, action);
}
