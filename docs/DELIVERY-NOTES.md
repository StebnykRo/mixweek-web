# Delivery notes

What was built, where the implementation departs from the specification and
why, and what is not built yet. Read this alongside `docs/15-roadmap.md`.

Last updated: 2026-08-19.

---

## 1. Deliberate departures from the specification

Each of these is a decision, not an oversight. If the reasoning does not hold
for you, the change back is small and is described.

### 1.1 `withSystemScope()` — a documented exception to tenant scoping

`docs/02` §4.2 describes two ways to reach the database: `getTenantDb()` for
everything, and `withPlatformScope()` for SUPER_ADMIN cross-tenant work.

There is a third case that neither covers: reads that necessarily happen
**before a tenant is known**. Resolving an email domain to a tenant is the
lookup that produces the tenant; the session's `Membership` row is what
establishes the role; the login screen renders a brand before anyone has
signed in. None of these can be tenant-scoped without a circular dependency.

`withSystemScope(reason, fn)` in `src/lib/db/tenant-client.ts` handles them. It
is narrow by construction:

- reads and writes keyed by an exact identifier (domain, id, `userId +
  tenantId`, secret key);
- **never** used for participant content — events, programme, registrations,
  media and orders all go through `withTenant()`;
- the complete list of call sites is: `modules/tenancy/service.ts`,
  `modules/tenancy/settings.ts`, `modules/branding/service.ts`,
  `modules/auth/session.ts`, `modules/auth/service.ts`,
  `modules/admin/users.ts`, `lib/crypto/secrets.ts`, `lib/audit.ts`,
  `worker/processors/maintenance.ts`.

`withPlatformScope()` is now a thin wrapper over it, kept for the SUPER_ADMIN
call sites that also write an `AuditLog` entry.

Row-level security therefore still catches an ORM mistake everywhere it
matters. `tests/integration/tenant-isolation.spec.ts` proves the participant
paths, both at the ORM layer and with raw SQL as `app_user`.

### 1.2 `style-src-attr 'unsafe-inline'` in the CSP

`docs/12` §3 requires a CSP with no `unsafe-inline`. The policy shipped keeps
that for **style elements** — an injected `<style>` could restyle the page into
a convincing phishing surface, so `style-src` stays nonce-only — but adds
`style-src-attr 'unsafe-inline'`.

React needs the `style` attribute for genuinely dynamic values: map-pin
coordinates as percentages, capacity-bar widths, brand logo sizing, the brand
preview in the editor. CSP Level 3 blocks style attributes outright once a
nonce is present in `style-src`, and there is no nonce mechanism for an
attribute. Without this the application does not render correctly at all.

React escapes attribute values, and a style attribute cannot introduce script,
so this does not reopen the XSS path that `unsafe-inline` on `style-src` as a
whole would. `script-src` is unaffected: nonce plus `strict-dynamic`, no
`unsafe-inline`, no `unsafe-eval` (except the HMR client in development).

Asserted in `tests/e2e/security.spec.ts`.

### 1.3 `APP_ENV` alongside `NODE_ENV`

`next start` forces `NODE_ENV=production` regardless of how it was invoked, so
`NODE_ENV` cannot distinguish a real deployment from a production build being
exercised locally or by the end-to-end suite.

`src/lib/app-env.ts` introduces `APP_ENV`, defaulting to `NODE_ENV`. Only
`production` and `staging` count as hardened. It selects: the mail transport,
the `__Host-` cookie prefix (which browsers only accept over HTTPS), the
rate-limit multiplier, and the `noindex` header.

This is an addition to `docs/01` §2, which describes the four environments but
not how the process learns which one it is in.

### 1.4 Cookie names outside production

`docs/03` §4 specifies `__Host-mw.session`. Browsers only accept a `__Host-`
cookie on a Secure connection, so over plain http — local development and the
e2e run — the cookie would be silently dropped and nothing would work.

`secureCookies()` applies the prefix exactly when the connection can carry it.
Both spellings are read, so a scheme change does not strand a session.
Production is unchanged.

### 1.5 Rate limits during the end-to-end run

`docs/03` §7 sets `/auth/start` at 3/minute per IP. An e2e suite signs in
dozens of times from one address. `RATE_LIMIT_MULTIPLIER` scales the limits and
is **ignored outright** when `APP_ENV` is `production` or `staging`
(`src/lib/rate-limit.ts`).

### 1.6 The service worker is outside the middleware matcher

A service worker script is governed by the CSP of its own response, and
`script-src 'strict-dynamic'` with a nonce blocks a worker that cannot carry
one. `/sw.js` is excluded from the middleware matcher and served from
`next.config.ts` with its own policy: `default-src 'self'; script-src 'self'`.

### 1.7 Two colour corrections for WCAG AA

The prototype's `#d3453b` measures 4.48:1 on white — just under the 4.5:1 the
contrast gate requires for body text. The default brand now uses `#cf3f35`
(4.76:1). This is the platform brand's `danger` token; a tenant can choose
anything that passes the same gate.

Tinted `Badge` variants used the semantic colour as text on a 15% tint of
itself, which measured 2.88:1. They now use ink on the tint. The label text
already names the state, so nothing is conveyed by colour alone
(`docs/05` §4).

Both were found by the axe suite, not by inspection.

### 1.8 Redis is optional in development

`src/lib/redis.ts` falls back to an in-process store when `REDIS_URL` is unset
or the server is unreachable, so the application runs without it. The
`fail-closed` behaviour for auth rate limiting described in `docs/12` §8 is
unchanged in production. `src/lib/queue` does the same for BullMQ: with no
Redis, jobs run in-process rather than being dropped.

### 1.9 Schema fields added beyond `docs/02` §2

Each supports a behaviour the specification requires but the schema did not
carry a column for:

| Field | Why |
|---|---|
| `Session.stepUpAt` | The 15-minute step-up window (`docs/03` §5) |
| `Session.absoluteExpiresAt` | The absolute session ceiling (`docs/03` §4) |
| `Activity.isMandatory` | Referenced by `docs/06` §6 |
| `Activity.announcedAt` | The six-hour `PROGRAMME_UPDATE` window (`docs/11` §5) |
| `EventRegistration.checkInMode` | Logging online vs offline check-in (`docs/06` §4.6) |
| `AuthFactor.wrappedKey` | Envelope encryption needs the wrapped DEK (`docs/12` §2.3) |
| `BrandVersion.tenantId`, `ProductVariant.tenantId` | Both are in the RLS list; the policy needs the column |
| `NotificationDelivery.createdAt` | Cursor pagination and the 12-month retention sweep |

---

## 2. What is implemented

- **Foundation** — env validation, envelope encryption, tenant guard, RLS on
  35 tables, rate limiting, structured logging with a PII scrubber, security
  headers with a per-request CSP nonce, audit log.
- **Authentication** — magic link plus six-digit code, browser binding, TOTP
  with recovery codes, trusted devices, database sessions with rotation and
  instant revoke, MFA policy per tenant, step-up, the provider abstraction with
  a Google implementation behind a flag.
- **White-label** — token schema and validation, SSR injection with no FOUC,
  brand editor with OKLCH ramp generation, a blocking contrast gate, draft →
  publish → roll back, per-tenant manifest.
- **Events and programme** — lifecycle, phases computed in the event timezone,
  all four filters in the URL, ♥ with offline queueing, bookings, "Now / Next",
  `.ics` export, map, EventStyle with a synced checklist, Travel, Help.
- **Registrations** — dynamic form validated server-side, transactional
  capacity, waiting list with promotion, idempotency keys, QR check-in with an
  offline fallback code, audited CSV export.
- **Media** — link cards with mandatory covers, allowlist and step-up for
  anything outside it, the external-link interstitial, reports queue.
- **WinStyle** — transactional reservation, per-user limits, pickup QR.
- **Notifications** — policy per kind, critical kinds that cannot be disabled,
  jitter and quiet hours, per-user caps, in-app history, web push with
  `pushsubscriptionchange`, branded email.
- **Admin** — dashboard, events with a publication checklist, programme editor
  with conflict detection, registrations with bulk actions, check-in scanner,
  media, content, map, brands, people with CSV import, notifications composer,
  settings, feature flags, secrets, audit log, insights, media reports.
- **PWA** — service worker with per-path caching rules, offline shell, install
  prompt, background sync for queued actions.
- **Testing** — 203 unit, 71 integration (against a real Postgres with RLS),
  166 end-to-end across two viewports including axe on 15 screens and the
  offline suite, four k6 scenarios.

## 3. What is not built yet

Listed so nobody discovers it during a demo.

| Area | State |
|---|---|
| Cover image upload | `processCover()` and `sanitiseSvg()` are implemented and tested; there is no upload endpoint and no S3 adapter. Covers are entered as URLs. |
| `POST /admin/media/{id}/cover` | Not implemented — depends on the above. |
| Announcements admin | Read path and seed exist; no admin CRUD screen or endpoint. |
| WinStyle admin | Participant path complete; no admin product/order screens. |
| Invites admin | The model and the sign-in path work; no admin CRUD. |
| HR assignments admin | Resolution works end to end; no editor for the mapping. |
| Translations admin (`docs/10` §3.11) | The `Translation` table exists; no UI and no content fallback wiring. |
| Platform admin (`docs/09` §6) | `/admin/platform/*` — tenants, domains, impersonation, health — not implemented. |
| GDPR export job | The request is recorded and queued; the worker that produces the ZIP is a stub. |
| Queue processors | `notifications`, `reminders` and `maintenance` are real. `waitlist`, `media`, `exports` and `digest` are stubs. |
| XLSX export | CSV only. |
| OpenAPI document | `zod-to-openapi` is a dependency; generation is not wired up. |
| Sentry | `setErrorReporter()` is the seam; no SDK is installed. |
| Visual regression tests | `docs/14` §1 asks for screenshot tests across two brands; not implemented. |
| Google OIDC | Provider, account linking rules and secrets registry are in place, switched off. Enabling it is the one-day task `docs/03` §3 describes. |

## 4. Known operational notes

- The repository lives in a synced folder in this environment, and the sync
  client leaves conflicted duplicates (`cache-life.d 2.ts`) inside `.next`,
  which break `tsc`. `pnpm typecheck` and `pnpm build` run
  `scripts/clean-sync-conflicts.mjs` first. Outside a synced folder this is a
  no-op.
- `pnpm test:integration` and `pnpm test:e2e` share one database each and run
  with file parallelism disabled; the concurrency assertions depend on it.
- Playwright always starts its own server (`reuseExistingServer: false`). A
  server left running from something else would not have `APP_ENV=e2e` or the
  rate-limit multiplier, and the suite would fail on 429s that look like
  application bugs.
- The load scenarios in `tests/load/` have not been executed here: they are
  written for staging with 3 000 seeded users (`pnpm db:seed:load`), and
  running them against a laptop measures the laptop.
