'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/cn';

export type AnnouncementBannerProps = {
  id: string;
  title: string;
  body: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  linkUrl?: string | null;
  dismissLabel: string;
};

const DISMISSED_KEY = 'mw.dismissed-announcements';

/** docs/07 §4 — dismissible, and it comes back when a new one is published. */
export function AnnouncementBanner({ id, title, body, severity, linkUrl, dismissLabel }: AnnouncementBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return (JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[]).includes(id);
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      const current = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) ?? '[]') as string[];
      window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...current.slice(-20), id]));
    } catch {
      // A full or blocked storage must not break the banner.
    }
  }

  const Icon = severity === 'INFO' ? Info : AlertTriangle;

  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-md px-4 py-3',
        severity === 'INFO' && 'bg-primary-100 text-primary-900',
        severity === 'WARNING' && 'bg-warning/15 text-ink',
        severity === 'CRITICAL' && 'bg-danger/15 text-ink',
      )}
    >
      <Icon size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        <p className="mt-0.5 text-sm">{body}</p>
        {linkUrl ? (
          <Link href={linkUrl} className="mt-1 inline-block text-sm font-semibold underline">
            More
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={dismissLabel}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-pill hover:bg-neutral-900/10"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
