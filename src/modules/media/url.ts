import { z } from 'zod';

/**
 * docs/08-media.md §4 — external link safety.
 *
 * We never fetch an arbitrary URL server-side, so the risk here is what a
 * participant's browser is sent to. Two gates: the scheme must be https, and
 * the host must be on the allowlist (or explicitly approved by a TENANT_ADMIN
 * with step-up, recorded in the audit log).
 */

export const DEFAULT_DOMAIN_ALLOWLIST = [
  'drive.google.com',
  'photos.google.com',
  'docs.google.com',
  'dropbox.com',
  '1drv.ms',
  'onedrive.live.com',
  'flickr.com',
  'smugmug.com',
  'pixieset.com',
  'youtube.com',
  'youtu.be',
  'vimeo.com',
] as const;

export const ExternalUrlSchema = z
  .string()
  .url()
  .max(2000)
  .refine((value) => {
    try {
      return new URL(value).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'only https links are accepted');

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
}

export function isAllowedHost(url: string, allowlist: readonly string[] = DEFAULT_DOMAIN_ALLOWLIST): boolean {
  const host = hostOf(url);
  if (!host) return false;
  return allowlist.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

export type UrlVerdict =
  | { ok: true; host: string; onAllowlist: boolean }
  | { ok: false; reason: 'invalid' | 'scheme' };

export function inspectExternalUrl(url: string, allowlist: readonly string[] = DEFAULT_DOMAIN_ALLOWLIST): UrlVerdict {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol !== 'https:') return { ok: false, reason: 'scheme' };
  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  return { ok: true, host, onAllowlist: isAllowedHost(url, allowlist) };
}

/** docs/08 §2 — the provider is inferred from the host, for the card badge. */
export function providerFor(url: string): string {
  const host = hostOf(url) ?? '';
  if (host.endsWith('drive.google.com') || host.endsWith('docs.google.com')) return 'GOOGLE_DRIVE';
  if (host.endsWith('photos.google.com')) return 'GOOGLE_PHOTOS';
  if (host.endsWith('dropbox.com')) return 'DROPBOX';
  if (host.endsWith('1drv.ms') || host.endsWith('onedrive.live.com')) return 'ONEDRIVE';
  if (host.endsWith('flickr.com')) return 'FLICKR';
  if (host.endsWith('smugmug.com')) return 'SMUGMUG';
  if (host.endsWith('pixieset.com')) return 'PIXIESET';
  if (host.endsWith('youtube.com') || host.endsWith('youtu.be')) return 'YOUTUBE';
  if (host.endsWith('vimeo.com')) return 'VIMEO';
  return 'OTHER';
}
