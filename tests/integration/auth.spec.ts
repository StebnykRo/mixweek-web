import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, globalDb } from '@/lib/db/client';
import { mailOutbox } from '@/lib/mail';
import { startAuth, completeLogin } from '@/modules/auth/service';
import { consumeCode, consumeLinkToken, issueLoginTokens, purgeExpiredTokens } from '@/modules/auth/tokens';
import {
  createSession,
  listSessions,
  markMfaSatisfied,
  readSession,
  revokeAllSessions,
  revokeSession,
  rotateSessionToken,
  sessionLifetimes,
  MAX_SESSIONS_PER_USER,
} from '@/modules/auth/session';
import {
  beginTotpSetup,
  confirmTotpSetup,
  consumeRecoveryCode,
  generateRecoveryCodes,
  hasConfirmedTotp,
  verifyTotpCode,
} from '@/modules/auth/totp';
import { adminDb, createTenantFixture, resetDatabase, type TenantFixture } from '../fixtures';

/** docs/03-auth.md §11 — the tests this module is required to have. */

let fixture: TenantFixture;

beforeEach(async () => {
  await resetDatabase();
  mailOutbox.clear();
  fixture = await createTenantFixture({ slug: 'auth', userCount: 1 });
});

afterAll(async () => {
  await resetDatabase();
  await adminDb.$disconnect();
  await prisma.$disconnect();
});

function codeFromLastMail(): string {
  const mail = mailOutbox.last();
  return /Code: (\d{6})/.exec(mail?.text ?? '')?.[1] ?? '';
}

describe('no user enumeration', () => {
  it('answers identically for a known and an unknown address', async () => {
    const known = await startAuth({
      email: fixture.users[0]!.email,
      ip: '203.0.113.1',
      userAgent: 'test',
      binding: 'b1',
      deviceHint: 'test',
    });
    const unknown = await startAuth({
      email: `nobody@${fixture.domain}`,
      ip: '203.0.113.1',
      userAgent: 'test',
      binding: 'b1',
      deviceHint: 'test',
    });

    expect(known.ok).toBe(true);
    expect(unknown.ok).toBe(true);
    // The brand is public for a verified domain, so both carry the same one.
    expect(known.brand?.id).toBe(unknown.brand?.id);
  });

  it('answers identically for a domain that is not registered at all', async () => {
    const result = await startAuth({
      email: 'someone@not-registered.example',
      ip: '203.0.113.1',
      userAgent: 'test',
      binding: 'b1',
      deviceHint: 'test',
    });
    expect(result.ok).toBe(true);
    expect(result.brand).not.toBeNull();
  });

  it('takes at least the floor response time in every case', async () => {
    const started = Date.now();
    await startAuth({
      email: 'someone@not-registered.example',
      ip: '203.0.113.9',
      userAgent: 'test',
      binding: 'b1',
      deviceHint: 'test',
    });
    expect(Date.now() - started).toBeGreaterThanOrEqual(395);
  });

  it('sends no email for an unknown domain, and records the attempt', async () => {
    mailOutbox.clear();
    const before = await globalDb.loginAttempt.count({ where: { reason: 'domain_not_allowed' } });

    await startAuth({
      email: 'someone@not-registered.example',
      ip: '203.0.113.2',
      userAgent: 'test',
      binding: 'b1',
      deviceHint: 'test',
    });

    expect(mailOutbox.all()).toHaveLength(0);
    // Counted as a delta: LoginAttempt is not tenant-scoped, so other specs
    // sharing this database contribute rows too.
    expect(await globalDb.loginAttempt.count({ where: { reason: 'domain_not_allowed' } })).toBe(before + 1);
  });

  it('does send an email for a registered domain', async () => {
    await startAuth({
      email: `newcomer@${fixture.domain}`,
      ip: '203.0.113.3',
      userAgent: 'test',
      binding: 'b1',
      deviceHint: 'test',
    });
    expect(mailOutbox.find(`newcomer@${fixture.domain}`)).not.toBeNull();
    expect(codeFromLastMail()).toMatch(/^\d{6}$/);
  });
});

describe('one-time codes', () => {
  it('accepts the right code exactly once', async () => {
    const email = fixture.users[0]!.email;
    await startAuth({ email, ip: null, userAgent: null, binding: 'browser-1', deviceHint: 'test' });
    const code = codeFromLastMail();

    const first = await consumeCode(email, code, 'browser-1');
    expect(first.ok).toBe(true);

    const second = await consumeCode(email, code, 'browser-1');
    expect(second.ok).toBe(false);
  });

  it('rejects a wrong code and burns the token after five attempts', async () => {
    const email = fixture.users[0]!.email;
    await startAuth({ email, ip: null, userAgent: null, binding: 'browser-1', deviceHint: 'test' });
    const code = codeFromLastMail();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await consumeCode(email, '000000', 'browser-1');
      expect(result.ok).toBe(false);
    }

    // The real code no longer works: the token was spent on the failures.
    expect((await consumeCode(email, code, 'browser-1')).ok).toBe(false);
  });

  it('rejects an expired token', async () => {
    const email = fixture.users[0]!.email;
    const issued = await issueLoginTokens(email, 'browser-1', { tenantId: fixture.tenantId });
    await globalDb.verificationToken.update({
      where: { id: issued.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    expect((await consumeCode(email, issued.code, 'browser-1')).ok).toBe(false);
    expect((await consumeLinkToken(issued.linkToken, 'browser-1')).ok).toBe(false);
  });

  it('flags a magic link opened in a different browser instead of signing in', async () => {
    const email = fixture.users[0]!.email;
    const issued = await issueLoginTokens(email, 'browser-1', { tenantId: fixture.tenantId });

    const elsewhere = await consumeLinkToken(issued.linkToken, 'browser-2');
    expect(elsewhere.ok).toBe(true);
    // Not signed in: the caller has to fall back to typing the code.
    expect(elsewhere.ok && elsewhere.bindingMatched).toBe(false);

    // And the token is still live for the original tab.
    const original = await consumeLinkToken(issued.linkToken, 'browser-1');
    expect(original.ok && original.bindingMatched).toBe(true);
  });

  it('replaces a pending token when a new one is requested', async () => {
    const email = fixture.users[0]!.email;
    const first = await issueLoginTokens(email, 'browser-1', { tenantId: fixture.tenantId });
    await issueLoginTokens(email, 'browser-1', { tenantId: fixture.tenantId });

    expect((await consumeCode(email, first.code, 'browser-1')).ok).toBe(false);
  });

  it('does not let a token from one tenant sign in to another', async () => {
    const other = await createTenantFixture({ slug: 'authb', userCount: 1 });
    const email = fixture.users[0]!.email;
    const issued = await issueLoginTokens(email, 'browser-1', { tenantId: fixture.tenantId });

    const consumed = await consumeCode(email, issued.code, 'browser-1');
    expect(consumed.ok).toBe(true);
    // The tenant travels in the token, not in the request.
    expect(consumed.ok && consumed.metadata.tenantId).toBe(fixture.tenantId);
    expect(consumed.ok && consumed.metadata.tenantId).not.toBe(other.tenantId);
  });

  it('purges tokens that lapsed more than a day ago', async () => {
    const issued = await issueLoginTokens('old@example.test', null, {});
    await globalDb.verificationToken.update({
      where: { id: issued.id },
      data: { expiresAt: new Date(Date.now() - 48 * 3600_000) },
    });
    expect(await purgeExpiredTokens()).toBeGreaterThanOrEqual(1);
  });
});

describe('login pipeline', () => {
  it('creates the user and membership on first sign-in', async () => {
    const email = `fresh@${fixture.domain}`;
    const result = await completeLogin({
      email,
      metadata: { tenantId: fixture.tenantId },
      ip: '203.0.113.5',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120',
    });

    expect(result.isFirstLogin).toBe(true);
    expect(result.role).toBe('PARTICIPANT');
    // REQUIRED_STAFF is the default, so a participant is not asked for a second factor.
    expect(result.mfaRequired).toBe(false);

    const user = await globalDb.user.findUnique({ where: { email } });
    expect(user?.status).toBe('ACTIVE');
  });

  it('requires a second factor for staff under REQUIRED_STAFF', async () => {
    const staff = await createTenantFixture({ slug: 'staff', userCount: 1, role: 'EVENT_MANAGER' });
    const result = await completeLogin({
      email: staff.users[0]!.email,
      metadata: { tenantId: staff.tenantId },
      ip: null,
      userAgent: null,
    });
    expect(result.mfaRequired).toBe(true);
    expect(result.mfaSatisfied).toBe(false);
  });

  it('writes an audit entry and a successful login attempt', async () => {
    await completeLogin({
      email: fixture.users[0]!.email,
      metadata: { tenantId: fixture.tenantId },
      ip: '203.0.113.6',
      userAgent: null,
    });

    expect(await adminDb.auditLog.count({ where: { action: 'auth.login', tenantId: fixture.tenantId } })).toBe(1);
    expect(await globalDb.loginAttempt.count({ where: { success: true, tenantId: fixture.tenantId } })).toBe(1);
  });

  it('notifies by email on a sign-in from a device not seen before', async () => {
    mailOutbox.clear();
    await completeLogin({
      email: fixture.users[0]!.email,
      metadata: { tenantId: fixture.tenantId },
      ip: null,
      userAgent: 'Mozilla/5.0 (iPhone) Safari/605',
    });
    expect(mailOutbox.all().some((mail) => mail.subject.includes('New sign-in'))).toBe(true);
  });
});

describe('sessions', () => {
  it('stores only the hash of the token', async () => {
    const { token, sessionId } = await createSession({
      userId: fixture.users[0]!.id,
      tenantId: fixture.tenantId,
      role: 'PARTICIPANT',
      mfaSatisfied: true,
    });

    const row = await globalDb.session.findUnique({ where: { id: sessionId } });
    expect(row?.tokenHash).not.toBe(token);
    expect(row?.tokenHash).toHaveLength(64);
  });

  it('resolves a live session and refuses a revoked one', async () => {
    const { token, sessionId } = await createSession({
      userId: fixture.users[0]!.id,
      tenantId: fixture.tenantId,
      role: 'PARTICIPANT',
      mfaSatisfied: true,
    });

    expect(await readSession(token)).not.toBeNull();
    await revokeSession(sessionId, 'test');
    expect(await readSession(token)).toBeNull();
  });

  it('invalidates the old token when the session token rotates', async () => {
    const { token, sessionId } = await createSession({
      userId: fixture.users[0]!.id,
      tenantId: fixture.tenantId,
      role: 'PARTICIPANT',
      mfaSatisfied: false,
    });

    await markMfaSatisfied(sessionId);
    const rotated = await rotateSessionToken(sessionId);

    expect(await readSession(token)).toBeNull();
    const session = await readSession(rotated);
    expect(session?.mfaSatisfied).toBe(true);
  });

  it('gives staff a much shorter session than a participant', () => {
    expect(sessionLifetimes('EVENT_MANAGER').rolling).toBeLessThan(sessionLifetimes('PARTICIPANT').rolling);
    expect(sessionLifetimes('TENANT_ADMIN').absolute).toBe(24 * 60 * 60 * 1000);
  });

  it('refuses an expired session', async () => {
    const { token, sessionId } = await createSession({
      userId: fixture.users[0]!.id,
      tenantId: fixture.tenantId,
      role: 'PARTICIPANT',
      mfaSatisfied: true,
    });
    await globalDb.session.update({ where: { id: sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await readSession(token)).toBeNull();
  });

  it('caps the number of live sessions per person', async () => {
    const userId = fixture.users[0]!.id;
    for (let index = 0; index < MAX_SESSIONS_PER_USER + 4; index += 1) {
      await createSession({ userId, tenantId: fixture.tenantId, role: 'PARTICIPANT', mfaSatisfied: true });
    }
    expect((await listSessions(userId)).length).toBeLessThanOrEqual(MAX_SESSIONS_PER_USER);
  });

  it('ends every session at once, which is what a role change relies on', async () => {
    const userId = fixture.users[0]!.id;
    const first = await createSession({ userId, tenantId: fixture.tenantId, role: 'PARTICIPANT', mfaSatisfied: true });
    const second = await createSession({ userId, tenantId: fixture.tenantId, role: 'PARTICIPANT', mfaSatisfied: true });

    await revokeAllSessions(userId, 'role_changed');

    expect(await readSession(first.token)).toBeNull();
    expect(await readSession(second.token)).toBeNull();
  });

  it('drops the session when the membership is suspended', async () => {
    const { token } = await createSession({
      userId: fixture.users[0]!.id,
      tenantId: fixture.tenantId,
      role: 'PARTICIPANT',
      mfaSatisfied: true,
    });

    await adminDb.membership.updateMany({
      where: { userId: fixture.users[0]!.id, tenantId: fixture.tenantId },
      data: { status: 'SUSPENDED' },
    });

    expect(await readSession(token)).toBeNull();
  });
});

describe('second factor', () => {
  it('enrols, confirms and then verifies', async () => {
    const { TOTP, Secret } = await import('otpauth');
    const userId = fixture.users[0]!.id;

    const setup = await beginTotpSetup(userId, fixture.users[0]!.email);
    expect(await hasConfirmedTotp(userId)).toBe(false);

    const totp = new TOTP({ secret: Secret.fromBase32(setup.secret) });
    expect(await confirmTotpSetup(userId, setup.factorId, totp.generate())).toBe(true);
    expect(await hasConfirmedTotp(userId)).toBe(true);
    expect(await verifyTotpCode(userId, totp.generate())).toBe(true);
    expect(await verifyTotpCode(userId, '000000')).toBe(false);
  });

  it('never stores the shared secret in plaintext', async () => {
    const userId = fixture.users[0]!.id;
    const setup = await beginTotpSetup(userId, fixture.users[0]!.email);

    const factor = await globalDb.authFactor.findUnique({ where: { id: setup.factorId } });
    const stored = Buffer.from(factor!.secretEnc!).toString('utf8');
    expect(stored).not.toContain(setup.secret);
  });

  it('spends a recovery code exactly once', async () => {
    const userId = fixture.users[0]!.id;
    const codes = await generateRecoveryCodes(userId);
    expect(codes).toHaveLength(10);

    expect(await consumeRecoveryCode(userId, codes[0]!)).toBe(true);
    expect(await consumeRecoveryCode(userId, codes[0]!)).toBe(false);
    expect(await consumeRecoveryCode(userId, codes[1]!)).toBe(true);
  });

  it('stores recovery codes only as hashes', async () => {
    const userId = fixture.users[0]!.id;
    const codes = await generateRecoveryCodes(userId);
    const stored = await globalDb.recoveryCode.findMany({ where: { userId }, select: { codeHash: true } });
    for (const row of stored) expect(codes).not.toContain(row.codeHash);
  });
});
