import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/http/context';
import { requireEvent } from '@/lib/http/viewer';
import { MapView } from '@/components/patterns/map-view';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Map' };

export default async function MapPage({ params }: { params: Promise<{ slug: string }> }) {
  const session = await getSession();
  if (!session?.tenantId) redirect('/login');
  const { slug } = await params;
  const event = await requireEvent(session.tenantId, slug);
  return (
    <MapView
      tenantId={session.tenantId}
      eventId={event.id}
      eventSlug={event.slug}
      eventTitle={event.title}
      selectedId={null}
    />
  );
}
