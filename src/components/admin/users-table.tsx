'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiCallError } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { DataTable, type Column } from './data-table';
import { StepUpDialog } from './step-up-dialog';
import { useToast } from '@/components/providers/toast-provider';

export type MemberRow = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  status: string;
  lastLoginAt: string | null;
};

const ROLES = ['PARTICIPANT', 'GUEST', 'SUPPORT', 'CONTENT_EDITOR', 'EVENT_MANAGER', 'TENANT_ADMIN'];

export function UsersTable({ rows, canWrite }: { rows: MemberRow[]; canWrite: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [retry, setRetry] = useState<{ userId: string; role: string } | null>(null);

  async function changeRole(userId: string, role: string) {
    // docs/10 §2 — this signs the person out everywhere and emails both sides.
    if (!window.confirm(`Change this role to ${role}? They will be signed out of all devices.`)) return;
    try {
      await api('/admin/users', { method: 'PATCH', body: { userId, role } });
      toast.show('Role updated', 'success');
      router.refresh();
    } catch (error) {
      if (error instanceof ApiCallError && (error.error.code === 'STEP_UP_REQUIRED' || error.error.code === 'NOT_FOUND')) {
        setRetry({ userId, role });
        setStepUpOpen(true);
        return;
      }
      toast.show(error instanceof ApiCallError ? error.error.message : 'Could not change the role', 'error');
    }
  }

  const columns: Column<MemberRow>[] = [
    { key: 'name', header: 'Name', render: (row) => <span className="font-semibold">{row.name}</span> },
    { key: 'email', header: 'Email', render: (row) => row.email },
    { key: 'department', header: 'Department', render: (row) => row.department },
    {
      key: 'role',
      header: 'Role',
      render: (row) =>
        canWrite ? (
          <select
            aria-label={`Role for ${row.email}`}
            value={row.role}
            onChange={(event) => void changeRole(row.id, event.target.value)}
            className="h-9 rounded-sm border border-divider bg-surface px-2 text-xs"
          >
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        ) : (
          <Badge>{row.role}</Badge>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <Badge tone={row.status === 'ACTIVE' ? 'success' : 'neutral'}>{row.status}</Badge>,
    },
    {
      key: 'lastLoginAt',
      header: 'Last sign-in',
      render: (row) =>
        row.lastLoginAt
          ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'short' }).format(new Date(row.lastLoginAt))
          : 'never',
    },
  ];

  return (
    <>
      <DataTable rows={rows} columns={columns} empty="Nobody here yet." />
      <StepUpDialog
        open={stepUpOpen}
        onOpenChange={setStepUpOpen}
        onConfirmed={() => {
          setStepUpOpen(false);
          if (retry) void changeRole(retry.userId, retry.role);
        }}
      />
    </>
  );
}
