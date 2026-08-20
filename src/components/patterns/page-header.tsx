import Link from 'next/link';
import { Bell, ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/cn';
import { initials } from './app-shell';

export type PageHeaderProps = {
  title: string;
  kicker?: string | null;
  subtitle?: string | null;
  backHref?: string;
  userLabel?: string;
  unreadCount?: number;
  notificationsLabel?: string;
  actions?: React.ReactNode;
  className?: string;
};

/** The mobile header. On desktop the sidebar carries navigation, so this stays lean. */
export function PageHeader({
  title,
  kicker,
  subtitle,
  backHref,
  userLabel,
  unreadCount = 0,
  notificationsLabel,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex items-start gap-3 px-4 pb-4 pt-5 lg:px-8 lg:pt-8', className)}>
      {backHref ? (
        <Link
          href={backHref}
          aria-label="Back"
          className="-ml-2 grid h-11 w-11 shrink-0 place-items-center rounded-pill hover:bg-neutral-200"
        >
          <ChevronLeft size={22} aria-hidden="true" />
        </Link>
      ) : null}

      <div className="min-w-0 flex-1">
        {kicker ? <p className="text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">{kicker}</p> : null}
        <h1 className="truncate font-display text-[26px] leading-tight lg:text-[32px]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-ink-muted">{subtitle}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {actions}
        {notificationsLabel ? (
          <Link
            href="/notifications"
            aria-label={notificationsLabel}
            className="relative grid h-11 w-11 place-items-center rounded-pill hover:bg-neutral-200 lg:hidden"
          >
            <Bell size={22} aria-hidden="true" />
            {unreadCount > 0 ? (
              <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-pill bg-danger px-1 text-[10px] font-bold text-neutral-50">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            ) : null}
          </Link>
        ) : null}
        {userLabel ? (
          <Link
            href="/profile"
            aria-label={userLabel}
            className="grid h-10 w-10 place-items-center rounded-pill bg-neutral-900 text-xs font-bold text-neutral-50 lg:hidden"
          >
            {initials(userLabel)}
          </Link>
        ) : null}
      </div>
    </header>
  );
}
