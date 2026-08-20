# mixweek-web

Multi-tenant, white-label web platform for corporate events. Mobile-first PWA
for participants, plus an admin panel for organisers.

The specification lives in [`docs/`](./docs); the working rules for changing
this codebase live in [`CLAUDE.md`](./CLAUDE.md). Where this README and `docs/`
disagree, `docs/` wins.

---

## Running it locally

You need Node 22+, pnpm 9, PostgreSQL 16 and (optionally) Redis.

```bash
pnpm install
docker compose up -d          # postgres, valkey, minio
cp .env.example .env          # then fill in AUTH_SECRET and APP_MASTER_KEY
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Generate the two bootstrap keys with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Without Docker, point `DATABASE_URL` at any Postgres 16 and create the two
roles from [`docker/init-roles.sql`](./docker/init-roles.sql). The application
connects as `app_user`, which is **not** the table owner and has no
`BYPASSRLS` — that is what makes the row-level security policies real.

### Signing in during development

There is no password anywhere in this system. `/auth/start` emails a magic link
and a six-digit code. With no mail transport configured, the message is written
to `.mail/` as JSON instead:

```bash
cat .mail/*.json | grep -o 'Code: [0-9]*'
```

Seeded accounts: `admin@softswiss.com` (tenant admin, second factor required),
`user1@softswiss.com` … `user50@softswiss.com` (participants),
`admin@acme.example` (a second tenant, visibly different brand),
`super@platform.test` (platform admin).

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and server |
| `pnpm worker` | Background jobs (notifications, reminders, retention) |
| `pnpm db:migrate` / `pnpm db:seed` | Migrations and demo data |
| `pnpm db:seed:load` | 3 000 users for the load scenarios |
| `pnpm db:anonymize` | Strip personal data from a restored copy |
| `pnpm test` | Unit tests |
| `pnpm test:integration` | Integration tests against a real Postgres |
| `pnpm test:e2e` | Playwright, two viewports, includes axe and offline |
| `pnpm lint` / `pnpm typecheck` | Static checks |
| `pnpm audit:security` | Dependency audit and a live header check |
| `pnpm secrets:rewrap` | Rotate `APP_MASTER_KEY` |
| `pnpm ops:*` | Incident containment (docs/12 §13) |

---

## How it is put together

```
src/
  app/          routes — (auth), (app), admin, api/v1
  modules/      vertical domain slices; each owns its service, schemas, policies
  components/   ui/ primitives, patterns/ composites, admin/ admin-only
  lib/          db, crypto, http, queue, redis, logger — no domain logic
  worker/       BullMQ processors, also usable in-process
```

The dependency direction is `app/ → modules/ → lib/`, never the other way.

### Four things that are load-bearing

**Tenant isolation is two layers, not one.** Every query against a
tenant-scoped table goes through `withTenant()`, which injects
`where: { tenantId }` and opens a transaction that sets `app.tenant_id`.
Postgres row-level security then enforces the same rule independently. If the
ORM layer is ever bypassed, the database still returns nothing. The canonical
list of scoped models is [`src/lib/db/models.ts`](./src/lib/db/models.ts) — it
drives the guard, the RLS migration and the isolation tests, so the three
cannot drift apart. A few identity and configuration reads necessarily happen
before a tenant is known (resolving a domain to a tenant, reading the session's
membership); they go through the explicit, documented `withSystemScope()`.

**Secrets live in the database, encrypted.** `.env` holds only what is needed
to open a connection and decrypt the rest. Everything else — SMTP, VAPID, S3,
Maps — is an envelope-encrypted row read through `getSecret()`. There is no
endpoint that returns a stored value: the admin sees a mask, a rotation date
and an author. That is a decision, not a gap.

**The theme is data.** Components reference `bg-primary-500`, which compiles to
`var(--color-primary-500)`. The active brand's tokens are validated by Zod,
rendered into a nonce'd `<style>` in the server response, and can be republished
from the admin without a deploy. A palette that fails WCAG AA contrast cannot be
published at all — the check blocks, it does not warn.

**Capacity is transactional.** Registration and booking lock the parent row,
count inside the same transaction, and rely on a partial unique index as a last
line of defence. `tests/integration/concurrency.spec.ts` runs 50 simultaneous
registrations against 10 places and asserts exactly 10 confirmed.

---

## Environments

`APP_ENV` carries the environment, because `next start` forces
`NODE_ENV=production` regardless of how it was invoked. It selects the mail
transport, the `__Host-` cookie prefix (which needs HTTPS), the rate-limit
multiplier used by the e2e run, and the `noindex` header. It defaults to
`NODE_ENV`, and only `production` and `staging` are treated as hardened.

---

## Notes for whoever picks this up next

- Read the relevant `docs/*.md` file **before** changing an area. The
  reasoning behind a constraint is usually there, and it is usually a reason.
- `docs/DELIVERY-NOTES.md` records where the implementation deliberately
  departs from the specification, and why.
- Every mutation writes an `AuditLog` entry. If you add one that does not, the
  PR checklist in `docs/12` §14 will catch it — but the person reading the audit
  log during an incident will not.
