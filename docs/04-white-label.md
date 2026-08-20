# 04 · White-label: тенанти, бренди, резолв теми

## 1. Модель

```
Tenant ──┬── TenantDomain[]   (softswiss.com, softswiss.io, acme.example)
         ├── Brand[]          (кілька тем на тенант)
         └── Event[] ── brandId?   (оверрайд теми на конкретний івент)
```

**Ланцюг застосування теми (від найвищого пріоритету):**

```
1. ?brandPreview=<id>   — тільки для адмінів, тільки staging/preview, з підписом
2. Event.brandId        — тема конкретного івенту (напр. окремий стиль Mix Week)
3. TenantDomain.brandId — тема під конкретний домен (com і io можуть різнитись)
4. Tenant.defaultBrand  — дефолт компанії
5. Platform default     — нейтральний бренд платформи (для екрану логіну)
```

## 2. Як користувач отримує «свій» бренд

### 2.1 До логіну — прогресивний брендинг

Екран логіну стартує в **нейтральному бренді платформи**. Щойно користувач
ввів email і перейшов до наступного кроку:

```
POST /api/v1/auth/start { email: "ivan@softswiss.com" }
→ 200 { ok: true, brand: { id, appName, kicker, logoLightUrl, tokens } }
```

Фронт застосовує тему **миттєво** — користувач бачить лого й кольори своєї
компанії ще до того, як відкрив пошту. Це головна демонстрація white-label.

**Безпека:** віддається лише публічна частина бренду (лого, назва, токени) і
**лише** для верифікованих доменів (`TenantDomain.verifiedAt != null`) з
увімкненим налаштуванням `brand.public`. Це не є витоком: бренд компанії —
публічна інформація. Але сам факт «такий домен існує в системі» —
контрольований: для невідомих доменів повертається нейтральний бренд, і
відповідь виглядає ідентично (див. `docs/03-auth.md` §2, блок про
enumeration).

Окремого ліміту в резолву бренду немає — він відбувається всередині
`POST /auth/start` і покривається його лімітами (`docs/03` §7), що вже
роблять масове сканування доменів неможливим.

### 2.2 Після логіну

Тенант і бренд зафіксовані в сесії. `middleware.ts` кладе `brandId` у
заголовок запиту → root layout (RSC) вантажить бренд з кешу (Redis, TTL 5 хв,
інвалідація за тегом `brand:{id}`) і рендерить CSS-змінні **у SSR**.

### 2.3 Альтернативні входи (підтримуються)

- **Піддомен**: `softswiss.mixweek.app` → тенант резолвиться з хоста
  до будь-якого логіну. Використовується для кастомних посилань у
  запрошеннях.
- **Кастомний домен**: `mixweek.softswiss.com` → `TenantDomain` з
  `hostType = HOST` (див. `docs/02`, enum `DomainType`), TLS через CDN.
- Обидва — опційні, вмикаються фіче-флагом `tenant.custom_host`.

## 3. Токени теми

### 3.1 Структура `Brand.tokens` (валідується Zod)

```ts
const BrandTokensSchema = z.object({
  mode: z.enum(['light', 'dark', 'auto']).default('light'),
  colors: z.object({
    primary:   ColorRampSchema,   // 50..900, обов'язково
    secondary: ColorRampSchema,   // акцент / CTA
    neutral:   ColorRampSchema,
    bg:        HexSchema,
    surface:   HexSchema,
    ink:       HexSchema,
    inkMuted:  HexSchema,
    divider:   HexSchema,
    success:   HexSchema,
    warning:   HexSchema,
    danger:    HexSchema,
  }),
  radius: z.object({ sm: PxSchema, md: PxSchema, lg: PxSchema, pill: PxSchema }),
  font: z.object({
    display:    z.string(),        // "Caprasimo"
    body:       z.string(),        // "Figtree"
    source:     z.enum(['google', 'self-hosted', 'system']),
    displayUrl: z.string().url().optional(),
    bodyUrl:    z.string().url().optional(),
    scale:      z.number().min(0.9).max(1.15).default(1),
  }),
  shadow: z.object({ sm: z.string(), md: z.string(), lg: z.string() }).optional(),
});

// 6 або 8 знаків (8-й варіант — для напівпрозорих значень на кшталт divider)
const HexSchema = z.string().regex(/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/);
const ColorRampSchema = z.object({
  50: HexSchema, 100: HexSchema, 200: HexSchema, 300: HexSchema, 400: HexSchema,
  500: HexSchema, 600: HexSchema, 700: HexSchema, 800: HexSchema, 900: HexSchema,
});
```

Регекс на hex — не косметика: це вузьке місце для CSS-ін'єкції. Жодних
довільних рядків у CSS-змінних.

### 3.2 Рендер у DOM

```tsx
// src/app/layout.tsx (RSC)
const brand = await getBrandForRequest();
const css = brandToCssVars(brand.tokens); // повертає лише валідні пари
return (
  <html lang={locale} data-brand={brand.key}>
    <head>
      <style nonce={nonce}>{`:root{${css}}`}</style>
      {brand.font.source === 'google' && <link rel="stylesheet" href={safeFontUrl} />}
    </head>
    ...
  </html>
);
```

`brandToCssVars` — **allowlist-функція**: приймає лише відомі ключі й лише
значення, що пройшли Zod. Усе інше мовчки відкидається. Інлайновий `<style>`
має CSP-`nonce`.

### 3.3 Tailwind

`tailwind.config.ts` мапить палітру на змінні, а не на hex:

```ts
colors: {
  primary: { 50: 'var(--color-primary-50)', /* … */ 900: 'var(--color-primary-900)' },
  secondary: { /* … */ },
  neutral: { /* … */ },
  bg: 'var(--color-bg)', surface: 'var(--color-surface)',
  ink: 'var(--color-ink)', divider: 'var(--color-divider)',
},
borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', pill: 'var(--radius-pill)' },
fontFamily: { display: 'var(--font-display)', body: 'var(--font-body)' },
```

Компонент пише `bg-primary-500`, `rounded-lg`, `font-display` — і автоматично
працює в будь-якому бренді. **Хардкод hex у компонентах заборонений лінтом.**

### 3.4 Немає FOUC

Тема приходить у SSR-відповіді, тому спалаху дефолтної теми немає.
Для клієнтської зміни бренду (прев'ю в адмінці) змінні перезаписуються на
`document.documentElement` — без перезавантаження.

## 4. Бренд-редактор в адмінці

Розділ **Brand → Editor**. Ліворуч — форма, праворуч — живий прев'ю
телефона й десктопа в `<iframe sandbox>` з `?brandPreview=`.

Можливості:
1. **Завантаження лого**: light / dark / mark (квадратне) / OG-зображення.
   SVG і PNG. SVG проходить обов'язкову санітизацію (`svgo` + видалення
   `<script>`, `on*`, `<foreignObject>`, зовнішніх посилань) — див. `docs/12`.
2. **Палітра**: вводиться один базовий колір → рампа 50…900 генерується
   автоматично (OKLCH-інтерполяція, `culori`); кожен крок можна
   перевизначити вручну.
3. **Контраст-чекер**: для кожної пари (текст на фоні, кнопка, бейдж)
   показується коефіцієнт контрасту. **Публікація блокується**, якщо
   основні пари не проходять WCAG AA (4.5:1 для тексту, 3:1 для великого
   тексту й UI-елементів). Це не попередження, а блокер.
4. **Шрифти**: Google Fonts (з фіксованого allowlist) або системні. Довільні
   URL заборонені (CSP + витік трафіку).
5. **Назва застосунку** і kicker.
6. **Пресети**: «Скопіювати з бренду X», «Скинути до дефолту платформи».
7. **Чернетка → публікація**: зміни спершу в `DRAFT`, видимі лише в прев'ю.
   Публікація створює `BrandVersion` і вимагає step-up 2FA.
8. **Відкат** на будь-яку попередню версію в один клік.
9. Кожна дія — в `AuditLog`.

## 5. Що ще налаштовується на тенант

| Налаштування | Ключ | Дефолт |
|---|---|---|
| Увімкнені модулі | `module.programme`, `module.map`, `module.winstyle`, `module.travel`, `module.media`, `module.eventstyle` | усі on |
| Мови | `Tenant.locales` | `["en"]` |
| Політика 2FA | `auth.mfa_policy` | `REQUIRED_STAFF` |
| Google-логін | `auth.google` | off |
| Самореєстрація за доменом | `TenantDomain.autoJoin` | on |
| Публічність бренду до логіну | `brand.public` | on |
| Аналітика продукту | `analytics.enabled` | on |
| Відправник пошти | `mail.from_name`, `mail.from_email` | платформний |
| Контакти підтримки | `support.email`, `support.phone` | — |
| Юр. документи | `legal.terms_url`, `legal.privacy_url`, `legal.version` | платформні |
| Кастомний хост | `tenant.custom_host` | off |

Резолв налаштування: `Event → Tenant → Platform default`. Реалізація —
`getSetting(key, { tenantId, eventId })` з кешем.

## 6. Ізоляція між тенантами (найкритичніша частина)

1. Усі запити — через `getTenantDb(session)` (див. `CLAUDE.md` §5.1).
2. RLS у Postgres як другий шар (`docs/02` §4).
3. Файли в S3 — з префіксом `t/{tenantId}/…`; підписані URL, TTL 15 хв;
   бакет закритий для публічного читання; обкладинки віддаються через
   CDN з окремого публічного префікса `public/{tenantId}/…`.
4. Кеш-ключі Redis **завжди** містять `tenantId`.
5. Теги інвалідації Next-кешу — `tenant:{id}:*`.
6. Черги BullMQ: `tenantId` у payload, воркер перевіряє відповідність.
7. Пошук по email в адмінці обмежений своїм тенантом; глобальний пошук —
   тільки `SUPER_ADMIN` і логується.
8. Помилка доступу до чужих даних → **404**, не 403 (не розкриваємо
   існування об'єкта).

**Обов'язковий тест-набір `tests/e2e/tenant-isolation.spec.ts`:**
для **кожної** сутності з канонічного переліку `docs/02` §4.1 — спроба
доступу з-під користувача тенанта B до об'єкта тенанта A по прямому id
має давати 404 у всіх методах (GET/PATCH/DELETE), включно з вкладеними
маршрутами, Server Actions і експортами. Перелік у тесті імпортується з
того самого модуля, що й `tenant-client.ts`, — розсинхронізація
неможлива.

## 7. Онбординг нового тенанта (для `SUPER_ADMIN`)

Майстер у 5 кроків, ≤ 15 хвилин:
1. Назва, slug, таймзона, мови.
2. Домени пошти + верифікація (DNS TXT-запис або підтвердження на
   `admin@<domain>`). Без верифікації `autoJoin` неможливий.
3. Бренд: лого + базовий колір → автогенерація теми → перевірка контрасту.
4. Перший адмін тенанта (інвайт на пошту).
5. Фіче-флаги: які модулі увімкнені.

Після цього тенант може створити перший івент самостійно.
