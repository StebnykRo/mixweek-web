import { requirePermission, allows } from '@/modules/admin/guard';
import { listMembers } from '@/modules/admin/users';
import { UsersTable } from '@/components/admin/users-table';
import { ImportWizard } from '@/components/admin/import-wizard';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'People' };

export default async function AdminUsersPage() {
  const session = await requirePermission('user:read');
  const members = await listMembers(session.tenantId);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl">People</h1>
        {allows(session, 'user.import:write') ? <ImportWizard /> : null}
      </div>

      <UsersTable
        canWrite={allows(session, 'user:write')}
        rows={members.map((member) => ({
          id: member.userId,
          name: member.user.name ?? '—',
          email: member.user.email,
          department: member.user.department ?? '—',
          role: member.role,
          status: member.status,
          lastLoginAt: member.user.lastLoginAt ? member.user.lastLoginAt.toISOString() : null,
        }))}
      />
    </div>
  );
}
