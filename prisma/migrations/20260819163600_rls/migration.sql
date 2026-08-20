-- docs/02-data-model.md §4 — Row Level Security.
--
-- Two layers guard tenant isolation: the Prisma `tenantGuard` extension in the
-- application, and these policies in the database. The app connects as
-- `app_user` (not the table owner, no BYPASSRLS) and runs
-- `SET LOCAL app.tenant_id = '<uuid>'` at the start of every transaction.
--
-- `app.platform_scope = 'on'` is the single, explicit cross-tenant escape hatch
-- used by withPlatformScope() for SUPER_ADMIN operations. It is set server-side
-- only, inside a transaction, and every use writes an AuditLog entry.

CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT current_setting('app.tenant_id', true) $$;

CREATE OR REPLACE FUNCTION app_platform_scope() RETURNS boolean
  LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('app.platform_scope', true), 'off') = 'on' $$;


ALTER TABLE "Brand" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Brand" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Brand";
CREATE POLICY tenant_isolation ON "Brand"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "BrandVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BrandVersion" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "BrandVersion";
CREATE POLICY tenant_isolation ON "BrandVersion"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "TenantSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantSetting" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantSetting";
CREATE POLICY tenant_isolation ON "TenantSetting"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "TenantDomain" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantDomain" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "TenantDomain";
CREATE POLICY tenant_isolation ON "TenantDomain"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Membership";
CREATE POLICY tenant_isolation ON "Membership"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Invite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invite" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Invite";
CREATE POLICY tenant_isolation ON "Invite"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Consent";
CREATE POLICY tenant_isolation ON "Consent"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "HrAssignment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "HrAssignment" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "HrAssignment";
CREATE POLICY tenant_isolation ON "HrAssignment"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Event" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Event";
CREATE POLICY tenant_isolation ON "Event"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Activity";
CREATE POLICY tenant_isolation ON "Activity"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "EventRegistration" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EventRegistration" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "EventRegistration";
CREATE POLICY tenant_isolation ON "EventRegistration"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "ActivityBooking" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ActivityBooking" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ActivityBooking";
CREATE POLICY tenant_isolation ON "ActivityBooking"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "SavedActivity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedActivity" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SavedActivity";
CREATE POLICY tenant_isolation ON "SavedActivity"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Place" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Place" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Place";
CREATE POLICY tenant_isolation ON "Place"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "ContentBlock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ContentBlock" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ContentBlock";
CREATE POLICY tenant_isolation ON "ContentBlock"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "ChecklistItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChecklistItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ChecklistItem";
CREATE POLICY tenant_isolation ON "ChecklistItem"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "ChecklistState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ChecklistState" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ChecklistState";
CREATE POLICY tenant_isolation ON "ChecklistState"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Contact" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Contact" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Contact";
CREATE POLICY tenant_isolation ON "Contact"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "MediaLink" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaLink" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MediaLink";
CREATE POLICY tenant_isolation ON "MediaLink"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "MediaReport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "MediaReport" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "MediaReport";
CREATE POLICY tenant_isolation ON "MediaReport"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Product" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Product";
CREATE POLICY tenant_isolation ON "Product"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "ProductVariant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductVariant" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "ProductVariant";
CREATE POLICY tenant_isolation ON "ProductVariant"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Order" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Order";
CREATE POLICY tenant_isolation ON "Order"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "OrderItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrderItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "OrderItem";
CREATE POLICY tenant_isolation ON "OrderItem"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Announcement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Announcement" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Announcement";
CREATE POLICY tenant_isolation ON "Announcement"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Notification" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Notification";
CREATE POLICY tenant_isolation ON "Notification"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "NotificationDelivery" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationDelivery" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "NotificationDelivery";
CREATE POLICY tenant_isolation ON "NotificationDelivery"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "NotificationPreference";
CREATE POLICY tenant_isolation ON "NotificationPreference"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushSubscription" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "PushSubscription";
CREATE POLICY tenant_isolation ON "PushSubscription"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "Translation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Translation" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "Translation";
CREATE POLICY tenant_isolation ON "Translation"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsEvent" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AnalyticsEvent";
CREATE POLICY tenant_isolation ON "AnalyticsEvent"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "DataRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DataRequest" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "DataRequest";
CREATE POLICY tenant_isolation ON "DataRequest"
  USING (app_platform_scope() OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" = app_current_tenant());

ALTER TABLE "FeatureFlag" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FeatureFlag" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "FeatureFlag";
CREATE POLICY tenant_isolation ON "FeatureFlag"
  USING (app_platform_scope() OR "tenantId" IS NULL OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" IS NULL OR "tenantId" = app_current_tenant());

ALTER TABLE "SecretSetting" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SecretSetting" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "SecretSetting";
CREATE POLICY tenant_isolation ON "SecretSetting"
  USING (app_platform_scope() OR "tenantId" IS NULL OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" IS NULL OR "tenantId" = app_current_tenant());

ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation ON "AuditLog";
CREATE POLICY tenant_isolation ON "AuditLog"
  USING (app_platform_scope() OR "tenantId" IS NULL OR "tenantId" = app_current_tenant())
  WITH CHECK (app_platform_scope() OR "tenantId" IS NULL OR "tenantId" = app_current_tenant());

-- Runtime role: data access only, never DDL, never ownership.
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

-- AuditLog is append-only for the runtime role: history cannot be rewritten.
REVOKE UPDATE, DELETE ON "AuditLog" FROM app_user;
