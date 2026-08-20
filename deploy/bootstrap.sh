#!/usr/bin/env bash
#
# Run once, as root, on a fresh Ubuntu 24.04 host.
#
#   ssh root@<ip>
#   bash bootstrap.sh --user usrmixweek --ssh-key "ssh-ed25519 AAAA... you@mac"
#
# Creates the usrmixweek user, installs Docker, and hardens the host. It does not
# touch the application; install-app.sh does that, as the usrmixweek user.
#
# SSH password login is disabled at the end. The script refuses to do that
# unless an authorized key is in place, and prints a warning telling you to
# verify a second session before closing this one.

set -euo pipefail

DEPLOY_USER=usrmixweek
SSH_KEY=''
SSH_PORT=22

while [[ $# -gt 0 ]]; do
	case "$1" in
	--user) DEPLOY_USER="$2"; shift 2 ;;
	--ssh-key) SSH_KEY="$2"; shift 2 ;;
	--ssh-port) SSH_PORT="$2"; shift 2 ;;
	-h | --help)
		sed -n '2,20p' "$0"
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

[[ $EUID -eq 0 ]] || die "run as root"
[[ -r /etc/os-release ]] || die "cannot identify the operating system"
# shellcheck disable=SC1091
. /etc/os-release
[[ ${ID:-} == ubuntu ]] || warn "written for Ubuntu LTS; found ${PRETTY_NAME:-unknown}"

# ── packages ───────────────────────────────────────────────────────────
log 'Updating the package index'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

log 'Installing base packages'
apt-get install -y -qq \
	ca-certificates curl gnupg git ufw fail2ban unattended-upgrades \
	apt-listchanges chrony rsync jq age htop ncdu

# ── time ───────────────────────────────────────────────────────────────
# Schedules, token expiry, and TOTP all depend on the clock being right.
timedatectl set-timezone UTC
systemctl enable --now chrony

# ── application user ────────────────────────────────────────────────────────
if id -u "$DEPLOY_USER" >/dev/null 2>&1; then
	log "User $DEPLOY_USER already exists"
else
	log "Creating $DEPLOY_USER"
	adduser --disabled-password --gecos '' "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
AUTH_KEYS="/home/$DEPLOY_USER/.ssh/authorized_keys"

if [[ -n $SSH_KEY ]]; then
	touch "$AUTH_KEYS"
	if grep -qxF "$SSH_KEY" "$AUTH_KEYS"; then
		log 'Public key already authorized'
	else
		log "Authorizing the supplied key for $DEPLOY_USER"
		printf '%s\n' "$SSH_KEY" >>"$AUTH_KEYS"
	fi
elif [[ ! -s $AUTH_KEYS && -s /root/.ssh/authorized_keys ]]; then
	# Only as a last resort. If the account already has a key, leave it alone:
	# silently granting root's keys to a second account is not something to do
	# behind the operator's back.
	log "No --ssh-key given and no key present; copying root's authorized_keys"
	cat /root/.ssh/authorized_keys >>"$AUTH_KEYS"
fi

chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"

# sudo without a password, because the usrmixweek user has no password to type.
# The account is key-only, so the SSH key is the real credential.
printf '%s ALL=(ALL) NOPASSWD:ALL\n' "$DEPLOY_USER" >"/etc/sudoers.d/90-$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/90-$DEPLOY_USER"
visudo -c >/dev/null || die 'sudoers file is invalid — fix before disconnecting'

# ── swap ───────────────────────────────────────────────────────────────
# A build without swap on a 2 GB host gets the compiler OOM-killed.
if [[ ! -f /swapfile ]] && ! swapon --show | grep -q .; then
	log 'Creating a 2G swapfile'
	fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
	chmod 600 /swapfile
	mkswap /swapfile >/dev/null
	swapon /swapfile
	grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
	sysctl -qw vm.swappiness=10
	echo 'vm.swappiness=10' >/etc/sysctl.d/99-swappiness.conf
fi

# ── docker ─────────────────────────────────────────────────────────────
if command -v docker >/dev/null 2>&1; then
	log 'Docker already installed'
else
	log 'Installing Docker from the official repository'
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
		gpg --dearmor -o /etc/apt/keyrings/docker.gpg
	chmod a+r /etc/apt/keyrings/docker.gpg
	printf 'deb [arch=%s signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu %s stable\n' \
		"$(dpkg --print-architecture)" "$(. /etc/os-release && echo "$VERSION_CODENAME")" \
		>/etc/apt/sources.list.d/docker.list
	apt-get update -qq
	apt-get install -y -qq \
		docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

# Membership of the docker group is root-equivalent. That is accepted here:
# the usrmixweek user already has passwordless sudo.
usermod -aG docker "$DEPLOY_USER"
systemctl enable --now docker

# Container logs otherwise grow until the disk is full.
cat >/etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}
JSON
systemctl restart docker

log 'Bootstrap finished — now running the hardening pass'
BOOTSTRAP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
DEPLOY_USER="$DEPLOY_USER" SSH_PORT="$SSH_PORT" bash "$BOOTSTRAP_DIR/harden.sh"

cat <<EOF

────────────────────────────────────────────────────────────────────────
  Host prepared.

  BEFORE YOU CLOSE THIS SESSION, open a second terminal and confirm that
  key-based login works:

      ssh -p $SSH_PORT $DEPLOY_USER@$(hostname -I | awk '{print $1}')

  Password authentication and direct root login are now disabled. If that
  second session fails and you close this one, you will need your
  provider's console to get back in.

  Once verified, continue with deploy/README.md — "First deploy".
────────────────────────────────────────────────────────────────────────
EOF
