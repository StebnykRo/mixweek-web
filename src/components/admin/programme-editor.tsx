'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Plus } from 'lucide-react';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SwitchField } from '@/components/ui/switch';
import { CheckboxField } from '@/components/ui/checkbox';
import { DataTable, type Column } from './data-table';
import { useToast } from '@/components/providers/toast-provider';

export type EditorActivity = {
  id: string;
  title: string;
  track: string;
  startsAt: string;
  endsAt: string;
  status: string;
  isFeatured: boolean;
  bookingRequired: boolean;
  capacity: number | null;
  placeId: string | null;
  announced: boolean;
};

const TRACKS = ['WORKSHOP', 'SPORT', 'PARTY', 'TEAM', 'LOGISTICS'];

export function ProgrammeEditor({
  eventId,
  timezone,
  published,
  activities,
  places,
  conflicts,
}: {
  eventId: string;
  timezone: string;
  published: boolean;
  activities: EditorActivity[];
  places: Array<{ id: string; name: string }>;
  conflicts: Array<{ a: string; b: string; place: string }>;
}) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState<EditorActivity | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState(false);

  const unannounced = useMemo(() => activities.filter((activity) => !activity.announced).length, [activities]);
  const placeName = (id: string | null) => places.find((place) => place.id === id)?.name ?? '—';

  const format = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      weekday: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));

  const columns: Column<EditorActivity>[] = [
    { key: 'time', header: 'When', render: (row) => format(row.startsAt) },
    {
      key: 'title',
      header: 'Session',
      render: (row) => (
        <button type="button" className="text-left font-semibold underline" onClick={() => setEditing(row)}>
          {row.title}
        </button>
      ),
    },
    { key: 'track', header: 'Track', render: (row) => <Badge tone="primary">{row.track}</Badge> },
    { key: 'place', header: 'Place', render: (row) => placeName(row.placeId) },
    {
      key: 'capacity',
      header: 'Booking',
      render: (row) => (row.bookingRequired ? `${row.capacity ?? '∞'} places` : '—'),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge tone={row.status === 'CANCELLED' ? 'danger' : row.status === 'MOVED' ? 'warning' : 'neutral'}>
          {row.status}
        </Badge>
      ),
    },
  ];

  async function announceNow() {
    setPending(true);
    try {
      await api(`/admin/events/${eventId}/announce`, { method: 'POST' });
      toast.show('Participants notified', 'success');
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not notify', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {published && unannounced > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-warning/15 px-4 py-3 text-sm">
          <span>
            <strong>{unannounced}</strong> new session{unannounced === 1 ? '' : 's'} have not been announced yet. They go
            out automatically as one message within six hours.
          </span>
          <Button size="sm" loading={pending} onClick={announceNow}>
            Notify now
          </Button>
        </div>
      ) : null}

      {conflicts.length > 0 ? (
        <div className="rounded-md bg-danger/10 px-4 py-3 text-sm">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} aria-hidden="true" />
            Overlapping sessions in the same place
          </p>
          <ul className="mt-1 ml-6 list-disc">
            {conflicts.map((conflict) => (
              <li key={`${conflict.a}-${conflict.b}`}>
                {conflict.a} ↔ {conflict.b} ({conflict.place})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus size={16} aria-hidden="true" />
          Add session
        </Button>
      </div>

      <DataTable rows={activities} columns={columns} empty="No sessions yet." />

      <ActivitySheet
        open={creating}
        onOpenChange={setCreating}
        eventId={eventId}
        places={places}
        tracks={TRACKS}
        published={published}
      />
      {editing ? (
        <ActivitySheet
          open
          onOpenChange={() => setEditing(null)}
          eventId={eventId}
          places={places}
          tracks={TRACKS}
          published={published}
          activity={editing}
        />
      ) : null}
    </div>
  );
}

function ActivitySheet({
  open,
  onOpenChange,
  eventId,
  places,
  tracks,
  published,
  activity,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string;
  places: Array<{ id: string; name: string }>;
  tracks: string[];
  published: boolean;
  activity?: EditorActivity;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const [notify, setNotify] = useState(true);
  const [form, setForm] = useState({
    title: activity?.title ?? '',
    track: activity?.track ?? 'WORKSHOP',
    startsAt: activity ? activity.startsAt.slice(0, 16) : '',
    endsAt: activity ? activity.endsAt.slice(0, 16) : '',
    placeId: activity?.placeId ?? '',
    bookingRequired: activity?.bookingRequired ?? false,
    capacity: activity?.capacity ?? null,
    isFeatured: activity?.isFeatured ?? false,
    isMandatory: false,
    description: '',
  });

  async function submit() {
    setPending(true);
    try {
      const body = {
        title: form.title,
        track: form.track,
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        placeId: form.placeId || null,
        bookingRequired: form.bookingRequired,
        capacity: form.bookingRequired ? form.capacity : null,
        waitlistEnabled: true,
        isFeatured: form.isFeatured,
        isMandatory: form.isMandatory,
        sortOrder: 0,
        ...(form.description ? { description: form.description } : {}),
      };

      if (activity) {
        await api(`/admin/events/${eventId}/activities/${activity.id}`, {
          method: 'PATCH',
          body: { ...body, notify },
        });
      } else {
        await api(`/admin/events/${eventId}/activities`, { method: 'POST', body });
      }
      onOpenChange(false);
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not save', 'error');
    } finally {
      setPending(false);
    }
  }

  async function cancel() {
    if (!activity) return;
    setPending(true);
    try {
      await api(`/admin/events/${eventId}/activities/${activity.id}`, { method: 'DELETE', body: { notify } });
      onOpenChange(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent title={activity ? 'Edit session' : 'New session'}>
        <div className="flex flex-col gap-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold" htmlFor="activity-track">
              Track
            </label>
            <select
              id="activity-track"
              value={form.track}
              onChange={(e) => setForm({ ...form, track: e.target.value })}
              className="h-12 rounded-md border border-divider bg-surface px-4"
            >
              {tracks.map((track) => (
                <option key={track} value={track}>
                  {track}
                </option>
              ))}
            </select>
          </div>

          <Input label="Starts" type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} />
          <Input label="Ends" type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold" htmlFor="activity-place">
              Place
            </label>
            <select
              id="activity-place"
              value={form.placeId}
              onChange={(e) => setForm({ ...form, placeId: e.target.value })}
              className="h-12 rounded-md border border-divider bg-surface px-4"
            >
              <option value="">—</option>
              {places.map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold" htmlFor="activity-description">
              Description (Markdown)
            </label>
            <textarea
              id="activity-description"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="rounded-md border border-divider bg-surface p-4 text-[15px]"
            />
          </div>

          <SwitchField
            label="Needs booking"
            description="Limits the number of places and opens a waiting list."
            checked={form.bookingRequired}
            onCheckedChange={(value) => setForm({ ...form, bookingRequired: value })}
          />
          {form.bookingRequired ? (
            <Input
              label="Places"
              type="number"
              min={1}
              value={form.capacity ?? ''}
              onChange={(e) => setForm({ ...form, capacity: e.target.value ? Number(e.target.value) : null })}
            />
          ) : null}
          <SwitchField
            label="Featured"
            checked={form.isFeatured}
            onCheckedChange={(value) => setForm({ ...form, isFeatured: value })}
          />

          {activity && published ? (
            <CheckboxField
              label="Notify the people who have this in their programme"
              checked={notify}
              onCheckedChange={setNotify}
            />
          ) : null}

          <div className="flex gap-2">
            <Button full loading={pending} disabled={!form.title || !form.startsAt || !form.endsAt} onClick={submit}>
              Save
            </Button>
            {activity ? (
              <Button variant="destructive" loading={pending} onClick={cancel}>
                Cancel session
              </Button>
            ) : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
