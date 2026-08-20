import { PrismaClient } from '@prisma/client';
import { issueLoginTokens, MAX_TTL_MS, TOKEN_TTL_MS } from '../src/modules/auth/tokens';

/**
 * `pnpm ops:signin-link --email=a@co.com,b@co.com [--hours=12]`
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
 * that person until it expires. Send each pair over something private, and
 * prefer configuring a mail transport for anything beyond first setup.
 *
 * --email takes a comma-separated list, so a group can be prepared in one go.
 * Each address gets its own link and its own code; they are not
 * interchangeable. Note that issuing a link cancels any earlier unused one
 * for the SAME address, so a second device means signing in on the first
 * before asking for another.
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

async function issueFor(email: string, ttlMs: number, appUrl: string): Promise<boolean> {
  const domain = email.split('@')[1] ?? '';
  const mapped = await prisma.tenantDomain.findFirst({
    where: { domain, hostType: 'EMAIL' },
    select: { tenant: { select: { id: true, slug: true, status: true } } },
  });

  if (!mapped) {
    console.error(`  SKIPPED ${email} — no tenant registered for @${domain}`);
    return false;
  }
  if (mapped.tenant.status !== 'ACTIVE') {
    console.error(`  SKIPPED ${email} — tenant "${mapped.tenant.slug}" is ${mapped.tenant.status}`);
    return false;
  }

  const known = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  // completeLogin() reads tenantId back out of the token metadata and throws
  // "Login token carries no tenant" without it, so this mirrors what
  // startLogin() stores rather than merely identifying the person.
  const tokens = await issueLoginTokens(
    email,
    null,
    { tenantId: mapped.tenant.id, viaInvite: false, inviteRole: null, inviteEventId: null, issuedBy: 'ops:signin-link' },
    ttlMs,
  );

  await prisma.auditLog.create({
    data: {
      action: 'ops.signin_link',
      entityType: 'VerificationToken',
      entityId: tokens.id,
      diff: { email, tenant: mapped.tenant.slug, ttlMs },
    },
  });

  console.log('');
  console.log(`  ${email}${known ? '' : '   (new — the account is created on first sign-in)'}`);
  console.log(`  ${appUrl}/auth/verify?token=${encodeURIComponent(tokens.linkToken)}`);
  console.log(`  Code: ${tokens.code}`);
  return true;
}

async function main() {
  const emailsRaw = arg('email');
  const hoursRaw = arg('hours');
  const hours = hoursRaw === undefined ? null : Number(hoursRaw);

  const emails = (emailsRaw ?? '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  if (!emails.length || emails.some((value) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value))) {
    console.error('Usage: pnpm ops:signin-link --email=<address>[,<address>...] [--hours=12]');
    process.exit(1);
  }

  if (hours !== null && (!Number.isFinite(hours) || hours <= 0 || hours * 3_600_000 > MAX_TTL_MS)) {
    console.error(`--hours must be a positive number up to ${MAX_TTL_MS / 3_600_000}.`);
    process.exit(1);
  }
  const ttlMs = hours === null ? TOKEN_TTL_MS : hours * 3_600_000;

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    console.error('APP_URL is not set; cannot build the link.');
    process.exit(1);
  }

  const validFor =
    ttlMs >= 3_600_000 ? `${Math.round(ttlMs / 3_600_000)} hour(s)` : `${Math.round(ttlMs / 60_000)} minutes`;
  const expiresAt = new Date(Date.now() + ttlMs);

  let issued = 0;
  for (const email of emails) {
    if (await issueFor(email, ttlMs, appUrl)) issued += 1;
  }

  console.log('');
  console.log(`  ${issued} link(s), valid ${validFor} — until ${expiresAt.toISOString()}. One use each.`);
  console.log('  Send each person BOTH their link and their code; the link alone signs nobody in.');
  console.log('  Codes are not interchangeable between people.');
  console.log('');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
