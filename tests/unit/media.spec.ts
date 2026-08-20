import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DOMAIN_ALLOWLIST,
  ExternalUrlSchema,
  hostOf,
  inspectExternalUrl,
  isAllowedHost,
  providerFor,
} from '@/modules/media/url';
import { isPrivateAddress } from '@/modules/media/url-server';
import { MediaInputSchema } from '@/modules/media/schemas';
import { sniffImageKind } from '@/modules/media/images';
import { sanitiseSvg, SvgRejected } from '@/modules/media/svg';

/** docs/14-qa.md, docs/08 §8 — external links, covers and SVG. */

describe('external URL validation', () => {
  it('accepts an https gallery link', () => {
    expect(ExternalUrlSchema.safeParse('https://drive.google.com/drive/folders/abc').success).toBe(true);
  });

  it.each([
    ['http://drive.google.com/x', 'plain http'],
    ['javascript:alert(1)', 'javascript'],
    ['data:text/html,<script>alert(1)</script>', 'data'],
    ['file:///etc/passwd', 'file'],
    ['ftp://example.com/x', 'ftp'],
  ])('rejects %s (%s)', (url) => {
    expect(ExternalUrlSchema.safeParse(url).success).toBe(false);
  });

  it('reports the host and whether it is on the allowlist', () => {
    expect(inspectExternalUrl('https://www.pixieset.com/gallery')).toEqual({
      ok: true,
      host: 'pixieset.com',
      onAllowlist: true,
    });
    expect(inspectExternalUrl('https://random.example/gallery')).toEqual({
      ok: true,
      host: 'random.example',
      onAllowlist: false,
    });
  });

  it('accepts a subdomain of an allow-listed host', () => {
    expect(isAllowedHost('https://mixweek.pixieset.com/gala', DEFAULT_DOMAIN_ALLOWLIST)).toBe(true);
  });

  it('does not accept a look-alike domain that merely ends with the same text', () => {
    // "evilpixieset.com" must not pass because it ends with "pixieset.com".
    expect(isAllowedHost('https://evilpixieset.com/gala', DEFAULT_DOMAIN_ALLOWLIST)).toBe(false);
    expect(isAllowedHost('https://drive.google.com.evil.example/x', DEFAULT_DOMAIN_ALLOWLIST)).toBe(false);
  });

  it('normalises away a www prefix', () => {
    expect(hostOf('https://www.vimeo.com/123')).toBe('vimeo.com');
  });

  it('maps a host to its provider badge', () => {
    expect(providerFor('https://drive.google.com/x')).toBe('GOOGLE_DRIVE');
    expect(providerFor('https://youtu.be/x')).toBe('YOUTUBE');
    expect(providerFor('https://something.else/x')).toBe('OTHER');
  });
});

describe('SSRF address filter', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.1',
    '169.254.169.254',
    '::1',
    'fc00::1',
    'fe80::1',
    'localhost',
    '0.0.0.0',
  ])('blocks %s', (address) => {
    expect(isPrivateAddress(address)).toBe(true);
  });

  it.each(['8.8.8.8', '172.15.0.1', '172.32.0.1', '2606:4700::1'])('allows the public address %s', (address) => {
    expect(isPrivateAddress(address)).toBe(false);
  });
});

describe('MediaInputSchema', () => {
  const valid = {
    kind: 'PHOTOGRAPHER_GALLERY' as const,
    title: 'Gala Night',
    url: 'https://mixweek.pixieset.com/gala',
    coverUrl: 'https://cdn.mixweek.app/cover.webp',
    acceptsUploads: false,
    sortOrder: 0,
  };

  it('accepts a complete card', () => {
    expect(MediaInputSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses a card with no cover — docs/08 §3 makes it mandatory', () => {
    const { coverUrl, ...withoutCover } = valid;
    void coverUrl;
    expect(MediaInputSchema.safeParse(withoutCover).success).toBe(false);
  });

  it('refuses an unknown extra field rather than ignoring it', () => {
    expect(MediaInputSchema.safeParse({ ...valid, isAdmin: true }).success).toBe(false);
  });
});

describe('image sniffing', () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

  it('identifies formats from magic bytes, not from a filename', () => {
    expect(sniffImageKind(jpeg)).toBe('jpeg');
    expect(sniffImageKind(png)).toBe('png');
    expect(sniffImageKind(svg)).toBe('svg');
    expect(sniffImageKind(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBe('unknown');
  });

  it('recognises an SVG even when it is named like a JPEG', () => {
    // The whole point of sniffing: the extension is not evidence.
    expect(sniffImageKind(new TextEncoder().encode('<?xml version="1.0"?><svg></svg>'))).toBe('svg');
  });
});

describe('SVG sanitisation', () => {
  it('keeps an ordinary logo intact', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0h10v10H0z"/></svg>';
    const cleaned = sanitiseSvg(source);
    expect(cleaned).toContain('<path');
    expect(cleaned).toContain('viewBox');
  });

  it('strips a script element', () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><path d="M0 0h10v10H0z"/></svg>';
    const cleaned = sanitiseSvg(source);
    expect(cleaned).not.toContain('<script');
    expect(cleaned).not.toContain('alert(1)');
  });

  it('strips an inline event handler', () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg"><path onload="alert(1)" d="M0 0h10v10H0z"/></svg>';
    const cleaned = sanitiseSvg(source);
    expect(cleaned).not.toMatch(/onload/i);
  });

  it('strips an external reference', () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="https://evil.example/x.svg#a"/><path d="M0 0h10v10H0z"/></svg>';
    const cleaned = sanitiseSvg(source);
    expect(cleaned).not.toContain('evil.example');
  });

  it('rejects something that is not an SVG at all', () => {
    expect(() => sanitiseSvg('<html><body>hi</body></html>')).toThrow(SvgRejected);
  });

  it('rejects a file large enough to be a denial-of-service attempt', () => {
    expect(() => sanitiseSvg(`<svg>${'x'.repeat(600 * 1024)}</svg>`)).toThrow(SvgRejected);
  });
});
