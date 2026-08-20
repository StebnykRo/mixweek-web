import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/cn';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-xs font-bold', {
  variants: {
    tone: {
      neutral: 'bg-neutral-200 text-ink',
      primary: 'bg-primary-100 text-primary-800',
      secondary: 'bg-secondary-200 text-ink',
      // A semantic colour at 15% opacity does not carry small bold text at
      // 4.5:1, so the tint conveys the state and the ink carries the reading.
      // The label text says what the state is either way (docs/05 §4).
      success: 'bg-success/20 text-ink',
      warning: 'bg-warning/25 text-ink',
      danger: 'bg-danger/20 text-ink',
      dark: 'bg-neutral-900 text-neutral-50',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

/** docs/05 §4 — state is never colour alone; a badge always carries text. */
export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
