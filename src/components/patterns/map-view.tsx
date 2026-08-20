import { getTranslations } from 'next-intl/server';
import { withTenant } from '@/lib/db/tenant-client';
import { PageHeader } from '@/components/patterns/page-header';
import { VenueMap } from '@/components/patterns/venue-map';
import { PlaceList } from '@/components/patterns/place-list';
import { EmptyState } from '@/components/ui/empty-state';

export const PLACE_KIND_LABELS: Record<string, string> = {
  STAGE: 'Stage',
  WORKSHOP: 'Workshop',
  CARE: 'Care',
  MERCH: 'WinStyle',
  HOTEL: 'Hotel',
  RESTAURANT: 'Food',
  TRANSFER: 'Transfer',
  IT_ZONE: 'IT',
  OTHER: 'Other',
};

/**
 * Shared by /map and /map/[placeId] so both URLs render the same screen — the
 * only difference is which pin starts selected (docs/07 §9).
 */
export async function MapView({
  tenantId,
  eventId,
  eventSlug,
  eventTitle,
  selectedId,
}: {
  tenantId: string;
  eventId: string;
  eventSlug: string;
  eventTitle: string;
  selectedId: string | null;
}) {
  const t = await getTranslations('map');

  const places = await withTenant(tenantId, (db) =>
    db.place.findMany({
      where: { eventId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        kind: true,
        description: true,
        mapX: true,
        mapY: true,
        lat: true,
        lng: true,
        address: true,
        openingHours: true,
        imageUrl: true,
      },
    }),
  );

  return (
    <>
      <PageHeader title={t('title')} kicker={eventTitle} backHref={`/events/${eventSlug}`} />

      {places.length === 0 ? (
        <div className="px-4 lg:px-8">
          <EmptyState title={t('empty')} />
        </div>
      ) : (
        <div className="grid gap-4 px-4 pb-8 lg:grid-cols-[2fr_1fr] lg:px-8">
          <VenueMap
            places={places}
            imageUrl={places.find((place) => place.imageUrl)?.imageUrl ?? null}
            selectedId={selectedId}
            eventSlug={eventSlug}
            legend={PLACE_KIND_LABELS}
          />
          <PlaceList places={places} selectedId={selectedId} eventSlug={eventSlug} labels={PLACE_KIND_LABELS} />
        </div>
      )}
    </>
  );
}
