'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/providers/toast-provider';
import { slugifyOrFallback } from '@/lib/slugify';

/**
 * Next year's event, from last year's. Copies the programme, places, content,
 * checklist, contacts and merchandise; never registrations or orders.
 */
export function DuplicateEventButton({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ title: `${eventTitle} (copy)`, slug: '', startsAt: '' });

  async function submit() {
    setPending(true);
    try {
      const created = await api<{ id: string; copied: Record<string, number> }>(
        `/admin/events/${eventId}/duplicate`,
        {
          method: 'POST',
          body: {
            title: form.title.trim(),
            slug: form.slug.trim() || slugifyOrFallback(form.title),
            startsAt: new Date(form.startsAt).toISOString(),
          },
        },
      );
      const summary = Object.entries(created.copied)
        .filter(([, n]) => n > 0)
        .map(([what, n]) => `${n} ${what}`)
        .join(', ');
      toast.show(summary ? `Copied ${summary}` : 'Event copied', 'success');
      setOpen(false);
      router.push(`/admin/events/${created.id}`);
      router.refresh();
    } catch (error) {
      const detail =
        error instanceof ApiCallError
          ? [error.error.message, ...(error.error.details ?? []).map((d) => `${d.path || 'field'}: ${d.message}`)]
              .filter(Boolean)
              .join(' — ')
          : 'Could not copy the event';
      toast.show(detail, 'error');
    } finally {
      setPending(false);
    }
  }

  const valid = form.title.trim() !== '' && form.startsAt !== '';

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Duplicate
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          title="Duplicate this event"
          description="Copies the programme, places, content, checklist, contacts and merchandise. Registrations and orders are not copied."
        >
          <div className="flex flex-col gap-4">
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
            <Input
              label="URL slug"
              hint={`Leave empty to use “${slugifyOrFallback(form.title, 'xxxxxx')}”`}
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
            <Input
              label="New start date"
              type="datetime-local"
              hint="Every session keeps its position relative to day one."
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              required
            />
            <Button full loading={pending} disabled={!valid} onClick={submit}>
              Create draft copy
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
