import { PrismaClient } from '@prisma/client';
import { issueLoginTokens, MAX_TTL_MS, TOKEN_TTL_MS } from '../src/modules/auth/tokens';

/**
 * `pnpm ops:signin-link --email=someone@company.com [--hours=12]`
 *
 * Mints a one-time sign-in link out of band and prints it, for installations
 * with no mail transport configured.
 *
 * This exists because docs/12-security.md §9 forbids links and codes leaving
 * the process in production — so unlike development, there is no `.mail/`
 * file to read and nothing useful in the logs. Without a transport there
 * would otherwise be no way in at all.
 *
 * SECURITY: the output is a live credential. Anyone holding it signs in as
 * that person for the next ten minutes. Send it over something private, and
 * prefer configuring a mail transport for anything beyond first setup.
 *
 * The link is issued with no browser binding, so it works in any browser —
 * which is the point here, and also why the six-digit code is printed with
 * it. An unbound link asks for the code on arrival; that second factor is
 * what stops a leaked URL from being enough on its own.
 *
 * --hours extends the ten-minute default up to a day, so links can be
 * prepared ahead of handing them out. That is only defensible because the
 * code is still demanded: the URL by itself admits nobody, whatever its age.
 * Recipients need both halves, and both should travel privately.
 */
const prisma = new PrismaClient();

function arg(name: string): string | undefined {
  return process.argv.find((value) => value.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
}

async function main() {
  const email = arg('email')?.trim().toLowerCase();
  const hoursRaw = arg('hours');
  const hours = hoursRaw === undefined ? null : Number(hoursRaw);

  if (hours !== null && (!Number.isFinite(hours) || hours <= 0 || hours * 3_600_000 > MAX_TTL_MS)) {
    console.error(`--hours must be a positive number up to ${MAX_TTL_MS / 3_600_000}.`);
    process.exit(1);
  }
  const ttlMs = hours === null ? TOKEN_TTL_MS : hours * 3_600_000;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('Usage: pnpm ops:signin-link --email=<address>');
    process.exit(1);
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.error('APP_URL is not set; cannot build the link.');
    process.exit(1);
  }

  // The address has to belong to a tenant, or the link resolves to nothing on
  // arrival. Checking here turns a confusing dead end into a clear message.
  const domain = email.split('@')[1] ?? '';
  const mapped = await prisma.tenantDomain.findFirst({
    where: { domain, hostType: 'EMAIL' },
    select: { tenant: { select: { id: true, slug: true, status: true } } },
  });

  if (!mapped) {
    console.error(`No tenant is registered for @${domain}.`);
    console.error('Run ops:provision-tenant first, or use an address in a domain that already has one.');
    process.exit(1);
  }
  if (mapped.tenant.status !== 'ACTIVE') {
    console.error(`Tenant "${mapped.tenant.slug}" is ${mapped.tenant.status}; sign-in is refused.`);
    process.exit(1);
  }

  const known = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  // No binding: the link has to work in whatever browser the recipient opens
  // it in, since it did not start there.
  // completeLogin() reads tenantId back out of the token metadata and throws
  // "Login token carries no tenant" without it, so this has to mirror what
  // startLogin() stores — not merely enough to identify the person.
  const tokens = await issueLoginTokens(
    email,
    null,
    {
      tenantId: mapped.tenant.id,
      viaInvite: false,
      inviteRole: null,
      inviteEventId: null,
      issuedBy: 'ops:signin-link',
    },
    ttlMs,
  );
  const url = `${appUrl}/auth/verify?token=${encodeURIComponent(tokens.linkToken)}`;

  await prisma.auditLog.create({
    data: {
      action: 'ops.signin_link',
      entityType: 'VerificationToken',
      entityId: tokens.id,
      diff: { email, tenant: mapped.tenant.slug, ttlMs },
    },
  });

  const validFor =
    ttlMs >= 3_600_000 ? `${Math.round(ttlMs / 3_600_000)} hour(s)` : `${Math.round(ttlMs / 60_000)} minutes`;

  console.log('');
  console.log(`  Sign-in link for ${email} (tenant: ${mapped.tenant.slug})`);
  console.log(`  ${known ? 'Existing account.' : 'No account yet — one is created on first sign-in.'}`);
  console.log('');
  console.log(`  ${url}`);
  console.log('');
  console.log(`  Code if asked:  ${tokens.code}`);
  console.log(`  Valid for:      ${validFor}, one use (until ${tokens.expiresAt.toISOString()})`);
  console.log('  Both halves are needed — the link alone will not sign anyone in.');
  console.log('');
  console.log('  Treat this like a password. Issuing a new link cancels this one.');
  console.log('');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
