import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { getSession } from '@/lib/http/context';
import { listInbox } from '@/modules/notifications/service';
import { PageHeader } from '@/components/patterns/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { MarkAllReadButton } from '@/components/patterns/mark-all-read';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Notifications' };

/**
 * docs/07-screens.md §14a — the guaranteed channel. A push can be missed and a
 * banner dismissed; this list keeps the message.
 */
export default async function NotificationsPage() {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const [t, tk, locale, inbox] = await Promise.all([
    getTranslations('notifications'),
    getTranslations('notificationKinds'),
    getLocale(),
    listInbox(session.tenantId, session.userId, { limit: 30 }),
  ]);

  const grouped = new Map<string, typeof inbox.items>();
  for (const item of inbox.items) {
    const day = new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(item.createdAt);
    grouped.set(day, [...(grouped.get(day) ?? []), item]);
  }

  return (
    <>
      <PageHeader
        title={t('title')}
        subtitle={inbox.unread > 0 ? t('unread', { count: inbox.unread }) : null}
        backHref="/events"
        actions={inbox.unread > 0 ? <MarkAllReadButton label={t('markAllRead')} /> : null}
      />

      <div className="px-4 pb-8 lg:max-w-3xl lg:px-8">
        {inbox.items.length === 0 ? (
          <EmptyState title={t('empty')} />
        ) : (
          <div className="flex flex-col gap-6">
            {[...grouped.entries()].map(([day, items]) => (
              <section key={day}>
                <h2 className="mb-2 text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">{day}</h2>
                <ul className="flex flex-col gap-2">
                  {items.map((item) => {
                    const body = (
                      <>
                        <div className="flex items-start justify-between gap-3">
                          <p className={cn('font-semibold', !item.readAt && 'text-primary-800')}>{item.title}</p>
                          <span className="shrink-0 text-xs text-ink-muted">
                            {new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(item.createdAt)}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] font-bold uppercase tracking-[1px] text-ink-muted">
                          {tk(item.kind as never)}
                        </p>
                        <p className="mt-1 text-sm text-ink-muted">{item.body}</p>
                      </>
                    );
                    return (
                      <li key={item.id}>
                        {item.linkUrl ? (
                          <Link
                            href={item.linkUrl}
                            className={cn('block rounded-md p-4', item.readAt ? 'bg-surface' : 'bg-primary-100')}
                          >
                            {body}
                          </Link>
                        ) : (
                          <div className={cn('rounded-md p-4', item.readAt ? 'bg-surface' : 'bg-primary-100')}>{body}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
