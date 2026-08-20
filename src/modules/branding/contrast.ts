/**
 * docs/04-white-label.md §4.3 — the contrast checker is a publish blocker, not
 * a warning. WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text and UI.
 */
export type ContrastPair = {
  id: string;
  label: string;
  foreground: string;
  background: string;
  minimum: number;
};

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function parseHex(hex: string): { r: number; g: number; b: number; a: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length !== 6 && clean.length !== 8) return null;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const a = clean.length === 8 ? Number.parseInt(clean.slice(6, 8), 16) / 255 : 1;
  if ([r, g, b].some(Number.isNaN)) return null;
  return { r, g, b, a };
}

export function relativeLuminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** Flattens a translucent foreground onto its background before measuring. */
function flatten(foreground: string, background: string): string {
  const fg = parseHex(foreground);
  const bg = parseHex(background);
  if (!fg || !bg) return foreground;
  if (fg.a >= 1) return foreground;
  const mix = (f: number, b: number) => Math.round(f * fg.a + b * (1 - fg.a));
  const hex = (v: number) => v.toString(16).padStart(2, '0');
  return `#${hex(mix(fg.r, bg.r))}${hex(mix(fg.g, bg.g))}${hex(mix(fg.b, bg.b))}`;
}

export function contrastRatio(foreground: string, background: string): number {
  const fg = relativeLuminance(flatten(foreground, background));
  const bg = relativeLuminance(background);
  if (fg === null || bg === null) return 0;
  const lighter = Math.max(fg, bg);
  const darker = Math.min(fg, bg);
  return (lighter + 0.05) / (darker + 0.05);
}

type TokensShape = {
  colors: {
    primary: Record<string, string>;
    secondary: Record<string, string>;
    neutral: Record<string, string>;
    bg: string;
    surface: string;
    ink: string;
    inkMuted: string;
    divider: string;
    danger: string;
    success: string;
    warning: string;
  };
};

export function buildContrastPairs(tokens: TokensShape): ContrastPair[] {
  const c = tokens.colors;
  return [
    { id: 'ink-on-bg', label: 'Body text on page background', foreground: c.ink, background: c.bg, minimum: 4.5 },
    { id: 'ink-on-surface', label: 'Body text on card', foreground: c.ink, background: c.surface, minimum: 4.5 },
    { id: 'muted-on-surface', label: 'Muted text on card', foreground: c.inkMuted, background: c.surface, minimum: 4.5 },
    { id: 'primary-button', label: 'Primary button label', foreground: c.neutral[50] ?? '#ffffff', background: c.primary[500] ?? '#000000', minimum: 4.5 },
    { id: 'secondary-button', label: 'Secondary button label', foreground: c.ink, background: c.secondary[500] ?? '#ffffff', minimum: 4.5 },
    { id: 'link-on-surface', label: 'Link on card', foreground: c.primary[700] ?? '#000000', background: c.surface, minimum: 4.5 },
    { id: 'danger-on-surface', label: 'Error text on card', foreground: c.danger, background: c.surface, minimum: 4.5 },
    { id: 'focus-ring', label: 'Focus ring against background', foreground: c.primary[500] ?? '#000000', background: c.bg, minimum: 3 },
    { id: 'divider', label: 'Divider against card', foreground: c.divider, background: c.surface, minimum: 1.2 },
  ];
}

export type ContrastReport = {
  pass: boolean;
  results: Array<ContrastPair & { ratio: number; pass: boolean }>;
};

export function checkContrast(tokens: TokensShape): ContrastReport {
  const results = buildContrastPairs(tokens).map((pair) => {
    const ratio = contrastRatio(pair.foreground, pair.background);
    return { ...pair, ratio: Math.round(ratio * 100) / 100, pass: ratio >= pair.minimum };
  });
  return { pass: results.every((r) => r.pass), results };
}
