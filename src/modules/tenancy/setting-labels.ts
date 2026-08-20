/**
 * Human names for the settings keys.
 *
 * The admin listed the raw key — `module.eventstyle`, `auth.mfa_policy`,
 * `booking.cancel_hours_before` — with nothing to say what any of it did or
 * what changing it would cost. The key is still shown, small, because it is
 * what appears in the audit log and in support conversations.
 */
export type SettingLabel = { label: string; help?: string; options?: string[] };

export const SETTING_LABELS: Record<string, SettingLabel> = {
  'module.programme': { label: 'Programme', help: 'The schedule tab. Turning this off hides it from everyone.' },
  'module.map': { label: 'Map', help: 'The venue map and the list of places.' },
  'module.winstyle': { label: 'WinStyle (merchandise)', help: 'Reserving t-shirts and the like. No payment is involved.' },
  'module.travel': { label: 'Travel', help: 'Flights, transfers and what is covered.' },
  'module.media': { label: 'Photos', help: 'Photo albums and the aftermovie.' },
  'module.eventstyle': { label: 'EventStyle', help: 'Dress code and the packing checklist.' },

  'auth.mfa_policy': {
    label: 'Two-factor authentication',
    help: 'Staff means anyone with an admin role. Requiring it of everyone is a real cost to participants — most will be setting up an authenticator for a three-day event.',
    options: ['OFF', 'REQUIRED_STAFF', 'REQUIRED_ALL'],
  },
  'auth.google': { label: 'Allow Google sign-in', help: 'Only works for corporate Google accounts on a verified domain.' },
  'auth.captcha': { label: 'CAPTCHA on sign-in', help: 'Adds friction for everyone. Worth it only if you are being attacked.' },

  'brand.public': { label: 'Show branding before sign-in', help: 'Off keeps your colours and logo private until someone is signed in.' },

  'mail.from_name': { label: 'Sender name', help: 'Shown as the sender of every email.' },
  'mail.from_email': { label: 'Sender address', help: 'Must be on a domain verified with the mail provider, or messages are rejected.' },

  'support.email': { label: 'Support email', help: 'Shown on the help screen and in emails.' },
  'support.phone': { label: 'Support phone', help: 'Shown on the help screen. Leave empty to hide it.' },

  'legal.terms_url': { label: 'Terms of Use link' },
  'legal.privacy_url': { label: 'Privacy Policy link' },
  'legal.version': { label: 'Policy version', help: 'Changing this asks everyone to accept the terms again at their next sign-in.' },

  'analytics.enabled': { label: 'Collect usage analytics', help: 'Aggregate counts only; no per-person tracking.' },
  'tenant.custom_host': { label: 'Custom domain', help: 'Lets this tenant be reached on its own hostname.' },
  'map.google': { label: 'Google Maps links', help: 'Adds an "open in Google Maps" link to each place.' },
  'media.embed': { label: 'Embed media inline', help: 'Off shows a link out instead, which is safer with third-party galleries.' },
  'media.self_hosted_upload': { label: 'Upload photos to this server', help: 'Off means albums are links to an external gallery.' },
  'security.av_scan': { label: 'Virus-scan uploads', help: 'Requires a scanner to be configured, or uploads will fail.' },
  'platform.readonly': { label: 'Read-only mode', help: 'Blocks every change across the tenant. For incidents and migrations.' },
  'registration.cancel_until_start': {
    label: 'Let people cancel until the event starts',
    help: 'Off means registration is final once the window closes.',
  },
  'booking.cancel_hours_before': {
    label: 'Hours before a session that booking can be cancelled',
    help: 'A larger number gives the waiting list more time to take the place.',
  },
};

export function labelForSetting(key: string): SettingLabel {
  return SETTING_LABELS[key] ?? { label: key };
}
