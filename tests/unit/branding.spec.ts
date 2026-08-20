import { describe, expect, it } from 'vitest';
import { BrandTokensSchema } from '@/modules/branding/schemas';
import { brandToCssVars, safeFontStylesheetUrl, sanitiseCustomCss } from '@/modules/branding/tokens';
import { checkContrast, contrastRatio } from '@/modules/branding/contrast';
import { PLATFORM_DEFAULT_TOKENS, ACME_TOKENS } from '@/modules/branding/default-brand';

/** docs/14-qa.md §2.5 — branding, and the CSS-injection surface in particular. */

describe('BrandTokensSchema', () => {
  it('accepts the platform default', () => {
    expect(BrandTokensSchema.safeParse(PLATFORM_DEFAULT_TOKENS).success).toBe(true);
    expect(BrandTokensSchema.safeParse(ACME_TOKENS).success).toBe(true);
  });

  /** A deep clone with the type loosened, so an attack payload can be planted. */
  const tampered = () => structuredClone(PLATFORM_DEFAULT_TOKENS) as unknown as {
    colors: Record<string, string>;
    radius: Record<string, string>;
    font: Record<string, string>;
  };

  it('rejects a colour that is not a hex literal', () => {
    const attack = tampered();
    attack.colors.bg = 'red; } body { display: none } :root { --x: 1';
    expect(BrandTokensSchema.safeParse(attack).success).toBe(false);
  });

  it('rejects a url() smuggled into a colour', () => {
    const attack = tampered();
    attack.colors.ink = 'url(https://evil.example/x)';
    expect(BrandTokensSchema.safeParse(attack).success).toBe(false);
  });

  it('rejects a radius that is not a pixel value', () => {
    const attack = tampered();
    attack.radius.md = 'calc(100% + expression(alert(1)))';
    expect(BrandTokensSchema.safeParse(attack).success).toBe(false);
  });

  it('rejects a font name with punctuation that could close the declaration', () => {
    const attack = tampered();
    attack.font.body = 'Figtree"; } html { display:none } .x { content: "';
    expect(BrandTokensSchema.safeParse(attack).success).toBe(false);
  });
});

describe('brandToCssVars', () => {
  it('emits the full ramp plus the semantic colours', () => {
    const css = brandToCssVars(PLATFORM_DEFAULT_TOKENS);
    expect(css).toContain('--color-primary-500:#2b4af0');
    expect(css).toContain('--color-secondary-500:#c8f04b');
    expect(css).toContain('--color-bg:#f1f3f7');
    expect(css).toContain('--radius-pill:999px');
    expect(css).toContain('--font-display:"Caprasimo"');
  });

  it('produces nothing at all for tokens that fail validation', () => {
    expect(brandToCssVars({ colors: { bg: 'javascript:alert(1)' } })).toBe('');
    expect(brandToCssVars(null)).toBe('');
    expect(brandToCssVars('primary')).toBe('');
  });

  it('only ever emits declarations, never a selector', () => {
    const css = brandToCssVars(ACME_TOKENS);
    expect(css).not.toContain('{');
    expect(css).not.toContain('}');
    expect(css).not.toContain('<');
    for (const declaration of css.split(';').filter(Boolean)) {
      expect(declaration.startsWith('--')).toBe(true);
    }
  });
});

describe('sanitiseCustomCss', () => {
  it('keeps plain custom properties', () => {
    expect(sanitiseCustomCss('--color-extra: #123456;')).toBe('--color-extra: #123456;');
  });

  it('drops a rule that tries to introduce a selector', () => {
    expect(sanitiseCustomCss('body { display: none }')).toBeNull();
  });

  it('drops url(), @import and javascript:', () => {
    expect(sanitiseCustomCss('--x: url(https://evil.example/a);')).toBeNull();
    expect(sanitiseCustomCss('@import url(evil.css);')).toBeNull();
    expect(sanitiseCustomCss('--x: javascript:alert(1);')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(sanitiseCustomCss('')).toBeNull();
    expect(sanitiseCustomCss(null)).toBeNull();
  });
});

describe('safeFontStylesheetUrl', () => {
  it('builds a Google Fonts URL from allow-listed families', () => {
    const url = safeFontStylesheetUrl(PLATFORM_DEFAULT_TOKENS);
    expect(url).toContain('https://fonts.googleapis.com/css2?');
    expect(url).toContain('family=Caprasimo');
    expect(url).toContain('display=swap');
  });

  it('returns null for a family that is not on the list', () => {
    const tokens = structuredClone(PLATFORM_DEFAULT_TOKENS);
    tokens.font.display = 'Evil Font';
    tokens.font.body = 'Also Evil';
    expect(safeFontStylesheetUrl(tokens)).toBeNull();
  });

  it('returns null when the tenant self-hosts', () => {
    const tokens = structuredClone(PLATFORM_DEFAULT_TOKENS);
    tokens.font.source = 'self-hosted';
    expect(safeFontStylesheetUrl(tokens)).toBeNull();
  });
});

describe('contrast', () => {
  it('computes the canonical extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });

  it('flattens a translucent foreground before measuring', () => {
    // The divider token is ink at 12%; against white it must not read as ink.
    const ratio = contrastRatio('#0b0f2b1f', '#ffffff');
    expect(ratio).toBeLessThan(2);
    expect(ratio).toBeGreaterThan(1);
  });

  it('passes for both seeded brands', () => {
    expect(checkContrast(PLATFORM_DEFAULT_TOKENS).pass).toBe(true);
    expect(checkContrast(ACME_TOKENS).pass).toBe(true);
  });

  it('fails, and says which pair, for an unreadable palette', () => {
    const tokens = structuredClone(PLATFORM_DEFAULT_TOKENS);
    tokens.colors.ink = '#eeeeee'; // light text on a light background
    const report = checkContrast(tokens);
    expect(report.pass).toBe(false);
    expect(report.results.find((result) => result.id === 'ink-on-bg')?.pass).toBe(false);
  });
});
