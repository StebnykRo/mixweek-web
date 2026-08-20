'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download } from 'lucide-react';
import { api, ApiCallError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './data-table';
import { StepUpDialog } from './step-up-dialog';
import { useToast } from '@/components/providers/toast-provider';

export type RegistrationRow = {
  id: string;
  status: string;
  waitlistPosition: number | null;
  name: string;
  email: string;
  department: string;
  checkedIn: boolean;
  createdAt: string;
  answers: Record<string, unknown>;
};

export function RegistrationsTable({
  eventId,
  rows,
  summary,
  canWrite,
}: {
  eventId: string;
  rows: RegistrationRow[];
  summary: { byStatus: Record<string, number>; checkedIn: number; capacity: number | null };
  canWrite: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const [stepUpOpen, setStepUpOpen] = useState(false);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function bulk(action: 'approve' | 'decline' | 'promote') {
    if (selected.size === 0) return;
    // docs/10 §4 — bulk actions always state the count and ask first.
    if (!window.confirm(`${action} ${selected.size} registration(s)?`)) return;

    setPending(true);
    try {
      await api(`/admin/events/${eventId}/registrations`, {
        method: 'PATCH',
        body: { action, registrationIds: [...selected] },
      });
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not update', 'error');
    } finally {
      setPending(false);
    }
  }

  async function exportCsv() {
    setPending(true);
    try {
      const response = await fetch(`/api/v1/admin/events/${eventId}/registrations/export`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (response.status === 401) {
        setStepUpOpen(true);
        return;
      }
      if (!response.ok) throw new Error('export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `registrations-${eventId}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.show('Could not export', 'error');
    } finally {
      setPending(false);
    }
  }

  const columns: Column<RegistrationRow>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-semibold">{row.name}</span> },
    { key: 'email', header: 'Email', render: (row) => row.email },
    { key: 'department', header: 'Department', render: (row) => row.department },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge
          tone={
            row.status === 'CONFIRMED' || row.status === 'ATTENDED'
              ? 'success'
              : row.status === 'WAITLISTED' || row.status === 'PENDING'
                ? 'warning'
                : 'neutral'
          }
        >
          {row.status}
          {row.waitlistPosition ? ` #${row.waitlistPosition}` : ''}
        </Badge>
      ),
    },
    { key: 'checkedIn', header: 'Checked in', render: (row) => (row.checkedIn ? 'Yes' : '—') },
    {
      key: 'answers',
      header: 'Answers',
      render: (row) => (
        <span className="text-xs text-ink-muted">
          {Object.entries(row.answers)
            .map(([key, value]) => `${key}: ${String(value)}`)
            .join(' · ') || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>
          <strong>{summary.byStatus.CONFIRMED ?? 0}</strong> confirmed
          {summary.capacity ? ` / ${summary.capacity}` : ''}
        </span>
        <span>
          <strong>{summary.byStatus.WAITLISTED ?? 0}</strong> waiting
        </span>
        <span>
          <strong>{summary.byStatus.PENDING ?? 0}</strong> pending
        </span>
        <span>
          <strong>{summary.checkedIn}</strong> checked in
        </span>
        <span className="ml-auto">
          <Button size="sm" variant="outline" loading={pending} onClick={exportCsv}>
            <Download size={16} aria-hidden="true" />
            Export CSV
          </Button>
        </span>
      </div>

      {canWrite && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-primary-100 px-4 py-2 text-sm">
          <span>{selected.size} selected</span>
          <Button size="sm" loading={pending} onClick={() => bulk('approve')}>
            Approve
          </Button>
          <Button size="sm" variant="outline" loading={pending} onClick={() => bulk('promote')}>
            Promote from waiting list
          </Button>
          <Button size="sm" variant="destructive" loading={pending} onClick={() => bulk('decline')}>
            Decline
          </Button>
        </div>
      ) : null}

      <DataTable
        rows={rows}
        columns={columns}
        empty="Nobody has registered yet."
        selectable={canWrite}
        selected={selected}
        onToggle={toggle}
      />

      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onConfirmed={() => {
          setStepUpOpen(false);
          void exportCsv();
        }}
      />
    </div>
  );
}
