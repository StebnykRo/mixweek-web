#!/usr/bin/env bash
#
# Nightly (and pre-deploy) backup. docs/01-architecture.md §8: RPO 15 min,
# RTO 2 h, restore drill every quarter.
#
#   DEPLOY_DIR=/home/deploy/app/deploy ./backup.sh [--label pre-abc1234]
#
# Writes an age-encrypted pg_dump plus the archived WAL segments. Encryption
# is to a public key, so this job never holds the means to decrypt what it
# writes; the private half lives in backups/age.key (and in your password
# manager). A stolen backup file on its own is useless.

set -euo pipefail

DEPLOY_DIR="${DEPLOY_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
ENV_FILE="$DEPLOY_DIR/.env.production"
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_DIR/backups}"
LABEL=''

while [[ $# -gt 0 ]]; do
	case "$1" in
	--label) LABEL="$2"; shift 2 ;;
	*) echo "unknown argument: $1" >&2; exit 2 ;;
	esac
done

die() {
	printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2
	exit 1
}

[[ -f $ENV_FILE ]] || die "no $ENV_FILE"
command -v age >/dev/null || die 'age is not installed (apt-get install age)'

# shellcheck disable=SC1090
set -a
. "$ENV_FILE"
set +a

: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is empty in .env.production}"
RETENTION="${BACKUP_RETENTION_DAYS:-30}"

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$DEPLOY_DIR/compose.production.yml")

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

STAMP=$(date -u +%Y%m%dT%H%M%SZ)
NAME="mixweek-${STAMP}${LABEL:+-$LABEL}"
TARGET="$BACKUP_DIR/$NAME.dump.age"

# Custom format so pg_restore can do selective restores, piped straight into
# age — the plaintext dump never exists as a file.
# PIPESTATUS is checked because a pg_dump failure downstream of a working
# age would otherwise leave a perfectly encrypted, perfectly empty backup.
set +e
"${COMPOSE[@]}" exec -T postgres pg_dump -U app_admin -d mixweek -Fc --no-owner |
	age --recipient "$BACKUP_AGE_RECIPIENT" >"$TARGET.partial"
STATUS=("${PIPESTATUS[@]}")
set -e

if [[ ${STATUS[0]} -ne 0 || ${STATUS[1]} -ne 0 ]]; then
	rm -f "$TARGET.partial"
	die "backup failed (pg_dump=${STATUS[0]} age=${STATUS[1]})"
fi

# A dump of a populated database is never this small; a few hundred bytes
# means the pipe produced nothing useful.
if [[ $(stat -c %s "$TARGET.partial" 2>/dev/null || stat -f %z "$TARGET.partial") -lt 1024 ]]; then
	rm -f "$TARGET.partial"
	die 'backup is implausibly small — treating it as a failure'
fi

# Only named .age once complete, so a truncated file is never mistaken for a
# usable backup.
mv "$TARGET.partial" "$TARGET"
chmod 600 "$TARGET"

SIZE=$(du -h "$TARGET" | cut -f1)

# WAL segments carry the changes made since the dump; together they are what
# makes a 15-minute RPO possible.
WAL_TARGET="$BACKUP_DIR/wal"
mkdir -p "$WAL_TARGET"
"${COMPOSE[@]}" exec -T postgres bash -c 'cd /wal-archive 2>/dev/null && tar cf - . 2>/dev/null || true' |
	tar xf - -C "$WAL_TARGET" 2>/dev/null || true

# Old segments are dead weight once a newer dump exists.
find "$WAL_TARGET" -type f -mtime "+$RETENTION" -delete 2>/dev/null || true
find "$BACKUP_DIR" -maxdepth 1 -name 'mixweek-*.dump.age' -mtime "+$RETENTION" -delete

COUNT=$(find "$BACKUP_DIR" -maxdepth 1 -name 'mixweek-*.dump.age' | wc -l | tr -d ' ')
echo "Backup $NAME ($SIZE). $COUNT kept, $RETENTION-day retention."

# A backup that only exists on the machine it protects is not a backup. Set
# BACKUP_REMOTE to an rclone or rsync destination to copy it off the host.
if [[ -n ${BACKUP_REMOTE:-} ]]; then
	if command -v rclone >/dev/null; then
		rclone copy "$TARGET" "$BACKUP_REMOTE" && echo "Copied to $BACKUP_REMOTE"
	else
		rsync -a "$TARGET" "$BACKUP_REMOTE" && echo "Copied to $BACKUP_REMOTE"
	fi
else
	echo 'BACKUP_REMOTE is not set — these backups live only on this server.'
fi
