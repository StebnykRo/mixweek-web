import { parse as parseCsv } from 'papaparse';
import type { Role } from '@prisma/client';
import { globalDb } from '@/lib/db/client';
import { withSystemScope, withTenant } from '@/lib/db/tenant-client';
import { AppError } from '@/lib/errors';
import { auditLog } from '@/lib/audit';
import { sendMail } from '@/lib/mail';
import { normaliseEmail, emailDomain } from '@/modules/tenancy/service';
import { resolveBrand } from '@/modules/branding/service';
import { renderSecurityNotice } from '@/modules/auth/emails';
import { getSetting } from '@/modules/tenancy/settings';
import { revokeAllSessions } from '@/modules/auth/session';
import type { AdminActor } from './events';

/** docs/10-admin.md §3.10 — people, roles, invites and the CSV import. */

export const IMPORT_COLUMNS = [
  'email',
  'name',
  'jobTitle',
  'department',
  'team',
  'hrEmail',
  'role',
  'avatarUrl',
  'locale',
] as const;

export type ImportRow = Partial<Record<(typeof IMPORT_COLUMNS)[number], string>>;

export type ImportOutcome = {
  willCreate: number;
  willUpdate: number;
  skipped: Array<{ row: number; email: string; reason: string }>;
  rows: Array<{ row: number; email: string; action: 'create' | 'update' }>;
};

const ALLOWED_AVATAR_HOSTS = ['lh3.googleusercontent.com', 'cdn.mixweek.app'];

/**
 * The import always runs as a dry run first. Nothing is written until the
 * organiser has seen exactly what will change and confirmed it.
 */
export async function analyseImport(tenantId: string, csv: string): Promise<ImportOutcome> {
  const parsed = parseCsv<ImportRow>(csv.trim(), { header: true, skipEmptyLines: true });
  const domains = await withSystemScope('list tenant domains for import', (db) =>
    db.tenantDomain.findMany({ where: { tenantId, hostType: 'EMAIL' }, select: { domain: true } }),
  );
  const allowed = new Set(domains.map((entry) => entry.domain.toLowerCase()));

  const outcome: ImportOutcome = { willCreate: 0, willUpdate: 0, skipped: [], rows: [] };

  for (const [index, raw] of parsed.data.entries()) {
    const rowNumber = index + 2; // header is row 1
    const email = normaliseEmail(raw.email ?? '');

    if (!email || !email.includes('@')) {
      outcome.skipped.push({ row: rowNumber, email: raw.email ?? '', reason: 'missing or invalid email' });
      continue;
    }
    // A row for someone else's domain is rejected with an explanation, never
    // silently imported into this tenant.
    if (!allowed.has(emailDomain(email))) {
      outcome.skipped.push({ row: rowNumber, email, reason: 'email domain is not registered for this tenant' });
      continue;
    }

    const existing = await globalDb.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      outcome.willUpdate += 1;
      outcome.rows.push({ row: rowNumber, email, action: 'update' });
    } else {
      outcome.willCreate += 1;
      outcome.rows.push({ row: rowNumber, email, action: 'create' });
    }
  }

  return outcome;
}

export async function applyImport(tenantId: string, csv: string, actor: AdminActor): Promise<ImportOutcome> {
  const plan = await analyseImport(tenantId, csv);
  const parsed = parseCsv<ImportRow>(csv.trim(), { header: true, skipEmptyLines: true });
  const importable = new Set(plan.rows.map((row) => row.email));

  for (const raw of parsed.data) {
    const email = normaliseEmail(raw.email ?? '');
    if (!importable.has(email)) continue;

    const hrUser = raw.hrEmail
      ? await globalDb.user.findUnique({ where: { email: normaliseEmail(raw.hrEmail) }, select: { id: true } })
      : null;

    const avatarUrl = raw.avatarUrl && isAllowedAvatar(raw.avatarUrl) ? raw.avatarUrl : null;

    const user = await globalDb.user.upsert({
      where: { email },
      create: {
        email,
        name: raw.name ?? null,
        jobTitle: raw.jobTitle ?? null,
        department: raw.department ?? null,
        team: raw.team ?? null,
        hrContactId: hrUser?.id ?? null,
        avatarUrl,
        locale: raw.locale ?? 'en',
        primaryTenantId: tenantId,
        // The import never creates a signed-in account: the person becomes
        // INVITED and their details are applied at first sign-in (docs/10 §3.10).
        status: 'INVITED',
      },
      update: {
        name: raw.name ?? undefined,
        jobTitle: raw.jobTitle ?? undefined,
        department: raw.department ?? undefined,
        team: raw.team ?? undefined,
        hrContactId: hrUser?.id ?? undefined,
        ...(avatarUrl ? { avatarUrl } : {}),
      },
      select: { id: true },
    });

    const role = normaliseRole(raw.role);
    await withSystemScope('import membership', (db) =>
      db.membership.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId } },
        create: { userId: user.id, tenantId, role, status: 'INVITED', invitedBy: actor.userId },
        update: {},
        select: { id: true },
      }),
    );
  }

  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'user.import',
    diff: { created: plan.willCreate, updated: plan.willUpdate, skipped: plan.skipped.length },
  });

  return plan;
}

function isAllowedAvatar(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && ALLOWED_AVATAR_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

function normaliseRole(value: string | undefined): Role {
  const roles: Role[] = ['PARTICIPANT', 'GUEST', 'SUPPORT', 'CONTENT_EDITOR', 'EVENT_MANAGER', 'TENANT_ADMIN'];
  const candidate = (value ?? '').trim().toUpperCase() as Role;
  return roles.includes(candidate) ? candidate : 'PARTICIPANT';
}

export async function listMembers(tenantId: string, query?: string) {
  const memberships = await withTenant(tenantId, (db) =>
    db.membership.findMany({
      orderBy: { joinedAt: 'desc' },
      take: 200,
      select: { id: true, role: true, status: true, joinedAt: true, userId: true },
    }),
  );

  const users = await globalDb.user.findMany({
    where: {
      id: { in: memberships.map((membership) => membership.userId) },
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: 'insensitive' } },
              { email: { contains: query, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    select: { id: true, email: true, name: true, department: true, team: true, status: true, lastLoginAt: true },
  });
  const userIndex = new Map(users.map((user) => [user.id, user]));

  return memberships
    .filter((membership) => userIndex.has(membership.userId))
    .map((membership) => ({ ...membership, user: userIndex.get(membership.userId)! }));
}

/**
 * docs/10-admin.md §2 — changing a role revokes every session that person holds
 * (docs/03 §4), and the last TENANT_ADMIN cannot be removed or demoted.
 */
export async function changeRole(tenantId: string, userId: string, role: Role, actor: AdminActor) {
  await withSystemScope('change membership role', async (db) => {
    const current = await db.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
      select: { role: true },
    });
    if (!current) throw new AppError('NOT_FOUND');

    if (current.role === 'TENANT_ADMIN' && role !== 'TENANT_ADMIN') {
      const admins = await db.membership.count({ where: { tenantId, role: 'TENANT_ADMIN', status: 'ACTIVE' } });
      if (admins <= 1) throw new AppError('CONFLICT', 'The last tenant admin cannot be demoted');
    }

    await db.membership.update({ where: { userId_tenantId: { userId, tenantId } }, data: { role } });
  });

  await revokeAllSessions(userId, 'role_changed');

  const [target, brand, supportEmail] = await Promise.all([
    globalDb.user.findUnique({ where: { id: userId }, select: { email: true } }),
    resolveBrand({ tenantId }),
    getSetting('support.email', { tenantId }),
  ]);

  if (target) {
    const notice = renderSecurityNotice(
      brand,
      'Your access level changed',
      `Your role in ${brand.appName} is now ${role.replace('_', ' ').toLowerCase()}. You have been signed out of all devices.`,
      (supportEmail as string) || 'support@mixweek.app',
    );
    await sendMail({ to: target.email, tenantId, ...notice });
  }

  await auditLog({
    tenantId,
    actorId: actor.userId,
    actorEmail: actor.email,
    actorRole: actor.role,
    action: 'user.role_change',
    entityType: 'User',
    entityId: userId,
    diff: { role },
  });
}
