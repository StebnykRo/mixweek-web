import type { PublicBrand } from '@/modules/branding/default-brand';

/**
 * docs/03-auth.md §8 — the login email. Branded per tenant, carries both the
 * link and the code, states the TTL, and names the requesting device so an
 * unexpected mail is recognisable. No personal data beyond the address itself.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export type LoginEmailInput = {
  appUrl: string;
  linkToken: string;
  code: string;
  ttlMinutes: number;
  deviceHint: string;
  brand: PublicBrand;
  supportEmail: string;
};

export function renderLoginEmail(input: LoginEmailInput): { subject: string; html: string; text: string } {
  const url = `${input.appUrl}/auth/verify?token=${encodeURIComponent(input.linkToken)}`;
  const appName = escapeHtml(input.brand.appName);
  const primary = input.brand.tokens.colors.primary[600];
  const ink = input.brand.tokens.colors.ink;
  const surface = input.brand.tokens.colors.surface;
  const bg = input.brand.tokens.colors.bg;
  const subject = `${input.brand.appName}: your sign-in code ${input.code}`;

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:${bg};font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:${ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:${surface};border-radius:16px;padding:32px">
    <tr><td>
      ${input.brand.logoLightUrl ? `<img src="${escapeHtml(input.brand.logoLightUrl)}" alt="${appName}" height="32" style="margin-bottom:24px">` : `<div style="font-size:20px;font-weight:700;margin-bottom:24px">${appName}</div>`}
      <h1 style="font-size:22px;margin:0 0 12px">Sign in to ${appName}</h1>
      <p style="margin:0 0 24px;line-height:1.5">Use the code below, or open the link on this device.</p>
      <div style="font-size:34px;letter-spacing:8px;font-weight:700;padding:16px 0;text-align:center;background:${bg};border-radius:12px">${escapeHtml(input.code)}</div>
      <p style="margin:24px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:${primary};color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600">Open ${appName}</a></p>
      <p style="margin:0 0 8px;font-size:13px;opacity:.75">The code and the link both expire in ${input.ttlMinutes} minutes and work only once.</p>
      <p style="margin:0 0 8px;font-size:13px;opacity:.75">Requested from: ${escapeHtml(input.deviceHint)}</p>
      <p style="margin:16px 0 0;font-size:13px;opacity:.75">If this was not you, ignore this email and tell us at ${escapeHtml(input.supportEmail)}.</p>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    `Sign in to ${input.brand.appName}`,
    '',
    `Code: ${input.code}`,
    `Link: ${url}`,
    '',
    `Both expire in ${input.ttlMinutes} minutes and work only once.`,
    `Requested from: ${input.deviceHint}`,
    `If this was not you, ignore this email and tell us at ${input.supportEmail}.`,
  ].join('\n');

  return { subject, html, text };
}

export function renderSecurityNotice(
  brand: PublicBrand,
  headline: string,
  detail: string,
  supportEmail: string,
): { subject: string; html: string; text: string } {
  const appName = escapeHtml(brand.appName);
  return {
    subject: `${brand.appName}: ${headline}`,
    html: `<!doctype html><html><body style="font-family:system-ui,sans-serif;padding:24px;color:${brand.tokens.colors.ink}">
      <h1 style="font-size:20px">${escapeHtml(headline)}</h1>
      <p style="line-height:1.5">${escapeHtml(detail)}</p>
      <p style="font-size:13px;opacity:.75">If this was not you, contact ${escapeHtml(supportEmail)} straight away and end your other sessions in ${appName} → Profile → Active sessions.</p>
    </body></html>`,
    text: `${headline}\n\n${detail}\n\nIf this was not you, contact ${supportEmail} and end your other sessions in ${brand.appName} → Profile → Active sessions.`,
  };
}
