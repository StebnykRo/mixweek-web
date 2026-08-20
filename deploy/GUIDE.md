# Step-by-step deployment guide

This guide takes you from a brand-new, empty Ubuntu server to a working
website at **https://events.sunscript.tech**.

It assumes you have never done this before. Every command is written out in
full. After most commands there is a short description of what you should see,
so you can tell whether it worked before moving on.

Set aside about **90 minutes**. Most of that is waiting.

If a step does not produce what this guide says it should, **stop** and look at
Part 12 (Troubleshooting) rather than continuing. Carrying on after a failed
step is what turns a small problem into a large one.

---

## Part 0 — Before you start

### 0.1 What you need to have ready

Write these five things down before you begin. You will need each of them
several times, and hunting for them mid-way is how mistakes happen.

| # | Thing | Example | Where it comes from |
| --- | --- | --- | --- |
| 1 | Server IP address | `203.0.113.45` | Your hosting provider's control panel |
| 2 | Server root password or key | — | Emailed to you when the server was created |
| 3 | Your email address | `you@yourcompany.com` | For certificate expiry warnings |
| 4 | Company email domain | `yourcompany.com` | The part after `@` in your staff's work email |
| 5 | Admin email address | `you@yourcompany.com` | Must end in the domain from row 4 |

Rows 4 and 5 matter more than they look. The application decides which company
a person belongs to by looking at the domain of the email address they type in.
Get row 4 wrong and nobody will be able to sign in.

### 0.2 What the server must be

- **Ubuntu 24.04 LTS** (Ubuntu 22.04 also works)
- At least **2 CPU cores, 4 GB RAM, 40 GB disk**
- A **public IPv4 address**

If your provider offers a smaller size, do not take it. Building the
application uses a lot of memory, and on a 2 GB server it either takes an hour
or fails outright.

### 0.3 Notation used in this guide

Commands you type appear in grey boxes like this:

```bash
echo hello
```

Some commands contain **placeholders in capital letters**. Replace the whole
placeholder, including nothing else. For example, if the guide says:

```bash
ssh root@SERVER_IP
```

and your server IP is `203.0.113.45`, you type:

```bash
ssh root@203.0.113.45
```

Not `ssh root@SERVER_IP203.0.113.45`, and not `ssh root@"203.0.113.45"`.

### 0.4 Two terminal windows

You will need **two Terminal windows open at the same time** in Part 6. It is
worth opening both now so you are not fumbling later.

On your Mac, press `Cmd + Space`, type `Terminal`, press Enter. Then press
`Cmd + N` to open a second window. Arrange them side by side.

Throughout the guide, commands are labelled:

- **[MAC]** — type this in a Terminal window on your Mac
- **[SERVER]** — type this in a Terminal window that is logged into the server

Getting these two mixed up is the single most common mistake. If a command
fails with "no such file or directory", check which machine you are on first.

To tell which one you are on, look at the start of the line where you type.
On your Mac it shows your Mac's name. On the server it shows something like
`root@ubuntu` or `deploy@ubuntu`.

---

## Part 1 — Point the domain at the server

Do this first. It takes a few minutes to take effect worldwide, and everything
later depends on it. Starting it now means the wait happens in the background
while you do Part 2.

### 1.1 Add the DNS record

Log in to wherever `sunscript.tech` is managed — the company that sells you the
domain name. Find the section called **DNS**, **DNS records**, or **Zone
editor**.

Add a new record with these exact values:

| Field | Value |
| --- | --- |
| Type | `A` |
| Name / Host | `events` |
| Value / Points to | Your server IP from row 1 |
| TTL | `300` (or "5 minutes", or "Automatic") |
| Proxy / CDN | **OFF** |

A few notes:

- The Name field is just `events`, **not** `events.sunscript.tech`. Nearly
  every DNS provider adds the rest for you. If yours shows a preview, it should
  read `events.sunscript.tech`.
- If you are using Cloudflare, there is an orange cloud icon next to the
  record. **Click it so it turns grey.** An orange cloud prevents the security
  certificate from being issued the first time. You can turn it back on later,
  once the site is working.

Save the record.

### 1.2 Check that it worked

**[MAC]**

```bash
dig +short events.sunscript.tech
```

You should see your server's IP address and nothing else:

```
203.0.113.45
```

If you see nothing at all, the record has not spread yet. Wait five minutes and
run the command again. If after twenty minutes it is still blank, the record
was probably saved incorrectly — go back to 1.1 and check the Name field.

**Do not continue until this command prints your server's IP.**

---

## Part 2 — Create your SSH key

An SSH key is a pair of files that proves who you are to the server, replacing
a password. One file is public and gets copied to the server. The other is
private and never leaves your Mac.

### 2.1 Check whether you already have one

**[MAC]**

```bash
ls -l ~/.ssh/mixweek.pub
```

If it prints a line ending in `mixweek.pub`, the key already exists —
**skip to 2.3**.

If it says `No such file or directory`, continue with 2.2.

### 2.2 Create the key

**[MAC]**

```bash
ssh-keygen -t ed25519 -C "mixweek-deploy" -f ~/.ssh/mixweek
```

The `-f ~/.ssh/mixweek` part matters. It tells the command exactly where to put
the key. Without it, the command asks you where to save it, and anything you
type there is treated as relative to whatever folder you happen to be in — so
the key ends up somewhere unexpected and later steps cannot find it.

It asks two questions:

1. *"Enter passphrase"* — type a passphrase and press Enter. **You will not see
   anything as you type, not even dots. That is normal.** Choose something you
   can remember; you will type it each time you connect. Save it in your
   password manager now.
2. *"Enter same passphrase again"* — type the same thing again.

It prints a small piece of ASCII art called a randomart image. That means it
worked.

### 2.3 Display the public key

**[MAC]**

```bash
cat ~/.ssh/mixweek.pub
```

It prints one long line that starts with `ssh-ed25519 AAAA` and ends with a
comment:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleExampleExampleExample mixweek-deploy
```

**Select that entire line and copy it** (`Cmd + C`). You will paste it in Part
4. Keep this Terminal window open so you can copy it again if needed.

Two warnings:

- Copy the **whole** line, including `ssh-ed25519` at the start and the comment
  at the end. Partial copies fail in confusing ways.
- This is the `.pub` file — the **public** half, safe to share. Never copy or
  send the file without `.pub`; that one is the actual secret. In particular
  keep it out of iCloud Drive, Dropbox and any other synced folder — `~/.ssh`
  is not synced, which is exactly why keys belong there.

---

## Part 3 — Copy the application to the server

The application currently exists only on this Mac. This part packages it up and
sends it across.

### 3.1 Make a package

**[MAC]**

```bash
cd "/Users/srv/Library/Mobile Documents/com~apple~CloudDocs/Projects/MixWeek app/mixweek-web"
```

That command prints nothing when it works. If it says "No such file or
directory", the project has moved — find it and use its real path.

Now build the package:

```bash
git archive --format=tar.gz -o ~/mixweek-web.tar.gz HEAD
```

This also prints nothing. Check it was created:

```bash
ls -lh ~/mixweek-web.tar.gz
```

You should see a file of roughly **1 to 3 MB**:

```
-rw-r--r--  1 srv  staff   1.8M 20 Aug 15:04 /Users/srv/mixweek-web.tar.gz
```

If it is only a few kilobytes, something is wrong — stop and ask.

### 3.2 Send it to the server

**[MAC]** — replace `SERVER_IP` with your server's address:

```bash
scp ~/mixweek-web.tar.gz root@SERVER_IP:/root/
```

The first time you connect to a new server it asks:

```
The authenticity of host '203.0.113.45' can't be established.
ED25519 key fingerprint is SHA256:...
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

Type `yes` and press Enter. Then enter the server's root password when asked
(again, nothing appears as you type).

A progress bar runs to 100%. That is the file transferred.

### 3.3 Log in to the server

**[MAC]**

```bash
ssh root@SERVER_IP
```

Enter the root password. The prompt changes to something like `root@ubuntu:~#`.

**Everything from here until Part 6 is [SERVER].**

### 3.4 Unpack

**[SERVER]**

```bash
mkdir -p /root/mixweek-web && tar xzf /root/mixweek-web.tar.gz -C /root/mixweek-web
```

Check it arrived intact:

```bash
ls /root/mixweek-web/deploy
```

You should see the deployment files:

```
Caddyfile   GUIDE.md    backup.sh   compose.production.yml   env.production.example
README.md   bootstrap.sh   deploy.sh   git-hooks   harden.sh   install-app.sh
postgres-init   restore.sh   setup-git-remote.sh
```

If that list is missing or short, the transfer failed. Go back to 3.1.

---

## Part 4 — Prepare and secure the server

This is the big one. It creates a user account for the application, installs
Docker, and locks the server down.

### 4.1 Read this before running the command

At the end of this step, **logging in with a password will no longer be
possible**. Only your SSH key will work. This is a large improvement in
security and also the one place in this guide where a mistake is expensive.

The script refuses to disable passwords unless it can see a valid key, and Part
6 verifies the key works before you close anything. Follow the order and you
will be fine.

### 4.2 Run the preparation script

**[SERVER]**

```bash
cd /root/mixweek-web/deploy
```

Now the main command. **Paste your public key from step 2.3 between the
quotes**, replacing `PASTE_YOUR_PUBLIC_KEY_HERE`:

```bash
bash bootstrap.sh --user deploy --ssh-key "PASTE_YOUR_PUBLIC_KEY_HERE"
```

The finished command looks roughly like this — one long line:

```bash
bash bootstrap.sh --user deploy --ssh-key "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleExample mixweek-deploy"
```

Keep the double quotes. The key contains spaces, and without quotes the script
sees only the first word.

Press Enter.

### 4.3 What happens now

It runs for **five to ten minutes** and prints blue `==>` lines as it goes:

```
==> Updating the package index
==> Installing base packages
==> Creating deploy
==> Creating a 2G swapfile
==> Installing Docker from the official repository
==> Bootstrap finished — now running the hardening pass
==> Configuring SSH for key-only login
==> Configuring the firewall
==> Configuring fail2ban
==> Enabling automatic security updates
==> Applying kernel network settings
==> Hardening complete
```

Yellow `[!]` lines are warnings and usually fine. A red `[x]` line means it
stopped — read what it says and see Part 12.

It finishes with a box telling you to verify a second session. That is Part 6,
and it is not optional.

**Leave this Terminal window open. Do not close it. Do not type `exit`.**

---

## Part 5 — What just happened

Worth understanding, because you now have a different way of logging in.

The script created a user called **`deploy`**. From now on you log in as
`deploy`, not as `root`. Root login over SSH is switched off.

It also:

- Installed **Docker**, which runs the application in isolated containers
- Added **2 GB of swap** so the build does not run out of memory
- Turned on a **firewall** allowing only SSH, HTTP and HTTPS
- Installed **fail2ban**, which blocks an IP address for 24 hours after three
  failed SSH attempts
- Turned on **automatic security updates**, with a reboot at 04:30 UTC if a new
  kernel needs one

---

## Part 6 — Verify you can still get in (do not skip)

This is the safety check. You are proving the new login works **while you still
have the old one open** as a fallback.

### 6.1 In your SECOND Terminal window

Switch to the other Terminal window — the one on your Mac that is not logged
into the server.

**[MAC]**

```bash
ssh deploy@SERVER_IP
```

It will ask for the **passphrase for your SSH key** (the one you chose in step
2.2), not the server's root password.

**If you land at a prompt reading `deploy@ubuntu:~$`, you are safe.** Continue
to 6.2.

**If you get `Permission denied (publickey)`:** do not close the first window.
Go to Part 12.3, which fixes this from the still-open root session.

### 6.2 Close the root session

Now, and only now, switch back to the **first** window — the one logged in as
root — and type:

```bash
exit
```

From here on, everything is done in the `deploy` session from 6.1.

### 6.3 Make future logins easier

**[MAC]** — in a Terminal on your Mac (open a third window, or use the one
freed up in 6.2):

```bash
cat >> ~/.ssh/config <<'EOF'

Host mixweek
    HostName SERVER_IP
    User deploy
    IdentityFile ~/.ssh/mixweek
    ServerAliveInterval 60
EOF
```

Replace `SERVER_IP` afterwards:

```bash
nano ~/.ssh/config
```

Use the arrow keys to reach `SERVER_IP`, delete it, type the real address. Then
press `Ctrl + O`, Enter (to save), and `Ctrl + X` (to exit).

Now you can connect with just:

```bash
ssh mixweek
```

---

## Part 7 — Move the application into place

**[SERVER]** — in your `deploy` session:

```bash
sudo mv /root/mixweek-web ~/app && sudo chown -R deploy:deploy ~/app
```

Check:

```bash
ls ~/app/deploy
```

Same file list as in 3.4.

### 7.1 Log out and back in

Docker permissions only apply to a fresh login. Skipping this makes the next
part fail with a confusing error.

**[SERVER]**

```bash
exit
```

**[MAC]**

```bash
ssh mixweek
```

Confirm Docker works:

```bash
docker ps
```

You should see an empty table with headings:

```
CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES
```

If instead you see `permission denied while trying to connect to the Docker
daemon socket`, the log-out did not take. Repeat 7.1.

---

## Part 8 — Install the application

### 8.1 Run the installer

**[SERVER]** — replace `YOUR_EMAIL` with your own address (row 3):

```bash
cd ~/app/deploy && ./install-app.sh --domain events.sunscript.tech --email YOUR_EMAIL
```

That email is only used by Let's Encrypt, the free certificate authority, to
warn you if a certificate is about to expire. It is not shown publicly.

### 8.2 What happens, and how long

**This takes 10 to 20 minutes.** Most of it is one long silent stretch during
the build. That is normal — do not interrupt it.

The stages, in order:

```
==> Generating .env.production        (instant — creates all passwords)
==> Checking DNS for events.sunscript.tech
==> Building images                   (LONG — 5 to 15 minutes, mostly silent)
==> Starting Postgres and Redis
==> Waiting for Postgres
==> Applying migrations               (creates the database tables)
==> Starting the application
==> Waiting for the app to report healthy
==> Waiting for the certificate       (up to 2 minutes)
==> Installing the nightly backup timer
```

Partway through it prints a message about secrets. **Read it — Part 9 acts on
it.**

It ends with a box confirming the site address and reminding you to create a
tenant.

### 8.3 Confirm the site is up

**[MAC]**

```bash
curl -sS https://events.sunscript.tech/api/health
```

You should get back:

```
{"status":"ok"}
```

Then open **https://events.sunscript.tech** in a browser. It sends you to the
sign-in page, and there should be a padlock in the address bar. Do not try to
sign in yet — that needs Parts 10 and 11 first.

If the certificate did not arrive, see Part 12.4.

---

## Part 9 — Save the two keys (do this now)

The server has just generated two things that **cannot be recreated**. If the
server's disk dies and you do not have copies, the data is gone permanently.
Not "difficult to recover" — gone.

Do this before moving on. It takes two minutes.

### 9.1 The master key

**[SERVER]**

```bash
grep APP_MASTER_KEY= ~/app/deploy/.env.production
```

It prints two lines. Copy the value of the first one — everything after the
`=` sign:

```
APP_MASTER_KEY=k7Jx2mQp9vRt4wYz6BcD8eFgHiJkLmNoPqRsTuVwXyZ=
APP_MASTER_KEY_PREVIOUS=
```

Paste it into your password manager (1Password, Bitwarden, Apple Passwords)
under a name like *"MixWeek APP_MASTER_KEY — production"*.

This key encrypts every secret the application stores. Without it those become
permanently unreadable.

### 9.2 The backup key

**[SERVER]**

```bash
cat ~/app/deploy/backups/age.key
```

It prints three lines, the last starting with `AGE-SECRET-KEY-`. Copy **all
three lines** into your password manager as *"MixWeek backup key —
production"*.

This is the only thing that can decrypt the nightly backups. A backup key
stored only on the machine it protects is not a backup key.

### 9.3 Where backups go

Backups run automatically every night at 03:15 UTC into
`~/app/deploy/backups`, and are kept for 30 days.

They currently live only on this server, which does not protect you against
losing the server. Once you have somewhere to put them — another machine, or
object storage — set `BACKUP_REMOTE` in `.env.production`. Until then, be aware
of the limitation.

---

## Part 10 — Create the first company and admin

The application is running but completely empty. There are no companies in it,
and because it works out which company you belong to from your email address,
**nobody can sign in yet**.

### 10.1 Understand the two different domains

This trips people up, so read it twice.

- **`events.sunscript.tech`** is the *website address*. People type it into a
  browser. It is already configured.
- **Your company email domain** (row 4 — for example `yourcompany.com`) is what
  comes after the `@` in your staff's email addresses. This is what the
  application uses to work out who somebody is.

These are almost always different, and the next command needs the **email**
one.

### 10.2 Run the command

**[SERVER]** — replace the four capitalised values:

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml run --rm --entrypoint '' migrator pnpm exec tsx scripts/provision-tenant.ts --slug=COMPANY_SLUG --name="COMPANY NAME" --domain=COMPANY_EMAIL_DOMAIN --admin=ADMIN_EMAIL
```

What each one means:

| Placeholder | What to put | Example |
| --- | --- | --- |
| `COMPANY_SLUG` | Short name, lowercase letters and hyphens only, no spaces | `acme` |
| `COMPANY NAME` | The display name, shown to users. Keep the quotes | `"Acme Corporation"` |
| `COMPANY_EMAIL_DOMAIN` | Row 4 — the part after `@` in staff emails | `acme.com` |
| `ADMIN_EMAIL` | Row 5 — your address, must end in the domain above | `you@acme.com` |

A filled-in example:

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml run --rm --entrypoint '' migrator pnpm exec tsx scripts/provision-tenant.ts --slug=acme --name="Acme Corporation" --domain=acme.com --admin=you@acme.com
```

### 10.3 What you should see

```
Tenant "acme" ready.
  email domain : acme.com
  admin        : you@acme.com (TENANT_ADMIN)
  Sign in with that address; the link arrives by email.
```

If it says `--admin must be at @acme.com`, your admin email does not match the
company domain. Both must be the same domain. Fix and run it again — running it
twice is safe.

---

## Part 11 — Set up email

Signing in works by emailing a link. Right now no email settings are
configured, so the application writes messages to a log file instead of
sending them. **Nobody can sign in until this is done.**

### 11.1 Get SMTP details

You need five values from whoever runs your company email — or from a sending
service such as Postmark, SendGrid, Mailgun or Amazon SES:

| Setting | Looks like |
| --- | --- |
| Host | `smtp.postmarkapp.com` |
| Port | `587` |
| Username | provided by the service |
| Password | provided by the service |
| From address | `no-reply@yourcompany.com` |

A dedicated sending service is worth the small cost. Mail sent directly from a
new server is very often filed as spam, and a sign-in link in a spam folder is
indistinguishable from a broken application.

### 11.2 Enter them

**[SERVER]**

```bash
nano ~/app/deploy/.env.production
```

`nano` is a simple text editor. Use the arrow keys — the mouse does nothing.
Press `Ctrl + W`, type `SMTP_HOST`, press Enter to jump to the right section.

Fill in the values after each `=`, with no spaces around it:

```
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=your-username-here
SMTP_PASSWORD=your-password-here
MAIL_FROM=no-reply@yourcompany.com
```

Save and exit: `Ctrl + O`, Enter, then `Ctrl + X`.

### 11.3 Restart

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml restart app worker
```

### 11.4 Test it

Open **https://events.sunscript.tech** and sign in with the admin address from
step 10.2. The link should arrive within a minute. Check the spam folder if it
does not.

### 11.5 If email is not ready yet

You can still get in. Request a sign-in link on the website, then:

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml logs --tail 100 app | grep -i "sign-in\|magic\|token"
```

The link appears in the output. Copy it into your browser. This is a temporary
measure for testing, not something to rely on.

---

## Part 12 — Troubleshooting

### 12.1 "Permission denied" or "command not found"

Check which machine you are on. Look at the start of the line where you type:
your Mac's name means **[MAC]**, `deploy@ubuntu` means **[SERVER]**. Running a
[SERVER] command on your Mac is the most common cause.

### 12.2 The script stopped with a red `[x]` line

That line says what went wrong. The scripts stop deliberately rather than
continuing in a broken state. Fix what it names and run the same command again
— all of them are safe to re-run.

### 12.3 `Permission denied (publickey)` when connecting as deploy

Your key did not get installed properly. **In the root window that is still
open** (Part 6 told you not to close it):

```bash
mkdir -p /home/deploy/.ssh
nano /home/deploy/.ssh/authorized_keys
```

Paste your public key from step 2.3 as a single line. Save with `Ctrl + O`,
Enter, `Ctrl + X`. Then:

```bash
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
```

Try connecting as `deploy` again in the second window.

**If you closed the root window already** and cannot get in at all: log in
through your hosting provider's web console (variously "Console", "VNC",
"Remote Access" in their control panel) — that route does not go through SSH
and still works. Then follow the steps above.

### 12.4 The site has no certificate / browser warns it is not secure

Check DNS still points here:

```bash
dig +short events.sunscript.tech
```

If that is right, look at the certificate service's log:

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml logs caddy | tail -40
```

Common causes:

- **DNS is wrong or has not spread.** Fix it, wait, then restart:
  `docker compose --env-file .env.production -f compose.production.yml restart caddy`
- **Cloudflare's orange cloud is on.** Turn it grey (step 1.1) and restart caddy.
- **Rate limited.** Let's Encrypt allows five failures per hour per domain. If
  you have tried repeatedly, wait an hour. Retrying faster makes it worse.

### 12.5 The application keeps restarting

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml logs --tail 60 app
```

Nearly always a missing or mistyped value in `.env.production`. The application
checks its settings on startup and refuses to run with bad ones — the log names
the offending setting.

### 12.6 Checking the state of everything

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml ps
```

All rows should read `running` or `healthy`, except `migrator`, which should
read `exited (0)`. That one is supposed to finish and stop.

---

## Part 13 — Day-to-day

Save yourself typing. **[SERVER]**, once:

```bash
echo "alias dc='docker compose --env-file ~/app/deploy/.env.production -f ~/app/deploy/compose.production.yml'" >> ~/.bashrc && source ~/.bashrc
```

Then:

| What you want | Command |
| --- | --- |
| See the live log | `dc logs -f app` (press `Ctrl + C` to stop) |
| Check what is running | `dc ps` |
| Restart the application | `dc restart app worker` |
| Back up right now | `cd ~/app/deploy && DEPLOY_DIR=~/app/deploy ./backup.sh` |
| List backups | `ls -lh ~/app/deploy/backups` |
| Add another company | Part 10.2 with different values |
| Free up disk space | `docker image prune -f` |

---

## Part 14 — Shipping updates later

Once the application changes and needs redeploying, set this up so it takes one
command.

### 14.1 On the server, once

**[SERVER]**

```bash
cd ~/app/deploy && bash setup-git-remote.sh
```

It prints the line to run on your Mac.

### 14.2 On your Mac, once

**[MAC]**

```bash
cd "/Users/srv/Library/Mobile Documents/com~apple~CloudDocs/Projects/MixWeek app/mixweek-web"
git remote add production mixweek:/home/deploy/repo/mixweek.git
```

### 14.3 Every time afterwards

**[MAC]**

```bash
git push production main
```

That is the whole deployment. The server takes a backup, builds the new
version, updates the database, and restarts. If the new version fails to start,
it puts the previous one back automatically and tells you.

Watch it happen — the output streams into your Terminal as it goes.

---

## Part 15 — Honest limitations

Things worth knowing rather than discovering:

- **This was never test-run end to end.** The scripts were written and checked
  for syntax on a machine without Docker, so the container images have never
  actually been built. Expect to hit at least one snag on the first
  `install-app.sh` and to fix it. Part 12 covers the likely ones.
- **Backups sit on the same server they protect.** That covers "someone deleted
  the wrong thing", not "the server is gone". Set `BACKUP_REMOTE` when you have
  somewhere to send them.
- **A restore has never been rehearsed.** Do a practice restore soon, while
  nothing depends on it. `./restore.sh` handles it, and takes a safety copy
  before overwriting anything.
- **Uploads are stored on the server's own disk**, not in object storage. Fine
  at small scale; include the disk in whatever you back up.
- **One server, no redundancy.** If it goes down, the site is down. That is a
  reasonable place to start, but it is worth knowing rather than assuming
  otherwise.

---

## Quick reference card

Print this, or keep it open in a tab.

```
Website          https://events.sunscript.tech
Connect          ssh mixweek
Working dir      ~/app/deploy
Settings file    ~/app/deploy/.env.production
Backups          ~/app/deploy/backups   (nightly 03:15 UTC, kept 30 days)

Status           dc ps
Logs             dc logs -f app
Restart          dc restart app worker
Deploy update    git push production main      [from the Mac]

In the password manager, verify you have:
  [ ] APP_MASTER_KEY
  [ ] backups/age.key
  [ ] SSH key passphrase
```
