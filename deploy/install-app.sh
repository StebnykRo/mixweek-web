#!/usr/bin/env bash
#
# Installs and starts the application. Run as the usrmixweek user, from the
# checkout on the server:
#
#   cd ~/app/deploy && ./install-app.sh
#
# Generates every secret locally, builds the images, runs the migrations,
# starts the stack, and waits for TLS. Re-running is safe: existing secrets in
# .env.production are kept, never regenerated. Regenerating APP_MASTER_KEY
# would make all stored secrets unreadable.

set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
cd "$HERE"

ENV_FILE="$HERE/.env.production"
COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$HERE/compose.production.yml")

DOMAIN="${APP_DOMAIN:-events.sunscript.tech}"
ACME_EMAIL_ARG="${ACME_EMAIL:-}"
SEED_DEMO=0
SKIP_TLS_WAIT=0

while [[ $# -gt 0 ]]; do
	case "$1" in
	--domain) DOMAIN="$2"; shift 2 ;;
	--email) ACME_EMAIL_ARG="$2"; shift 2 ;;
	--seed-demo) SEED_DEMO=1; shift ;;
	--skip-tls-wait) SKIP_TLS_WAIT=1; shift ;;
	-h | --help)
		sed -n '2,14p' "$0"
		exit 0
		;;
	*)
		echo "unknown argument: $1" >&2
		exit 2
		;;
	esac
done

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die() {
	printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2
	exit 1
}

command -v docker >/dev/null || die 'docker is not installed — run bootstrap.sh first'
docker compose version >/dev/null 2>&1 || die 'the docker compose plugin is missing'
docker info >/dev/null 2>&1 || die "cannot talk to the docker daemon (log out and back in so the docker group applies)"

secret() { openssl rand -base64 32; }
password() { openssl rand -base64 24 | tr -d '/+=' | cut -c1-28; }

# ── environment file ───────────────────────────────────────────────────
if [[ -f $ENV_FILE ]]; then
	log 'Reusing the existing .env.production'
else
	log 'Generating .env.production'

	[[ -n $ACME_EMAIL_ARG ]] || die 'first run needs --email <address> for the TLS certificate'

	POSTGRES_PASSWORD=$(password)
	APP_USER_PASSWORD=$(password)
	REDIS_PASSWORD=$(password)
	AUTH_SECRET=$(secret)
	APP_MASTER_KEY=$(secret)

	# Backups encrypt to a public key so the nightly job never holds the
	# means to read what it wrote.
	command -v age-keygen >/dev/null || die 'age is not installed — run bootstrap.sh first'
	mkdir -p "$HERE/backups"
	chmod 700 "$HERE/backups"
	if [[ ! -f $HERE/backups/age.key ]]; then
		(umask 077 && age-keygen -o "$HERE/backups/age.key" 2>/dev/null)
	fi
	BACKUP_AGE_RECIPIENT=$(age-keygen -y "$HERE/backups/age.key")

	# Written 600 from the start — never world-readable, not even briefly.
	install -m 600 /dev/null "$ENV_FILE"

	sed \
		-e "s|^APP_DOMAIN=.*|APP_DOMAIN=$DOMAIN|" \
		-e "s|^APP_URL=.*|APP_URL=https://$DOMAIN|" \
		-e "s|^ACME_EMAIL=.*|ACME_EMAIL=$ACME_EMAIL_ARG|" \
		-e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$POSTGRES_PASSWORD|" \
		-e "s|^APP_USER_PASSWORD=.*|APP_USER_PASSWORD=$APP_USER_PASSWORD|" \
		-e "s|^REDIS_PASSWORD=.*|REDIS_PASSWORD=$REDIS_PASSWORD|" \
		-e "s|^AUTH_SECRET=.*|AUTH_SECRET=$AUTH_SECRET|" \
		-e "s|^APP_MASTER_KEY=.*|APP_MASTER_KEY=$APP_MASTER_KEY|" \
		-e "s|^BACKUP_AGE_RECIPIENT=.*|BACKUP_AGE_RECIPIENT=$BACKUP_AGE_RECIPIENT|" \
		-e "s|__APP_USER_PASSWORD__|$APP_USER_PASSWORD|g" \
		-e "s|__POSTGRES_PASSWORD__|$POSTGRES_PASSWORD|g" \
		-e "s|__REDIS_PASSWORD__|$REDIS_PASSWORD|g" \
		-e "s|no-reply@events.sunscript.tech|no-reply@$DOMAIN|" \
		env.production.example >"$ENV_FILE"

	chmod 600 "$ENV_FILE"

	cat <<-EOF

		  Secrets generated in $ENV_FILE (mode 600).

		  Copy APP_MASTER_KEY (from that file) and backups/age.key into your
		  password manager now. APP_MASTER_KEY is the only thing that can
		  decrypt stored secrets; age.key is the only thing that can open the
		  backups. Neither can be recovered if this disk is lost — and a
		  backup key stored only on the machine it protects is no key at all.
	EOF
fi

# Refuse to continue on a half-filled file rather than fail three steps later.
for key in APP_DOMAIN APP_URL ACME_EMAIL POSTGRES_PASSWORD APP_USER_PASSWORD REDIS_PASSWORD AUTH_SECRET APP_MASTER_KEY; do
	value=$(grep -E "^$key=" "$ENV_FILE" | head -1 | cut -d= -f2-)
	[[ -n $value ]] || die "$key is empty in $ENV_FILE"
done

# ── DNS ────────────────────────────────────────────────────────────────
log "Checking DNS for $DOMAIN"
PUBLIC_IP=$(curl -fsS --max-time 10 https://api.ipify.org || echo '')
RESOLVED=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1; exit}' || echo '')

if [[ -z $RESOLVED ]]; then
	warn "$DOMAIN does not resolve yet. Let's Encrypt will fail until it does."
	warn "Add an A record pointing at ${PUBLIC_IP:-this server} and re-run."
elif [[ -n $PUBLIC_IP && $RESOLVED != "$PUBLIC_IP" ]]; then
	warn "$DOMAIN resolves to $RESOLVED but this host is $PUBLIC_IP."
	warn 'If a CDN is in front, that is expected; otherwise the certificate will fail.'
else
	log "$DOMAIN -> $RESOLVED"
fi

# ── build ──────────────────────────────────────────────────────────────
log 'Building images (several minutes on a first run)'
"${COMPOSE[@]}" build --pull

# ── database ───────────────────────────────────────────────────────────
log 'Starting Postgres and Redis'
"${COMPOSE[@]}" up -d postgres redis

log 'Waiting for Postgres'
for _ in $(seq 1 60); do
	if "${COMPOSE[@]}" exec -T postgres pg_isready -U app_admin -d mixweek >/dev/null 2>&1; then
		break
	fi
	sleep 2
done
"${COMPOSE[@]}" exec -T postgres pg_isready -U app_admin -d mixweek >/dev/null 2>&1 ||
	die 'Postgres did not become ready; check: docker compose logs postgres'

log 'Applying migrations'
"${COMPOSE[@]}" run --rm migrator

# ── first-run data ─────────────────────────────────────────────────────
if [[ $SEED_DEMO -eq 1 ]]; then
	warn 'Seeding demo data. prisma/seed.ts TRUNCATES the database first.'
	read -r -p 'Type "seed" to confirm: ' answer
	[[ $answer == seed ]] || die 'aborted'
	"${COMPOSE[@]}" run --rm --entrypoint '' migrator pnpm exec tsx prisma/seed.ts
fi

# ── start ──────────────────────────────────────────────────────────────
log 'Starting the application'
"${COMPOSE[@]}" up -d

log 'Waiting for the app to report healthy'
for _ in $(seq 1 60); do
	state=$("${COMPOSE[@]}" ps --format json app 2>/dev/null | head -1 || echo '')
	if [[ $state == *healthy* ]]; then break; fi
	sleep 3
done

if ! "${COMPOSE[@]}" ps --format json app 2>/dev/null | head -1 | grep -q healthy; then
	warn 'The app is not healthy yet. Recent logs:'
	"${COMPOSE[@]}" logs --tail 40 app || true
fi

# ── TLS ────────────────────────────────────────────────────────────────
if [[ $SKIP_TLS_WAIT -eq 0 ]]; then
	log 'Waiting for the certificate (Let'\''s Encrypt, up to two minutes)'
	for _ in $(seq 1 40); do
		if curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1; then
			log "https://$DOMAIN is live"
			break
		fi
		sleep 3
	done
	curl -fsS --max-time 5 "https://$DOMAIN/api/health" >/dev/null 2>&1 ||
		warn "No certificate yet. Check DNS, then: docker compose logs caddy"
fi

# ── backups ────────────────────────────────────────────────────────────
log 'Installing the nightly backup timer'
sudo install -m 755 "$HERE/backup.sh" /usr/local/bin/mixweek-backup
sudo tee /etc/systemd/system/mixweek-backup.service >/dev/null <<EOF
[Unit]
Description=MixWeek database backup
After=docker.service

[Service]
Type=oneshot
User=$(id -un)
Environment=DEPLOY_DIR=$HERE
ExecStart=/usr/local/bin/mixweek-backup
EOF
sudo tee /etc/systemd/system/mixweek-backup.timer >/dev/null <<'EOF'
[Unit]
Description=Nightly MixWeek backup

[Timer]
OnCalendar=*-*-* 03:15:00
RandomizedDelaySec=900
Persistent=true

[Install]
WantedBy=timers.target
EOF
sudo systemctl daemon-reload
sudo systemctl enable --now mixweek-backup.timer

cat <<EOF

────────────────────────────────────────────────────────────────────────
  Installed. https://$DOMAIN

  There is no tenant yet, so nobody can sign in. Create the first one:

      cd $HERE
      docker compose --env-file .env.production -f compose.production.yml \\
        run --rm --entrypoint '' migrator \\
        pnpm exec tsx scripts/provision-tenant.ts \\
          --slug=yourco --name="Your Company" \\
          --domain=yourco.com --admin=you@yourco.com

  Sign-in is by emailed link, and no mail transport is configured yet, so
  nothing is sent. To let someone in now:

      docker compose --env-file .env.production -f compose.production.yml \\
        run --rm --entrypoint '' migrator \\
        pnpm ops:signin-link --email=you@yourco.com

  That prints a link and a code, valid ten minutes. See deploy/GUIDE.md
  Part 14 for configuring Resend properly.

  Backups run nightly at 03:15 UTC into $HERE/backups.
────────────────────────────────────────────────────────────────────────
EOF
