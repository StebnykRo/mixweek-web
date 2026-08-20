'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { CheckboxField } from '@/components/ui/checkbox';
import { StepUpDialog } from './step-up-dialog';
import { useToast } from '@/components/providers/toast-provider';
import { DEFAULT_DOMAIN_ALLOWLIST, hostOf, isAllowedHost } from '@/modules/media/url';

export type MediaRow = {
  id: string;
  kind: string;
  title: string;
  url: string;
  coverUrl: string;
  status: string;
  authorName: string | null;
  acceptsUploads: boolean;
};

const KINDS = ['PARTICIPANT_UPLOAD', 'PHOTOGRAPHER_GALLERY', 'AFTERMOVIE', 'VIDEO', 'MATERIALS', 'PRESS'] as const;

export function MediaManager({ eventId, items }: { eventId: string; items: MediaRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [form, setForm] = useState({
    kind: 'PHOTOGRAPHER_GALLERY' as (typeof KINDS)[number],
    title: '',
    description: '',
    url: '',
    coverUrl: '',
    authorName: '',
    accessNote: '',
    acceptsUploads: false,
  });

  const host = hostOf(form.url);
  const offAllowlist = form.url.length > 0 && !isAllowedHost(form.url, DEFAULT_DOMAIN_ALLOWLIST);

  async function create() {
    setPending(true);
    try {
      await api(`/admin/events/${eventId}/media`, {
        method: 'POST',
        body: {
          kind: form.kind,
          title: form.title,
          description: form.description || null,
          url: form.url,
          coverUrl: form.coverUrl,
          authorName: form.authorName || null,
          accessNote: form.accessNote || null,
          acceptsUploads: form.acceptsUploads,
          sortOrder: items.length,
        },
      });
      setOpen(false);
      setForm({ ...form, title: '', url: '', coverUrl: '', authorName: '' });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiCallError && error.error.code === 'FORBIDDEN') {
        setStepUpOpen(true);
        toast.show(error.error.message, 'error');
        return;
      }
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not save', 'error');
    } finally {
      setPending(false);
    }
  }

  async function publish(id: string, notify: boolean) {
    setPending(true);
    try {
      await api(`/admin/media/${id}/publish`, { method: 'POST', body: { notify } });
      toast.show(notify ? 'Published and participants notified' : 'Published', 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not publish', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Photos and materials</h2>
        <Button onClick={() => setOpen(true)}>Add link</Button>
      </div>

      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="overflow-hidden rounded-lg bg-surface shadow-sm">
            <div className="relative aspect-video bg-neutral-200">
              {item.coverUrl ? <Image src={item.coverUrl} alt="" fill className="object-cover" sizes="33vw" /> : null}
            </div>
            <div className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{item.title}</p>
                <Badge tone={item.status === 'PUBLISHED' ? 'success' : 'neutral'}>{item.status}</Badge>
              </div>
              <p className="truncate text-xs text-ink-muted">{item.url}</p>
              {item.status !== 'PUBLISHED' ? (
                <div className="flex gap-2">
                  <Button size="sm" loading={pending} onClick={() => publish(item.id, false)}>
                    Publish
                  </Button>
                  <Button size="sm" variant="secondary" loading={pending} onClick={() => publish(item.id, true)}>
                    Publish and notify
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {items.length === 0 ? (
        <p className="rounded-lg bg-surface p-8 text-center text-sm text-ink-muted">No links yet.</p>
      ) : null}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          title="Add a gallery link"
          description="We store the link and the cover, never the photos themselves."
        >
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold" htmlFor="media-kind">
                Type
              </label>
              <select
                id="media-kind"
                value={form.kind}
                onChange={(event) => setForm({ ...form, kind: event.target.value as (typeof KINDS)[number] })}
                className="h-12 rounded-md border border-divider bg-surface px-4"
              >
                {KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </div>

            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input
              label="Gallery URL"
              hint={offAllowlist ? `${host} is not on the approved list — a tenant admin has to approve it.` : undefined}
              error={form.url && !form.url.startsWith('https://') ? 'Only https links are accepted' : undefined}
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <Input
              label="Cover image URL"
              hint="Required. A card cannot be published without its own cover."
              value={form.coverUrl}
              onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
            />
            <Input
              label="Author / studio"
              value={form.authorName}
              onChange={(e) => setForm({ ...form, authorName: e.target.value })}
            />
            <Input
              label="Access note"
              placeholder="Password sent by email"
              value={form.accessNote}
              onChange={(e) => setForm({ ...form, accessNote: e.target.value })}
            />
            <CheckboxField
              label="Participants can upload to this folder"
              checked={form.acceptsUploads}
              onCheckedChange={(value) => setForm({ ...form, acceptsUploads: value })}
            />

            <Button full loading={pending} disabled={!form.title || !form.url || !form.coverUrl} onClick={create}>
              Save as draft
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onConfirmed={() => {
          setStepUpOpen(false);
          void create();
        }}
      />
    </div>
  );
}
