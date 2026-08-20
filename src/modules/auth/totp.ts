import * as OTPAuth from 'otpauth';
import { globalDb } from '@/lib/db/client';
import { buildAad, open, seal } from '@/lib/crypto/envelope';
import { hashSecretValue, randomBase32Code, verifySecretValue } from '@/lib/crypto/hash';

/**
 * docs/03-auth.md §2 step 3 — TOTP as the second factor. The shared secret is
 * stored with envelope encryption (docs/12 §2.3), never as plaintext base32.
 */

const ISSUER = 'Mix Week';
const RECOVERY_CODE_COUNT = 10;
const WINDOW = 1; // ±30 s, tolerates ordinary clock drift.

function aadFor(userId: string, factorId: string): Buffer {
  return buildAad(userId, `totp:${factorId}`, 1);
}

export type TotpSetup = {
  factorId: string;
  secret: string;
  otpauthUrl: string;
};

export async function beginTotpSetup(userId: string, accountLabel: string): Promise<TotpSetup> {
  // Any unconfirmed factor is replaced — a half-finished setup must not linger.
  await globalDb.authFactor.deleteMany({ where: { userId, type: 'TOTP', confirmedAt: null } });

  const secret = new OTPAuth.Secret({ size: 20 });
  const factor = await globalDb.authFactor.create({
    data: { userId, type: 'TOTP', label: accountLabel },
    select: { id: true },
  });

  const sealed = seal(secret.base32, aadFor(userId, factor.id));
  await globalDb.authFactor.update({
    where: { id: factor.id },
    data: {
      secretEnc: sealed.ciphertext,
      iv: sealed.iv,
      authTag: sealed.authTag,
      wrappedKey: sealed.wrappedKey,
    },
  });

  const totp = new OTPAuth.TOTP({ issuer: ISSUER, label: accountLabel, secret });
  return { factorId: factor.id, secret: secret.base32, otpauthUrl: totp.toString() };
}

async function readSecret(userId: string, factorId: string): Promise<OTPAuth.Secret | null> {
  const factor = await globalDb.authFactor.findFirst({
    where: { id: factorId, userId, type: 'TOTP' },
    select: { secretEnc: true, iv: true, authTag: true, wrappedKey: true },
  });
  if (!factor?.secretEnc || !factor.iv || !factor.authTag || !factor.wrappedKey) return null;
  const base32 = open(
    {
      ciphertext: factor.secretEnc,
      iv: factor.iv,
      authTag: factor.authTag,
      wrappedKey: factor.wrappedKey,
      keyVersion: 1,
    },
    aadFor(userId, factorId),
  );
  return OTPAuth.Secret.fromBase32(base32);
}

export async function verifyTotpCode(userId: string, code: string): Promise<boolean> {
  const factors = await globalDb.authFactor.findMany({
    where: { userId, type: 'TOTP', confirmedAt: { not: null } },
    select: { id: true, label: true },
  });
  for (const factor of factors) {
    const secret = await readSecret(userId, factor.id);
    if (!secret) continue;
    const totp = new OTPAuth.TOTP({ issuer: ISSUER, label: factor.label ?? 'account', secret });
    if (totp.validate({ token: code, window: WINDOW }) !== null) {
      await globalDb.authFactor.update({ where: { id: factor.id }, data: { lastUsedAt: new Date() } });
      return true;
    }
  }
  return false;
}

export async function confirmTotpSetup(userId: string, factorId: string, code: string): Promise<boolean> {
  const secret = await readSecret(userId, factorId);
  if (!secret) return false;
  const totp = new OTPAuth.TOTP({ issuer: ISSUER, secret });
  if (totp.validate({ token: code, window: WINDOW }) === null) return false;
  await globalDb.authFactor.update({
    where: { id: factorId },
    data: { confirmedAt: new Date(), lastUsedAt: new Date() },
  });
  return true;
}

export async function hasConfirmedTotp(userId: string): Promise<boolean> {
  const count = await globalDb.authFactor.count({
    where: { userId, type: 'TOTP', confirmedAt: { not: null } },
  });
  return count > 0;
}

export async function resetTotp(userId: string): Promise<void> {
  await globalDb.authFactor.deleteMany({ where: { userId, type: 'TOTP' } });
  await globalDb.recoveryCode.deleteMany({ where: { userId } });
}

/** Ten single-use recovery codes, stored only as memory-hard hashes. */
export async function generateRecoveryCodes(userId: string): Promise<string[]> {
  await globalDb.recoveryCode.deleteMany({ where: { userId } });
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i += 1) {
    codes.push(`${randomBase32Code(5)}-${randomBase32Code(5)}`);
  }
  const hashes = await Promise.all(codes.map((code) => hashSecretValue(code)));
  await globalDb.recoveryCode.createMany({
    data: hashes.map((codeHash) => ({ userId, codeHash })),
  });
  return codes;
}

export async function consumeRecoveryCode(userId: string, code: string): Promise<boolean> {
  const candidates = await globalDb.recoveryCode.findMany({
    where: { userId, usedAt: null },
    select: { id: true, codeHash: true },
  });
  for (const candidate of candidates) {
    if (await verifySecretValue(candidate.codeHash, code.trim().toUpperCase())) {
      await globalDb.recoveryCode.update({ where: { id: candidate.id }, data: { usedAt: new Date() } });
      return true;
    }
  }
  return false;
}

export async function countRemainingRecoveryCodes(userId: string): Promise<number> {
  return globalDb.recoveryCode.count({ where: { userId, usedAt: null } });
}
