import { cn } from '@/lib/cn';

export type ProgressProps = {
  value: number;
  max: number;
  label: string;
  tone?: 'primary' | 'warning' | 'danger';
  className?: string;
};

export function Progress({ value, max, label, tone = 'primary', className }: ProgressProps) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-pill bg-neutral-200', className)}
    >
      <div
        className={cn(
          'h-full rounded-pill transition-[width]',
          tone === 'primary' && 'bg-primary-500',
          tone === 'warning' && 'bg-warning',
          tone === 'danger' && 'bg-danger',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
