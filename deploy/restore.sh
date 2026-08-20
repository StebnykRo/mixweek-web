#!/usr/bin/env bash
#
# Restores a backup taken by backup.sh.
#
#   ./restore.sh backups/mixweek-20260820T031500Z.dump.age
#
# THIS REPLACES THE CURRENT DATABASE. Every row written since that backup is
# lost. The script stops the application first, asks for confirmation, and
# takes a safety dump of the present state before overwriting anything.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENV_FILE="$HERE/.env.production"
ARCHIVE="${1:-}"

die() {
	printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2
	exit 1
}
log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

[[ -n $ARCHIVE ]] || die 'usage: ./restore.sh <backup.dump.age>'
[[ -f $ARCHIVE ]] || die "no such file: $ARCHIVE"
[[ -f $ENV_FILE ]] || die "no $ENV_FILE"

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a
AGE_KEY="${BACKUP_AGE_KEY:-$HERE/backups/age.key}"
[[ -f $AGE_KEY ]] || die "no decryption key at $AGE_KEY — restore it from your password manager first"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$HERE/compose.production.yml")

cat <<EOF

  About to restore:  $ARCHIVE
  Into database:     mixweek on this host

  The current contents of that database will be destroyed. Anything written
  after the backup was taken cannot be recovered from it.

EOF
read -r -p 'Type "restore" to proceed: ' answer
[[ $answer == restore ]] || die 'aborted'

log 'Stopping the application (Postgres stays up)'
"${COMPOSE[@]}" stop app worker || true

log 'Taking a safety dump of the current state'
SAFETY="$HERE/backups/pre-restore-$(date -u +%Y%m%dT%H%M%SZ).dump.age"
mkdir -p "$HERE/backups"
"${COMPOSE[@]}" exec -T postgres pg_dump -U app_admin -d mixweek -Fc --no-owner |
	age --recipient "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is empty}" >"$SAFETY" ||
	die 'safety dump failed — refusing to restore'
chmod 600 "$SAFETY"
log "Safety dump: $SAFETY"

log 'Restoring'
# --clean --if-exists drops each object before recreating it; the roles are
# left alone because --no-owner ignores ownership.
age --decrypt --identity "$AGE_KEY" <"$ARCHIVE" |
	"${COMPOSE[@]}" exec -T postgres pg_restore -U app_admin -d mixweek \
		--clean --if-exists --no-owner --single-transaction ||
	die "restore failed — the database is unchanged (single transaction); safety dump at $SAFETY"

log 'Starting the application'
"${COMPOSE[@]}" up -d

log 'Restore complete. Confirm the data looks right before announcing recovery.'
