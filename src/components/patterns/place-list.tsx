'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Clock, Navigation } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export type PlaceListItem = {
  id: string;
  name: string;
  kind: string;
  description: string | null;
  lat: number | null;
  lng: number | null;
  address: string | null;
  openingHours: string | null;
};

/** docs/07 §9 — the list beside the map; hovering an entry highlights its pin. */
export function PlaceList({
  places,
  selectedId,
  eventSlug,
  labels,
}: {
  places: PlaceListItem[];
  selectedId: string | null;
  eventSlug: string;
  labels: Record<string, string>;
}) {
  const t = useTranslations('map');
  const tc = useTranslations('common');
  const [query, setQuery] = useState('');

  const filtered = places.filter((place) => place.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="flex flex-col gap-3">
      <label className="sr-only" htmlFor="place-search">
        {tc('search')}
      </label>
      <input
        id="place-search"
        type="search"
        placeholder={tc('search')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="h-12 w-full rounded-md border border-divider bg-surface px-4 text-[15px]"
      />

      <ul className="flex flex-col gap-2">
        {filtered.map((place) => (
          <li key={place.id}>
            <Link
              href={`/events/${eventSlug}/map/${place.id}`}
              scroll={false}
              aria-current={place.id === selectedId ? 'true' : undefined}
              className={cn(
                'block rounded-md bg-surface p-4',
                place.id === selectedId && 'ring-2 ring-[var(--color-primary-500)]',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{place.name}</p>
                <Badge>{labels[place.kind] ?? place.kind}</Badge>
              </div>
              {place.description ? <p className="mt-1 text-sm text-ink-muted">{place.description}</p> : null}
              {place.openingHours ? (
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-muted">
                  <Clock size={13} aria-hidden="true" />
                  {t('openingHours')}: {place.openingHours}
                </p>
              ) : null}
              {place.lat !== null && place.lng !== null ? (
                <a
                  href={`geo:${place.lat},${place.lng}?q=${encodeURIComponent(place.name)}`}
                  className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 underline"
                  onClick={(event) => event.stopPropagation()}
                >
                  <Navigation size={14} aria-hidden="true" />
                  {t('directions')}
                </a>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
