import Link from 'next/link';
import Image from 'next/image';
import { MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/cn';

export type EventCardProps = {
  slug: string;
  title: string;
  subtitle?: string | null;
  coverUrl?: string | null;
  city?: string | null;
  dateLabel: string;
  phase: 'upcoming' | 'live' | 'past';
  status: string;
  badge?: { label: string; tone: 'neutral' | 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'dark' } | null;
  hasMedia?: boolean;
  mediaLabel?: string;
  liveLabel?: string;
  cancelledLabel?: string;
};

/** docs/07-screens.md §3 — the card in the events list. Past events read muted. */
export function EventCard({
  slug,
  title,
  subtitle,
  coverUrl,
  city,
  dateLabel,
  phase,
  status,
  badge,
  hasMedia,
  mediaLabel,
  liveLabel,
  cancelledLabel,
}: EventCardProps) {
  return (
    <Link
      href={`/events/${slug}`}
      className={cn(
        'group block overflow-hidden rounded-lg bg-surface shadow-sm transition-shadow hover:shadow-md',
        phase === 'past' && 'opacity-80',
      )}
    >
      <div className="relative aspect-video bg-neutral-200">
        {coverUrl ? (
          <Image src={coverUrl} alt="" fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
        ) : (
          <div
            aria-hidden="true"
            className="h-full w-full"
            style={{
              backgroundImage:
                'linear-gradient(135deg, var(--color-primary-400), var(--color-primary-700))',
            }}
          />
        )}
        <div className="absolute left-3 top-3 flex gap-2">
          {phase === 'live' && status === 'PUBLISHED' && liveLabel ? (
            <Badge tone="dark">
              <span aria-hidden="true" className="live-pulse mr-1 inline-block h-1.5 w-1.5 rounded-pill bg-secondary-500" />
              {liveLabel}
            </Badge>
          ) : null}
          {status === 'CANCELLED' && cancelledLabel ? <Badge tone="danger">{cancelledLabel}</Badge> : null}
          {hasMedia && mediaLabel ? <Badge tone="secondary">{mediaLabel}</Badge> : null}
        </div>
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        <p className="text-xs font-semibold text-ink-muted">{dateLabel}</p>
        <h2 className="font-display text-xl leading-tight">{title}</h2>
        {subtitle ? <p className="line-clamp-2 text-sm text-ink-muted">{subtitle}</p> : null}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {city ? (
            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
              <MapPin size={14} aria-hidden="true" />
              {city}
            </span>
          ) : null}
          {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
        </div>
      </div>
    </Link>
  );
}
