import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type EmptyStateProps = {
  title: string;
  body?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

/** docs/05 §3.3 — an empty state always explains and always offers a next step. */
export function EmptyState({ title, body, action, icon, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center gap-3 rounded-lg bg-surface px-6 py-12 text-center', className)}>
      {icon ? <div className="text-neutral-500">{icon}</div> : null}
      <p className="text-base font-bold">{title}</p>
      {body ? <p className="max-w-sm text-sm text-ink-muted">{body}</p> : null}
      {action}
    </div>
  );
}
