#!/usr/bin/env bash
#
# Ships a new release. Run on the server as the deploy user:
#
#   cd ~/app/deploy && ./deploy.sh
#
# Also invoked automatically by the post-receive hook when you push.
#
# Takes a database backup first, then builds, migrates, and restarts. On a
# failed health check it rolls the containers back to the previous images.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
REPO=$(cd "$HERE/.." && pwd)
cd "$HERE"

ENV_FILE="$HERE/.env.production"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$HERE/compose.production.yml")

SKIP_BACKUP=0
while [[ $# -gt 0 ]]; do
	case "$1" in
	--skip-backup) SKIP_BACKUP=1; shift ;;
	*) echo "unknown argument: $1" >&2; exit 2 ;;
	esac
done

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die() {
	printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2
	exit 1
}

[[ -f $ENV_FILE ]] || die "no $ENV_FILE — run install-app.sh first"

# The working tree may have no .git of its own: the post-receive hook checks
# files out of a bare repository elsewhere and passes the revision in.
if [[ -n ${DEPLOY_REVISION:-} ]]; then
	REVISION="${DEPLOY_REVISION:0:7}"
elif REVISION=$(git -C "$REPO" rev-parse --short HEAD 2>/dev/null); then
	:
else
	REVISION=$(date -u +%Y%m%dT%H%M%SZ)
fi
log "Deploying $REVISION"

# ── backup ─────────────────────────────────────────────────────────────
# A migration that goes wrong is the reason this runs before anything else.
if [[ $SKIP_BACKUP -eq 0 ]]; then
	log 'Taking a pre-deploy backup'
	DEPLOY_DIR="$HERE" bash "$HERE/backup.sh" --label "pre-$REVISION" ||
		die 'backup failed — refusing to deploy'
fi

# ── previous images, for rollback ──────────────────────────────────────
PREV_APP=$(docker image inspect mixweek-app:latest --format '{{.Id}}' 2>/dev/null || echo '')
if [[ -n $PREV_APP ]]; then
	docker tag "$PREV_APP" mixweek-app:previous
	docker tag "$(docker image inspect mixweek-worker:latest --format '{{.Id}}')" mixweek-worker:previous 2>/dev/null || true
fi

# ── build ──────────────────────────────────────────────────────────────
log 'Building'
"${COMPOSE[@]}" build

log 'Applying migrations'
"${COMPOSE[@]}" run --rm migrator || die 'migration failed — nothing was restarted'

log 'Restarting'
"${COMPOSE[@]}" up -d --remove-orphans

# ── verify ─────────────────────────────────────────────────────────────
log 'Health check'
healthy=0
for _ in $(seq 1 40); do
	if "${COMPOSE[@]}" ps --format json app 2>/dev/null | head -1 | grep -q healthy; then
		healthy=1
		break
	fi
	sleep 3
done

if [[ $healthy -eq 0 ]]; then
	warn 'New release is unhealthy. Logs:'
	"${COMPOSE[@]}" logs --tail 60 app || true

	if [[ -n $PREV_APP ]]; then
		warn 'Rolling back to the previous images'
		docker tag mixweek-app:previous mixweek-app:latest
		docker tag mixweek-worker:previous mixweek-worker:latest 2>/dev/null || true
		"${COMPOSE[@]}" up -d --no-build
		warn 'Rolled back. The database migration was NOT reverted — check whether'
		warn 'the old code tolerates the new schema before considering this stable.'
	fi
	exit 1
fi

# ── tidy ───────────────────────────────────────────────────────────────
docker image prune -f --filter 'until=168h' >/dev/null 2>&1 || true

DOMAIN=$(grep -E '^APP_DOMAIN=' "$ENV_FILE" | cut -d= -f2-)
log "Deployed $REVISION — https://$DOMAIN"
