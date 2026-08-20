#!/usr/bin/env bash
#
# Security pass. Called by bootstrap.sh, and safe to re-run at any time —
# every step is idempotent.
#
#   sudo DEPLOY_USER=deploy bash harden.sh
#
# Covers: SSH key-only login, firewall, fail2ban, automatic security updates,
# kernel network settings.

set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-deploy}"
SSH_PORT="${SSH_PORT:-22}"

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die() {
	printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2
	exit 1
}

[[ $EUID -eq 0 ]] || die 'run with sudo'

# ── ssh ────────────────────────────────────────────────────────────────
AUTH_KEYS="/home/$DEPLOY_USER/.ssh/authorized_keys"

# The one check that prevents a lock-out: password login is only switched off
# once there is a key that can replace it.
if [[ ! -s $AUTH_KEYS ]]; then
	die "no authorized key at $AUTH_KEYS — add one before hardening SSH, or you will be locked out"
fi

log 'Configuring SSH for key-only login'
cat >/etc/ssh/sshd_config.d/10-hardening.conf <<EOF
Port $SSH_PORT
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitEmptyPasswords no
AuthenticationMethods publickey

# Only the deploy user may log in at all.
AllowUsers $DEPLOY_USER

X11Forwarding no
AllowAgentForwarding no
AllowTcpForwarding yes
MaxAuthTries 3
MaxSessions 5
LoginGraceTime 30

ClientAliveInterval 300
ClientAliveCountMax 2

# Modern algorithms only.
KexAlgorithms curve25519-sha256,curve25519-sha256@libssh.org,diffie-hellman-group16-sha512
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com,aes128-gcm@openssh.com
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
EOF

# Cloud images often ship a drop-in that re-enables passwords and sorts after
# ours. Neutralise it rather than fight over ordering.
for f in /etc/ssh/sshd_config.d/*cloud-init*.conf /etc/ssh/sshd_config.d/50-cloud-init.conf; do
	[[ -f $f ]] || continue
	sed -i 's/^\s*PasswordAuthentication\s\+yes/PasswordAuthentication no/I' "$f"
done

sshd -t || die 'sshd configuration is invalid — not restarting; fix it first'
systemctl reload ssh 2>/dev/null || systemctl reload sshd

# ── firewall ───────────────────────────────────────────────────────────
log 'Configuring the firewall'
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw limit "$SSH_PORT/tcp" comment 'SSH (rate limited)'
ufw allow 80/tcp comment 'HTTP — ACME challenge and redirect'
ufw allow 443/tcp comment 'HTTPS'
ufw allow 443/udp comment 'HTTP/3'
ufw --force enable

# Docker publishes ports by writing its own iptables rules, which bypass UFW
# entirely. The production compose file binds Postgres and Redis to 127.0.0.1
# for exactly this reason; this is the second line of defence.
if ! grep -q 'DOCKER-USER' /etc/ufw/after.rules 2>/dev/null; then
	log 'Blocking direct external access to published container ports'
	cat >>/etc/ufw/after.rules <<'RULES'

# Containers must not be reachable from outside regardless of -p bindings.
*filter
:DOCKER-USER - [0:0]
-A DOCKER-USER -i lo -j RETURN
-A DOCKER-USER -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
-A DOCKER-USER -p tcp --dport 5432 -j DROP
-A DOCKER-USER -p tcp --dport 6379 -j DROP
-A DOCKER-USER -j RETURN
COMMIT
RULES
	ufw reload
fi

# ── fail2ban ───────────────────────────────────────────────────────────
log 'Configuring fail2ban'
cat >/etc/fail2ban/jail.local <<EOF
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd
# Never ban yourself off the box.
ignoreip = 127.0.0.1/8 ::1

[sshd]
enabled  = true
port     = $SSH_PORT
maxretry = 3
bantime  = 24h
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

# ── unattended upgrades ────────────────────────────────────────────────
log 'Enabling automatic security updates'
cat >/etc/apt/apt.conf.d/50unattended-upgrades <<'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
// Reboots happen at a fixed hour rather than whenever a kernel lands.
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "04:30";
EOF

cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
systemctl enable --now unattended-upgrades

# ── kernel ─────────────────────────────────────────────────────────────
log 'Applying kernel network settings'
cat >/etc/sysctl.d/99-hardening.conf <<'EOF'
# Ignore ICMP redirects and source routing.
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_source_route = 0

# Log packets with impossible addresses.
net.ipv4.conf.all.log_martians = 1

# SYN flood resistance.
net.ipv4.tcp_syncookies = 1
net.ipv4.tcp_max_syn_backlog = 2048

# Reverse path filtering.
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# No core dumps from setuid binaries; restrict kernel pointer exposure.
fs.suid_dumpable = 0
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1

# Docker needs forwarding; do not set net.ipv4.ip_forward = 0 here.
EOF
sysctl -q --system

# ── report ─────────────────────────────────────────────────────────────
log 'Hardening complete'
printf '  SSH        : port %s, key-only, root login disabled\n' "$SSH_PORT"
printf '  Firewall   : %s\n' "$(ufw status | head -1)"
printf '  fail2ban   : %s\n' "$(systemctl is-active fail2ban)"
printf '  Auto-update: %s\n' "$(systemctl is-active unattended-upgrades)"
