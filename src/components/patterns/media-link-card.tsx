'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { ExternalLink, Flag, Link2, Lock, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/providers/toast-provider';
import { api } from '@/lib/api-client';

export type MediaLinkCardProps = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  coverUrl: string;
  kind: string;
  authorName: string | null;
  accessNote: string | null;
  acceptsUploads: boolean;
  itemCountHint: number | null;
  addedBy: string | null;
  addedOn: string;
};

const INTERSTITIAL_KEY = 'mw.seen-external-domains';

/**
 * docs/08-media.md §4 — a card is a link to somebody else's gallery.
 *
 * The interstitial names the destination and who added it, once per domain per
 * session; the link itself carries noopener/noreferrer/nofollow and no referrer.
 */
export function MediaLinkCard(props: MediaLinkCardProps) {
  const t = useTranslations('media');
  const tc = useTranslations('common');
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  const host = safeHost(props.url);

  function open() {
    window.open(props.url, '_blank', 'noopener,noreferrer');
    rememberDomain(host);
    setConfirmOpen(false);
  }

  function handleOpen() {
    if (hasSeenDomain(host)) {
      open();
      return;
    }
    setConfirmOpen(true);
  }

  async function submitReport(reason: string) {
    try {
      await api(`/media/${props.id}/reports`, { method: 'POST', body: { reason } });
      toast.show(t('reportSent'), 'success');
    } catch {
      toast.show(tc('errorTitle'), 'error');
    } finally {
      setReportOpen(false);
    }
  }

  return (
    <article className="overflow-hidden rounded-lg bg-surface shadow-sm">
      <div className="relative aspect-video bg-neutral-200">
        <Image src={props.coverUrl} alt="" fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover" />
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge tone="dark">{t(`groups.${props.kind}` as never)}</Badge>
          {props.acceptsUploads ? (
            <Badge tone="secondary">
              <Upload size={12} aria-hidden="true" /> {t('acceptsUploads')}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2 p-4">
        <h3 className="font-display text-lg leading-tight">{props.title}</h3>
        <p className="text-xs text-ink-muted">
          {[props.authorName, props.itemCountHint ? t('photoCount', { count: props.itemCountHint }) : null]
            .filter(Boolean)
            .join(' · ')}
        </p>
        {props.description ? <p className="line-clamp-2 text-sm text-ink-muted">{props.description}</p> : null}
        {props.accessNote ? (
          <p className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
            <Lock size={13} aria-hidden="true" />
            {props.accessNote}
          </p>
        ) : null}
        {props.acceptsUploads ? <p className="text-xs text-ink-muted">{t('uploadReminder')}</p> : null}

        <div className="mt-1 flex flex-wrap gap-2">
          <Button size="sm" onClick={handleOpen}>
            <ExternalLink size={16} aria-hidden="true" />
            {tc('open')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard.writeText(props.url);
              toast.show(tc('copied'), 'success');
            }}
          >
            <Link2 size={16} aria-hidden="true" />
            {tc('copy')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setReportOpen(true)} aria-label={t('report')}>
            <Flag size={16} aria-hidden="true" />
          </Button>
        </div>
      </div>

      <Sheet open={confirmOpen} onOpenChange={setConfirmOpen}>
        <SheetContent title={t('externalTitle')}>
          <p className="text-[15px]">
            {t('externalBody', { domain: host, author: props.addedBy ?? '—', date: props.addedOn })}
          </p>
          <div className="mt-5 flex gap-2">
            <Button onClick={open}>{t('externalOpen')}</Button>
            <Button variant="quiet" onClick={() => setConfirmOpen(false)}>
              {tc('cancel')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={reportOpen} onOpenChange={setReportOpen}>
        <SheetContent title={t('report')} description={t('reportReason')}>
          <ul className="flex flex-col gap-2">
            {(['PRIVACY', 'INAPPROPRIATE', 'BROKEN_LINK', 'WRONG_ACCESS', 'OTHER'] as const).map((reason) => (
              <li key={reason}>
                <Button variant="outline" full onClick={() => submitReport(reason)}>
                  {t(`reportReasons.${reason}` as never)}
                </Button>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </article>
  );
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'an external site';
  }
}

function hasSeenDomain(host: string): boolean {
  try {
    return (JSON.parse(window.sessionStorage.getItem(INTERSTITIAL_KEY) ?? '[]') as string[]).includes(host);
  } catch {
    return false;
  }
}

function rememberDomain(host: string): void {
  try {
    const seen = JSON.parse(window.sessionStorage.getItem(INTERSTITIAL_KEY) ?? '[]') as string[];
    window.sessionStorage.setItem(INTERSTITIAL_KEY, JSON.stringify([...new Set([...seen, host])]));
  } catch {
    // Session storage may be blocked; showing the notice again is harmless.
  }
}
