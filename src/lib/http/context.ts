import { cookies, headers } from 'next/headers';
import { readSession, type SessionContext } from '@/modules/auth/session';
import { readSessionCookie } from './cookies';

/**
 * The request-scoped facts every handler needs. tenantId is read from the
 * session only — never from a body, a query parameter or a header
 * (CLAUDE.md §5.1 rule 2).
 */
export type RequestContext = {
  requestId: string;
  ip: string | null;
  userAgent: string | null;
  origin: string | null;
  session: SessionContext | null;
};

export function clientIpFrom(headerBag: Headers): string | null {
  const forwarded = headerBag.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return headerBag.get('x-real-ip');
}

/** The /24 aggregate, so we can rate-limit a subnet without storing an address. */
export function subnetOf(ip: string | null): string {
  if (!ip) return 'unknown';
  const v4 = ip.split('.');
  if (v4.length === 4) return `${v4[0]}.${v4[1]}.${v4[2]}.0/24`;
  return ip.split(':').slice(0, 4).join(':');
}

export async function getRequestContext(): Promise<RequestContext> {
  const headerBag = await headers();
  const cookieBag = await cookies();
  const token = readSessionCookie(cookieBag);
  return {
    requestId: headerBag.get('x-request-id') ?? 'unknown',
    ip: clientIpFrom(headerBag),
    userAgent: headerBag.get('user-agent'),
    origin: headerBag.get('origin'),
    session: await readSession(token),
  };
}

export async function getSession(): Promise<SessionContext | null> {
  const cookieBag = await cookies();
  return readSession(readSessionCookie(cookieBag));
}
