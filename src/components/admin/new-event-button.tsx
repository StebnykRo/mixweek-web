'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useToast } from '@/components/providers/toast-provider';

const TIMEZONES = ['Asia/Nicosia', 'Europe/Kyiv', 'Europe/Warsaw', 'Europe/London', 'America/New_York', 'UTC'];

/** docs/10-admin.md §3.2 — the minimum to create a draft; everything else is edited after. */
export function NewEventButton() {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [form, setForm] = useState({ title: '', slug: '', startsAt: '', endsAt: '', timezone: 'Asia/Nicosia', city: '' });

  async function submit() {
    setPending(true);
    try {
      const event = await api<{ id: string }>('/admin/events', {
        method: 'POST',
        body: {
          title: form.title,
          slug: form.slug || slugify(form.title),
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          timezone: form.timezone,
          city: form.city || null,
          visibility: 'TENANT',
          registrationEnabled: true,
          waitlistEnabled: true,
          approvalRequired: false,
        },
      });
      setOpen(false);
      router.push(`/admin/events/${event.id}`);
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not create the event', 'error');
    } finally {
      setPending(false);
    }
  }

  const valid = form.title.trim() && form.startsAt && form.endsAt;

  return (
    <>
      <Button onClick={() => setOpen(true)}>New event</Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent title="New event" description="Created as a draft — nobody sees it until you publish.">
          <div className="flex flex-col gap-4">
            <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
            <Input
              label="URL slug"
              hint={`Leave empty to use “${slugify(form.title) || 'my-event'}”`}
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />
            <Input
              label="Starts"
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
              required
            />
            <Input
              label="Ends"
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
              required
            />
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold" htmlFor="event-timezone">
                Timezone
              </label>
              <select
                id="event-timezone"
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="h-12 rounded-md border border-divider bg-surface px-4"
              >
                {TIMEZONES.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
            <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Button full loading={pending} disabled={!valid} onClick={submit}>
              Create draft
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
