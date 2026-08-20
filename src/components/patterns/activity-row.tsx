'use client';

import Link from 'next/link';
import { Heart, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export type ActivityRowProps = {
  id: string;
  href: string;
  title: string;
  timeLabel: string;
  durationLabel?: string;
  placeName?: string | null;
  track: string;
  trackLabel: string;
  status: string;
  changeNote?: string | null;
  saved: boolean;
  booked?: boolean;
  waitlisted?: boolean;
  conflict?: boolean;
  onToggleSave?: (id: string, next: boolean) => void;
  saveLabel: string;
  unsaveLabel: string;
  movedLabel: string;
  cancelledLabel: string;
  bookedLabel: string;
  waitlistedLabel: string;
  conflictLabel: string;
};

const TRACK_TONE: Record<string, 'primary' | 'secondary' | 'success' | 'warning' | 'neutral'> = {
  WORKSHOP: 'primary',
  SPORT: 'success',
  PARTY: 'secondary',
  TEAM: 'warning',
  LOGISTICS: 'neutral',
};

/** docs/05 §3.2 — one programme row: time, title, place, track badge and ♥. */
export function ActivityRow({
  id,
  href,
  title,
  timeLabel,
  durationLabel,
  placeName,
  track,
  trackLabel,
  status,
  changeNote,
  saved,
  booked,
  waitlisted,
  conflict,
  onToggleSave,
  saveLabel,
  unsaveLabel,
  movedLabel,
  cancelledLabel,
  bookedLabel,
  waitlistedLabel,
  conflictLabel,
}: ActivityRowProps) {
  const cancelled = status === 'CANCELLED';

  return (
    <div className="flex items-start gap-3 rounded-md bg-surface px-4 py-3">
      <div className="w-14 shrink-0 pt-0.5">
        <p className={cn('text-sm font-bold tabular-nums', cancelled && 'line-through')}>{timeLabel}</p>
        {durationLabel ? <p className="text-[11px] text-ink-muted">{durationLabel}</p> : null}
      </div>

      <Link href={href} className="min-w-0 flex-1">
        <p className={cn('font-semibold leading-snug', cancelled && 'line-through text-ink-muted')}>{title}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <Badge tone={TRACK_TONE[track] ?? 'neutral'}>{trackLabel}</Badge>
          {booked ? <Badge tone="success">✓ {bookedLabel}</Badge> : null}
          {waitlisted ? <Badge tone="warning">⏳ {waitlistedLabel}</Badge> : null}
          {status === 'MOVED' ? <Badge tone="warning">{changeNote ?? movedLabel}</Badge> : null}
          {cancelled ? <Badge tone="danger">{cancelledLabel}</Badge> : null}
          {conflict ? <Badge tone="warning">{conflictLabel}</Badge> : null}
        </div>
        {placeName ? (
          <p className="mt-1 inline-flex items-center gap-1 text-xs text-ink-muted">
            <MapPin size={13} aria-hidden="true" />
            {placeName}
          </p>
        ) : null}
      </Link>

      {onToggleSave ? (
        <button
          type="button"
          aria-pressed={saved}
          aria-label={saved ? unsaveLabel : saveLabel}
          onClick={() => onToggleSave(id, !saved)}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-pill hover:bg-neutral-200"
        >
          <Heart
            size={20}
            aria-hidden="true"
            className={saved ? 'fill-[var(--color-danger)] text-[var(--color-danger)]' : 'text-ink-muted'}
          />
        </button>
      ) : null}
    </div>
  );
}
