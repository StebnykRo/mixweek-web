import { getSecret } from './crypto/secrets';
import { getSetting } from '@/modules/tenancy/settings';
import { logger, maskEmail } from './logger';
import { isHardenedEnv } from './app-env';

/**
 * docs/11-notifications.md §7 — transactional email.
 *
 * Transport resolution: a tenant (or platform) Resend key if one is configured,
 * otherwise the console transport. Nothing here reads process.env for a secret;
 * everything comes from SecretSetting through getSecret().
 */

export type MailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
  tenantId?: string | null;
};

export type MailResult = { delivered: boolean; transport: 'resend' | 'console' };

/** Captures sent mail in tests and local development, so flows are verifiable. */
const outbox: MailMessage[] = [];
export const mailOutbox = {
  all: () => [...outbox],
  last: () => outbox[outbox.length - 1] ?? null,
  find: (to: string) => [...outbox].reverse().find((m) => m.to.toLowerCase() === to.toLowerCase()) ?? null,
  clear: () => {
    outbox.length = 0;
  },
};

/**
 * The development file drop. One JSON file per message under `.mail/`, which is
 * git-ignored. Never reached in production or staging (see app-env.ts).
 */
async function writeToOutboxFile(message: MailMessage): Promise<void> {
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const dir = `${process.cwd()}/.mail`;
    await mkdir(dir, { recursive: true });
    const name = `${Date.now()}-${message.to.replace(/[^a-z0-9]/gi, '_')}.json`;
    await writeFile(`${dir}/${name}`, JSON.stringify(message, null, 2), 'utf8');
  } catch {
    // A failed debug write must never affect the request.
  }
}

export async function sendMail(message: MailMessage): Promise<MailResult> {
  outbox.push(message);
  if (outbox.length > 500) outbox.splice(0, outbox.length - 500);

  const apiKey = await getSecret('mail.resend_api_key', { tenantId: message.tenantId ?? null });
  const fromName = (await getSetting('mail.from_name', { tenantId: message.tenantId ?? null })) as string;
  const fromEmail = (await getSetting('mail.from_email', { tenantId: message.tenantId ?? null })) as string;

  if (!apiKey) {
    // No transport configured: fall back to the file drop so local development
    // and end-to-end tests can read what would have been sent. Never in
    // production — docs/12 §9 forbids codes and links leaving the process.
    logger.info({ emailMasked: maskEmail(message.to), kind: 'mail.console' }, 'mail-not-sent-no-transport');
    if (!isHardenedEnv()) await writeToOutboxFile(message);
    return { delivered: false, transport: 'console' };
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      logger.warn({ status: response.status, kind: 'mail.resend' }, 'mail-send-failed');
      return { delivered: false, transport: 'resend' };
    }
    return { delivered: true, transport: 'resend' };
  } catch (error) {
    logger.warn({ reason: (error as Error).message, kind: 'mail.resend' }, 'mail-send-error');
    return { delivered: false, transport: 'resend' };
  }
}
