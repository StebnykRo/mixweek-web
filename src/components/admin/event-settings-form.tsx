'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SwitchField } from '@/components/ui/switch';
import { useToast } from '@/components/providers/toast-provider';

export type EventSettings = {
  title: string;
  subtitle: string;
  description: string;
  coverUrl: string;
  city: string;
  country: string;
  venueName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  capacity: number | null;
  registrationEnabled: boolean;
  waitlistEnabled: boolean;
  approvalRequired: boolean;
  registrationOpensAt: string;
  registrationClosesAt: string;
  visibility: string;
};

/** docs/10-admin.md §3.2 — the event form, with an explicit save. */
export function EventSettingsForm({ eventId, initial }: { eventId: string; initial: EventSettings }) {
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState(initial);
  const [pending, setPending] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  async function save() {
    setPending(true);
    try {
      await api(`/admin/events/${eventId}`, {
        method: 'PATCH',
        body: {
          title: form.title,
          subtitle: form.subtitle || null,
          description: form.description || null,
          coverUrl: form.coverUrl || null,
          city: form.city || null,
          country: form.country || null,
          venueName: form.venueName || null,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          timezone: form.timezone,
          capacity: form.capacity,
          registrationEnabled: form.registrationEnabled,
          waitlistEnabled: form.waitlistEnabled,
          approvalRequired: form.approvalRequired,
          registrationOpensAt: form.registrationOpensAt ? new Date(form.registrationOpensAt).toISOString() : null,
          registrationClosesAt: form.registrationClosesAt ? new Date(form.registrationClosesAt).toISOString() : null,
        },
      });
      setSavedAt(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date()));
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not save', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg bg-surface p-5">
      <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Input label="Subtitle" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor="event-description">
          Description (Markdown)
        </label>
        <textarea
          id="event-description"
          rows={5}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="rounded-md border border-divider bg-surface p-4 text-[15px]"
        />
      </div>

      <Input
        label="Cover image URL"
        hint="Shown on the event card and the Home header."
        value={form.coverUrl}
        onChange={(e) => setForm({ ...form, coverUrl: e.target.value })}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Starts" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
        <Input label="Ends" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />
        <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <Input label="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
        <Input label="Venue" value={form.venueName} onChange={(e) => setForm({ ...form, venueName: e.target.value })} />
        <Input
          label="Capacity"
          type="number"
          min={1}
          value={form.capacity ?? ''}
          onChange={(e) => setForm({ ...form, capacity: e.target.value ? Number(e.target.value) : null })}
          hint="Leave empty for unlimited."
        />
        <Input
          label="Registration opens"
          type="datetime-local"
          value={form.registrationOpensAt}
          onChange={(e) => setForm({ ...form, registrationOpensAt: e.target.value })}
        />
        <Input
          label="Registration closes"
          type="datetime-local"
          value={form.registrationClosesAt}
          onChange={(e) => setForm({ ...form, registrationClosesAt: e.target.value })}
        />
      </div>

      <div className="border-t border-divider">
        <SwitchField
          label="Registration open"
          checked={form.registrationEnabled}
          onCheckedChange={(value) => setForm({ ...form, registrationEnabled: value })}
        />
        <SwitchField
          label="Waiting list"
          description="When the event is full, people can queue for a place."
          checked={form.waitlistEnabled}
          onCheckedChange={(value) => setForm({ ...form, waitlistEnabled: value })}
        />
        <SwitchField
          label="Approval required"
          description="Registrations arrive as pending and you confirm them."
          checked={form.approvalRequired}
          onCheckedChange={(value) => setForm({ ...form, approvalRequired: value })}
        />
      </div>

      <div className="flex items-center gap-3">
        <Button loading={pending} onClick={save}>
          Save
        </Button>
        {savedAt ? <span className="text-xs text-ink-muted">Saved at {savedAt}</span> : null}
      </div>
    </section>
  );
}
