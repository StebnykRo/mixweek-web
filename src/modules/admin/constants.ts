/** docs/03-auth.md §10 — the grace window before an account is really deleted. */
export const DELETION_GRACE_DAYS = 30;

/** docs/02 §5 — retention windows, in days. */
export const RETENTION_DAYS = {
  verificationToken: 1,
  session: 30,
  loginAttempt: 90,
  notificationDelivery: 365,
  analyticsEvent: 90,
  mediaReportClosed: 365,
  auditLog: 730,
  pastRegistration: 730,
} as const;

/** docs/10 §3.5 — an export link is signed and lives for one hour. */
export const EXPORT_LINK_TTL_SECONDS = 3600;
