# Deploying to events.sunscript.tech

This directory contains everything needed to take a blank Ubuntu server and
end up with the application running on HTTPS. The whole path is four commands;
the rest of this document explains what each one does and what to check
afterwards.

Target: **Ubuntu 24.04 LTS**, 2 vCPU / 4 GB RAM / 40 GB disk minimum. The
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

## 2. Server preparation

### 2.1 Get an SSH key onto the machine

You need a key pair on your Mac. If you do not have one:

```bash
ssh-keygen -t ed25519 -C "srv@mixweek-deploy"
```

Accept the default path (`~/.ssh/id_ed25519`) and set a passphrase. Then print
the public half — this is the string you will pass to the bootstrap script:

```bash
cat ~/.ssh/id_ed25519.pub
```

It is one line beginning `ssh-ed25519 AAAA…`. The **public** key is what goes
on the server. The private key (no `.pub`) never leaves your machine.

### 2.2 Copy this directory to the server

Log in as root using whatever credentials your provider gave you, and clone
the repository. If it is not on a hosting service yet, see §3.2 for the
push-first route; otherwise:

```bash
ssh root@YOUR_SERVER_IP
git clone https://github.com/YOUR_ORG/mixweek-web.git /root/mixweek-web
```

### 2.3 Run the bootstrap

```bash
cd /root/mixweek-web/deploy
bash bootstrap.sh --user deploy --ssh-key "ssh-ed25519 AAAA… srv@mixweek-deploy"
```

Paste your own public key inside the quotes. The script creates the `deploy`
user, installs Docker, adds swap, and then calls `harden.sh`, which sets up
the firewall, fail2ban, automatic security updates, and key-only SSH.

**Before you close that terminal**, open a second one and confirm you can get
back in:

```bash
ssh deploy@YOUR_SERVER_IP
```

If that works, you are safe. If it does not, fix it from the still-open root
session — password login and root login are now off, and your provider's
web console would be the only way back in.

### 2.4 Move the checkout to the deploy user

```bash
sudo mv /root/mixweek-web ~/app
sudo chown -R deploy:deploy ~/app
```

Everything from here runs as `deploy`, not root.

---

## 3. Connecting this machine to the server

Two options. The first needs nothing but SSH, which you already have.

### 3.1 Push straight to the server (recommended to start)

On the server:

```bash
cd ~/app/deploy && bash setup-git-remote.sh
```

That creates a bare repository at `~/repo/mixweek.git` and installs a
`post-receive` hook. The script prints the remote to add. On your Mac, in the
`mixweek-web` checkout:

```bash
git remote add production deploy@YOUR_SERVER_IP:/home/deploy/repo/mixweek.git
```

From then on, `git push production main` checks the code out on the server and
runs a deploy. Pushing any other branch is stored but does not deploy.

To avoid retyping the host, add to `~/.ssh/config` on your Mac:

```
Host mixweek
    HostName YOUR_SERVER_IP
    User deploy
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60
```

Then `ssh mixweek` and `git remote set-url production mixweek:/home/deploy/repo/mixweek.git`.

### 3.2 Pull from GitHub instead

If you would rather the server pulled from GitHub, generate a key **on the
server** and register it as a read-only deploy key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ''
cat ~/.ssh/github_deploy.pub
```

Add that public key in GitHub under Settings → Deploy keys, leaving "Allow
write access" unchecked. Then on the server:

```bash
printf 'Host github.com\n  IdentityFile ~/.ssh/github_deploy\n' >> ~/.ssh/config
git clone git@github.com:YOUR_ORG/mixweek-web.git ~/app
```

Deploys then become `cd ~/app && git pull && deploy/deploy.sh`. This is the
better option once more than one person deploys, because GitHub becomes the
single source of truth. The push-to-deploy route is simpler while it is just
you.

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

Sign-in is by emailed link. With `SMTP_*` empty, the app writes mail to a file
rather than sending it, which means nobody can log in. Fill in the SMTP
settings in `.env.production` and restart:

```bash
docker compose --env-file .env.production -f compose.production.yml restart app worker
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
| Re-apply hardening | `sudo DEPLOY_USER=deploy bash harden.sh` |
| Revoke all sessions | `dc run --rm --entrypoint '' migrator pnpm ops:revoke-sessions` |
| Suspend a tenant | `dc run --rm --entrypoint '' migrator pnpm ops:disable-tenant --id=…` |

`deploy.sh` takes a backup before it does anything else, and rolls the
containers back to the previous images if the new release fails its health
check. It does **not** roll back the database — a migration that has run has
run. That is why the pre-deploy backup exists.

---

## 6. Security summary

What `harden.sh` puts in place, and why each piece is there:

**SSH.** Key-only, root login refused, only the `deploy` user permitted, three
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
either add your key to `/home/deploy/.ssh/authorized_keys` or temporarily set
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
