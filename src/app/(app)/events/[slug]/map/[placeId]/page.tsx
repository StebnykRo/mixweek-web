import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { MapView } from '@/components/patterns/map-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Map' };

/** docs/07-screens.md §9 — selecting a pin changes the URL, so it is shareable. */
export default async function PlacePage({ params }: { params: Promise<{ slug: string; placeId: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  const { slug, placeId } = await params;
  const event = await requireEvent(session.tenantId, slug);
  return (
    <MapView
      tenantId={session.tenantId}
      eventId={event.id}
      eventSlug={event.slug}
      eventTitle={event.title}
      selectedId={placeId}
    />
  );
}
