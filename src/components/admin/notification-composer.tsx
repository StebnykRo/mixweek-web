'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CheckboxField } from '@/components/ui/checkbox';
import { StepUpDialog } from './step-up-dialog';
import { useToast } from '@/components/providers/toast-provider';
import { truncateForPush } from '@/modules/notifications/policy';

const KINDS = ['ANNOUNCEMENT', 'REMINDER', 'PROGRAMME_UPDATE', 'MEDIA_READY', 'MERCH'] as const;

/**
 * docs/10-admin.md §3.7 — the composer.
 *
 * The reach estimate and the preview are shown before anything can be sent,
 * and a send above 100 people asks for a second factor. A message cannot be
 * edited after it has gone out.
 */
export function NotificationComposer({ events }: { events: Array<{ id: string; title: string }> }) {
  const router = useRouter();
  const toast = useToast();

  const [form, setForm] = useState({
    eventId: events[0]?.id ?? '',
    kind: 'ANNOUNCEMENT' as (typeof KINDS)[number],
    title: '',
    body: '',
    linkUrl: '',
    registeredOnly: true,
    channels: { inapp: true, push: true, email: false },
  });
  const [estimate, setEstimate] = useState<{ recipients: number; reachablePush: number } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const channels = Object.entries(form.channels)
    .filter(([, on]) => on)
    .map(([name]) => name);

  const audience = { registeredOnly: form.registeredOnly };
  const preview = truncateForPush(form.title, form.body);

  async function estimateReach() {
    setPending(true);
    try {
      const result = await api<{ recipients: number; reachablePush: number }>('/admin/notifications', {
        method: 'PUT',
        body: { eventId: form.eventId || null, audience },
      });
      setEstimate(result);
    } finally {
      setPending(false);
    }
  }

  async function createDraft() {
    setPending(true);
    try {
      const draft = await api<{ id: string; estimatedRecipients: number }>('/admin/notifications', {
        method: 'POST',
        body: {
          eventId: form.eventId || null,
          kind: form.kind,
          title: form.title,
          body: form.body,
          linkUrl: form.linkUrl || null,
          audience,
          channels,
        },
      });
      setDraftId(draft.id);
      setEstimate({ recipients: draft.estimatedRecipients, reachablePush: estimate?.reachablePush ?? 0 });
      toast.show('Draft saved — review it, then send', 'success');
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not save', 'error');
    } finally {
      setPending(false);
    }
  }

  async function send() {
    if (!draftId) return;
    const count = estimate?.recipients ?? 0;
    if (!window.confirm(`Send to ${count} ${count === 1 ? 'person' : 'people'}? This cannot be undone.`)) return;

    setPending(true);
    try {
      await api(`/admin/notifications/${draftId}/send`, { method: 'POST' });
      toast.show('Sending', 'success');
      setDraftId(null);
      setForm({ ...form, title: '', body: '', linkUrl: '' });
      router.refresh();
    } catch (error) {
      if (error instanceof ApiCallError && error.error.code === 'STEP_UP_REQUIRED') {
        setStepUpOpen(true);
        return;
      }
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not send', 'error');
    } finally {
      setPending(false);
    }
  }

  async function testOnMyself() {
    setPending(true);
    try {
      // The recipient is taken from the session on the server, never from here.
      await api('/admin/notifications/test', {
        method: 'POST',
        body: {
          eventId: form.eventId || null,
          kind: form.kind,
          title: form.title,
          body: form.body,
          linkUrl: form.linkUrl || null,
          channels,
        },
      });
      toast.show('Test sent to you', 'success');
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not send the test', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="flex h-fit flex-col gap-4 rounded-lg bg-surface p-5">
      <h1 className="font-display text-2xl">New notification</h1>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor="notif-event">
          Event
        </label>
        <select
          id="notif-event"
          value={form.eventId}
          onChange={(event) => setForm({ ...form, eventId: event.target.value })}
          className="h-12 rounded-md border border-divider bg-surface px-4"
        >
          {events.map((event) => (
            <option key={event.id} value={event.id}>
              {event.title}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor="notif-kind">
          Type
        </label>
        <select
          id="notif-kind"
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

      <Input
        label="Title"
        hint="Up to 50 characters survive on a lock screen."
        value={form.title}
        onChange={(event) => setForm({ ...form, title: event.target.value })}
      />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-semibold" htmlFor="notif-body">
          Message
        </label>
        <textarea
          id="notif-body"
          rows={3}
          value={form.body}
          onChange={(event) => setForm({ ...form, body: event.target.value })}
          className="rounded-md border border-divider bg-surface p-4 text-[15px]"
        />
      </div>

      <Input
        label="Link (inside the app)"
        placeholder="/events/mix-week-2026/programme"
        value={form.linkUrl}
        onChange={(event) => setForm({ ...form, linkUrl: event.target.value })}
      />

      <fieldset className="border-t border-divider pt-3">
        <legend className="text-sm font-semibold">Channels</legend>
        <div className="mt-2 flex flex-col gap-1">
          {(['inapp', 'push', 'email'] as const).map((channel) => (
            <CheckboxField
              key={channel}
              label={channel === 'inapp' ? 'In-app history' : channel === 'push' ? 'Push' : 'Email'}
              checked={form.channels[channel]}
              onCheckedChange={(value) => setForm({ ...form, channels: { ...form.channels, [channel]: value } })}
            />
          ))}
        </div>
      </fieldset>

      <CheckboxField
        label="Only people registered for this event"
        checked={form.registeredOnly}
        onCheckedChange={(value) => setForm({ ...form, registeredOnly: value })}
      />

      <div className="rounded-md bg-bg p-4">
        <p className="text-xs font-bold uppercase tracking-[1px] text-ink-muted">Push preview</p>
        <p className="mt-1 font-semibold">{preview.title || 'Title'}</p>
        <p className="text-sm text-ink-muted">{preview.body || 'Message'}</p>
      </div>

      {estimate ? (
        <p className="text-sm">
          Reaches <strong>{estimate.recipients}</strong> people (push: {estimate.reachablePush}, email:{' '}
          {estimate.recipients}).
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" loading={pending} onClick={estimateReach}>
          Estimate reach
        </Button>
        <Button variant="outline" loading={pending} disabled={!form.title || !form.body} onClick={testOnMyself}>
          Test on me
        </Button>
        <Button loading={pending} disabled={!form.title || !form.body || channels.length === 0} onClick={createDraft}>
          Save draft
        </Button>
        <Button variant="secondary" loading={pending} disabled={!draftId} onClick={send}>
          Send
        </Button>
      </div>

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onConfirmed={() => {
          setStepUpOpen(false);
          void send();
        }}
      />
    </section>
  );
}
