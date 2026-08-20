import { describe, expect, it } from 'vitest';
import type { Role } from '@prisma/client';
import {
  can,
  hasPermission,
  isStaffRole,
  PERMISSIONS,
  requiresStepUp,
  SECTIONS,
  stepUpSatisfied,
  STEP_UP_MAX_AGE_MS,
  type SessionLike,
} from '@/modules/auth/policies';

/** docs/14-qa.md §2.2 and docs/10 §2 — the permission matrix, exactly as written. */

const TENANT = 'tenant-a';

function session(overrides: Partial<SessionLike> = {}): SessionLike {
  return {
    userId: 'user-1',
    tenantId: TENANT,
    role: 'TENANT_ADMIN',
    mfaSatisfied: true,
    stepUpAt: new Date(),
    ...overrides,
  };
}

describe('deny by default', () => {
  it('gives a participant nothing in the admin panel', () => {
    for (const section of SECTIONS) {
      expect(hasPermission('PARTICIPANT', `${section}:read`)).toBe(false);
      expect(hasPermission('PARTICIPANT', `${section}:write`)).toBe(false);
    }
  });

  it('treats a guest exactly like a participant', () => {
    expect(PERMISSIONS.GUEST).toEqual(PERMISSIONS.PARTICIPANT);
  });

  it('refuses when there is no session at all', () => {
    expect(can(null, 'event:read')).toBe(false);
  });
});

describe('the matrix from docs/10 §2', () => {
  const cases: Array<[Role, string, boolean]> = [
    ['SUPPORT', 'event:read', true],
    ['SUPPORT', 'event:write', false],
    ['SUPPORT', 'notification:write', false],
    ['SUPPORT', 'secret:read', false],
    ['CONTENT_EDITOR', 'programme:write', true],
    ['CONTENT_EDITOR', 'registration:read', false],
    ['CONTENT_EDITOR', 'notification:write', false],
    ['EVENT_MANAGER', 'registration:write', true],
    ['EVENT_MANAGER', 'notification:write', true],
    ['EVENT_MANAGER', 'user:write', false],
    ['EVENT_MANAGER', 'brand:write', false],
    ['EVENT_MANAGER', 'secret:write', false],
    ['TENANT_ADMIN', 'brand:publish', true],
    ['TENANT_ADMIN', 'user:write', true],
    ['TENANT_ADMIN', 'secret:write', true],
    ['TENANT_ADMIN', 'tenant:write', false],
    ['SUPER_ADMIN', 'tenant:write', true],
    ['SUPER_ADMIN', 'platform_health:read', true],
  ];

  it.each(cases)('%s %s → %s', (role, action, expected) => {
    expect(hasPermission(role, action as never)).toBe(expected);
  });

  it('never grants a tenant admin platform health', () => {
    expect(hasPermission('TENANT_ADMIN', 'platform_health:read')).toBe(false);
  });
});

describe('mfa gate', () => {
  it('refuses everything until the second factor is satisfied', () => {
    expect(can(session({ mfaSatisfied: false }), 'event:read')).toBe(false);
  });
});

describe('tenant boundary', () => {
  it('refuses a resource belonging to another tenant', () => {
    expect(can(session(), 'event:read', { tenantId: 'tenant-b' })).toBe(false);
  });

  it('allows a resource in the session tenant', () => {
    expect(can(session(), 'event:read', { tenantId: TENANT })).toBe(true);
  });

  it('lets a super admin cross tenants — the audit trail is the control there', () => {
    expect(can(session({ role: 'SUPER_ADMIN' }), 'event:read', { tenantId: 'tenant-b' })).toBe(true);
  });
});

describe('step-up', () => {
  it('marks the actions listed in docs/03 §5', () => {
    expect(requiresStepUp('event:publish')).toBe(true);
    expect(requiresStepUp('brand:publish')).toBe(true);
    expect(requiresStepUp('secret:write')).toBe(true);
    expect(requiresStepUp('registration.export:write')).toBe(true);
    expect(requiresStepUp('event:read')).toBe(false);
  });

  it('accepts a confirmation inside the 15-minute window', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    const recent = new Date(now.getTime() - STEP_UP_MAX_AGE_MS + 1000);
    expect(stepUpSatisfied(session({ stepUpAt: recent }), now)).toBe(true);
  });

  it('rejects one that has expired', () => {
    const now = new Date('2026-10-21T12:00:00Z');
    expect(stepUpSatisfied(session({ stepUpAt: new Date(now.getTime() - STEP_UP_MAX_AGE_MS - 1000) }), now)).toBe(false);
    // can() reads the wall clock, so this one is expressed relative to it.
    const staleForNow = new Date(Date.now() - STEP_UP_MAX_AGE_MS - 1000);
    expect(can(session({ stepUpAt: staleForNow }), 'event:publish')).toBe(false);
  });

  it('rejects one that never happened', () => {
    expect(stepUpSatisfied(session({ stepUpAt: null }))).toBe(false);
  });

  it('does not block an ordinary action when step-up has lapsed', () => {
    const stale = new Date(Date.now() - STEP_UP_MAX_AGE_MS - 1000);
    expect(can(session({ stepUpAt: stale }), 'event:read')).toBe(true);
  });
});

describe('isStaffRole', () => {
  it('separates staff from participants, which is what REQUIRED_STAFF keys off', () => {
    expect(isStaffRole('SUPPORT')).toBe(true);
    expect(isStaffRole('SUPER_ADMIN')).toBe(true);
    expect(isStaffRole('PARTICIPANT')).toBe(false);
    expect(isStaffRole('GUEST')).toBe(false);
    expect(isStaffRole(null)).toBe(false);
  });
});
