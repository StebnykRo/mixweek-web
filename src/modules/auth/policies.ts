import type { Role } from '@prisma/client';

/**
 * docs/10-admin.md §2 — the permission matrix, encoded once.
 *
 * Deny by default: an action that is not listed is not permitted. The check
 * always runs on the server; hiding a button in the UI is UX, not security
 * (docs/12 §5).
 */

export type Operation = 'read' | 'write' | 'publish' | 'delete';

export const SECTIONS = [
  'dashboard',
  'event',
  'programme',
  'place',
  'content',
  'media',
  'announcement',
  'notification',
  'registration',
  'registration.export',
  'winstyle',
  'brand',
  'user',
  'invite',
  'feature_flag',
  'setting',
  'secret',
  'analytics',
  'media_report',
  'user.import',
  'translation',
  'audit',
  'tenant',
  'platform_health',
] as const;

export type Section = (typeof SECTIONS)[number];
export type Action = `${Section}:${Operation}`;

const R: Operation[] = ['read'];
const RW: Operation[] = ['read', 'write'];
const RWD: Operation[] = ['read', 'write', 'delete'];
const RWP: Operation[] = ['read', 'write', 'publish'];
const RWPD: Operation[] = ['read', 'write', 'publish', 'delete'];
const W: Operation[] = ['write'];
const NONE: Operation[] = [];

type Matrix = Record<Section, Operation[]>;

const empty = (): Matrix =>
  Object.fromEntries(SECTIONS.map((s) => [s, NONE])) as Matrix;

const SUPPORT: Matrix = {
  ...empty(),
  dashboard: R,
  event: R,
  programme: R,
  place: R,
  content: R,
  media: R,
  announcement: R,
  notification: R,
  registration: R,
  winstyle: R,
  brand: R,
  user: R,
  invite: R,
  feature_flag: R,
  setting: R,
  analytics: R,
  media_report: R,
  translation: R,
  audit: R,
};

const CONTENT_EDITOR: Matrix = {
  ...SUPPORT,
  programme: RW,
  place: RW,
  content: RW,
  media: RW,
  announcement: RW,
  notification: NONE,
  registration: NONE,
  user: NONE,
  invite: NONE,
  feature_flag: NONE,
  setting: NONE,
  translation: RW,
  audit: NONE,
};

const EVENT_MANAGER: Matrix = {
  ...SUPPORT,
  event: RW,
  programme: RWPD,
  place: RWD,
  content: RW,
  media: RWP,
  announcement: RWP,
  notification: RWP,
  registration: RW,
  'registration.export': W,
  winstyle: RW,
  invite: RW,
  media_report: RW,
  translation: RW,
  audit: R,
};

const TENANT_ADMIN: Matrix = {
  ...EVENT_MANAGER,
  event: RWPD,
  place: RWD,
  media: RWPD,
  announcement: RWPD,
  registration: RWD,
  winstyle: RWD,
  brand: RWP,
  user: RWD,
  invite: RWD,
  feature_flag: RW,
  setting: RW,
  secret: RWD,
  'user.import': W,
};

const SUPER_ADMIN: Matrix = {
  ...TENANT_ADMIN,
  tenant: RWPD,
  platform_health: R,
  audit: R,
};

const PARTICIPANT: Matrix = empty();

export const PERMISSIONS: Record<Role, Matrix> = {
  PARTICIPANT,
  GUEST: PARTICIPANT,
  SUPPORT,
  CONTENT_EDITOR,
  EVENT_MANAGER,
  TENANT_ADMIN,
  SUPER_ADMIN,
};

/**
 * docs/03-auth.md §5 — actions that require a second factor confirmed in the
 * last 15 minutes, on top of the role check.
 */
export const STEP_UP_ACTIONS = new Set<Action>([
  'event:publish',
  'event:delete',
  'brand:publish',
  'secret:read',
  'secret:write',
  'secret:delete',
  'user:write',
  'user:delete',
  'user.import:write',
  'registration.export:write',
  'notification:publish',
  'tenant:publish',
  'tenant:delete',
  'audit:write',
]);

export const STEP_UP_MAX_AGE_MS = 15 * 60 * 1000;

export type SessionLike = {
  userId: string;
  tenantId: string | null;
  role: Role | null;
  mfaSatisfied: boolean;
  stepUpAt: Date | null;
};

export type Resource = { tenantId?: string | null; eventId?: string | null };

export function hasPermission(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  const [section, operation] = action.split(':') as [Section, Operation];
  const matrix = PERMISSIONS[role];
  if (!matrix) return false;
  return (matrix[section] ?? NONE).includes(operation);
}

export function requiresStepUp(action: Action): boolean {
  return STEP_UP_ACTIONS.has(action);
}

export function stepUpSatisfied(session: SessionLike, now = new Date()): boolean {
  if (!session.stepUpAt) return false;
  return now.getTime() - session.stepUpAt.getTime() <= STEP_UP_MAX_AGE_MS;
}

/**
 * The one authorisation entry point. Objects are always checked by
 * (tenantId, id) — never by id alone (docs/12 §5).
 */
export function can(session: SessionLike | null, action: Action, resource: Resource = {}): boolean {
  if (!session) return false;
  if (!session.mfaSatisfied) return false;
  if (resource.tenantId && resource.tenantId !== session.tenantId && session.role !== 'SUPER_ADMIN') {
    return false;
  }
  if (!hasPermission(session.role, action)) return false;
  if (requiresStepUp(action) && !stepUpSatisfied(session)) return false;
  return true;
}

/** True when the role is staff — used by the REQUIRED_STAFF MFA policy. */
const STAFF_ROLES: Role[] = ['SUPPORT', 'CONTENT_EDITOR', 'EVENT_MANAGER', 'TENANT_ADMIN', 'SUPER_ADMIN'];

export function isStaffRole(role: Role | null | undefined): boolean {
  return role !== null && role !== undefined && STAFF_ROLES.includes(role);
}
