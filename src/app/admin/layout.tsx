import Link from 'next/link';
import { headers } from 'next/headers';
import {
  BarChart3,
  Bell,
  CalendarDays,
  Flag,
  Image as ImageIcon,
  KeyRound,
  LayoutDashboard,
  Palette,
  ScanLine,
  ScrollText,
  Settings,
  Users,
} from 'lucide-react';
import { requireAdminSession } from '@/modules/admin/guard';
import { getTenant } from '@/modules/tenancy/service';
import { hasPermission, type Action } from '@/modules/auth/policies';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

/**
 * docs/10-admin.md §1 — desktop-first, always dynamic, never indexed, with a
 * permanent banner naming the tenant so nobody edits the wrong company's event.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await requireAdminSession();
  const tenant = await getTenant(session.tenantId);
  const pathname = (await headers()).get('x-pathname') ?? '/admin';

  type NavEntry = { href: string; label: string; icon: React.ReactNode; action: Action };

  const nav: NavEntry[] = ([
    { href: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={18} />, action: 'dashboard:read' },
    { href: '/admin/events', label: 'Events', icon: <CalendarDays size={18} />, action: 'event:read' },
    { href: '/admin/checkin', label: 'Check-in', icon: <ScanLine size={18} />, action: 'registration:write' },
    { href: '/admin/notifications', label: 'Notifications', icon: <Bell size={18} />, action: 'notification:read' },
    { href: '/admin/media-reports', label: 'Media reports', icon: <ImageIcon size={18} />, action: 'media_report:read' },
    { href: '/admin/brands', label: 'Brands', icon: <Palette size={18} />, action: 'brand:read' },
    { href: '/admin/users', label: 'People', icon: <Users size={18} />, action: 'user:read' },
    { href: '/admin/insights', label: 'Insights', icon: <BarChart3 size={18} />, action: 'analytics:read' },
    { href: '/admin/feature-flags', label: 'Feature flags', icon: <Flag size={18} />, action: 'feature_flag:read' },
    { href: '/admin/settings', label: 'Settings', icon: <Settings size={18} />, action: 'setting:read' },
    { href: '/admin/secrets', label: 'Secrets', icon: <KeyRound size={18} />, action: 'secret:read' },
    { href: '/admin/audit', label: 'Audit log', icon: <ScrollText size={18} />, action: 'audit:read' },
  ] satisfies NavEntry[]).filter((item) => hasPermission(session.role, item.action));

  return (
    <div className="min-h-dvh bg-bg md:flex">
      <aside className="w-60 shrink-0 border-r border-divider bg-surface px-3 py-5 md:sticky md:top-0 md:h-dvh md:overflow-y-auto">
        <p className="px-3 font-display text-lg">Admin</p>
        <p className="mt-0.5 px-3 text-xs text-ink-muted">{tenant?.name}</p>
        <nav aria-label="Admin" className="mt-5 flex flex-col gap-0.5">
          {nav.map((item) => {
            const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-semibold',
                  active ? 'bg-primary-100 text-primary-800' : 'hover:bg-neutral-200',
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link href="/events" className="mt-6 block px-3 text-xs text-ink-muted underline">
          ← Back to the app
        </Link>
      </aside>

      <div className="min-w-0 flex-1">
        {session.role === 'SUPER_ADMIN' ? (
          <div role="status" className="bg-danger px-4 py-2 text-center text-xs font-bold text-neutral-50">
            You are working as SUPER_ADMIN in {tenant?.name}. Everything you do here is logged.
          </div>
        ) : null}
        <div className="border-b border-divider bg-surface px-5 py-2 text-xs text-ink-muted">
          Tenant: <strong className="text-ink">{tenant?.name}</strong> · Role:{' '}
          <strong className="text-ink">{session.role}</strong>
        </div>
        <main className="px-5 py-6">{children}</main>
      </div>
    </div>
  );
}
