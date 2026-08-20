import { renderMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/cn';

/**
 * The only place in the app that sets HTML directly. The string comes straight
 * from renderMarkdown(), which applies the rehype-sanitize allowlist from
 * docs/12 §6 — see that function for the tag and protocol rules.
 */
export async function Markdown({ source, className }: { source: string; className?: string }) {
  const html = await renderMarkdown(source);
  return (
    <div
      className={cn(
        'prose-mixweek text-[15px] leading-relaxed [&_a]:font-semibold [&_a]:text-primary-700 [&_a]:underline [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:mt-3 [&_ul]:mt-3',
        className,
      )}
      // Sanitised above with a strict allowlist; no other input path exists.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
