'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Mail, Phone } from 'lucide-react';
import { api } from '@/lib/api-client';
import { Skeleton } from '@/components/ui/skeleton';

type Contact = { id: string; name: string; email?: string | null; phone?: string | null; jobTitle?: string | null; role?: string | null };
type Response = { source: string; contact: Contact | null };

/** docs/10 §3.10 — personal HR contact, resolved server-side. */
export function HrContactCard() {
  const t = useTranslations('help');
  const [state, setState] = useState<Response | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api<Response>('/me/hr-contact')
      .then((result) => {
        if (!cancelled) setState(result);
      })
      .catch(() => setState({ source: 'none', contact: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === null) return <Skeleton className="h-24 w-full" />;
  if (!state.contact) return null;

  return (
    <section className="rounded-lg bg-surface p-5">
      <h2 className="text-[11px] font-bold uppercase tracking-[2px] text-ink-muted">{t('hrContact')}</h2>
      <p className="mt-2 font-semibold">{state.contact.name}</p>
      <p className="text-xs text-ink-muted">{state.contact.jobTitle ?? state.contact.role ?? ''}</p>
      <div className="mt-3 flex gap-2">
        {state.contact.email ? (
          <a
            href={`mailto:${state.contact.email}`}
            className="inline-flex h-11 items-center gap-2 rounded-pill bg-neutral-200 px-4 text-sm font-semibold"
          >
            <Mail size={16} aria-hidden="true" />
            {t('write')}
          </a>
        ) : null}
        {state.contact.phone ? (
          <a
            href={`tel:${state.contact.phone.replace(/\s/g, '')}`}
            className="inline-flex h-11 items-center gap-2 rounded-pill bg-neutral-200 px-4 text-sm font-semibold"
          >
            <Phone size={16} aria-hidden="true" />
            {t('call')}
          </a>
        ) : null}
      </div>
    </section>
  );
}
