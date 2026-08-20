'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { cn } from '@/lib/cn';

export type MapPlace = {
  id: string;
  name: string;
  kind: string;
  mapX: number | null;
  mapY: number | null;
};

export type VenueMapProps = {
  places: MapPlace[];
  imageUrl: string | null;
  selectedId: string | null;
  eventSlug: string;
  legend: Record<string, string>;
};

/**
 * docs/07-screens.md §9 — the default map is an uploaded floor plan with pins
 * at percentage coordinates. It works offline, needs no API key and sends
 * nothing to a third party. Google Maps is an opt-in flag, not the baseline.
 *
 * Every pin is a real button: reachable by keyboard and labelled for a screen
 * reader, because a pin that only responds to a tap excludes people.
 */
export function VenueMap({ places, imageUrl, selectedId, eventSlug, legend }: VenueMapProps) {
  const router = useRouter();
  const [hovered, setHovered] = useState<string | null>(null);

  const positioned = places.filter((place) => place.mapX !== null && place.mapY !== null);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-neutral-200">
      {imageUrl ? (
        <Image src={imageUrl} alt="" fill sizes="(min-width: 1024px) 66vw, 100vw" className="object-cover" />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(135deg, var(--color-neutral-200), var(--color-neutral-300)), repeating-linear-gradient(45deg, transparent, transparent 18px, var(--color-neutral-200) 18px, var(--color-neutral-200) 36px)',
          }}
        />
      )}

      <ul className="absolute inset-0">
        {positioned.map((place) => {
          const active = place.id === selectedId || place.id === hovered;
          return (
            <li
              key={place.id}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${place.mapX}%`, top: `${place.mapY}%` }}
            >
              <button
                type="button"
                aria-label={`${place.name} — ${legend[place.kind] ?? place.kind}`}
                aria-pressed={place.id === selectedId}
                onMouseEnter={() => setHovered(place.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(place.id)}
                onBlur={() => setHovered(null)}
                onClick={() => router.replace(`/events/${eventSlug}/map/${place.id}`, { scroll: false })}
                className={cn(
                  'flex min-h-[44px] min-w-[44px] flex-col items-center justify-end gap-1 px-1 pb-1',
                )}
              >
                <span
                  className={cn(
                    'max-w-[120px] truncate rounded-pill px-2 py-1 text-[11px] font-bold shadow-sm transition-colors',
                    active ? 'bg-primary-500 text-neutral-50' : 'bg-surface text-ink',
                  )}
                >
                  {place.name}
                </span>
                <span
                  aria-hidden="true"
                  className={cn('h-3 w-3 rounded-pill border-2 border-surface', active ? 'bg-primary-500' : 'bg-neutral-900')}
                />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
