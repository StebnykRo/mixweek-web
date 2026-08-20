import { cn } from '@/lib/cn';

/** docs/05 §6 — skeletons, not spinners, wherever the layout is known. */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('skeleton rounded-md', className)} {...props} />;
}
