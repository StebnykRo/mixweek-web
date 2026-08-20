'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { StepUpDialog } from './step-up-dialog';
import { useToast } from '@/components/providers/toast-provider';

export type Checklist = { ready: boolean; items: Array<{ key: string; label: string; ok: boolean }> };

/**
 * docs/10-admin.md §3.2 — publishing is gated twice: the readiness checklist,
 * and a fresh second factor (docs/03 §5).
 */
export function PublishPanel({ eventId, status, checklist }: { eventId: string; status: string; checklist: Checklist }) {
  const router = useRouter();
  const toast = useToast();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function publish() {
    setPending(true);
    try {
      await api(`/admin/events/${eventId}/publish`, { method: 'POST' });
      toast.show('Published', 'success');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiCallError && (error.error.code === 'STEP_UP_REQUIRED' || error.error.code === 'NOT_FOUND')) {
        setStepUpOpen(true);
        return;
      }
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not publish', 'error');
    } finally {
      setPending(false);
    }
  }

  return (
    <aside className="flex h-fit flex-col gap-4 rounded-lg bg-surface p-5">
      <h2 className="font-display text-lg">Publication</h2>

      <ul className="flex flex-col gap-1.5 text-sm">
        {checklist.items.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            {item.ok ? (
              <Check size={16} aria-label="Done" className="mt-0.5 shrink-0 text-success" />
            ) : (
              <X size={16} aria-label="Not done" className="mt-0.5 shrink-0 text-danger" />
            )}
            <span className={item.ok ? 'text-ink-muted' : 'font-semibold'}>{item.label}</span>
          </li>
        ))}
      </ul>

      {status === 'PUBLISHED' ? (
        <p className="text-sm font-semibold text-success">This event is live.</p>
      ) : (
        <Button loading={pending} disabled={!checklist.ready} onClick={publish}>
          Publish
        </Button>
      )}

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onConfirmed={() => {
          setStepUpOpen(false);
          void publish();
        }}
      />
    </aside>
  );
}
