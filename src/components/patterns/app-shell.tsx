import Link from 'next/link';
import { Bell, CalendarDays, CalendarRange, Home, Map, ShoppingBag, User } from 'lucide-react';
import { BrandLogo } from './brand-logo';
import { cn } from '@/lib/cn';

export type NavItem = {
  href: string;
  label: string;
  icon: 'home' | 'programme' | 'map' | 'winstyle' | 'events' | 'profile';
  /**
   * Match this path only, never its descendants. The event home lives at the
   * event's own base path and every other tab hangs off it, so a prefix match
   * lit Home up on every screen — two tabs highlighted at once, and no way to
   * tell where you were.
   */
  exact?: boolean;
};

const ICONS = {
  home: Home,
  events: CalendarRange,
  programme: CalendarDays,
  map: Map,
  winstyle: ShoppingBag,
  profile: User,
} as const;

export type AppShellProps = {
  children: React.ReactNode;
  brand: { appName: string; kicker: string | null; logoLightUrl: string | null; logoMarkUrl: string | null };
  nav: NavItem[];
  secondaryNav?: Array<{ href: string; label: string; exact?: boolean }>;
  activePath: string;
  unreadCount?: number;
  userLabel: string;
  notificationsLabel: string;
};

/**
 * docs/05-design-system.md §2 — the mobile layout is the base: a five-item
 * bottom tab bar inside the safe area. From `lg` it becomes a persistent left
 * sidebar; the content column does not simply stretch.
 */
export function AppShell({
  children,
  brand,
  nav,
  secondaryNav = [],
  activePath,
  unreadCount = 0,
  userLabel,
  notificationsLabel,
}: AppShellProps) {
  return (
    <div className="min-h-dvh lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-divider bg-surface px-4 py-6 lg:flex lg:sticky lg:top-0 lg:h-dvh">
        <BrandLogo appName={brand.appName} kicker={brand.kicker} logoUrl={brand.logoLightUrl} markUrl={brand.logoMarkUrl} />
        <nav aria-label="Main" className="mt-8 flex flex-1 flex-col gap-1">
          {nav.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(activePath, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold',
                  active ? 'bg-primary-100 text-primary-800' : 'text-ink hover:bg-neutral-200',
                )}
              >
                <Icon size={20} aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
          {secondaryNav.length > 0 ? (
            <div className="mt-4 border-t border-divider pt-4">
              {secondaryNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(activePath, item.href, item.exact) ? 'page' : undefined}
                  className="flex h-11 items-center rounded-md px-3 text-sm text-ink-muted hover:bg-neutral-200"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </nav>
        <Link
          href="/notifications"
          className="flex h-11 items-center gap-3 rounded-md px-3 text-sm font-semibold hover:bg-neutral-200"
        >
          <Bell size={20} aria-hidden="true" />
          {notificationsLabel}
          {unreadCount > 0 ? <UnreadDot count={unreadCount} /> : null}
        </Link>
        <Link href="/profile" className="mt-2 flex h-11 items-center gap-3 rounded-md px-3 text-sm hover:bg-neutral-200">
          <span className="grid h-8 w-8 place-items-center rounded-pill bg-neutral-900 text-xs font-bold text-neutral-50">
            {initials(userLabel)}
          </span>
          <span className="truncate">{userLabel}</span>
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Centred and capped on a desktop. Without this the content hugged
            the sidebar and left a third of a 1280px window empty, which read
            as a broken layout rather than a spacious one. */}
        <main className="mx-auto w-full max-w-6xl flex-1 pb-[calc(env(safe-area-inset-bottom)+72px)] lg:pb-8">
          {children}
        </main>

        <nav
          aria-label="Main"
          className="fixed inset-x-0 bottom-0 z-30 flex border-t border-divider bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
        >
          {nav.map((item) => {
            const Icon = ICONS[item.icon];
            const active = isActive(activePath, item.href, item.exact);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-semibold',
                  active ? 'text-primary-600' : 'text-ink-muted',
                )}
              >
                <Icon size={22} aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

function UnreadDot({ count }: { count: number }) {
  return (
    <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-pill bg-danger px-1.5 text-[11px] font-bold text-neutral-50">
      {count > 99 ? '99+' : count}
    </span>
  );
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join('') || '?';
}

function isActive(current: string, href: string, exact?: boolean): boolean {
  if (exact || href === '/events') return current === href;
  return current === href || current.startsWith(`${href}/`);
}
