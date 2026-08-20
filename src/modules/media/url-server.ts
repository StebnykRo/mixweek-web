import { inspectExternalUrl } from './url';

/**
 * docs/08 §4.3 — if a server-side fetch is ever needed (oEmbed), it goes
 * through here: private ranges blocked, redirects to private addresses
 * blocked, five-second timeout, one-megabyte cap.
 */
const PRIVATE_V4 = [
  /^10\./,
  /^127\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
];

export function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase();
  if (value === '::1' || value === 'localhost') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true; // fc00::/7
  if (value.startsWith('fe80:')) return true;
  return PRIVATE_V4.some((pattern) => pattern.test(value));
}

export async function ssrfSafeFetch(url: string, allowlist: readonly string[]): Promise<Response> {
  const verdict = inspectExternalUrl(url, allowlist);
  if (!verdict.ok || !verdict.onAllowlist) throw new Error('URL is not permitted for server-side fetching');

  const { lookup } = await import('node:dns/promises');
  const records = await lookup(verdict.host, { all: true });
  if (records.some((record) => isPrivateAddress(record.address))) {
    throw new Error('URL resolves to a private address');
  }

  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
    headers: { accept: 'application/json, text/html' },
  });
  if (response.status >= 300 && response.status < 400) {
    throw new Error('Redirects are not followed for external URLs');
  }
  const length = Number(response.headers.get('content-length') ?? '0');
  if (length > 1024 * 1024) throw new Error('Response is too large');
  return response;
}

