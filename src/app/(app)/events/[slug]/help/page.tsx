import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Mail, Phone } from 'lucide-react';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { withTenant } from '@/lib/db/tenant-client';
import { PageHeader } from '@/components/patterns/page-header';
import { ContentSections } from '@/components/patterns/content-sections';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Help' };

/** docs/07-screens.md §14 — must stay usable offline, so it is plain content. */
export default async function HelpPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');

  const { slug } = await params;
  const tenantId = session.tenantId;
  const event = await requireEvent(tenantId, slug);
  const t = await getTranslations('help');

  const [blocks, contacts] = await withTenant(tenantId, (db) =>
    Promise.all([
      db.contentBlock.findMany({
        where: { eventId: event.id, section: 'HELP', isPublished: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, title: true, body: true, icon: true },
      }),
      db.contact.findMany({
        where: { eventId: event.id, deletedAt: null },
        orderBy: [{ isUrgent: 'desc' }, { sortOrder: 'asc' }],
        select: { id: true, kind: true, name: true, role: true, email: true, phone: true, note: true, isUrgent: true },
      }),
    ]),
  );

  const urgent = contacts.filter((contact) => contact.isUrgent);
  const regular = contacts.filter((contact) => !contact.isUrgent);

  return (
    <>
      <PageHeader title={t('title')} kicker={event.title} backHref={`/events/${event.slug}`} />

      <div className="flex flex-col gap-5 px-4 pb-8 lg:max-w-3xl lg:px-8">
        {urgent.map((contact) => (
          <Card key={contact.id} className="border-2 border-danger p-5">
            <Badge tone="danger">{t('urgent')}</Badge>
            <p className="mt-2 font-display text-xl">{contact.name}</p>
            {contact.note ? <p className="text-sm text-ink-muted">{contact.note}</p> : null}
            {contact.phone ? (
              <a
                href={`tel:${contact.phone.replace(/\s/g, '')}`}
                className="mt-3 inline-flex h-12 items-center gap-2 rounded-pill bg-danger px-5 font-semibold text-neutral-50"
              >
                <Phone size={18} aria-hidden="true" />
                {contact.phone}
              </a>
            ) : null}
          </Card>
        ))}

        <ul className="flex flex-col gap-2">
          {regular.map((contact) => (
            <li key={contact.id} className="rounded-md bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{contact.name}</p>
                  <p className="text-xs text-ink-muted">{contact.role ?? contact.kind}</p>
                  {contact.note ? <p className="mt-1 text-sm text-ink-muted">{contact.note}</p> : null}
                </div>
                <div className="flex shrink-0 gap-1">
                  {contact.phone ? (
                    <a
                      href={`tel:${contact.phone.replace(/\s/g, '')}`}
                      aria-label={`${t('call')} ${contact.name}`}
                      className="grid h-11 w-11 place-items-center rounded-pill bg-neutral-200"
                    >
                      <Phone size={18} aria-hidden="true" />
                    </a>
                  ) : null}
                  {contact.email ? (
                    <a
                      href={`mailto:${contact.email}`}
                      aria-label={`${t('write')} ${contact.name}`}
                      className="grid h-11 w-11 place-items-center rounded-pill bg-neutral-200"
                    >
                      <Mail size={18} aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <ContentSections blocks={blocks} emptyTitle={t('title')} />
      </div>
    </>
  );
}
