'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/providers/toast-provider';

export type ReportRow = {
  id: string;
  reason: string;
  comment: string | null;
  status: string;
  createdAt: string;
  mediaTitle: string;
  mediaUrl: string;
};

export function MediaReportsQueue({ reports }: { reports: ReportRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState<string | null>(null);

  async function update(id: string, status: string, hideMedia = false) {
    setPending(id);
    try {
      await api('/admin/media-reports', { method: 'PATCH', body: { id, status, hideMedia } });
      router.refresh();
    } catch {
      toast.show('Could not update', 'error');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="font-display text-2xl">Media reports</h1>
        <p className="mt-1 text-sm text-ink-muted">
          We do not moderate other people&apos;s galleries. What we can do is hide the card here and talk to whoever
          added the link.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {reports.map((report) => (
          <li key={report.id} className="rounded-md bg-surface p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold">{report.mediaTitle}</p>
                <p className="truncate text-xs text-ink-muted">{report.mediaUrl}</p>
              </div>
              <Badge tone={report.reason === 'PRIVACY' ? 'danger' : 'warning'}>{report.reason}</Badge>
            </div>
            {report.comment ? <p className="mt-2 text-ink-muted">{report.comment}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" loading={pending === report.id} onClick={() => update(report.id, 'IN_PROGRESS')}>
                Take it on
              </Button>
              <Button size="sm" variant="destructive" loading={pending === report.id} onClick={() => update(report.id, 'RESOLVED', true)}>
                Hide the card and resolve
              </Button>
              <Button size="sm" variant="ghost" loading={pending === report.id} onClick={() => update(report.id, 'DISMISSED')}>
                Dismiss
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {reports.length === 0 ? (
        <p className="rounded-lg bg-surface p-8 text-center text-sm text-ink-muted">Nothing to look at.</p>
      ) : null}
    </div>
  );
}
