/**
 * docs/02-data-model.md §4.1 — the canonical list of tenant-scoped entities.
 *
 * This array is the single source of truth. `tenant-client.ts` guards exactly
 * these models, the RLS migration covers exactly these tables, and
 * `tests/e2e/tenant-isolation.spec.ts` imports this same array — so the three
 * cannot drift apart.
 */
export const TENANT_SCOPED_MODELS = [
  'Brand',
  'BrandVersion',
  'FeatureFlag',
  'TenantSetting',
  'SecretSetting',
  'TenantDomain',
  'Membership',
  'Invite',
  'Consent',
  'HrAssignment',
  'Event',
  'Activity',
  'EventRegistration',
  'ActivityBooking',
  'SavedActivity',
  'Place',
  'ContentBlock',
  'ChecklistItem',
  'ChecklistState',
  'Contact',
  'MediaLink',
  'MediaReport',
  'Product',
  'ProductVariant',
  'Order',
  'OrderItem',
  'Announcement',
  'Notification',
  'NotificationDelivery',
  'NotificationPreference',
  'PushSubscription',
  'Translation',
  'AnalyticsEvent',
  'DataRequest',
  'AuditLog',
] as const;

export type TenantScopedModel = (typeof TENANT_SCOPED_MODELS)[number];

/** Models whose tenantId may be null because the row belongs to the platform. */
export const NULLABLE_TENANT_MODELS = new Set<TenantScopedModel>([
  'FeatureFlag',
  'SecretSetting',
  'AuditLog',
]);

const scoped = new Set<string>(TENANT_SCOPED_MODELS);

export function isTenantScoped(model: string | undefined): model is TenantScopedModel {
  return typeof model === 'string' && scoped.has(model);
}

/**
 * Not tenant-scoped: a user can belong to several tenants, so these are guarded
 * by Membership and policies rather than by RLS (docs/02 §4.1).
 */
export const GLOBAL_MODELS = [
  'Tenant',
  'User',
  'Session',
  'Account',
  'AuthFactor',
  'RecoveryCode',
  'VerificationToken',
  'TrustedDevice',
  'LoginAttempt',
] as const;
