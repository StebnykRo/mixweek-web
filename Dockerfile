# docs/12-security.md §11 — multi-stage, non-root, minimal final layer.
#
# Debian slim rather than Alpine on purpose: Prisma's query engine and sharp
# both want glibc, and chasing musl builds is a poor trade for a few megabytes.

FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# The pnpm version comes from package.json#packageManager. Activating it here
# means no container reaches for the network on first run.
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# ── dependencies ───────────────────────────────────────────────────────
FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc ./
COPY prisma ./prisma
# .npmrc sets enable-pre-post-scripts=false: no dependency runs a postinstall.
RUN pnpm install --frozen-lockfile

# ── build ──────────────────────────────────────────────────────────────
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build validates env at import time in a few places, so placeholders are
# supplied here. They never reach the runtime image.
ENV AUTH_SECRET=build-time-placeholder-value-not-used-at-runtime
ENV APP_MASTER_KEY=YnVpbGQtdGltZS1wbGFjZWhvbGRlci0zMmJ5dGVzISE=
ENV APP_URL=http://localhost:3000
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
RUN pnpm prisma generate && pnpm exec next build

# ── migrator ───────────────────────────────────────────────────────────
# A separate image with the Prisma CLI and the migration history. `migrate
# deploy` runs from here, so the application image needs no build tooling.
FROM base AS migrator
# From the builder, not deps: .npmrc disables postinstall scripts, so the
# generated Prisma Client only exists after the builder's explicit
# `prisma generate`. The seed and provisioning scripts need it.
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
COPY tsconfig.json ./
# Docker does not derive HOME from USER; without this pnpm writes its cache
# into /root and fails as an unprivileged user.
ENV HOME=/home/node
USER node
ENTRYPOINT ["pnpm", "exec", "prisma", "migrate", "deploy"]

# ── runtime ────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `node` (uid 1000) ships with the image; nothing here runs as root.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health',{headers:{'x-internal-probe':'1'}}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

# ── worker ─────────────────────────────────────────────────────────────
# Same dependencies, different entry point: BullMQ processors and the cron
# schedules from docs/01 §6.
FROM base AS worker
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node src ./src
ENV HOME=/home/node
USER node
CMD ["pnpm", "exec", "tsx", "src/worker/index.ts"]
