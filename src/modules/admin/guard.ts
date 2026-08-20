import { redirect } from 'next/navigation';
import { getSession } from '@/lib/http/context';
import { can, hasPermission, type Action } from '@/modules/auth/policies';
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
  if (!can(session, action, { tenantId: session.tenantId })) {
    // Same treatment as the API: no hint that the section exists.
    const { notFound } = await import('next/navigation');
    notFound();
  }
  return session;
}

/** For rendering: hides a control the person cannot use. Not a security check. */
export function allows(session: SessionContext, action: Action): boolean {
  return hasPermission(session.role, action);
}
