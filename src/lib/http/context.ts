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

/**
 * The caller's address, used for rate limiting and for the HMAC'd `ipHash`.
 *
 * Behind a reverse proxy this is security-relevant: a client can send its own
 * `X-Forwarded-For`, and a proxy that appends to it leaves the forged value
 * leftmost. Trusting that would hand anyone an unlimited number of rate-limit
 * buckets on `/auth/start`.
 *
 * So the trusted header is named explicitly. `TRUSTED_PROXY_HEADER` (set to
 * `x-real-ip` in the deployment) is read to the exclusion of everything else,
 * and the proxy is configured to overwrite rather than append it. With no proxy
 * — local development, tests — the header is absent and we fall back to the
 * usual ones.
 */
export function clientIpFrom(headerBag: Headers): string | null {
  const trusted = process.env.TRUSTED_PROXY_HEADER;
  if (trusted) {
    const value = headerBag.get(trusted);
    return value ? (value.split(',').pop()?.trim() ?? null) : null;
  }

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
