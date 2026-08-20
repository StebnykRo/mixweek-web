import { optimize } from 'svgo';

/**
 * docs/12-security.md §7 — brand logos are the only SVG we accept, and only
 * after this pass. Anything active is removed; if the file changes so much that
 * it is no longer recognisably the same drawing, we refuse it rather than serve
 * a mangled logo.
 */

const FORBIDDEN_TAGS = ['script', 'foreignObject', 'iframe', 'embed', 'object', 'handler'] as const;
const FORBIDDEN_OPEN = /<\s*(script|foreignObject|iframe|embed|object|handler)\b/i;
const EVENT_ATTRIBUTES = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const EXTERNAL_REFERENCES = /(href|xlink:href)\s*=\s*("|')\s*(?!#)[^"']*\2/gi;
const DANGEROUS_URLS = /(javascript|data)\s*:/gi;

/** Removes an element and everything inside it, including a self-closing form. */
function stripElement(source: string, tag: string): string {
  const paired = new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*/\\s*${tag}\\s*>`, 'gi');
  const selfClosing = new RegExp(`<\\s*${tag}\\b[^>]*/\\s*>`, 'gi');
  const orphanOpen = new RegExp(`<\\s*/?\\s*${tag}\\b[^>]*>`, 'gi');
  return source.replace(paired, '').replace(selfClosing, '').replace(orphanOpen, '');
}

export class SvgRejected extends Error {
  constructor(readonly reason: string) {
    super(`SVG rejected: ${reason}`);
    this.name = 'SvgRejected';
  }
}

export function sanitiseSvg(source: string): string {
  if (source.length > 512 * 1024) throw new SvgRejected('file is larger than 512 KB');
  if (!/<svg[\s>]/i.test(source)) throw new SvgRejected('not an SVG document');

  let cleaned = source.replace(/<!DOCTYPE[^>]*>/gi, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/gi, '');

  // Whole elements go, contents included — leaving a stray closing tag behind
  // would produce malformed XML that the optimiser then refuses outright.
  for (const tag of FORBIDDEN_TAGS) cleaned = stripElement(cleaned, tag);

  cleaned = cleaned
    .replace(EVENT_ATTRIBUTES, ' ')
    .replace(EXTERNAL_REFERENCES, '')
    .replace(DANGEROUS_URLS, '');

  try {
    cleaned = optimize(cleaned, {
      multipass: true,
      plugins: [
        { name: 'preset-default', params: { overrides: { removeViewBox: false } } },
        'removeScriptElement',
        'removeStyleElement',
        'removeDimensions',
      ],
    }).data;
  } catch (error) {
    // A file the optimiser cannot parse is not one we are going to serve.
    throw new SvgRejected(`could not be parsed (${(error as Error).message})`);
  }

  if (FORBIDDEN_OPEN.test(cleaned) || /\son[a-z]+\s*=/i.test(cleaned)) {
    throw new SvgRejected('active content survived sanitisation');
  }
  // A file that lost almost all of its path data is not the logo any more.
  const pathCountBefore = (source.match(/<(path|circle|rect|polygon|ellipse|line|polyline)\b/gi) ?? []).length;
  const pathCountAfter = (cleaned.match(/<(path|circle|rect|polygon|ellipse|line|polyline)\b/gi) ?? []).length;
  if (pathCountBefore > 0 && pathCountAfter < pathCountBefore * 0.5) {
    throw new SvgRejected('too much of the drawing was removed');
  }

  return cleaned;
}
