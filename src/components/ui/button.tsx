import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * docs/05-design-system.md §3.1 — every colour comes from a brand token.
 * A hard-coded hex here would break white-label and is blocked by lint.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary-500 text-neutral-50 hover:bg-primary-600 active:bg-primary-700',
        secondary: 'bg-secondary-500 text-ink hover:bg-secondary-600 active:bg-secondary-700',
        ghost: 'bg-transparent text-ink hover:bg-neutral-200',
        quiet: 'bg-neutral-200 text-ink hover:bg-neutral-300',
        destructive: 'bg-danger text-neutral-50 hover:opacity-90',
        outline: 'border border-divider bg-surface text-ink hover:bg-neutral-200',
      },
      size: {
        // docs/05 §2 — never smaller than a 44 px touch target.
        sm: 'h-11 px-4 text-sm rounded-pill',
        md: 'h-12 px-5 text-[15px] rounded-pill',
        lg: 'h-14 px-7 text-base rounded-pill',
        icon: 'h-11 w-11 rounded-pill',
      },
      full: { true: 'w-full', false: '' },
    },
    defaultVariants: { variant: 'primary', size: 'md', full: false },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, full, asChild, loading, children, disabled, ...props },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size, full }), className);

  // Radix's Slot requires exactly one child, so the spinner is never added in
  // asChild mode — the caller's element is passed straight through.
  if (asChild) {
    return (
      <Slot ref={ref} className={classes} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <button
      ref={ref}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
});

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export { buttonVariants };
