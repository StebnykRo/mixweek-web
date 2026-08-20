import { cn } from '@/lib/cn';

/**
 * The frame every screen sits in.
 *
 * Widths had drifted — max-w-2xl on one page, max-w-3xl on the next, full
 * width elsewhere — so moving between tabs on a desktop made the content jump
 * and none of it lined up with the page before it. Padding is identical
 * everywhere; only the measure changes, and only between two deliberate
 * options.
 */
export function PageBody({
  children,
  width = 'wide',
  className,
}: {
  children: React.ReactNode;
  /**
   * `wide` for grids, lists and anything with cards. `reading` caps the line
   * length for pages that are mostly prose — travel notes, help, the dress
   * code — because full-width body text is hard to read.
   */
  width?: 'wide' | 'reading';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'px-4 pb-8 lg:px-8',
        width === 'reading' && 'lg:max-w-3xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
