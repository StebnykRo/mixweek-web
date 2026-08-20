import { describe, expect, it } from 'vitest';
import { GLOBAL_MODELS, isTenantScoped, NULLABLE_TENANT_MODELS, TENANT_SCOPED_MODELS } from '@/lib/db/models';
import { emailDomain, normaliseEmail } from '@/modules/tenancy/service';
import { matchesVisibility, registrationGate, type Viewer } from '@/modules/events/service';
import { redactDiff } from '@/lib/audit';
import { maskEmail } from '@/lib/logger';

/** docs/02-data-model.md §4.1 — the canonical list, and the rules built on it. */

describe('tenant-scoped model list', () => {
  it('matches the canonical list in docs/02 §4.1', () => {
    expect(TENANT_SCOPED_MODELS).toHaveLength(35);
    for (const model of ['Event', 'Activity', 'EventRegistration', 'MediaLink', 'Order', 'AuditLog']) {
      expect(isTenantScoped(model)).toBe(true);
    }
  });

  it('excludes the models a person can hold across tenants', () => {
    for (const model of GLOBAL_MODELS) expect(isTenantScoped(model)).toBe(false);
  });

  it('marks exactly the three models that also hold platform-level rows', () => {
    expect([...NULLABLE_TENANT_MODELS].sort()).toEqual(['AuditLog', 'FeatureFlag', 'SecretSetting']);
  });

  it('rejects an unknown model name', () => {
    expect(isTenantScoped('NotARealModel')).toBe(false);
    expect(isTenantScoped(undefined)).toBe(false);
  });
});

describe('email normalisation', () => {
  it('lowercases and trims', () => {
    expect(normaliseEmail('  Anna.Admin@SoftSwiss.COM ')).toBe('anna.admin@softswiss.com');
  });

  it('extracts the domain, which is what resolves the tenant', () => {
    expect(emailDomain('anna@softswiss.com')).toBe('softswiss.com');
    expect(emailDomain('anna@sub.softswiss.com')).toBe('sub.softswiss.com');
    expect(emailDomain('not-an-email')).toBe('');
  });

  it('uses the last @ so a local part containing one cannot spoof the domain', () => {
    expect(emailDomain('"weird@name"@softswiss.com')).toBe('softswiss.com');
  });
});

describe('event visibility', () => {
  const viewer: Viewer = {
    userId: 'user-1',
    tenantId: 'tenant-a',
    role: 'PARTICIPANT',
    department: 'Engineering',
    team: 'Core',
  };

  it('shows a TENANT event to any member', () => {
    expect(matchesVisibility({ id: 'e1', visibility: 'TENANT', audienceRules: null }, viewer, new Set())).toBe(true);
  });

  it('hides a TENANT event from a guest', () => {
    expect(
      matchesVisibility({ id: 'e1', visibility: 'TENANT', audienceRules: null }, { ...viewer, role: 'GUEST' }, new Set()),
    ).toBe(false);
  });

  it('shows an INVITE_ONLY event only to someone actually invited', () => {
    const event = { id: 'e1', visibility: 'INVITE_ONLY', audienceRules: null };
    expect(matchesVisibility(event, viewer, new Set())).toBe(false);
    expect(matchesVisibility(event, viewer, new Set(['e1']))).toBe(true);
  });

  it('matches a GROUP event by department, team, role or explicit id', () => {
    expect(
      matchesVisibility({ id: 'e1', visibility: 'GROUP', audienceRules: { departments: ['Engineering'] } }, viewer, new Set()),
    ).toBe(true);
    expect(
      matchesVisibility({ id: 'e1', visibility: 'GROUP', audienceRules: { teams: ['Core'] } }, viewer, new Set()),
    ).toBe(true);
    expect(
      matchesVisibility({ id: 'e1', visibility: 'GROUP', audienceRules: { userIds: ['user-1'] } }, viewer, new Set()),
    ).toBe(true);
    expect(
      matchesVisibility({ id: 'e1', visibility: 'GROUP', audienceRules: { departments: ['Finance'] } }, viewer, new Set()),
    ).toBe(false);
  });

  it('hides a GROUP event with no matching rule at all', () => {
    expect(matchesVisibility({ id: 'e1', visibility: 'GROUP', audienceRules: {} }, viewer, new Set())).toBe(false);
  });
});

describe('registrationGate', () => {
  const now = new Date('2026-10-01T12:00:00Z');
  const open = {
    status: 'PUBLISHED',
    registrationEnabled: true,
    registrationOpensAt: null,
    registrationClosesAt: null,
    capacity: null,
    waitlistEnabled: true,
  };

  it('is open for a published, upcoming event inside its window', () => {
    expect(registrationGate(open, 'upcoming', 0, now)).toEqual({ open: true, reason: null });
  });

  it('is closed for a draft', () => {
    expect(registrationGate({ ...open, status: 'DRAFT' }, 'upcoming', 0, now).reason).toBe('EVENT_NOT_PUBLISHED');
  });

  it('is closed once the event has ended', () => {
    expect(registrationGate(open, 'past', 0, now).reason).toBe('EVENT_ENDED');
  });

  it('is closed before the window opens and after it shuts', () => {
    expect(
      registrationGate({ ...open, registrationOpensAt: new Date('2026-10-02T00:00:00Z') }, 'upcoming', 0, now).reason,
    ).toBe('REGISTRATION_NOT_OPEN');
    expect(
      registrationGate({ ...open, registrationClosesAt: new Date('2026-09-30T00:00:00Z') }, 'upcoming', 0, now).reason,
    ).toBe('REGISTRATION_CLOSED');
  });

  it('stays open at capacity when there is a waiting list', () => {
    expect(registrationGate({ ...open, capacity: 10 }, 'upcoming', 10, now).open).toBe(true);
  });

  it('closes at capacity when there is not', () => {
    expect(registrationGate({ ...open, capacity: 10, waitlistEnabled: false }, 'upcoming', 10, now).reason).toBe(
      'EVENT_FULL',
    );
  });
});

describe('log and audit redaction', () => {
  it('masks an email down to its first letter and domain', () => {
    expect(maskEmail('anna.admin@softswiss.com')).toBe('a***@softswiss.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });

  it('replaces sensitive fields in an audit diff', () => {
    const diff = redactDiff({
      title: 'Gala',
      tokenHash: 'abc',
      answers: { dietary: 'vegan' },
      nested: { ciphertext: 'xyz', keep: 1 },
    }) as Record<string, unknown>;

    expect(diff.title).toBe('Gala');
    expect(diff.tokenHash).toBe('[redacted]');
    expect(diff.answers).toBe('[redacted]');
    expect((diff.nested as Record<string, unknown>).ciphertext).toBe('[redacted]');
    expect((diff.nested as Record<string, unknown>).keep).toBe(1);
  });

  it('truncates a very long string rather than storing it whole', () => {
    const diff = redactDiff({ note: 'x'.repeat(1000) }) as { note: string };
    expect(diff.note.length).toBeLessThanOrEqual(501);
    expect(diff.note.endsWith('…')).toBe(true);
  });
});
