'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/providers/toast-provider';

export type MapPlaceRow = {
  id: string;
  name: string;
  kind: string;
  mapX: number | null;
  mapY: number | null;
  imageUrl: string | null;
  openingHours: string | null;
};

const KINDS = ['STAGE', 'WORKSHOP', 'CARE', 'MERCH', 'HOTEL', 'RESTAURANT', 'TRANSFER', 'IT_ZONE', 'OTHER'] as const;

/**
 * docs/10-admin.md §3.4 — pins are placed by clicking the plan, and stored as
 * percentages so the same coordinates work at any rendered size.
 */
export function MapEditor({ eventId, places }: { eventId: string; places: MapPlaceRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [planUrl, setPlanUrl] = useState(places.find((place) => place.imageUrl)?.imageUrl ?? '');
  const [draft, setDraft] = useState({ name: '', kind: 'STAGE' as (typeof KINDS)[number], mapX: 50, mapY: 50, openingHours: '' });
  const [pending, setPending] = useState(false);

  function placePin(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    setDraft({
      ...draft,
      mapX: Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10,
      mapY: Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10,
    });
  }

  async function save() {
    setPending(true);
    try {
      await api(`/admin/events/${eventId}/places`, {
        method: 'POST',
        body: {
          name: draft.name,
          kind: draft.kind,
          mapX: draft.mapX,
          mapY: draft.mapY,
          openingHours: draft.openingHours || null,
          imageUrl: planUrl || null,
          sortOrder: places.length,
        },
      });
      setDraft({ ...draft, name: '', openingHours: '' });
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not save', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex flex-col gap-3">
        <Input
          label="Floor plan image URL"
          hint="An uploaded plan works offline and sends nothing to a third party."
          value={planUrl}
          onChange={(event) => setPlanUrl(event.target.value)}
        />

        {/* Clicking sets the coordinates for the pin being added. */}
        <div
          role="presentation"
          onClick={placePin}
          className="relative aspect-[4/3] cursor-crosshair overflow-hidden rounded-lg bg-neutral-200"
          style={planUrl ? { backgroundImage: `url(${planUrl})`, backgroundSize: 'cover' } : undefined}
        >
          {places
            .filter((place) => place.mapX !== null && place.mapY !== null)
            .map((place) => (
              <span
                key={place.id}
                className="absolute -translate-x-1/2 -translate-y-full rounded-pill bg-surface px-2 py-1 text-[11px] font-bold shadow-sm"
                style={{ left: `${place.mapX}%`, top: `${place.mapY}%` }}
              >
                {place.name}
              </span>
            ))}
          <span
            aria-hidden="true"
            className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-surface bg-primary-500"
            style={{ left: `${draft.mapX}%`, top: `${draft.mapY}%` }}
          />
        </div>
        <p className="text-xs text-ink-muted">
          Click the plan to position the next pin ({draft.mapX}%, {draft.mapY}%).
        </p>
      </div>

      <aside className="flex h-fit flex-col gap-4 rounded-lg bg-surface p-5">
        <h2 className="font-display text-lg">Add a place</h2>
        <Input label="Name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold" htmlFor="place-kind">
            Type
          </label>
          <select
            id="place-kind"
            value={draft.kind}
            onChange={(event) => setDraft({ ...draft, kind: event.target.value as (typeof KINDS)[number] })}
            className="h-12 rounded-md border border-divider bg-surface px-4"
          >
            {KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </div>

        <Input
          label="Opening hours"
          value={draft.openingHours}
          onChange={(event) => setDraft({ ...draft, openingHours: event.target.value })}
        />

        <Button loading={pending} disabled={!draft.name} onClick={save}>
          Add pin
        </Button>

        <ul className="mt-2 flex flex-col gap-1 text-sm">
          {places.map((place) => (
            <li key={place.id} className="flex justify-between border-b border-divider py-1 last:border-0">
              <span>{place.name}</span>
              <span className="text-xs text-ink-muted">{place.kind}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
