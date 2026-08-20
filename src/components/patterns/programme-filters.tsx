'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { TIME_PRESETS, type TimePreset } from '@/modules/events/time';

export type ProgrammeFiltersProps = {
  days: Array<{ key: string; label: string; isToday: boolean }>;
  tracks: string[];
  places: Array<{ id: string; name: string }>;
  resultCount: number;
};

const PRESET_KEYS: TimePreset[] = ['morning', 'afternoon', 'evening', 'night'];

/**
 * docs/07-screens.md §6 — four filter dimensions combined with AND: day,
 * category, time of day and place, plus a title search.
 *
 * The whole state lives in the URL, so a filtered view survives a reload, a
 * back navigation and being shared with a colleague.
 */
export function ProgrammeFilters({ days, tracks, places, resultCount }: ProgrammeFiltersProps) {
  const t = useTranslations('programme');
  const tc = useTranslations('common');
  const tt = useTranslations('tracks');
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [searchOpen, setSearchOpen] = useState(Boolean(params.get('q')));

  const selected = useMemo(
    () => ({
      day: params.get('day'),
      tracks: (params.get('track') ?? '').split(',').filter(Boolean),
      places: (params.get('place') ?? '').split(',').filter(Boolean),
      from: params.get('from'),
      to: params.get('to'),
      q: params.get('q') ?? '',
    }),
    [params],
  );

  const push = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(params.toString());
      mutate(next);
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const toggleInList = (key: 'track' | 'place', value: string) =>
    push((next) => {
      const current = (next.get(key) ?? '').split(',').filter(Boolean);
      const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
      if (updated.length) next.set(key, updated.join(','));
      else next.delete(key);
    });

  const activePreset = PRESET_KEYS.find(
    (preset) => TIME_PRESETS[preset].from === selected.from && TIME_PRESETS[preset].to === selected.to,
  );

  const activeChips: Array<{ label: string; clear: () => void }> = [];
  if (selected.day) {
    const day = days.find((d) => d.key === selected.day);
    activeChips.push({ label: day?.label ?? selected.day, clear: () => push((n) => n.delete('day')) });
  }
  for (const track of selected.tracks) {
    activeChips.push({ label: tt(track as never), clear: () => toggleInList('track', track) });
  }
  if (activePreset) {
    activeChips.push({ label: t(activePreset), clear: () => push((n) => { n.delete('from'); n.delete('to'); }) });
  }
  for (const placeId of selected.places) {
    const place = places.find((p) => p.id === placeId);
    if (place) activeChips.push({ label: place.name, clear: () => toggleInList('place', placeId) });
  }
  if (selected.q) activeChips.push({ label: `“${selected.q}”`, clear: () => push((n) => n.delete('q')) });

  return (
    <div className="flex flex-col gap-3">
      <div className="chip-scroll px-4 lg:px-8">
        {days.map((day) => (
          <Chip
            key={day.key}
            selected={selected.day === day.key}
            onClick={() =>
              push((next) => (selected.day === day.key ? next.delete('day') : next.set('day', day.key)))
            }
          >
            {day.label}
            {day.isToday ? <span className="ml-1 text-[10px] font-bold uppercase">{tc('today')}</span> : null}
          </Chip>
        ))}
      </div>

      <div className="chip-scroll px-4 lg:px-8">
        <Chip selected={selected.tracks.length === 0} onClick={() => push((next) => next.delete('track'))}>
          {tc('all')}
        </Chip>
        {tracks.map((track) => (
          <Chip key={track} selected={selected.tracks.includes(track)} onClick={() => toggleInList('track', track)}>
            {tt(track as never)}
          </Chip>
        ))}
      </div>

      <div className="chip-scroll px-4 lg:px-8">
        {PRESET_KEYS.map((preset) => (
          <Chip
            key={preset}
            selected={activePreset === preset}
            onClick={() =>
              push((next) => {
                if (activePreset === preset) {
                  next.delete('from');
                  next.delete('to');
                } else {
                  next.set('from', TIME_PRESETS[preset].from);
                  next.set('to', TIME_PRESETS[preset].to);
                }
              })
            }
          >
            {t(preset)}
          </Chip>
        ))}

        <Sheet>
          <SheetTrigger asChild>
            <Chip selected={selected.places.length > 0}>
              <SlidersHorizontal size={16} aria-hidden="true" />
              {t('filterPlace')}
              {selected.places.length > 0 ? ` (${selected.places.length})` : ''}
            </Chip>
          </SheetTrigger>
          <SheetContent title={t('filterPlace')}>
            <ul className="flex flex-col gap-2">
              {places.map((place) => (
                <li key={place.id}>
                  <Chip
                    className="w-full justify-start"
                    selected={selected.places.includes(place.id)}
                    onClick={() => toggleInList('place', place.id)}
                  >
                    {place.name}
                  </Chip>
                </li>
              ))}
            </ul>
          </SheetContent>
        </Sheet>

        <Chip selected={searchOpen} onClick={() => setSearchOpen((open) => !open)} aria-label={tc('search')}>
          <Search size={16} aria-hidden="true" />
        </Chip>
      </div>

      {searchOpen ? (
        <div className="px-4 lg:px-8">
          <label className="sr-only" htmlFor="programme-search">
            {tc('search')}
          </label>
          <input
            id="programme-search"
            type="search"
            defaultValue={selected.q}
            placeholder={tc('search')}
            className="h-12 w-full rounded-md border border-divider bg-surface px-4 text-[15px]"
            onChange={(event) => {
              const value = event.target.value;
              push((next) => (value ? next.set('q', value) : next.delete('q')));
            }}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 px-4 lg:px-8">
        <p aria-live="polite" className="text-xs font-semibold text-ink-muted">
          {tc('results', { count: resultCount })}
        </p>
        {activeChips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={chip.clear}
            className="inline-flex h-8 items-center gap-1 rounded-pill bg-neutral-200 px-3 text-xs font-semibold"
          >
            {chip.label}
            <X size={12} aria-hidden="true" />
          </button>
        ))}
        {activeChips.length > 0 ? (
          <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={() => router.replace(pathname)}>
            {tc('resetAll')}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
