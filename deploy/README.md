# Deploying to events.sunscript.tech

This directory contains everything needed to take a blank Ubuntu server and
end up with the application running on HTTPS. The whole path is four commands;
the rest of this document explains what each one does and what to check
afterwards.

Target: **Ubuntu 26.04 LTS** (`resolute`); 24.04 also works, 2 vCPU / 4 GB RAM / 40 GB disk minimum. The
build is the memory-hungry part — 2 GB works only because `bootstrap.sh` adds
swap, and it will be slow.

Read the whole of "Server preparation" before starting. One step disables
password login over SSH, and doing it without a working key means losing
access to the machine.

---

## What gets installed

| Piece | Where it runs | Notes |
| --- | --- | --- |
| Caddy | container, ports 80/443 | Terminates TLS, certificates renew automatically |
| Next.js app | container, internal only | Not reachable except through Caddy |
| Worker | container, internal only | BullMQ jobs and scheduled tasks |
| Postgres 16 | container, `127.0.0.1:5432` | Not reachable from the internet |
| Valkey (Redis) | container, `127.0.0.1:6379` | Password-protected, loopback only |

The app connects to Postgres as `app_user`, which is neither a superuser nor
the owner of any table and has no `BYPASSRLS`. Row-level security therefore
applies to every query it makes. Migrations run separately, as `app_admin`.
This split is the second of the two layers that keep tenants apart, and it is
the reason there are two different database URLs in the environment file.

---

## 1. DNS

Do this first — certificate issuance needs it, and DNS propagation is the one
step you cannot hurry.

At your DNS provider, create an A record:

| Name | Type | Value | TTL |
| --- | --- | --- | --- |
| `events` | A | your server's public IPv4 | 300 |

If the server has an IPv6 address, add the matching `AAAA` record too. Do not
enable a CDN proxy (Cloudflare's orange cloud) yet — it interferes with the
HTTP-01 challenge on first issuance. Turn it on after the certificate exists,
if you want it.

Check from your own machine:

```bash
dig +short events.sunscript.tech
```

You want your server's IP back. Until you get it, stop here.

---

## 2. Keys

Three SSH connections, three keys. Each is scoped to one thing, so a leak stays
contained.

| Key | Lives on | Purpose | Access |
| --- | --- | --- | --- |
| A `github_mixweek` | Mac | push code | read + write |
| B `mixweek` | Mac | log in to the server | login as `usrmixweek` |
| C `github_deploy` | server | pull code | **read only** |

C is read-only deliberately: a server that can push to the source can alter
what it deploys.

On the Mac, for A and B:

```bash
ssh-keygen -t ed25519 -C "mixweek-web (mac push)" -f ~/.ssh/github_mixweek
ssh-keygen -t ed25519 -C "mixweek-deploy" -f ~/.ssh/mixweek
ssh-add --apple-use-keychain ~/.ssh/github_mixweek ~/.ssh/mixweek
```

Always pass `-f`. Answering the interactive prompt with a bare name writes the
key relative to the current directory, not into `~/.ssh`.

Register A on the repository as a deploy key **with** write access, then:

```bash
cat >> ~/.ssh/config <<'EOF'

Host github-mixweek
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_mixweek
  IdentitiesOnly yes
  AddKeysToAgent yes
  UseKeychain yes
EOF
git remote add origin git@github-mixweek:YOUR_ORG/mixweek-web.git
git push -u origin main
```

`IdentitiesOnly yes` matters. Without it SSH offers every key, GitHub
authenticates against whichever other repository matches first, and the push
fails with "repository not found" for a repository that exists.

---

## 3. Server preparation

Nothing is copied onto the server by hand. Root creates the account, then the
server fetches everything from GitHub itself.

### 3.1 Root, six commands, then done

A fresh server offers only root, so the first login is root by necessity. It
exists to create `usrmixweek` and let it in, then it is closed.

```bash
ssh root@YOUR_SERVER_IP
```

```bash
apt-get update && apt-get install -y git
adduser --disabled-password --gecos '' usrmixweek
usermod -aG sudo usrmixweek

install -d -m 700 -o usrmixweek -g usrmixweek /home/usrmixweek/.ssh
echo "PASTE_KEY_B_PUBLIC_HERE" > /home/usrmixweek/.ssh/authorized_keys
chown usrmixweek:usrmixweek /home/usrmixweek/.ssh/authorized_keys
chmod 600 /home/usrmixweek/.ssh/authorized_keys

echo 'usrmixweek ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-usrmixweek
chmod 440 /etc/sudoers.d/90-usrmixweek
visudo -c
```

`visudo -c` must print `parsed OK`. The account has no password, so passwordless
sudo is not a weakening — the SSH key is the credential.

### 3.2 Verify the new account before going further

In a second terminal, while the root session is still open:

```bash
ssh usrmixweek@YOUR_SERVER_IP
sudo whoami        # -> root, no prompt
```

Password login still works as a fallback at this point; after §3.4 it will not.
Once this succeeds, `exit` the root session. Nothing else uses root directly.

### 3.3 Key C, then clone

As `usrmixweek`:

```bash
ssh-keygen -t ed25519 -C "mixweek-web server (read-only)" -f ~/.ssh/github_deploy -N ''
cat ~/.ssh/github_deploy.pub
```

No passphrase: nobody is at the server to type one. Register that key on the
repository as a deploy key with **"Allow write access" unchecked**. Then:

```bash
cat >> ~/.ssh/config <<'EOF'

Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config

ssh -T git@github.com          # -> Hi YOUR_ORG/mixweek-web!
git clone git@github.com:YOUR_ORG/mixweek-web.git ~/app
```

### 3.4 Harden

```bash
cd ~/app/deploy && sudo bash bootstrap.sh
```

Installs Docker and swap, then calls `harden.sh`: firewall, fail2ban,
automatic security updates, key-only SSH restricted to `usrmixweek`. No
`--ssh-key` is needed — key B is already in place and the script leaves an
existing key alone.

`sudo` because this rewrites the SSH and firewall configuration. That is
privileged work whichever account asks for it; what matters is that the
application, its files and its containers never run as root.

Confirm you are still in from the other terminal, then log out and back in so
the docker group applies:

```bash
ssh mixweek && docker ps
```

### 3.5 Arriving as root later

Only happens via the provider's web console; SSH refuses root after §3.4.
Switch across before touching anything:

```bash
sudo su - usrmixweek
```

The `-` loads the account's environment. Without it `~` still points at root's
home and commands land in the wrong place.

### 3.6 Shorten the login

On the Mac:

```
Host mixweek
    HostName YOUR_SERVER_IP
    User usrmixweek
    IdentityFile ~/.ssh/mixweek
    ServerAliveInterval 60
```

### 3.7 Alternative: push straight to the server

If you would rather skip GitHub entirely, `setup-git-remote.sh` creates a bare
repository with a `post-receive` hook, and `git push production main` deploys.
Simpler for one person; GitHub is better once more than one person ships,
because it gives you a single source of truth and an audit trail.

---

## 4. First deploy

On the server:

```bash
cd ~/app/deploy
./install-app.sh --domain events.sunscript.tech --email you@yourcompany.com
```

The email is for Let's Encrypt expiry notices. This step:

1. Generates every secret with `openssl rand` and writes `.env.production`
   with mode 600.
2. Generates an age keypair for backup encryption.
3. Checks that DNS points here, warning loudly if not.
4. Builds the images — five to fifteen minutes on the first run.
5. Starts Postgres and Redis, applies the migrations.
6. Starts the app, the worker and Caddy, and waits for the certificate.
7. Installs a systemd timer for nightly backups at 03:15 UTC.

**Immediately afterwards**, copy two things into your password manager:

- `APP_MASTER_KEY` from `deploy/.env.production` — the key that wraps every
  stored secret. Lose it and the encrypted settings are gone for good.
- `deploy/backups/age.key` — the private key for the backups. Keeping it only
  on the server it protects defeats the purpose.

### 4.1 Create the first tenant

The installation has no tenants, and tenants are resolved by email domain, so
until one exists nobody can sign in at all. The platform super-admin UI is not
built (see `docs/DELIVERY-NOTES.md` §3), so this is done from the command
line:

```bash
cd ~/app/deploy
docker compose --env-file .env.production -f compose.production.yml \
  run --rm --entrypoint '' migrator \
  pnpm exec tsx scripts/provision-tenant.ts \
    --slug=yourco --name="Your Company" \
    --domain=yourco.com --admin=you@yourco.com
```

`--domain` is the **corporate email domain** of your staff, not the site
hostname. Anyone signing in with an address at that domain gets routed to this
tenant. `--admin` must be an address inside it and becomes `TENANT_ADMIN`.

### 4.2 Configure email

Sign-in is by emailed link. There is no SMTP setting — the transport is
Resend's HTTP API, and the key is an encrypted secret in the database rather
than an environment variable, so it rotates without a redeploy and cannot be
read back.

Until a key is set nothing is sent, and in production nothing is written to
disk either (docs/12 §9). To let someone in meanwhile:

```bash
dc run --rm --entrypoint '' migrator pnpm ops:signin-link --email=someone@yourco.com
```

That prints a link and a code, good for ten minutes and one use. It is a live
credential — send it privately.

To configure the transport:

```bash
dc run --rm -it --entrypoint '' migrator pnpm ops:rotate-secret --key=mail.resend_api_key --tenant=<tenantId>
```
```

Until then you can read the sign-in link out of the logs:

```bash
docker compose --env-file .env.production -f compose.production.yml logs app | grep -i 'magic\|sign-in'
```

---

## 5. Everyday operations

All of these run from `~/app/deploy` on the server. To save typing:

```bash
alias dc='docker compose --env-file ~/app/deploy/.env.production -f ~/app/deploy/compose.production.yml'
```

| Task | Command |
| --- | --- |
| Deploy a new release | `git push production main` (from your Mac) |
| Deploy from the server | `./deploy.sh` |
| Logs, following | `dc logs -f app` |
| Container status | `dc ps` |
| Restart the app | `dc restart app worker` |
| Database shell | `dc exec postgres psql -U app_admin -d mixweek` |
| Manual backup | `DEPLOY_DIR=~/app/deploy ./backup.sh` |
| Restore a backup | `./restore.sh backups/mixweek-….dump.age` |
| Re-apply hardening | `sudo DEPLOY_USER=usrmixweek bash harden.sh` |
| Revoke all sessions | `dc run --rm --entrypoint '' migrator pnpm ops:revoke-sessions` |
| Suspend a tenant | `dc run --rm --entrypoint '' migrator pnpm ops:disable-tenant --id=…` |

`deploy.sh` takes a backup before it does anything else, and rolls the
containers back to the previous images if the new release fails its health
check. It does **not** roll back the database — a migration that has run has
run. That is why the pre-deploy backup exists.

---

## 6. Security summary

What `harden.sh` puts in place, and why each piece is there:

**SSH.** Key-only, root login refused, only the `usrmixweek` user permitted, three
attempts before the connection drops, modern ciphers only. Ubuntu cloud images
often ship a drop-in that re-enables password authentication; the script
rewrites it rather than relying on file ordering.

**Firewall.** UFW denies everything inbound except 22, 80 and 443. Port 22 is
rate-limited. Docker writes its own iptables rules and normally bypasses UFW
entirely, so a `DOCKER-USER` chain explicitly drops external traffic to 5432
and 6379 — belt and braces on top of binding those to `127.0.0.1`.

**fail2ban.** Three failed SSH attempts inside ten minutes earns a 24-hour ban.

**Automatic updates.** Security patches install unattended, with a reboot at
04:30 UTC when the kernel requires one. Pick a different hour if that clashes
with an event.

**Secrets.** Generated on the server, never transmitted, `.env.production` is
mode 600 and gitignored. Application secrets are additionally encrypted at
rest with envelope encryption: `APP_MASTER_KEY` wraps a per-secret key, and
the AAD binds each ciphertext to its tenant, so a row copied between tenants
will not decrypt.

**Client addresses.** Caddy overwrites `X-Real-IP` on every request and the
app is configured with `TRUSTED_PROXY_HEADER=x-real-ip`, reading that header
and nothing else. Without this a client could forge `X-Forwarded-For` and get
a fresh rate-limit bucket per request, which would defeat the sign-in
throttle. Addresses are stored only as a `/24` and as an HMAC.

**Backups.** Nightly, encrypted to a public key so the backup job itself
cannot read its own output, 30-day retention. Set `BACKUP_REMOTE` in
`.env.production` to an rclone or rsync destination to get them off the host —
until you do, a lost server is a lost database.

**HSTS.** Two years, `includeSubDomains`, preload-eligible. Browsers cache
this, so it is effectively hard to undo. It is deliberately only sent once you
are settled on HTTPS for this domain.

---

## 7. When something is wrong

**The certificate never arrives.** Check DNS resolves to this host, check port
80 is open from outside (`curl -I http://events.sunscript.tech`), then
`dc logs caddy`. Let's Encrypt rate-limits five failures per hour per domain;
if you have burned through them, wait rather than retrying.

**The app container restarts in a loop.** `dc logs app`. Almost always a
missing or malformed value in `.env.production` — the app validates its
environment at startup and refuses to run with a bad one.

**Migrations fail.** `dc logs migrator`. The app is not started when this
happens, so the previous release is still serving. Fix the migration, push
again.

**Locked out of SSH.** Use your provider's web console, log in as root, and
either add your key to `/home/usrmixweek/.ssh/authorized_keys` or temporarily set
`PasswordAuthentication yes` in `/etc/ssh/sshd_config.d/10-hardening.conf`
followed by `systemctl reload ssh`.

**Out of disk.** `docker system prune -a --volumes` is the blunt instrument,
but note `--volumes` would destroy the database. Without that flag it is safe.
Check `deploy/backups` first — that is usually what has grown.

---

## 8. Not verified here

Honesty about what has and has not been exercised:

- Docker is not installed on the machine these files were written on, so the
  images have **not** been built and the compose stack has **not** been run.
  Expect to iterate on the first `install-app.sh`.
- The shell scripts pass `bash -n` syntax checking only. No shellcheck was
  available.
- The application itself is covered by the unit, integration, end-to-end and
  accessibility suites described in `docs/14-qa.md`, all passing locally.
- A restore has not been rehearsed against a real backup. `docs/01` §8 asks
  for a quarterly restore drill; do the first one now, while nothing depends
  on it, rather than discovering a problem during an incident.
