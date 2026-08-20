import { createInterface } from 'node:readline/promises';
import { PrismaClient } from '@prisma/client';

/**
 * `pnpm ops:rotate-secret --key=<key> [--tenant=<id>]`
 *
 * docs/12-security.md §13 — rotates one secret. The new value is read from
 * stdin so it never appears in the shell history or in the process list.
 */
const prisma = new PrismaClient();

async function main() {
  const key = process.argv.find((value) => value.startsWith('--key='))?.split('=')[1];
  const tenantId = process.argv.find((value) => value.startsWith('--tenant='))?.split('=')[1] ?? null;

  if (!key) {
    console.error('Usage: pnpm ops:rotate-secret --key=<key> [--tenant=<id>]');
    process.exit(1);
  }

  const rl = createInterface({ input: process.stdin, output: process.stderr });
  const value = (await rl.question(`New value for ${key}: `)).trim();
  rl.close();

  if (!value) {
    console.error('Empty value; nothing was changed.');
    process.exit(1);
  }

  const { setSecret, isSecretKey } = await import('../src/lib/crypto/secrets');
  if (!isSecretKey(key)) {
    console.error(`${key} is not in the SecretKey registry (docs/12 §2.2).`);
    process.exit(1);
  }

  await setSecret({ tenantId }, key, value, { userId: null });

  await prisma.auditLog.create({
    data: {
      tenantId,
      action: 'ops.rotate_secret',
      entityType: 'SecretSetting',
      entityId: key,
    },
  });

  console.log(`Rotated ${key}. The previous value is gone; update anything that used it.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
