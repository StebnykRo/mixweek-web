# 02 · Модель даних

Джерело істини — `prisma/schema.prisma`. Цей документ описує **цільову**
схему: усе нижче має бути реалізовано.

## 1. Принципи

1. **Ізоляція тенанта.** Кожна таблиця з користувацькими/контентними даними
   має `tenantId` і складений індекс, що починається з `tenantId`.
2. **Два рівні захисту:**
   - *рівень застосунку* — Prisma Client Extension `tenantGuard` автоматично
     додає `where: { tenantId }` і кидає помилку, якщо `tenantId` відсутній;
   - *рівень БД* — PostgreSQL **Row Level Security** на тих самих таблицях;
     застосунок під'єднується non-superuser роллю і на кожну транзакцію
     виконує `SET LOCAL app.tenant_id = '<uuid>'`. Політика:
     `USING (tenant_id = current_setting('app.tenant_id')::uuid)`.
     Якщо ORM-шар колись «протече» — БД все одно не віддасть чужі рядки.
3. **Ідентифікатори** — `cuid2` (не автоінкремент: не розкриває обсяг даних
   і не дозволяє перебір).
4. **Час** — `DateTime @db.Timestamptz(3)`, завжди UTC.
5. **Гроші** — `Int` у мінорних одиницях + `currency String @db.Char(3)`.
6. **М'яке видалення** — `deletedAt` для контенту (програма, медіа, товари).
   Персональні дані видаляються **жорстко** (GDPR), див. `docs/12`.
7. **Enum-и** зберігаються як Postgres enum; додавання значення — окрема
   міграція.

## 2. Prisma schema (цільова)

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions", "relationJoins"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgcrypto, citext, pg_trgm]
}

// ─────────────────────────────────────────────────────────────
// ТЕНАНТИ ТА БРЕНДИНГ
// ─────────────────────────────────────────────────────────────

model Tenant {
  id           String   @id @default(cuid(2))
  slug         String   @unique                    // "softswiss"
  name         String
  legalName    String?
  status       TenantStatus @default(ACTIVE)
  defaultLocale String  @default("en")
  locales      String[] @default(["en"])
  timezone     String   @default("Asia/Nicosia")
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @db.Timestamptz(3)

  domains      TenantDomain[]
  brands       Brand[]
  memberships  Membership[]
  events       Event[]
  settings     TenantSetting[]
  featureFlags FeatureFlag[]
  invites      Invite[]
  secrets      SecretSetting[]

  @@index([status])
}

enum TenantStatus { ACTIVE SUSPENDED ARCHIVED }

/// Домени корпоративної пошти → визначають тенант і бренд при логіні.
model TenantDomain {
  id        String   @id @default(cuid(2))
  tenantId  String
  domain    String   @db.Citext                    // "softswiss.com"
  /// EMAIL — домен корпоративної пошти (резолв тенанта при логіні).
  /// HOST  — кастомний хост застосунку (mixweek.softswiss.com), фіче-флаг
  ///         tenant.custom_host.
  hostType  DomainType @default(EMAIL)
  isPrimary Boolean  @default(false)
  /// Дозволяє самореєстрацію користувачів з цим доменом.
  autoJoin  Boolean  @default(true)
  /// Бренд, який застосовується при вході з цього домену.
  /// Якщо null — використовується дефолтний бренд тенанта.
  brandId   String?
  verifiedAt DateTime? @db.Timestamptz(3)
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  brand  Brand? @relation(fields: [brandId], references: [id], onDelete: SetNull)

  @@unique([domain])                                // домен глобально унікальний
  @@index([tenantId])
}

enum DomainType { EMAIL HOST }

/// Візуальна тема. Може належати тенанту або конкретному івенту.
model Brand {
  id           String  @id @default(cuid(2))
  tenantId     String
  key          String                               // "softswiss-default", "mixweek-2026"
  name         String
  isDefault    Boolean @default(false)

  appName      String                               // "Mix Week"
  kicker       String?                              // "SOFTSWISS"
  logoLightUrl String?
  logoDarkUrl  String?
  logoMarkUrl  String?                              // квадратна іконка / favicon / PWA
  ogImageUrl   String?

  /// Токени теми. ЄДИНЕ джерело істини щодо структури — BrandTokensSchema
  /// у docs/04-white-label.md §3.1. Коротко:
  /// { mode, colors: { primary|secondary|neutral: {50..900},
  ///   bg, surface, ink, inkMuted, divider, success, warning, danger },
  ///   radius: { sm, md, lg, pill },
  ///   font: { display, body, source, displayUrl?, bodyUrl?, scale },
  ///   shadow?: { sm, md, lg } }
  tokens       Json

  /// Санітизований додатковий CSS (лише :root-змінні). Може бути null.
  customCss    String?  @db.Text

  status       BrandStatus @default(DRAFT)
  version      Int      @default(1)
  publishedAt  DateTime? @db.Timestamptz(3)
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  updatedAt    DateTime @updatedAt @db.Timestamptz(3)

  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  domains  TenantDomain[]
  events   Event[]
  versions BrandVersion[]

  @@unique([tenantId, key])
  @@index([tenantId, status])
}

enum BrandStatus { DRAFT PUBLISHED ARCHIVED }

/// Історія версій теми — для відкату в один клік.
model BrandVersion {
  id        String   @id @default(cuid(2))
  brandId   String
  version   Int
  snapshot  Json                                    // повна копія полів Brand
  createdBy String?
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  brand Brand @relation(fields: [brandId], references: [id], onDelete: Cascade)
  @@unique([brandId, version])
}

model FeatureFlag {
  id        String  @id @default(cuid(2))
  tenantId  String?                                 // null = глобальний дефолт
  eventId   String?                                 // найвищий пріоритет
  key       String                                  // "module.winstyle", "media.self_hosted_upload"
  enabled   Boolean @default(false)
  payload   Json?
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  tenant Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  event  Event?  @relation(fields: [eventId], references: [id], onDelete: Cascade)

  @@unique([tenantId, eventId, key])
  @@index([key])
}

model TenantSetting {
  id       String @id @default(cuid(2))
  tenantId String
  key      String
  value    Json
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, key])
}

/// Зашифровані секрети інтеграцій. Значення НІКОЛИ не читається в UI.
model SecretSetting {
  id          String  @id @default(cuid(2))
  tenantId    String?                               // null = платформний секрет
  /// Значення з закритого union SecretKey — docs/12-security.md §2.2.
  key         String                                // "mail.smtp_password", "google.client_secret"
  ciphertext  Bytes                                 // AES-256-GCM
  iv          Bytes
  authTag     Bytes
  /// Зашифрований DEK (envelope encryption), обгорнутий APP_MASTER_KEY.
  wrappedKey  Bytes
  keyVersion  Int     @default(1)
  hint        String?                               // "••••4f2a" — тільки для UI
  rotatedAt   DateTime? @db.Timestamptz(3)
  expiresAt   DateTime? @db.Timestamptz(3)
  createdBy   String?
  createdAt   DateTime @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @db.Timestamptz(3)

  tenant Tenant? @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@unique([tenantId, key])
}

// ─────────────────────────────────────────────────────────────
// КОРИСТУВАЧІ ТА ДОСТУП
// ─────────────────────────────────────────────────────────────

model User {
  id            String    @id @default(cuid(2))
  email         String    @unique @db.Citext
  emailVerifiedAt DateTime? @db.Timestamptz(3)
  name          String?
  jobTitle      String?
  department    String?
  team          String?
  /// Ініціали за замовчуванням; завантаження аватара — поза скоупом v1
  /// (див. docs/12 §7). Поле заповнюється лише при CSV-імпорті з
  /// корпоративного каталогу, URL має бути на дозволеному домені.
  avatarUrl     String?
  /// Персональний HR business partner. Заповнюється CSV-імпортом або
  /// правилом «департамент → HR BP» (HrAssignment).
  hrContactId   String?
  locale        String    @default("en")
  status        UserStatus @default(ACTIVE)
  /// Тенант «за замовчуванням» — визначається доменом пошти при першому вході.
  primaryTenantId String?
  lastLoginAt   DateTime? @db.Timestamptz(3)
  createdAt     DateTime  @default(now()) @db.Timestamptz(3)
  updatedAt     DateTime  @updatedAt @db.Timestamptz(3)
  /// GDPR: заплановане видалення.
  deletionRequestedAt DateTime? @db.Timestamptz(3)

  memberships     Membership[]
  accounts        Account[]
  sessions        Session[]
  authFactors     AuthFactor[]
  recoveryCodes   RecoveryCode[]
  consents        Consent[]
  registrations   EventRegistration[]
  bookings        ActivityBooking[]
  savedActivities SavedActivity[]
  checklistStates ChecklistState[]
  orders          Order[]
  pushSubs        PushSubscription[]
  notifications   NotificationDelivery[]
  notifPrefs      NotificationPreference[]
  auditEntries    AuditLog[] @relation("AuditActor")

  @@index([status])
  @@index([primaryTenantId])
}

/// Прив'язка HR business partner до департаменту/команди тенанта.
/// Використовується, коли персональний hrContactId не заданий.
model HrAssignment {
  id         String @id @default(cuid(2))
  tenantId   String
  department String?
  team       String?
  /// Користувач-HR у тому ж тенанті.
  hrUserId   String
  updatedAt  DateTime @updatedAt @db.Timestamptz(3)

  @@unique([tenantId, department, team])
  @@index([tenantId])
}

enum UserStatus { ACTIVE INVITED SUSPENDED DELETED }

/// Зв'язок користувача з тенантом + роль. Один користувач може бути в кількох.
model Membership {
  id        String   @id @default(cuid(2))
  userId    String
  tenantId  String
  role      Role     @default(PARTICIPANT)
  status    MembershipStatus @default(ACTIVE)
  invitedBy String?
  joinedAt  DateTime @default(now()) @db.Timestamptz(3)

  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId])
  @@index([tenantId, role])
}

enum Role {
  PARTICIPANT
  GUEST
  SUPPORT
  CONTENT_EDITOR
  EVENT_MANAGER
  TENANT_ADMIN
  SUPER_ADMIN
}

enum MembershipStatus { ACTIVE INVITED SUSPENDED }

/// OAuth/OIDC-акаунти. Створюється в v1 порожньою — під Google у v1.5.
model Account {
  id                String  @id @default(cuid(2))
  userId            String
  provider          String                          // "google"
  providerAccountId String
  type              String                          // "oidc"
  /// Токени зберігаються зашифрованими (див. docs/12), не в plaintext.
  accessTokenEnc    Bytes?
  refreshTokenEnc   Bytes?
  expiresAt         Int?
  scope             String?
  /// hd-claim Google Workspace — використовується для мапінгу на тенант.
  hostedDomain      String?
  createdAt         DateTime @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([provider, providerAccountId])
  @@index([userId])
}

model Session {
  id           String   @id @default(cuid(2))
  /// SHA-256 від токена сесії. Сам токен у БД не зберігається.
  tokenHash    String   @unique
  userId       String
  tenantId     String?                              // активний тенант сесії
  /// Сесія повністю авторизована лише після проходження 2-го фактора.
  mfaSatisfied Boolean  @default(false)
  ipHash       String?                              // HMAC(ip), не сам IP
  userAgent    String?
  deviceLabel  String?
  createdAt    DateTime @default(now()) @db.Timestamptz(3)
  lastSeenAt   DateTime @default(now()) @db.Timestamptz(3)
  expiresAt    DateTime @db.Timestamptz(3)
  revokedAt    DateTime? @db.Timestamptz(3)
  revokedReason String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, expiresAt])
  @@index([expiresAt])
}

/// Одноразові токени: magic link, email OTP, інвайти, зміна пошти.
model VerificationToken {
  id         String   @id @default(cuid(2))
  identifier String                                  // email (citext, нормалізований)
  tokenHash  String   @unique                        // SHA-256, не сам токен
  purpose    TokenPurpose
  /// Прив'язка до сесії браузера, де почався логін (anti-phishing).
  bindingHash String?
  attempts   Int      @default(0)
  maxAttempts Int     @default(5)
  metadata   Json?
  expiresAt  DateTime @db.Timestamptz(3)
  consumedAt DateTime? @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)

  @@index([identifier, purpose])
  @@index([expiresAt])
}

enum TokenPurpose { MAGIC_LINK EMAIL_OTP INVITE EMAIL_CHANGE STEP_UP }

/// Другий фактор (TOTP). Обов'язковий для всіх адмін-ролей.
model AuthFactor {
  id         String   @id @default(cuid(2))
  userId     String
  type       FactorType
  /// TOTP-секрет зашифрований (envelope encryption), не base32 у plaintext.
  secretEnc  Bytes?
  iv         Bytes?
  authTag    Bytes?
  label      String?
  confirmedAt DateTime? @db.Timestamptz(3)
  lastUsedAt DateTime? @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, type])
}

enum FactorType { TOTP EMAIL_OTP WEBAUTHN }

model RecoveryCode {
  id        String   @id @default(cuid(2))
  userId    String
  codeHash  String                                   // argon2id
  usedAt    DateTime? @db.Timestamptz(3)
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId])
}

/// Довірений пристрій — дозволяє не питати 2-й фактор 30 днів.
model TrustedDevice {
  id         String   @id @default(cuid(2))
  userId     String
  tokenHash  String   @unique
  label      String?
  expiresAt  DateTime @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  @@index([userId])
}

/// Для детекту брутфорсу й enumeration. Чиститься через 90 днів.
model LoginAttempt {
  id         String   @id @default(cuid(2))
  emailHash  String                                  // HMAC(email)
  ipHash     String
  success    Boolean
  reason     String?
  tenantId   String?
  createdAt  DateTime @default(now()) @db.Timestamptz(3)

  @@index([emailHash, createdAt])
  @@index([ipHash, createdAt])
}

model Invite {
  id        String   @id @default(cuid(2))
  tenantId  String
  email     String   @db.Citext
  role      Role     @default(GUEST)
  eventId   String?
  tokenHash String   @unique
  invitedBy String?
  expiresAt DateTime @db.Timestamptz(3)
  acceptedAt DateTime? @db.Timestamptz(3)
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([tenantId, email])
}

/// Згоди: Terms, Privacy, маркетинг, фото. Незмінні записи (append-only).
model Consent {
  id        String   @id @default(cuid(2))
  userId    String
  tenantId  String
  kind      ConsentKind
  documentVersion String
  granted   Boolean
  ipHash    String?
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([userId, kind])
}

enum ConsentKind { TERMS PRIVACY PUSH_NOTIFICATIONS PHOTO_USAGE MARKETING }

// ─────────────────────────────────────────────────────────────
// ІВЕНТИ ТА ПРОГРАМА
// ─────────────────────────────────────────────────────────────

model Event {
  id          String   @id @default(cuid(2))
  tenantId    String
  slug        String                                 // "mix-week-2026"
  title       String
  subtitle    String?
  description String?  @db.Text
  coverUrl    String?
  /// Бренд-оверрайд для конкретного івенту (напр. окремий стиль Mix Week).
  brandId     String?

  startsAt    DateTime @db.Timestamptz(3)
  endsAt      DateTime @db.Timestamptz(3)
  timezone    String                                 // "Asia/Nicosia"
  city        String?
  country     String?
  venueName   String?

  status      EventStatus @default(DRAFT)
  visibility  EventVisibility @default(TENANT)
  /// Для visibility = GROUP: { departments?: string[], teams?: string[],
  /// roles?: Role[], userIds?: string[] }. Ігнорується для інших значень.
  audienceRules Json?

  // Реєстрація
  registrationEnabled  Boolean  @default(true)
  registrationOpensAt  DateTime? @db.Timestamptz(3)
  registrationClosesAt DateTime? @db.Timestamptz(3)
  capacity             Int?
  waitlistEnabled      Boolean  @default(true)
  approvalRequired     Boolean  @default(false)
  /// JSON-схема додаткових питань анкети (docs/06).
  registrationForm     Json?

  publishedAt DateTime? @db.Timestamptz(3)
  archivedAt  DateTime? @db.Timestamptz(3)
  deletedAt   DateTime? @db.Timestamptz(3)
  createdAt   DateTime @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @db.Timestamptz(3)

  tenant        Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  brand         Brand? @relation(fields: [brandId], references: [id], onDelete: SetNull)
  activities    Activity[]
  places        Place[]
  registrations EventRegistration[]
  announcements Announcement[]
  mediaLinks    MediaLink[]
  contentBlocks ContentBlock[]
  checklistItems ChecklistItem[]
  contacts      Contact[]
  products      Product[]
  orders        Order[]
  featureFlags  FeatureFlag[]
  notifications Notification[]

  @@unique([tenantId, slug])
  @@index([tenantId, status, startsAt])
  @@index([tenantId, startsAt])
}

enum EventStatus { DRAFT PUBLISHED CANCELLED ARCHIVED }
/// TENANT — усі співробітники тенанта; INVITE_ONLY — лише запрошені;
/// GROUP — за групами/департаментами (audienceRules).
enum EventVisibility { TENANT INVITE_ONLY GROUP }

model Activity {
  id          String   @id @default(cuid(2))
  tenantId    String
  eventId     String
  title       String
  description String?  @db.Text
  track       Track    @default(WORKSHOP)
  startsAt    DateTime @db.Timestamptz(3)
  endsAt      DateTime @db.Timestamptz(3)
  placeId     String?
  locationText String?                               // якщо місця немає на мапі
  speakers    Json?                                  // [{name, role, avatarUrl}]

  // Бронювання місць
  bookingRequired Boolean @default(false)
  capacity        Int?
  waitlistEnabled Boolean @default(true)
  bookingOpensAt  DateTime? @db.Timestamptz(3)
  bookingClosesAt DateTime? @db.Timestamptz(3)

  isFeatured  Boolean  @default(false)
  status      ActivityStatus @default(SCHEDULED)
  /// Заповнюється при переносі/скасуванні — показується в UI як бейдж.
  changeNote  String?
  sortOrder   Int      @default(0)
  deletedAt   DateTime? @db.Timestamptz(3)
  createdAt   DateTime @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @db.Timestamptz(3)

  event    Event  @relation(fields: [eventId], references: [id], onDelete: Cascade)
  place    Place? @relation(fields: [placeId], references: [id], onDelete: SetNull)
  bookings ActivityBooking[]
  savedBy  SavedActivity[]

  @@index([tenantId, eventId, startsAt])
  @@index([eventId, track])
  @@index([placeId])
}

enum Track { WORKSHOP SPORT PARTY TEAM LOGISTICS }
enum ActivityStatus { SCHEDULED MOVED CANCELLED FINISHED }

model EventRegistration {
  id        String @id @default(cuid(2))
  tenantId  String
  eventId   String
  /// Nullable навмисно: після retention-періоду (docs/02 §5) запис
  /// анонімізується — userId → null, агрегати лишаються для звітності.
  userId    String?
  status    RegistrationStatus @default(CONFIRMED)
  /// Відповіді на registrationForm.
  answers   Json?
  /// Позиція в листі очікування (null, якщо не в ньому).
  waitlistPosition Int?
  /// Код для чек-іну на місці (QR). Зберігається як хеш + короткий префікс.
  checkInCodeHash String? @unique
  checkedInAt DateTime? @db.Timestamptz(3)
  cancelledAt DateTime? @db.Timestamptz(3)
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User? @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@unique([eventId, userId])
  @@index([tenantId, eventId, status])
  @@index([userId, createdAt])
}

enum RegistrationStatus { PENDING CONFIRMED WAITLISTED DECLINED CANCELLED ATTENDED NO_SHOW }

model ActivityBooking {
  id         String @id @default(cuid(2))
  tenantId   String
  activityId String
  userId     String
  status     BookingStatus @default(BOOKED)
  waitlistPosition Int?
  cancelledAt DateTime? @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)

  activity Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([activityId, userId])
  @@index([tenantId, activityId, status])
  @@index([userId])
}

enum BookingStatus { BOOKED WAITLISTED CANCELLED ATTENDED }

/// «♥» — особиста програма без бронювання місця.
model SavedActivity {
  userId     String
  activityId String
  tenantId   String
  createdAt  DateTime @default(now()) @db.Timestamptz(3)

  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  activity Activity @relation(fields: [activityId], references: [id], onDelete: Cascade)

  @@id([userId, activityId])
  @@index([tenantId, activityId])
}

// ─────────────────────────────────────────────────────────────
// МАПА ТА КОНТЕНТ
// ─────────────────────────────────────────────────────────────

model Place {
  id          String @id @default(cuid(2))
  tenantId    String
  eventId     String
  name        String
  kind        PlaceKind
  description String? @db.Text
  /// Координати на стилізованій мапі, у відсотках (0–100).
  mapX        Float?
  mapY        Float?
  /// Реальні координати — для «прокласти маршрут».
  lat         Float?
  lng         Float?
  address     String?
  openingHours String?
  imageUrl    String?
  sortOrder   Int    @default(0)
  deletedAt   DateTime? @db.Timestamptz(3)

  event      Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  activities Activity[]

  @@index([tenantId, eventId])
}

enum PlaceKind { STAGE WORKSHOP CARE MERCH HOTEL RESTAURANT TRANSFER IT_ZONE OTHER }

/// Універсальні контент-блоки: EventStyle, Travel, Help, FAQ, правила.
model ContentBlock {
  id        String @id @default(cuid(2))
  tenantId  String
  eventId   String
  section   ContentSection
  key       String
  title     String
  body      String  @db.Text            // Markdown, санітизується при рендері
  icon      String?                     // ім'я Lucide-іконки
  imageUrl  String?
  sortOrder Int     @default(0)
  isPublished Boolean @default(true)
  deletedAt DateTime? @db.Timestamptz(3)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@unique([eventId, section, key])
  @@index([tenantId, eventId, section])
}

enum ContentSection { EVENT_STYLE TRAVEL HELP FAQ RULES ONBOARDING }

model ChecklistItem {
  id        String @id @default(cuid(2))
  tenantId  String
  eventId   String
  label     String
  sortOrder Int    @default(0)
  deletedAt DateTime? @db.Timestamptz(3)

  event  Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  states ChecklistState[]
  @@index([tenantId, eventId])
}

model ChecklistState {
  userId   String
  itemId   String
  tenantId String
  checked  Boolean  @default(false)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  user User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  item ChecklistItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  @@id([userId, itemId])
  @@index([tenantId, itemId])
}

model Contact {
  id       String @id @default(cuid(2))
  tenantId String
  eventId  String
  kind     ContactKind
  name     String
  role     String?
  email    String?
  phone    String?
  note     String?
  isUrgent Boolean @default(false)
  sortOrder Int    @default(0)
  deletedAt DateTime? @db.Timestamptz(3)

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@index([tenantId, eventId])
}

enum ContactKind { HR PROGRAMME LOGISTICS URGENT IT OTHER }

// ─────────────────────────────────────────────────────────────
// МЕДІА (лише зовнішні посилання + обкладинка)
// ─────────────────────────────────────────────────────────────

model MediaLink {
  id          String @id @default(cuid(2))
  tenantId    String
  eventId     String
  kind        MediaKind
  title       String
  description String? @db.Text
  /// Зовнішнє посилання. Тільки https, домен має бути в allowlist (docs/08).
  url         String
  /// ОБОВ'ЯЗКОВА обкладинка. Зберігається в нашому S3 у 3 розмірах.
  coverUrl    String
  coverBlurhash String?
  provider    MediaProvider @default(OTHER)
  /// Ім'я фотографа/студії для kind = PHOTOGRAPHER.
  authorName  String?
  authorUrl   String?
  /// Підказка про доступ: «потрібен корпоративний акаунт», «пароль у листі».
  accessNote  String?
  /// Позначка, що галерея приймає завантаження від учасників.
  acceptsUploads Boolean @default(false)
  itemCountHint Int?
  status      MediaStatus @default(DRAFT)
  sortOrder   Int    @default(0)
  publishedAt DateTime? @db.Timestamptz(3)
  deletedAt   DateTime? @db.Timestamptz(3)
  createdBy   String?
  createdAt   DateTime @default(now()) @db.Timestamptz(3)
  updatedAt   DateTime @updatedAt @db.Timestamptz(3)

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@index([tenantId, eventId, status, sortOrder])
}

enum MediaKind { PARTICIPANT_UPLOAD PHOTOGRAPHER_GALLERY VIDEO PRESS AFTERMOVIE MATERIALS }
enum MediaProvider { GOOGLE_DRIVE GOOGLE_PHOTOS DROPBOX ONEDRIVE FLICKR SMUGMUG PIXIESET YOUTUBE VIMEO OTHER }
enum MediaStatus { DRAFT PUBLISHED HIDDEN }

/// Скарга учасника на вміст зовнішньої галереї (docs/08 §7).
/// Ми не модеруємо чужий контент, але даємо канал організатору.
model MediaReport {
  id          String @id @default(cuid(2))
  tenantId    String
  mediaLinkId String
  reporterId  String?
  reason      MediaReportReason
  comment     String? @db.Text
  status      MediaReportStatus @default(OPEN)
  resolvedBy  String?
  resolvedAt  DateTime? @db.Timestamptz(3)
  createdAt   DateTime @default(now()) @db.Timestamptz(3)

  @@index([tenantId, status, createdAt])
  @@index([mediaLinkId])
}

enum MediaReportReason { PRIVACY INAPPROPRIATE BROKEN_LINK WRONG_ACCESS OTHER }
enum MediaReportStatus { OPEN IN_PROGRESS RESOLVED DISMISSED }

// ─────────────────────────────────────────────────────────────
// WINSTYLE (мерч, без оплат у v1)
// ─────────────────────────────────────────────────────────────

model Product {
  id          String @id @default(cuid(2))
  tenantId    String
  eventId     String
  sku         String
  name        String
  description String? @db.Text
  imageUrl    String?
  priceCents  Int
  currency    String @db.Char(3) @default("EUR")
  isActive    Boolean @default(true)
  /// Ліміт одиниць на одного користувача.
  perUserLimit Int   @default(1)
  sortOrder   Int    @default(0)
  deletedAt   DateTime? @db.Timestamptz(3)

  event    Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  variants ProductVariant[]
  @@unique([eventId, sku])
  @@index([tenantId, eventId])
}

model ProductVariant {
  id        String @id @default(cuid(2))
  tenantId  String
  productId String
  size      String                      // "S" | "M" | "L" | "XL" | "ONE"
  /// Загальна кількість. reserved рахується з OrderItem — не денормалізуємо.
  stockTotal Int   @default(0)
  isActive  Boolean @default(true)

  product Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  items   OrderItem[]
  @@unique([productId, size])
}

model Order {
  id         String @id @default(cuid(2))
  tenantId   String
  eventId    String
  userId     String
  /// Людиночитний номер: MW-0482. Генерується послідовністю на івент.
  number     String
  status     OrderStatus @default(RESERVED)
  /// Хеш коду видачі; QR містить одноразовий підписаний токен, не сам id.
  pickupCodeHash String? @unique
  pickedUpAt DateTime? @db.Timestamptz(3)
  pickedUpBy String?
  cancelledAt DateTime? @db.Timestamptz(3)
  createdAt  DateTime @default(now()) @db.Timestamptz(3)
  updatedAt  DateTime @updatedAt @db.Timestamptz(3)

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  user  User  @relation(fields: [userId], references: [id], onDelete: Cascade)
  items OrderItem[]

  @@unique([eventId, number])
  @@index([tenantId, eventId, status])
  @@index([userId])
}

enum OrderStatus { RESERVED READY_FOR_PICKUP PICKED_UP CANCELLED EXPIRED }

model OrderItem {
  id        String @id @default(cuid(2))
  tenantId  String
  orderId   String
  variantId String
  quantity  Int    @default(1)
  priceCents Int                          // фіксується на момент резерву

  order   Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variant ProductVariant @relation(fields: [variantId], references: [id])
  @@unique([orderId, variantId])
  @@index([variantId])
}

// ─────────────────────────────────────────────────────────────
// ОГОЛОШЕННЯ ТА НОТИФІКАЦІЇ
// ─────────────────────────────────────────────────────────────

model Announcement {
  id        String @id @default(cuid(2))
  tenantId  String
  eventId   String
  title     String
  body      String  @db.Text
  severity  AnnouncementSeverity @default(INFO)
  linkUrl   String?
  startsAt  DateTime? @db.Timestamptz(3)
  endsAt    DateTime? @db.Timestamptz(3)
  isPinned  Boolean @default(false)
  isPublished Boolean @default(false)
  createdBy String?
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  deletedAt DateTime? @db.Timestamptz(3)

  event Event @relation(fields: [eventId], references: [id], onDelete: Cascade)
  @@index([tenantId, eventId, isPublished, startsAt])
}

enum AnnouncementSeverity { INFO WARNING CRITICAL }

model Notification {
  id        String @id @default(cuid(2))
  tenantId  String
  eventId   String?
  kind      NotificationKind
  title     String
  body      String
  linkUrl   String?
  /// Сегментація: { roles?, departments?, registeredOnly?, activityId?, userIds? }
  audience  Json
  channels  String[]                     // ["push","email","inapp"]
  scheduledAt DateTime? @db.Timestamptz(3)
  sentAt    DateTime? @db.Timestamptz(3)
  status    NotificationStatus @default(DRAFT)
  createdBy String?
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  event      Event? @relation(fields: [eventId], references: [id], onDelete: Cascade)
  deliveries NotificationDelivery[]
  @@index([tenantId, status, scheduledAt])
}

enum NotificationKind { ANNOUNCEMENT REMINDER SCHEDULE_CHANGE PROGRAMME_UPDATE REGISTRATION MEDIA_READY MERCH SYSTEM }
enum NotificationStatus { DRAFT SCHEDULED SENDING SENT FAILED CANCELLED }

model NotificationDelivery {
  id             String @id @default(cuid(2))
  tenantId       String
  notificationId String
  userId         String
  channel        String
  status         DeliveryStatus @default(QUEUED)
  error          String?
  sentAt         DateTime? @db.Timestamptz(3)
  readAt         DateTime? @db.Timestamptz(3)

  notification Notification @relation(fields: [notificationId], references: [id], onDelete: Cascade)
  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([notificationId, userId, channel])
  @@index([userId, readAt])
}

enum DeliveryStatus { QUEUED SENT DELIVERED FAILED SKIPPED }

/// Налаштування каналів по типах. Відсутній рядок = дефолт з docs/11 §2.
/// Критичні типи (SCHEDULE_CHANGE, REGISTRATION, SYSTEM) ігнорують enabled=false.
model NotificationPreference {
  id       String @id @default(cuid(2))
  userId   String
  tenantId String
  kind     NotificationKind
  channel  String                        // "push" | "email"
  enabled  Boolean @default(true)
  updatedAt DateTime @updatedAt @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, tenantId, kind, channel])
  @@index([tenantId, userId])
}

model PushSubscription {
  id        String @id @default(cuid(2))
  tenantId  String
  userId    String
  endpoint  String @unique
  p256dh    String
  auth      String
  userAgent String?
  locale    String?
  isValid   Boolean @default(true)
  lastSuccessAt DateTime? @db.Timestamptz(3)
  createdAt DateTime @default(now()) @db.Timestamptz(3)

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([tenantId, userId, isValid])
}

// ─────────────────────────────────────────────────────────────
// ЛОКАЛІЗАЦІЯ ТА АУДИТ
// ─────────────────────────────────────────────────────────────

/// Переклади контенту (не UI-рядків — ті у файлах messages/*.json).
model Translation {
  id         String @id @default(cuid(2))
  tenantId   String
  entityType String                       // "Activity", "ContentBlock", "MediaLink"…
  entityId   String
  field      String                       // "title", "body"
  locale     String
  value      String @db.Text
  updatedBy  String?
  updatedAt  DateTime @updatedAt @db.Timestamptz(3)

  @@unique([entityType, entityId, field, locale])
  @@index([tenantId, locale])
}

model AuditLog {
  id         String @id @default(cuid(2))
  tenantId   String?
  actorId    String?
  actorEmailHash String?
  actorRole  String?
  action     String                        // "event.publish", "brand.update", "secret.rotate"
  entityType String?
  entityId   String?
  /// Різниця before/after з видаленими чутливими полями.
  diff       Json?
  ipHash     String?
  userAgent  String?
  requestId  String?
  createdAt  DateTime @default(now()) @db.Timestamptz(3)

  actor User? @relation("AuditActor", fields: [actorId], references: [id], onDelete: SetNull)
  @@index([tenantId, createdAt])
  @@index([entityType, entityId])
  @@index([actorId, createdAt])
}

/// Продуктова аналітика. Власна таблиця (рішення зафіксовано в docs/13 §8):
/// без сторонніх трекерів, без cookie, ідентифікатор псевдонімізований.
model AnalyticsEvent {
  id          String @id @default(cuid(2))
  tenantId    String
  eventId     String?
  /// HMAC(userId, analytics.pepper). Не дозволяє зворотну ідентифікацію.
  subjectHash String
  name        String                       // "screen.view", "activity.save", …
  props       Json?                        // без PII, лише id та enum-значення
  occurredAt  DateTime @default(now()) @db.Timestamptz(3)

  @@index([tenantId, name, occurredAt])
  @@index([tenantId, eventId, occurredAt])
}

/// GDPR-запити (експорт/видалення).
model DataRequest {
  id        String @id @default(cuid(2))
  tenantId  String
  userId    String
  kind      DataRequestKind
  status    DataRequestStatus @default(PENDING)
  resultUrl String?                        // підписане тимчасове посилання
  processedAt DateTime? @db.Timestamptz(3)
  createdAt DateTime @default(now()) @db.Timestamptz(3)
  @@index([tenantId, status])
}

enum DataRequestKind { EXPORT DELETE }
enum DataRequestStatus { PENDING PROCESSING DONE FAILED }
```

## 3. Обов'язкові індекси й обмеження понад `@@index`

Створюються raw-SQL міграцією:

```sql
-- Унікальний номер замовлення в межах івенту без гонок
CREATE SEQUENCE IF NOT EXISTS order_number_seq;

-- Швидка вибірка «зараз / далі»
CREATE INDEX activity_now_next_idx
  ON "Activity" ("eventId", "startsAt", "endsAt")
  WHERE "deletedAt" IS NULL AND status <> 'CANCELLED';

-- Пошук по програмі
CREATE INDEX activity_title_trgm_idx ON "Activity" USING gin (title gin_trgm_ops);

-- Не більше однієї активної реєстрації
CREATE UNIQUE INDEX registration_active_uniq
  ON "EventRegistration" ("eventId","userId")
  WHERE status IN ('PENDING','CONFIRMED','WAITLISTED');

-- Час закінчення після початку
ALTER TABLE "Activity" ADD CONSTRAINT activity_time_valid CHECK ("endsAt" > "startsAt");
ALTER TABLE "Event"    ADD CONSTRAINT event_time_valid    CHECK ("endsAt" >= "startsAt");

-- Місткість невід'ємна
ALTER TABLE "Activity" ADD CONSTRAINT activity_capacity_positive CHECK (capacity IS NULL OR capacity > 0);
ALTER TABLE "ProductVariant" ADD CONSTRAINT stock_nonneg CHECK ("stockTotal" >= 0);
```

## 4. Row Level Security

### 4.1 Канонічний перелік тенант-скоупованих сутностей

Це **єдине джерело істини**. На нього посилаються `CLAUDE.md` §5.1,
`docs/04` §6 і тест ізоляції `docs/14` §2.1. Додавання нової моделі з
`tenantId` **зобовʼязує** оновити цей список, `tenant-client.ts` і тест.

```
Brand · BrandVersion · FeatureFlag · TenantSetting · SecretSetting ·
TenantDomain · Membership · Invite · Consent · HrAssignment ·
Event · Activity · EventRegistration · ActivityBooking · SavedActivity ·
Place · ContentBlock · ChecklistItem · ChecklistState · Contact ·
MediaLink · MediaReport ·
Product · ProductVariant · Order · OrderItem ·
Announcement · Notification · NotificationDelivery ·
NotificationPreference · PushSubscription ·
Translation · AnalyticsEvent · DataRequest · AuditLog (tenantId nullable)
```

`User`, `Session`, `Account`, `AuthFactor`, `RecoveryCode`,
`VerificationToken`, `TrustedDevice`, `LoginAttempt` — **не** тенант-
скоуповані (користувач може належати кільком тенантам). Доступ до них
контролюється через `Membership` і політики, а не через RLS.

### 4.2 Політика

Для кожної таблиці з переліку §4.1:

```sql
ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Activity" FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Activity"
  USING ("tenantId" = current_setting('app.tenant_id', true))
  WITH CHECK ("tenantId" = current_setting('app.tenant_id', true));
```

- Застосунок працює під роллю `app_user` (не власник таблиць, без `BYPASSRLS`).
- Prisma-екстеншн виконує `SET LOCAL app.tenant_id = $1` на початку кожної
  транзакції; запити поза транзакцією з тенант-таблицями заборонені лінтом.
- Роль `app_admin` (міграції, seed) має `BYPASSRLS` і використовується лише
  в CI, ніколи в рантаймі застосунку.
- Для SUPER_ADMIN крос-тенантних операцій — окремий явний
  `withPlatformScope()` з обов'язковим записом в `AuditLog`.
- **Реалізація (2026-08):** додано третій, вужчий виняток `withSystemScope()`
  для читань, які за визначенням відбуваються **до** того, як тенант відомий:
  резолв домену пошти → тенант, `Membership` сесії, бренд на екрані логіну,
  платформні `FeatureFlag`/`SecretSetting`. Повний перелік місць виклику й
  обґрунтування — `docs/DELIVERY-NOTES.md` §1.1. Для контенту учасника
  (`Event`, `Activity`, `EventRegistration`, `MediaLink`, `Order`…) він не
  використовується ніколи.

### 4.3 Поля, додані понад §2

Реалізація додала кілька колонок, потрібних для поведінки, яку ТЗ вимагає, але
для якої в схемі §2 не було місця: `Session.stepUpAt`,
`Session.absoluteExpiresAt`, `Activity.isMandatory`, `Activity.announcedAt`,
`EventRegistration.checkInMode`, `AuthFactor.wrappedKey`,
`BrandVersion.tenantId`, `ProductVariant.tenantId`,
`NotificationDelivery.createdAt`. Обґрунтування кожного —
`docs/DELIVERY-NOTES.md` §1.9.

## 5. Політики збереження даних

| Дані | Термін | Дія |
|---|---|---|
| `VerificationToken` | 24 год після `expiresAt` | видалення |
| `Session` | 30 днів після `expiresAt` | видалення |
| `LoginAttempt` | 90 днів | видалення |
| `NotificationDelivery` | 12 місяців | видалення |
| `AnalyticsEvent` | 90 днів | видалення сирих подій (агрегати лишаються) |
| `MediaReport` (закриті) | 12 місяців | видалення |
| `AuditLog` | 24 місяці | архівація в холодне сховище |
| Реєстрації минулих івентів | 24 місяці | анонімізація (`userId` → null, збереження агрегатів) |
| Акаунт після запиту на видалення | 30 днів grace | жорстке видалення + анонімізація історії |

## 6. Seed-дані (`pnpm db:seed`)

Обов'язково створює:
- 2 тенанти: `softswiss` (домени `softswiss.com`, `softswiss.io`) і
  `acme` (`acme.example`) — **з різними брендами**, щоб white-label був
  перевіряємий з першого дня;
- 3 івенти (усі зі `status = PUBLISHED`, фаза задається датами відносно
  `now` при сіді — див. `docs/06` §2): один **upcoming** з відкритою
  реєстрацією, один **live** (Mix Week, 7 днів, повна програма з `design/`),
  один **past** (`ARCHIVED`) з 4 `MediaLink` — 2 `PARTICIPANT_UPLOAD`,
  2 `PHOTOGRAPHER_GALLERY`, усі з обкладинками;
- ~40 активностей, 7 місць мапи, EventStyle-блоки, чек-ліст, 4 товари;
- користувачів: `super@platform.test`, `admin@softswiss.com`,
  `editor@softswiss.com`, `user1..user50@softswiss.com`, `admin@acme.example`
  (усі seed-домени перелічені в `SEED_DOMAINS` — цей же список перевіряє
  реліз-чекліст `docs/12` §15);
- для навантажувальних тестів — окрема команда `pnpm db:seed:load`, що
  створює 3 000 користувачів і 3 000 реєстрацій.
