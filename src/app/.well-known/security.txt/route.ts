import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const dynamic = 'force-static';

/** docs/12-security.md §15 — a published contact point for reports (RFC 9116). */
export function GET(): NextResponse {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    `Contact: mailto:security@mixweek.app`,
    `Expires: ${expires}`,
    `Preferred-Languages: en, uk, ru`,
    `Canonical: ${env().APP_URL}/.well-known/security.txt`,
    `Policy: ${env().APP_URL}/legal/security`,
    '',
  ].join('\n');

  return new NextResponse(body, {
    headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });
}
