import { describe, expect, it } from 'vitest';
import { markdownExcerpt, renderMarkdown } from '@/lib/markdown';

/** docs/12-security.md §6 — Markdown is sanitised at render, with an allowlist. */

describe('renderMarkdown', () => {
  it('renders the tags organisers actually use', async () => {
    const html = await renderMarkdown('## Gala\n\n**Dress code:** black tie.\n\n- Jacket\n- Shoes');
    expect(html).toContain('<h2>Gala</h2>');
    expect(html).toContain('<strong>Dress code:</strong>');
    expect(html).toContain('<li>Jacket</li>');
  });

  it('strips a script tag, leaving its payload as inert text', async () => {
    const html = await renderMarkdown('Hello <script>alert(1)</script> world');
    // Raw HTML never becomes an element; what is left is ordinary text, which
    // no browser will execute.
    expect(html).not.toContain('<script');
    expect(html).toBe('<p>Hello alert(1) world</p>');
  });

  it('strips an inline event handler', async () => {
    const html = await renderMarkdown('<p onmouseover="alert(1)">hover</p>');
    expect(html).not.toMatch(/onmouseover/i);
  });

  it('strips an img with an onerror payload', async () => {
    const html = await renderMarkdown('<img src=x onerror="alert(1)">');
    expect(html).not.toMatch(/onerror/i);
  });

  it('drops a javascript: link but keeps its text', async () => {
    const html = await renderMarkdown('[click me](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('click me');
  });

  it('keeps https, mailto and tel links', async () => {
    const html = await renderMarkdown(
      '[site](https://example.com) [mail](mailto:a@b.com) [call](tel:+35799000000)',
    );
    expect(html).toContain('https://example.com');
    expect(html).toContain('mailto:a@b.com');
    expect(html).toContain('tel:+35799000000');
  });

  it('drops an iframe entirely', async () => {
    const html = await renderMarkdown('<iframe src="https://evil.example"></iframe>');
    expect(html).not.toContain('<iframe');
  });

  it('drops a style element', async () => {
    const html = await renderMarkdown('<style>body{display:none}</style>');
    expect(html).not.toContain('<style');
  });

  it('escapes stray angle brackets in ordinary prose', async () => {
    const html = await renderMarkdown('5 < 6 and 7 > 6');
    expect(html).toContain('&#x3C;');
  });
});

describe('markdownExcerpt', () => {
  it('reduces Markdown to plain text', () => {
    expect(markdownExcerpt('## Title\n\n**Bold** and [a link](https://x.test)')).toBe('Title Bold and a link');
  });

  it('truncates with an ellipsis', () => {
    const excerpt = markdownExcerpt('word '.repeat(100), 20);
    expect(excerpt).toHaveLength(20);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('removes code fences and images', () => {
    expect(markdownExcerpt('```js\nalert(1)\n```\n![alt](img.png)\nreal text')).toBe('real text');
  });
});
