import Link from 'next/link';
import { headers } from 'next/headers';
import { requirePermission } from '@/modules/admin/guard';
import { getAdminEvent } from '@/modules/admin/events';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';

const TABS = [
  { segment: '', label: 'Settings' },
  { segment: '/programme', label: 'Programme' },
  { segment: '/map', label: 'Map' },
  { segment: '/content', label: 'Content' },
  { segment: '/registrations', label: 'Registrations' },
  { segment: '/media', label: 'Media' },
];

export default async function AdminEventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const session = await requirePermission('event:read');
  const { id } = await params;
  const event = await getAdminEvent(session.tenantId, id);
  const pathname = (await headers()).get('x-pathname') ?? '';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/events" className="text-xs text-ink-muted underline">
            ← Events
          </Link>
          <h1 className="font-display text-2xl">{event.title}</h1>
        </div>
        <Badge tone={event.status === 'PUBLISHED' ? 'success' : 'neutral'}>{event.status}</Badge>
      </div>

      <nav aria-label="Event sections" className="chip-scroll">
        {TABS.map((tab) => {
          const href = `/admin/events/${id}${tab.segment}`;
          const active = tab.segment === '' ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={tab.label}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex h-10 items-center rounded-pill border px-4 text-sm font-semibold',
                active ? 'border-primary-500 bg-primary-500 text-neutral-50' : 'border-divider bg-surface',
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>

      {children}
    </div>
  );
}
