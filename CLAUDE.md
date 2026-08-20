# CLAUDE.md — робочі правила проєкту `mixweek-web`

> Цей файл читається Claude Code автоматично на початку кожної сесії.
> Він містить **правила**, а не опис фіч. Опис фіч — у `docs/`.

---

## 1. Що це за проєкт

Мультитенантна (white-label) **веб-платформа корпоративних івентів**:
mobile-first PWA для учасників + адмін-панель для організаторів.

Базовий кейс — **SOFTSWISS Mix Week** (21–27 жовтня, Лімасол).
Платформа мусить обслуговувати **кілька компаній** з різним брендингом,
які визначаються за доменом корпоративної пошти користувача.

Це **не** нативний застосунок. Це адаптивний веб: мобільний веб (основний
сценарій, ~85% трафіку) + повноцінна десктопна адаптація.

**Масштаб:** 1 500–3 000 користувачів. Не будуємо мікросервіси, Kubernetes,
шардинг, event sourcing. Будуємо один добре зроблений моноліт.

**Пріоритет №1 — безпека.** Див. `docs/12-security.md`. Жоден PR не
мержиться без проходження чекліста `docs/12-security.md` §14.

---

## 2. Порядок читання документації

| Файл | Коли читати |
|---|---|
| `docs/00-overview.md` | завжди, першим — контекст, скоуп, глосарій |
| `docs/01-architecture.md` | перед будь-якою структурною зміною |
| `docs/02-data-model.md` | перед зміною `schema.prisma` |
| `docs/03-auth.md` | будь-що навколо логіну/сесій/ролей |
| `docs/04-white-label.md` | будь-що навколо брендингу/тем/тенантів |
| `docs/05-design-system.md` | будь-який UI-компонент |
| `docs/06-events.md` | програма, реєстрації, минулі/майбутні івенти |
| `docs/07-screens.md` | конкретний екран учасника |
| `docs/08-media.md` | фото/галереї/медіа-лінки |
| `docs/09-api.md` | будь-який route handler |
| `docs/10-admin.md` | адмін-панель, RBAC |
| `docs/11-notifications.md` | push / email |
| `docs/12-security.md` | **обов'язково перед кожним PR** |
| `docs/13-nfr.md` | продуктивність, i18n, a11y, offline |
| `docs/14-qa.md` | тести й критерії приймання |
| `docs/15-roadmap.md` | що робимо зараз, що потім |

Дизайн-референс (HTML-прототип мобільного застосунку) — у `design/`.
Це **референс вигляду, а не код для копіювання**.

---

## 3. Стек — зафіксовано, не змінювати без узгодження

```
Next.js 15 (App Router) · React 19 · TypeScript 5 (strict)
Tailwind CSS 4 + shadcn/ui (Radix primitives)
Prisma 6 + PostgreSQL 16
Auth.js (NextAuth v5) — database sessions
Redis (Valkey) — rate limiting, кеш, черги
BullMQ — фонові задачі (розсилки, promote з waitlist)
Zod — валідація на межі (входи API, env, форми)
next-intl — i18n (en / ru / uk)
Vitest + Playwright + axe-core + k6
Власна аналітика (таблиця AnalyticsEvent) — без сторонніх трекерів
S3-сумісне сховище (Cloudflare R2 / MinIO) — лише бренд-ассети та обкладинки
Resend / SMTP — транзакційна пошта
Web Push (VAPID) — пуші
Sentry — помилки; OpenTelemetry → Grafana/Loki — логи й метрики
```

Заборонено без узгодження: інші ORM, інші стейт-менеджери окрім
TanStack Query + React state, CSS-in-JS, UI-кіти окрім shadcn/ui,
будь-які пакети з < 10k тижневих завантажень у прод-залежностях.

---

## 4. Структура репозиторію

```
mixweek-web/
├─ src/
│  ├─ app/
│  │  ├─ (auth)/                 # логін, 2FA, вихід
│  │  ├─ (app)/                  # застосунок учасника
│  │  │  ├─ events/              # список майбутніх/минулих
│  │  │  │  └─ [slug]/           # програма, мапа, медіа, мерч івенту
│  │  │  ├─ notifications/       # історія in-app
│  │  │  └─ profile/
│  │  ├─ admin/                  # адмін-панель
│  │  └─ api/v1/                 # route handlers
│  ├─ modules/                   # ВЕРТИКАЛЬНІ зрізи домену
│  │  ├─ auth/  tenancy/  branding/  events/  programme/
│  │  ├─ registrations/  media/  merch/  map/  notifications/
│  │  ├─ analytics/  admin/
│  │  └─ <module>/{ service.ts, repository.ts, schemas.ts, policies.ts, ui/ }
│  ├─ components/ui/             # shadcn/ui примітиви (без домену)
│  ├─ components/patterns/       # композитні компоненти (EventCard, DayPicker…)
│  ├─ lib/                       # db, redis, logger, rate-limit, crypto, env
│  ├─ styles/                    # tokens.css, globals.css
│  └─ messages/                  # en.json, ru.json, uk.json
├─ prisma/{schema.prisma, migrations/, seed.ts}
├─ tests/{unit,e2e,load}
├─ docs/                         # ЦЕ ТЗ
└─ design/                       # HTML-прототип-референс
```

**Правило залежностей:** `app/` → `modules/` → `lib/`.
Зворотних імпортів немає. Модуль не імпортує внутрішній код іншого модуля —
лише його публічний `index.ts`.

---

## 5. Незламні правила (hard rules)

### 5.1 Мультитенантність
1. **Кожен запит до БД по тенант-скоупованій таблиці ОБОВ'ЯЗКОВО містить
   `tenantId`.** Не «зазвичай», а завжди.
2. `tenantId` береться **тільки з серверної сесії**, ніколи з тіла запиту,
   query-параметра чи заголовка.
3. Доступ до Prisma — тільки через `getTenantDb(session)` з
   `src/lib/db/tenant-client.ts` (Prisma Client Extension, що інжектить
   `where: { tenantId }` в кожен `find*/update*/delete*/count`).
   Прямий імпорт `prisma` дозволений лише в `src/lib/db/*`, у seed і в
   міграційних скриптах. Лінт-правило це forbid-ить.
4. Кожна нова тенант-скоупована модель додається до списку в
   `tenant-client.ts` **і** покривається тестом «крос-тенантний доступ
   повертає 404».

### 5.2 Безпека
5. Жодного `dangerouslySetInnerHTML` без `DOMPurify` і документованого
   обґрунтування в коментарі.
6. **Секрети.** У `.env` живе лише bootstrap-мінімум — **канонічний
   перелік у `docs/12-security.md` §2.1**, інших списків не існує.
   Усі інші секрети (SMTP,
   Google OAuth client secret, VAPID, S3, вебхуки, API-ключі інтеграцій)
   зберігаються **зашифрованими в БД** (envelope encryption AES-256-GCM,
   таблиця `SecretSetting`) і читаються через `getSecret(key)` —
   ніколи напряму з `process.env`. Жодних секретів у коді, в
   `NEXT_PUBLIC_*` та в логах. `.env` читається через `src/lib/env.ts`
   (Zod, fail-fast при старті).
   Ключі секретів беруться із закритого union `SecretKey`
   (`docs/12` §2.2) — довільні рядки заборонені.
7. Кожен route handler починається з: `authorize()` → `rateLimit()` →
   `zod.parse()`. У такому порядку. Без винятків.
8. Кожна мутація пише запис в `AuditLog`.
9. Зовнішні URL (фото-галереї, лінки) — тільки `https:`, з allowlist схем і
   перевіркою на SSRF при серверному фетчі. Рендеряться з
   `rel="noopener noreferrer"` і `target="_blank"`.
10. Помилки назовні — узагальнені (`{ error: { code, message } }`), деталі —
    тільки в лог із `requestId`. Ніколи не повертати stack trace / SQL /
    ім'я таблиці.

### 5.3 Брендинг
11. **Жодного хардкоду кольору** в компонентах. Тільки CSS-змінні
    (`var(--color-primary-500)`) через Tailwind-токени.
    Літерали `#hex`, `rgb(`, `hsl(` у `src/components/**` і `src/modules/**`
    заборонені лінт-правилом. Виняток — `src/styles/tokens.css`.
12. Логотип, назва застосунку, шрифт і палітра завжди беруться з
    активного бренду (`useBrand()` / `getBrand()`), ніколи не з констант.

### 5.4 Код
13. TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. `any`
    заборонений (лінт `error`); коли неминучий — `unknown` + Zod.
14. Server Components за замовчуванням. `"use client"` — лише там, де
    потрібні стан/ефекти/браузерні API, і якнайнижче по дереву.
15. Бізнес-логіка живе в `modules/*/service.ts`, не в компонентах і не в
    route handlers. Route handler = auth + validate + виклик сервісу +
    серіалізація.
16. Дати в БД — завжди UTC (`timestamptz`). Таймзона івенту зберігається на
    івенті (`Event.timezone`), форматування — тільки в UI.
17. Гроші — цілі числа в мінорних одиницях (`priceCents: Int`) + `currency`.
18. Міграції — тільки `prisma migrate dev` / `deploy`. Ніякого
    `db push` після першого релізу.

### 5.5 Процес
19. Кожна фіча = міграція (за потреби) + сервіс + тести + оновлення
    відповідного файлу в `docs/`. Документація не відстає від коду.
20. Перед тим як писати код нової фічі — прочитай відповідний `docs/*.md`
    **повністю**. Не вгадуй.
21. Якщо вимога в `docs/` суперечить іншій — **зупинись і запитай**, не
    вирішуй сам.

---

## 6. Команди

```bash
pnpm dev                 # dev-сервер
pnpm build && pnpm start # прод-збірка
pnpm db:migrate          # prisma migrate dev
pnpm db:seed             # демо-дані: 2 тенанти, 3 івенти, ~40 активностей
pnpm db:studio
pnpm test                # vitest
pnpm test:e2e            # playwright (mobile + desktop viewports)
pnpm test:a11y           # axe
pnpm test:load           # k6 push-storm сценарій
pnpm lint && pnpm typecheck
pnpm audit:security      # pnpm audit + semgrep + перевірка headers
```

CI блокує мерж при: провалі типів, лінту, unit/e2e, a11y-порушеннях рівня
serious+, `pnpm audit` high/critical, перевищенні бюджету бандла.

---

## 7. Пріоритети при конфлікті вимог

1. Безпека й приватність даних
2. Коректність (правильні дані на екрані)
3. Доступність (a11y) і продуктивність на мобільному 4G
4. Відповідність дизайну
5. Швидкість розробки

---

## 8. Чого НЕ робити в v1

- Платежі, доставка, повернення в WinStyle (лише резерв + QR).
- Реальний indoor-навігатор і live GPS.
- Соцстрічка, чати, matchmaking.
- Завантаження фото учасниками в наше сховище (тільки зовнішні лінки —
  див. `docs/08-media.md`).
- Нативні застосунки iOS/Android.
- Інтеграція з корпоративним AD/SAML (архітектурно підготовлена — див.
  `docs/03-auth.md`, але не реалізується).
