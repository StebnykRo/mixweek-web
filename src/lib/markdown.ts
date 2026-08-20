import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

/**
 * docs/12-security.md §6 — content is stored as Markdown and sanitised at
 * RENDER time, with a hard allowlist. Storing "already sanitised" HTML is a
 * trap: the next reader of that column has no way to know.
 *
 * Allowed tags: p br strong em ul ol li a h2..h4 blockquote code pre.
 * `href` is restricted to https:, mailto: and tel:.
 */
const schema = {
  ...defaultSchema,
  tagNames: [
    'p',
    'br',
    'strong',
    'em',
    'ul',
    'ol',
    'li',
    'a',
    'h2',
    'h3',
    'h4',
    'blockquote',
    'code',
    'pre',
    'hr',
  ],
  attributes: {
    a: ['href', 'title', ['rel', 'noopener noreferrer'], ['target', '_blank']],
    code: ['className'],
  },
  protocols: { href: ['https', 'mailto', 'tel'] },
  clobberPrefix: 'md-',
  strip: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
} as typeof defaultSchema;

const processor = unified()
  .use(remarkParse)
  .use(remarkRehype)
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

/** Returns HTML that is safe to hand to dangerouslySetInnerHTML. */
export async function renderMarkdown(source: string): Promise<string> {
  const file = await processor.process(source);
  return String(file);
}

/** Plain-text excerpt for cards and notification bodies. */
export function markdownExcerpt(source: string, maxLength = 160): string {
  const text = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_>`~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}
