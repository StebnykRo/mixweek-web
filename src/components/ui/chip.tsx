'use client';

import { cn } from '@/lib/cn';

export type ChipProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  selected?: boolean;
};

/** Toggle chip. `aria-pressed` carries the state for assistive tech. */
export function Chip({ selected, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'inline-flex h-11 items-center gap-1.5 rounded-pill border px-4 text-sm font-semibold transition-colors',
        selected
          ? 'border-primary-500 bg-primary-500 text-neutral-50'
          : 'border-divider bg-surface text-ink hover:bg-neutral-200',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
