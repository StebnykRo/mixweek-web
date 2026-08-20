import { ALLOWED_GOOGLE_FONTS, BrandTokensSchema, type BrandTokens } from './schemas';

/**
 * docs/04-white-label.md §3.2 — brandToCssVars is an allowlist function.
 *
 * It emits only keys it knows about, and only values that already passed Zod.
 * Anything else is dropped silently, so a crafted token object cannot break out
 * of the declaration and inject CSS.
 */

const RAMP_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const;

export function brandToCssVars(rawTokens: unknown): string {
  const parsed = BrandTokensSchema.safeParse(rawTokens);
  if (!parsed.success) return '';
  const t = parsed.data;
  const out: string[] = [];

  for (const role of ['primary', 'secondary', 'neutral'] as const) {
    const ramp = t.colors[role];
    for (const step of RAMP_STEPS) out.push(`--color-${role}-${step}:${ramp[step]}`);
  }

  out.push(`--color-bg:${t.colors.bg}`);
  out.push(`--color-surface:${t.colors.surface}`);
  out.push(`--color-ink:${t.colors.ink}`);
  out.push(`--color-ink-muted:${t.colors.inkMuted}`);
  out.push(`--color-divider:${t.colors.divider}`);
  out.push(`--color-success:${t.colors.success}`);
  out.push(`--color-warning:${t.colors.warning}`);
  out.push(`--color-danger:${t.colors.danger}`);

  out.push(`--radius-sm:${t.radius.sm}`);
  out.push(`--radius-md:${t.radius.md}`);
  out.push(`--radius-lg:${t.radius.lg}`);
  out.push(`--radius-pill:${t.radius.pill}`);

  out.push(`--font-display:${quoteFont(t.font.display)}, Georgia, serif`);
  out.push(`--font-body:${quoteFont(t.font.body)}, system-ui, -apple-system, "Segoe UI", sans-serif`);
  out.push(`--font-scale:${t.font.scale}`);

  if (t.shadow) {
    out.push(`--shadow-sm:${t.shadow.sm}`);
    out.push(`--shadow-md:${t.shadow.md}`);
    out.push(`--shadow-lg:${t.shadow.lg}`);
  }

  return `${out.join(';')};`;
}

function quoteFont(name: string): string {
  // The Zod schema already restricts this to letters, digits and spaces.
  return `"${name}"`;
}

/** Only a Google Fonts URL built from allow-listed family names ever renders. */
export function safeFontStylesheetUrl(tokens: BrandTokens): string | null {
  if (tokens.font.source !== 'google') return null;
  const families = [tokens.font.display, tokens.font.body].filter((family) =>
    (ALLOWED_GOOGLE_FONTS as readonly string[]).includes(family),
  );
  if (families.length === 0) return null;
  const query = families
    .map((family) => `family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@400;600;700`)
    .join('&');
  return `https://fonts.googleapis.com/css2?${query}&display=swap`;
}

/**
 * docs/04 §4.1 — extra CSS from the brand editor is reduced to custom-property
 * declarations inside :root. No selectors, no at-rules, no url(), no
 * expressions. What cannot be proven safe is dropped.
 */
export function sanitiseCustomCss(input: string | null | undefined): string | null {
  if (!input) return null;
  const body = input.replace(/\/\*[\s\S]*?\*\//g, '');
  const declarations = body
    .split(';')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^--[a-z0-9-]{1,60}\s*:\s*[#a-z0-9 .,%()/-]{1,120}$/i.test(line))
    .filter((line) => !/url\s*\(|expression|@import|javascript:/i.test(line));
  if (declarations.length === 0) return null;
  return `${declarations.join(';')};`;
}
