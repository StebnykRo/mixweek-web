# 09 · API

## 1. Загальні правила

- База: `/api/v1`. Версія в шляху. Ламаючі зміни → `/api/v2`.
- Формат — JSON. Кодування UTF-8. Дати — ISO 8601 з таймзоною (UTC).
- Автентифікація — cookie-сесія. Bearer-токенів для учасників немає.
- **Кожен handler:** `authorize()` → `rateLimit()` → `zod.parse()` →
  `service()` → серіалізація. Саме в такому порядку.
- Усі відповіді з персональними даними:
  `Cache-Control: private, no-store`, `Vary: Cookie`.
- CSRF: `SameSite=Lax` + перевірка `Origin`/`Sec-Fetch-Site` на всіх
  небезпечних методах + double-submit токен для форм.
- Ідемпотентність: `Idempotency-Key` (обов'язковий для POST реєстрацій,
  бронювань, резервів). Ключ живе 24 год у Redis.
- Пагінація — курсорна: `?cursor=&limit=` (max 100), відповідь
  `{ items, nextCursor }`. Offset не використовуємо.
- OpenAPI генерується з Zod-схем (`zod-to-openapi`), публікується на
  `/api/v1/openapi.json` (в проді — тільки для адмінів).

### Формат помилки

```json
{ "error": { "code": "REGISTRATION_CLOSED",
             "message": "Registration is closed for this event",
             "requestId": "req_01J..." } }
```

Ніколи не повертаємо: stack trace, SQL, імена таблиць, внутрішні шляхи,
підказки про існування чужих обʼєктів. Для «немає доступу» — **404**.

Коди: `UNAUTHENTICATED` 401 · `MFA_REQUIRED` 401 · `FORBIDDEN` 403 ·
`NOT_FOUND` 404 · `CONFLICT` 409 · `VALIDATION_FAILED` 422 ·
`RATE_LIMITED` 429 · `EVENT_FULL` 409 · `EVENT_ENDED` 409 ·
`REGISTRATION_CLOSED` 422 · `OUT_OF_STOCK` 409 · `INTERNAL` 500.

### Наскрізні заголовки відповіді
`X-Request-Id` · `RateLimit-Limit` / `RateLimit-Remaining` /
`RateLimit-Reset` · `Retry-After` (при 429).

---

## 2. Автентифікація

| Метод | Шлях | Опис |
|---|---|---|
| POST | `/auth/start` | `{ email }` → `{ ok, brand? }`, завжди 200 |
| POST | `/auth/verify` | `{ code }` або `?token=` → сесія (можливо `MFA_REQUIRED`) |
| POST | `/auth/mfa/setup` | ініціалізація TOTP → `{ otpauthUrl, qrSvg }` |
| POST | `/auth/mfa/confirm` | `{ code }` → активація + 10 recovery-кодів |
| POST | `/auth/mfa/verify` | `{ code, trustDevice? }` → `mfaSatisfied = true` |
| POST | `/auth/mfa/recovery` | `{ code }` → вхід + сповіщення на пошту |
| POST | `/auth/logout` | `{ allDevices? }` |
| GET | `/auth/session` | поточна сесія: user, tenant, brand, permissions |
| GET | `/auth/sessions` · DELETE `/auth/sessions/{id}` | керування пристроями |

## 3. Івенти

| Метод | Шлях | Опис |
|---|---|---|
| GET | `/events?scope=upcoming\|past\|mine&q=&cursor=` | список |
| GET | `/events/{slug}` | деталі + `phase`, `myRegistration`, `serverTime` |
| GET | `/events/{slug}/activities?day=&track=&place=&from=&to=&q=` | програма (кешовано, ETag) |
| GET | `/events/{slug}/activities/{id}` | деталі активності |
| GET | `/events/{slug}/places` | місця мапи |
| GET | `/events/{slug}/content?section=` | ContentBlock-и |
| GET | `/events/{slug}/contacts` | контакти для Help |
| GET | `/events/{slug}/announcements` | активні оголошення |
| GET | `/events/{slug}/media` | опубліковані медіа-картки |
| GET | `/events/{slug}/checklist` | пункти + мій стан |

Параметри фільтра програми:
`day` — дата в таймзоні івенту (`YYYY-MM-DD`) · `track` — CSV значень
`Track` · `place` — CSV `placeId` · `from`/`to` — час доби `HH:mm` у
таймзоні івенту (для пресетів «Ранок/День/Вечір/Ніч») · `q` — пошук за
назвою. Комбінуються логікою AND. Ключ кешу/ETag включає **усі** параметри.

## 4. Персональні дії

| Метод | Шлях | Опис |
|---|---|---|
| POST | `/events/{slug}/registrations` | реєстрація, `Idempotency-Key` |
| DELETE | `/events/{slug}/registrations/me` | скасування |
| GET | `/events/{slug}/registrations/me` | стан, позиція в черзі |
| GET | `/events/{slug}/check-in-token` | короткоживучий QR-токен (TTL 60 с) |
| GET | `/events/{slug}/my-schedule` | ♥ + бронювання |
| GET | `/events/{slug}/my-schedule.ics` | експорт календаря |
| PUT/DELETE | `/activities/{id}/save` | ♥ додати/зняти |
| POST/DELETE | `/activities/{id}/bookings` | бронювання/скасування |
| PUT | `/checklist/{itemId}` | `{ checked }` |
| GET/PATCH | `/me` | `name`, `jobTitle`, `department`, `team`, `locale` |
| GET | `/me/hr-contact` | персональний HR BP (User.hrContactId → HrAssignment → Contact(HR)) |
| GET | `/me/notifications?cursor=` | історія in-app |
| POST | `/me/notifications/{id}/read` | позначити прочитаним |
| GET/PUT | `/me/notification-preferences` | налаштування каналів по типах |
| POST/DELETE | `/me/push-subscriptions` | web push |
| POST | `/me/data-requests` | `{ kind: "EXPORT" \| "DELETE" }` |
| POST | `/media/{id}/reports` | скарга на зовнішню галерею |
| POST | `/analytics/events` | батч подій аналітики (без PII, rate-limited) |

## 5. WinStyle

| Метод | Шлях |
|---|---|
| GET | `/events/{slug}/products` — товари з доступними залишками |
| POST | `/events/{slug}/orders` — `{ items: [{variantId, quantity}] }`, ідемпотентно |
| GET | `/events/{slug}/orders/me` |
| DELETE | `/orders/{id}` — скасування резерву |
| GET | `/orders/{id}/pickup-token` — короткоживучий QR |

## 6. Адмін-API (`/api/v1/admin/*`)

Усе під `TENANT_ADMIN`+ (або нижчі ролі за матрицею `docs/10`), з
обов'язковим `AuditLog`, зі step-up 2FA на чутливих операціях.

```
GET/POST/PATCH/DELETE  /admin/events[/{id}]
POST                   /admin/events/{id}/publish        (step-up)
GET/POST/PATCH/DELETE  /admin/events/{id}/activities[/{id}]
POST                   /admin/activities/{id}/notify-change
GET/POST/PATCH/DELETE  /admin/events/{id}/places[/{id}]
GET/POST/PATCH/DELETE  /admin/events/{id}/content[/{id}]
GET/POST/PATCH/DELETE  /admin/events/{id}/contacts[/{id}]
GET/POST/PATCH/DELETE  /admin/events/{id}/checklist[/{id}]
GET/POST/PATCH/DELETE  /admin/events/{id}/media[/{id}]
POST                   /admin/media/{id}/cover           (upload)
GET/PATCH              /admin/media-reports[/{id}]       (скарги на галереї)
GET/PATCH              /admin/events/{id}/registrations  (фільтри, масові дії)
POST                   /admin/events/{id}/registrations/export   (CSV/XLSX, async)
POST                   /admin/events/{id}/check-in       (сканер QR)
GET/POST/PATCH/DELETE  /admin/events/{id}/products[/{id}]
GET/PATCH              /admin/orders
GET/POST/PATCH         /admin/announcements
GET/POST               /admin/notifications              (створення, розсилка)
POST                   /admin/notifications/{id}/send    (step-up, якщо >100)
GET/POST/PATCH         /admin/brands[/{id}]
POST                   /admin/brands/{id}/publish        (step-up)
POST                   /admin/brands/{id}/rollback/{ver} (step-up)
GET/POST/PATCH/DELETE  /admin/users, /admin/invites
POST                   /admin/users/import               (CSV, step-up, dry-run + apply)
GET/PUT                /admin/hr-assignments
GET                    /admin/analytics                  (агрегати, без сирих подій)
GET/PATCH              /admin/feature-flags
GET/PUT                /admin/settings
GET/PUT/DELETE         /admin/secrets                    (step-up, значення не читається)
GET/POST/PATCH         /admin/translations
GET                    /admin/audit-log
```

**Платформні (`SUPER_ADMIN`):** `/admin/platform/tenants`,
`/admin/platform/domains`, `/admin/platform/impersonate` (тільки тенант,
не користувач), `/admin/platform/health`.

## 6.1 Службові ендпоінти (поза `/api/v1`)

| Метод | Шлях | Доступ | Кеш |
|---|---|---|---|
| GET | `/api/health` | публічний, але без деталей: `{ status: "ok" }` або 503. Розширена відповідь (БД, Redis, черги) — тільки з внутрішньої мережі або з `SUPER_ADMIN` | `no-store` |
| POST | `/api/csp-report` | публічний, rate-limit 60/хв на IP, тіло ≤ 8 КБ, лише `application/csp-report`; вміст логується, не зберігається в БД | `no-store` |
| GET | `/manifest.webmanifest` | публічний, генерується під бренд тенанта | `private, max-age=300` |
| GET | `/.well-known/security.txt` | публічний | `public, max-age=86400` |

`/api/health` **не** розкриває версію, назви сервісів чи тексти помилок —
це вектор розвідки.

## 7. Кешування й ETag

- `GET /events/{slug}/activities` і `/places` — `ETag` + `304`;
  серверний кеш з тегами `event:{id}`, інвалідація при публікації змін.
- Персональні ендпоінти — без кешу, ніколи не в CDN.
- Service Worker кешує програму, мапу, help, EventStyle
  (stale-while-revalidate, TTL 24 год) і **ніколи** — відповіді
  `/me/*`, `/auth/*`, `/admin/*`.

## 8. Валідація входу

- Кожен вхід описаний Zod-схемою в `modules/*/schemas.ts`.
- `z.strictObject()` за замовчуванням — зайві поля відхиляються (не
  ігноруються).
- Ліміти: тіло запиту ≤ 256 КБ (крім завантаження файлів ≤ 10 МБ),
  рядки з явним `max()`, масиви з `max()`, глибина JSON ≤ 10.
- HTML у полях контенту зберігається як Markdown і санітизується **при
  рендері** (rehype-sanitize з жорстким allowlist), не при збереженні.
- Завантаження файлів: перевірка magic bytes, а не `Content-Type` і не
  розширення; повторне кодування зображень.

## 9. Вебхуки (не в v1, зарезервовано)

Вихідні вебхуки на події `registration.created`, `event.published`,
`media.published`. Підпис `HMAC-SHA256` заголовком
`X-MixWeek-Signature`, timestamp у підписі, вікно 5 хв, ретраї 5 разів.
Секрет — у `SecretSetting`.
