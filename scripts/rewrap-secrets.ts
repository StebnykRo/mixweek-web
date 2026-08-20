import { PrismaClient } from '@prisma/client';
import { getMasterKey, getPreviousMasterKey, rewrap } from '../src/lib/crypto/envelope';

/**
 * `pnpm secrets:rewrap`
 *
 * docs/12-security.md §2.2 — rotating APP_MASTER_KEY.
 *
 * Set APP_MASTER_KEY to the new key and APP_MASTER_KEY_PREVIOUS to the old one,
 * then run this. Only the wrapped data keys change; the ciphertexts and their
 * AAD bindings are untouched, so nothing is ever decrypted in the process.
 */
const prisma = new PrismaClient();

async function main() {
  const previous = getPreviousMasterKey();
  if (!previous) {
    console.error('APP_MASTER_KEY_PREVIOUS is not set. Point it at the old key and run again.');
    process.exit(1);
  }

  const next = getMasterKey();
  const rows = await prisma.secretSetting.findMany({ select: { id: true, key: true, wrappedKey: true } });
  const factors = await prisma.authFactor.findMany({
    where: { wrappedKey: { not: null } },
    select: { id: true, wrappedKey: true },
  });

  console.log(`Re-wrapping ${rows.length} secret(s) and ${factors.length} TOTP key(s)…`);

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      await tx.secretSetting.update({
        where: { id: row.id },
        data: { wrappedKey: rewrap(row.wrappedKey, previous, next) },
      });
    }
    for (const factor of factors) {
      if (!factor.wrappedKey) continue;
      await tx.authFactor.update({
        where: { id: factor.id },
        data: { wrappedKey: rewrap(factor.wrappedKey, previous, next) },
      });
    }
  });

  console.log('Done. Remove APP_MASTER_KEY_PREVIOUS once every instance has restarted.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
