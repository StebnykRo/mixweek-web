-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DomainType" AS ENUM ('EMAIL', 'HOST');

-- CreateEnum
CREATE TYPE "BrandStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('PARTICIPANT', 'GUEST', 'SUPPORT', 'CONTENT_EDITOR', 'EVENT_MANAGER', 'TENANT_ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('MAGIC_LINK', 'EMAIL_OTP', 'INVITE', 'EMAIL_CHANGE', 'STEP_UP');

-- CreateEnum
CREATE TYPE "FactorType" AS ENUM ('TOTP', 'EMAIL_OTP', 'WEBAUTHN');

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('TERMS', 'PRIVACY', 'PUSH_NOTIFICATIONS', 'PHOTO_USAGE', 'MARKETING');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('TENANT', 'INVITE_ONLY', 'GROUP');

-- CreateEnum
CREATE TYPE "Track" AS ENUM ('WORKSHOP', 'SPORT', 'PARTY', 'TEAM', 'LOGISTICS');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('SCHEDULED', 'MOVED', 'CANCELLED', 'FINISHED');

-- CreateEnum
CREATE TYPE "RegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'WAITLISTED', 'DECLINED', 'CANCELLED', 'ATTENDED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'WAITLISTED', 'CANCELLED', 'ATTENDED');

-- CreateEnum
CREATE TYPE "PlaceKind" AS ENUM ('STAGE', 'WORKSHOP', 'CARE', 'MERCH', 'HOTEL', 'RESTAURANT', 'TRANSFER', 'IT_ZONE', 'OTHER');

-- CreateEnum
CREATE TYPE "ContentSection" AS ENUM ('EVENT_STYLE', 'TRAVEL', 'HELP', 'FAQ', 'RULES', 'ONBOARDING');

-- CreateEnum
CREATE TYPE "ContactKind" AS ENUM ('HR', 'PROGRAMME', 'LOGISTICS', 'URGENT', 'IT', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('PARTICIPANT_UPLOAD', 'PHOTOGRAPHER_GALLERY', 'VIDEO', 'PRESS', 'AFTERMOVIE', 'MATERIALS');

-- CreateEnum
CREATE TYPE "MediaProvider" AS ENUM ('GOOGLE_DRIVE', 'GOOGLE_PHOTOS', 'DROPBOX', 'ONEDRIVE', 'FLICKR', 'SMUGMUG', 'PIXIESET', 'YOUTUBE', 'VIMEO', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "MediaReportReason" AS ENUM ('PRIVACY', 'INAPPROPRIATE', 'BROKEN_LINK', 'WRONG_ACCESS', 'OTHER');

-- CreateEnum
CREATE TYPE "MediaReportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('RESERVED', 'READY_FOR_PICKUP', 'PICKED_UP', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AnnouncementSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('ANNOUNCEMENT', 'REMINDER', 'SCHEDULE_CHANGE', 'PROGRAMME_UPDATE', 'REGISTRATION', 'MEDIA_READY', 'MERCH', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "DataRequestKind" AS ENUM ('EXPORT', 'DELETE');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "defaultLocale" TEXT NOT NULL DEFAULT 'en',
    "locales" TEXT[] DEFAULT ARRAY['en']::TEXT[],
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Nicosia',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" CITEXT NOT NULL,
    "hostType" "DomainType" NOT NULL DEFAULT 'EMAIL',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "autoJoin" BOOLEAN NOT NULL DEFAULT true,
    "brandId" TEXT,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "appName" TEXT NOT NULL,
    "kicker" TEXT,
    "logoLightUrl" TEXT,
    "logoDarkUrl" TEXT,
    "logoMarkUrl" TEXT,
    "ogImageUrl" TEXT,
    "tokens" JSONB NOT NULL,
    "customCss" TEXT,
    "status" "BrandStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandVersion" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeatureFlag" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "eventId" TEXT,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "FeatureFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "TenantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SecretSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "ciphertext" BYTEA NOT NULL,
    "iv" BYTEA NOT NULL,
    "authTag" BYTEA NOT NULL,
    "wrappedKey" BYTEA NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "hint" TEXT,
    "rotatedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "SecretSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "name" TEXT,
    "jobTitle" TEXT,
    "department" TEXT,
    "team" TEXT,
    "avatarUrl" TEXT,
    "hrContactId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'en',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "primaryTenantId" TEXT,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletionRequestedAt" TIMESTAMPTZ(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HrAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "department" TEXT,
    "team" TEXT,
    "hrUserId" TEXT NOT NULL,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "HrAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'PARTICIPANT',
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "invitedBy" TEXT,
    "joinedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accessTokenEnc" BYTEA,
    "refreshTokenEnc" BYTEA,
    "expiresAt" INTEGER,
    "scope" TEXT,
    "hostedDomain" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT,
    "mfaSatisfied" BOOLEAN NOT NULL DEFAULT false,
    "stepUpAt" TIMESTAMPTZ(3),
    "ipHash" TEXT,
    "userAgent" TEXT,
    "deviceLabel" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "revokedReason" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "bindingHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "metadata" JSONB,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthFactor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "FactorType" NOT NULL,
    "secretEnc" BYTEA,
    "iv" BYTEA,
    "authTag" BYTEA,
    "wrappedKey" BYTEA,
    "label" TEXT,
    "confirmedAt" TIMESTAMPTZ(3),
    "lastUsedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthFactor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecoveryCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecoveryCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "ipHash" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "reason" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" CITEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'GUEST',
    "eventId" TEXT,
    "tokenHash" TEXT NOT NULL,
    "invitedBy" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "acceptedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "documentVersion" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "ipHash" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "description" TEXT,
    "coverUrl" TEXT,
    "brandId" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "city" TEXT,
    "country" TEXT,
    "venueName" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "EventVisibility" NOT NULL DEFAULT 'TENANT',
    "audienceRules" JSONB,
    "registrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "registrationOpensAt" TIMESTAMPTZ(3),
    "registrationClosesAt" TIMESTAMPTZ(3),
    "capacity" INTEGER,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "registrationForm" JSONB,
    "publishedAt" TIMESTAMPTZ(3),
    "archivedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "track" "Track" NOT NULL DEFAULT 'WORKSHOP',
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "placeId" TEXT,
    "locationText" TEXT,
    "speakers" JSONB,
    "bookingRequired" BOOLEAN NOT NULL DEFAULT false,
    "capacity" INTEGER,
    "waitlistEnabled" BOOLEAN NOT NULL DEFAULT true,
    "bookingOpensAt" TIMESTAMPTZ(3),
    "bookingClosesAt" TIMESTAMPTZ(3),
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "status" "ActivityStatus" NOT NULL DEFAULT 'SCHEDULED',
    "changeNote" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "announcedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "status" "RegistrationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "answers" JSONB,
    "waitlistPosition" INTEGER,
    "checkInCodeHash" TEXT,
    "checkedInAt" TIMESTAMPTZ(3),
    "checkInMode" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityBooking" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "waitlistPosition" INTEGER,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedActivity" (
    "userId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SavedActivity_pkey" PRIMARY KEY ("userId","activityId")
);

-- CreateTable
CREATE TABLE "Place" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PlaceKind" NOT NULL,
    "description" TEXT,
    "mapX" DOUBLE PRECISION,
    "mapY" DOUBLE PRECISION,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "address" TEXT,
    "openingHours" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Place_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentBlock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "section" "ContentSection" NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "icon" TEXT,
    "imageUrl" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ContentBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ChecklistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChecklistState" (
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChecklistState_pkey" PRIMARY KEY ("userId","itemId")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "ContactKind" NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "note" TEXT,
    "isUrgent" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaLink" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "url" TEXT NOT NULL,
    "coverUrl" TEXT NOT NULL,
    "coverBlurhash" TEXT,
    "provider" "MediaProvider" NOT NULL DEFAULT 'OTHER',
    "authorName" TEXT,
    "authorUrl" TEXT,
    "accessNote" TEXT,
    "acceptsUploads" BOOLEAN NOT NULL DEFAULT false,
    "itemCountHint" INTEGER,
    "status" "MediaStatus" NOT NULL DEFAULT 'DRAFT',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMPTZ(3),
    "deletedAt" TIMESTAMPTZ(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "MediaLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mediaLinkId" TEXT NOT NULL,
    "reporterId" TEXT,
    "reason" "MediaReportReason" NOT NULL,
    "comment" TEXT,
    "status" "MediaReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "priceCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "size" TEXT NOT NULL,
    "stockTotal" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'RESERVED',
    "pickupCodeHash" TEXT,
    "pickedUpAt" TIMESTAMPTZ(3),
    "pickedUpBy" TEXT,
    "cancelledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "priceCents" INTEGER NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "severity" "AnnouncementSeverity" NOT NULL DEFAULT 'INFO',
    "linkUrl" TEXT,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "linkUrl" TEXT,
    "audience" JSONB NOT NULL,
    "channels" TEXT[],
    "scheduledAt" TIMESTAMPTZ(3),
    "sentAt" TIMESTAMPTZ(3),
    "status" "NotificationStatus" NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "kind" "NotificationKind" NOT NULL,
    "channel" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "locale" TEXT,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "lastSuccessAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Translation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Translation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "actorId" TEXT,
    "actorEmailHash" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "diff" JSONB,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT,
    "subjectHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "props" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DataRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "DataRequestKind" NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'PENDING',
    "resultUrl" TEXT,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "Tenant_status_idx" ON "Tenant"("status");

-- CreateIndex
CREATE INDEX "TenantDomain_tenantId_idx" ON "TenantDomain"("tenantId");

-- CreateIndex
CREATE INDEX "TenantDomain_brandId_idx" ON "TenantDomain"("brandId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantDomain_domain_key" ON "TenantDomain"("domain");

-- CreateIndex
CREATE INDEX "Brand_tenantId_status_idx" ON "Brand"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_tenantId_key_key" ON "Brand"("tenantId", "key");

-- CreateIndex
CREATE INDEX "BrandVersion_tenantId_brandId_idx" ON "BrandVersion"("tenantId", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandVersion_brandId_version_key" ON "BrandVersion"("brandId", "version");

-- CreateIndex
CREATE INDEX "FeatureFlag_key_idx" ON "FeatureFlag"("key");

-- CreateIndex
CREATE UNIQUE INDEX "FeatureFlag_tenantId_eventId_key_key" ON "FeatureFlag"("tenantId", "eventId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "TenantSetting_tenantId_key_key" ON "TenantSetting"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "SecretSetting_tenantId_key_key" ON "SecretSetting"("tenantId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_status_idx" ON "User"("status");

-- CreateIndex
CREATE INDEX "User_primaryTenantId_idx" ON "User"("primaryTenantId");

-- CreateIndex
CREATE INDEX "HrAssignment_tenantId_idx" ON "HrAssignment"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HrAssignment_tenantId_department_team_key" ON "HrAssignment"("tenantId", "department", "team");

-- CreateIndex
CREATE INDEX "Membership_tenantId_role_idx" ON "Membership"("tenantId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_tenantId_key" ON "Membership"("userId", "tenantId");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_expiresAt_idx" ON "Session"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_identifier_purpose_idx" ON "VerificationToken"("identifier", "purpose");

-- CreateIndex
CREATE INDEX "VerificationToken_expiresAt_idx" ON "VerificationToken"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthFactor_userId_type_idx" ON "AuthFactor"("userId", "type");

-- CreateIndex
CREATE INDEX "RecoveryCode_userId_idx" ON "RecoveryCode"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");

-- CreateIndex
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");

-- CreateIndex
CREATE INDEX "LoginAttempt_emailHash_createdAt_idx" ON "LoginAttempt"("emailHash", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_ipHash_createdAt_idx" ON "LoginAttempt"("ipHash", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invite_tokenHash_key" ON "Invite"("tokenHash");

-- CreateIndex
CREATE INDEX "Invite_tenantId_email_idx" ON "Invite"("tenantId", "email");

-- CreateIndex
CREATE INDEX "Consent_userId_kind_idx" ON "Consent"("userId", "kind");

-- CreateIndex
CREATE INDEX "Consent_tenantId_kind_idx" ON "Consent"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "Event_tenantId_status_startsAt_idx" ON "Event"("tenantId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "Event_tenantId_startsAt_idx" ON "Event"("tenantId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_tenantId_slug_key" ON "Event"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "Activity_tenantId_eventId_startsAt_idx" ON "Activity"("tenantId", "eventId", "startsAt");

-- CreateIndex
CREATE INDEX "Activity_eventId_track_idx" ON "Activity"("eventId", "track");

-- CreateIndex
CREATE INDEX "Activity_placeId_idx" ON "Activity"("placeId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_checkInCodeHash_key" ON "EventRegistration"("checkInCodeHash");

-- CreateIndex
CREATE INDEX "EventRegistration_tenantId_eventId_status_idx" ON "EventRegistration"("tenantId", "eventId", "status");

-- CreateIndex
CREATE INDEX "EventRegistration_userId_createdAt_idx" ON "EventRegistration"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_userId_key" ON "EventRegistration"("eventId", "userId");

-- CreateIndex
CREATE INDEX "ActivityBooking_tenantId_activityId_status_idx" ON "ActivityBooking"("tenantId", "activityId", "status");

-- CreateIndex
CREATE INDEX "ActivityBooking_userId_idx" ON "ActivityBooking"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityBooking_activityId_userId_key" ON "ActivityBooking"("activityId", "userId");

-- CreateIndex
CREATE INDEX "SavedActivity_tenantId_activityId_idx" ON "SavedActivity"("tenantId", "activityId");

-- CreateIndex
CREATE INDEX "Place_tenantId_eventId_idx" ON "Place"("tenantId", "eventId");

-- CreateIndex
CREATE INDEX "ContentBlock_tenantId_eventId_section_idx" ON "ContentBlock"("tenantId", "eventId", "section");

-- CreateIndex
CREATE UNIQUE INDEX "ContentBlock_eventId_section_key_key" ON "ContentBlock"("eventId", "section", "key");

-- CreateIndex
CREATE INDEX "ChecklistItem_tenantId_eventId_idx" ON "ChecklistItem"("tenantId", "eventId");

-- CreateIndex
CREATE INDEX "ChecklistState_tenantId_itemId_idx" ON "ChecklistState"("tenantId", "itemId");

-- CreateIndex
CREATE INDEX "Contact_tenantId_eventId_idx" ON "Contact"("tenantId", "eventId");

-- CreateIndex
CREATE INDEX "MediaLink_tenantId_eventId_status_sortOrder_idx" ON "MediaLink"("tenantId", "eventId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "MediaReport_tenantId_status_createdAt_idx" ON "MediaReport"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MediaReport_mediaLinkId_idx" ON "MediaReport"("mediaLinkId");

-- CreateIndex
CREATE INDEX "Product_tenantId_eventId_idx" ON "Product"("tenantId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_eventId_sku_key" ON "Product"("eventId", "sku");

-- CreateIndex
CREATE INDEX "ProductVariant_tenantId_productId_idx" ON "ProductVariant"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVariant_productId_size_key" ON "ProductVariant"("productId", "size");

-- CreateIndex
CREATE UNIQUE INDEX "Order_pickupCodeHash_key" ON "Order"("pickupCodeHash");

-- CreateIndex
CREATE INDEX "Order_tenantId_eventId_status_idx" ON "Order"("tenantId", "eventId", "status");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_eventId_number_key" ON "Order"("eventId", "number");

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderItem_orderId_variantId_key" ON "OrderItem"("orderId", "variantId");

-- CreateIndex
CREATE INDEX "Announcement_tenantId_eventId_isPublished_startsAt_idx" ON "Announcement"("tenantId", "eventId", "isPublished", "startsAt");

-- CreateIndex
CREATE INDEX "Notification_tenantId_status_scheduledAt_idx" ON "Notification"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_userId_readAt_idx" ON "NotificationDelivery"("userId", "readAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_tenantId_userId_createdAt_idx" ON "NotificationDelivery"("tenantId", "userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_userId_channel_key" ON "NotificationDelivery"("notificationId", "userId", "channel");

-- CreateIndex
CREATE INDEX "NotificationPreference_tenantId_userId_idx" ON "NotificationPreference"("tenantId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_tenantId_kind_channel_key" ON "NotificationPreference"("userId", "tenantId", "kind", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_tenantId_userId_isValid_idx" ON "PushSubscription"("tenantId", "userId", "isValid");

-- CreateIndex
CREATE INDEX "Translation_tenantId_locale_idx" ON "Translation"("tenantId", "locale");

-- CreateIndex
CREATE UNIQUE INDEX "Translation_entityType_entityId_field_locale_key" ON "Translation"("entityType", "entityId", "field", "locale");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_name_occurredAt_idx" ON "AnalyticsEvent"("tenantId", "name", "occurredAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_tenantId_eventId_occurredAt_idx" ON "AnalyticsEvent"("tenantId", "eventId", "occurredAt");

-- CreateIndex
CREATE INDEX "DataRequest_tenantId_status_idx" ON "DataRequest"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "TenantDomain" ADD CONSTRAINT "TenantDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantDomain" ADD CONSTRAINT "TenantDomain_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandVersion" ADD CONSTRAINT "BrandVersion_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeatureFlag" ADD CONSTRAINT "FeatureFlag_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SecretSetting" ADD CONSTRAINT "SecretSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuthFactor" ADD CONSTRAINT "AuthFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecoveryCode" ADD CONSTRAINT "RecoveryCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invite" ADD CONSTRAINT "Invite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "Place"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventRegistration" ADD CONSTRAINT "EventRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBooking" ADD CONSTRAINT "ActivityBooking_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityBooking" ADD CONSTRAINT "ActivityBooking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedActivity" ADD CONSTRAINT "SavedActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedActivity" ADD CONSTRAINT "SavedActivity_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Place" ADD CONSTRAINT "Place_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentBlock" ADD CONSTRAINT "ContentBlock_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistItem" ADD CONSTRAINT "ChecklistItem_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistState" ADD CONSTRAINT "ChecklistState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChecklistState" ADD CONSTRAINT "ChecklistState_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "ChecklistItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaLink" ADD CONSTRAINT "MediaLink_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
