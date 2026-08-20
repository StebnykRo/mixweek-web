# Step-by-step deployment guide

This guide takes you from nothing to a working website at
**https://events.sunscript.tech**.

It assumes you have never done this before. Every command is written out in
full. After most commands there is a note saying what you should see, so you
can tell whether it worked before moving on.

Set aside about **two hours**. Most of that is waiting.

If a step does not produce what this guide says it should, **stop** and look at
Part 17 (Troubleshooting) rather than pushing on. Continuing after a failed
step is what turns a small problem into a large one.

---

## Part 0 — Before you start

### 0.1 What you need to have ready

Write these down before you begin. You will need each of them several times,
and hunting for them halfway through is how mistakes happen.

| # | Thing | Example | Where it comes from |
| --- | --- | --- | --- |
| 1 | Server IP address | `203.0.113.45` | Your hosting provider's control panel |
| 2 | Server root password | — | Emailed to you when the server was created |
| 3 | Your email address | `you@yourcompany.com` | For certificate expiry warnings |
| 4 | Company email domain | `yourcompany.com` | The part after `@` in your staff's work email |
| 5 | Admin email address | `you@yourcompany.com` | Must end in the domain from row 4 |
| 6 | GitHub account | `StebnykRo` | Where the code is stored |

Rows 4 and 5 matter more than they look. The application decides which company
a person belongs to by looking at the domain of the email address they type in.
Get row 4 wrong and nobody will be able to sign in.

### 0.2 What the server must be

- **Ubuntu 24.04 LTS** (22.04 also works)
- At least **2 CPU cores, 4 GB RAM, 40 GB disk**
- A **public IPv4 address**

If your provider offers something smaller, do not take it. Building the
application uses a lot of memory; on a 2 GB server it either takes an hour or
fails outright.

### 0.3 Notation

Commands appear in grey boxes:

```bash
echo hello
```

Some contain **placeholders in capital letters**. Replace the whole
placeholder and nothing else. If the guide says:

```bash
ssh root@SERVER_IP
```

and your server is `203.0.113.45`, you type:

```bash
ssh root@203.0.113.45
```

Not `ssh root@SERVER_IP203.0.113.45`, and not `ssh root@"203.0.113.45"`.

Every command is labelled with where it runs:

- **[MAC]** — a Terminal window on your Mac
- **[SERVER]** — a Terminal window logged into the server
- **[BROWSER]** — a website, not a command

Mixing up [MAC] and [SERVER] is the single most common mistake. To tell which
you are on, look at the start of the line where you type: your Mac's name means
[MAC], `usrmixweek@ubuntu` or `root@ubuntu` means [SERVER].

### 0.4 Open two Terminal windows

You will need two at once in Part 8. Open both now.

Press `Cmd + Space`, type `Terminal`, press Enter. Then `Cmd + N` for a second
window. Put them side by side.

---

## Part 1 — How the pieces fit together

Read this once. It makes the rest of the guide obvious instead of a list of
commands to copy.

There are **three machines** in this story:

```
   your Mac  ────────────►  GitHub  ◄────────────  the server
              writes code            reads code
                    │                      ▲
                    └──────────────────────┘
                        runs the deploy
```

- **GitHub** stores the code. It is the single source of truth.
- **Your Mac** writes code and pushes it up.
- **The server** pulls the code down and runs the website.

Every arrow is an SSH connection, and each one needs **its own key**. A key is
a pair of files: a `.pub` file that is safe to hand out, and a matching private
file that never leaves the machine that made it.

Three arrows, three keys:

| Key | Lives on | Lets you | Access |
| --- | --- | --- | --- |
| **A** `github_mixweek` | your Mac | push code to GitHub | read + write |
| **B** `mixweek` | your Mac | log in to the server | full login |
| **C** `github_deploy` | the server | pull code from GitHub | **read only** |

Two design decisions worth understanding, because they are deliberate:

**Key C is read-only.** The server can fetch code and nothing else. A server
that can push to your source is a server that can quietly change what it
deploys. If it is ever broken into, your code is still safe.

**Each key is scoped to one repository.** On GitHub these are *deploy keys*,
and a deploy key works for exactly one repository. If key A leaks, only
`mixweek-web` is affected — your other projects are untouched.

You will create A and B on your Mac, and C on the server.

---

## Part 2 — Point the domain at the server

Do this first. It takes a few minutes to spread worldwide, and everything later
depends on it. Starting now means the wait happens in the background.

### 2.1 Add the DNS record

Log in to wherever `sunscript.tech` is managed — the company you buy the domain
name from. Find the section called **DNS**, **DNS records** or **Zone editor**.

Add a record with these exact values:

| Field | Value |
| --- | --- |
| Type | `A` |
| Name / Host | `events` |
| Value / Points to | Your server IP (row 1) |
| TTL | `300`, or "5 minutes", or "Automatic" |
| Proxy / CDN | **OFF** |

Two things people get wrong here:

- The Name field is just `events`, **not** `events.sunscript.tech`. Nearly
  every provider adds the rest for you. If yours shows a preview it should read
  `events.sunscript.tech`.
- On Cloudflare there is an orange cloud icon beside the record. **Click it so
  it turns grey.** An orange cloud blocks the security certificate from being
  issued the first time. You can switch it back on later.

Save the record.

### 2.2 Check it worked

**[MAC]**

```bash
dig +short events.sunscript.tech
```

You want your server's IP and nothing else:

```
203.0.113.45
```

Nothing at all means it has not spread yet — wait five minutes and try again.
Still blank after twenty minutes means the record was saved wrongly; go back to
2.1 and check the Name field.

**Do not continue until this prints your server's IP.**

---

## Part 3 — Key A: let your Mac push to GitHub

> **Already done?** If you have pushed to this repository before, skip to
> Part 4 and just run the verification in 4.4.

### 3.1 Create the key

**[MAC]**

```bash
ssh-keygen -t ed25519 -C "mixweek-web (mac push)" -f ~/.ssh/github_mixweek
```

The `-f ~/.ssh/github_mixweek` part matters. It says exactly where to save the
key. Leave it out and the command *asks* you where to save it, and whatever you
type there is treated as relative to whichever folder you happen to be in — so
the key lands somewhere unexpected and nothing can find it afterwards.

It asks two questions:

1. *"Enter passphrase"* — type one and press Enter. **Nothing appears as you
   type, not even dots. That is normal.** Put the passphrase in your password
   manager now.
2. *"Enter same passphrase again"* — type the same thing.

It prints a small block of ASCII art. That means it worked.

### 3.2 Remember the passphrase once

**[MAC]**

```bash
ssh-add --apple-use-keychain ~/.ssh/github_mixweek
```

Type the passphrase one final time. macOS stores it and loads the key
automatically at every login, so pushes never prompt again.

This is better than a key with no passphrase: the file on disk stays
encrypted, and macOS decides when it may be used.

### 3.3 Show the public half

**[MAC]**

```bash
cat ~/.ssh/github_mixweek.pub
```

One long line beginning `ssh-ed25519 AAAA` and ending in a comment:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleExampleExampleExample mixweek-web (mac push)
```

**Select the entire line and copy it** (`Cmd + C`).

Copy the *whole* line, including `ssh-ed25519` at the start. Partial copies
fail in confusing ways.

This is the `.pub` file — the **public** half, safe to share. Never copy or
send the file without `.pub`; that one is the actual secret. Keep it out of
iCloud Drive, Dropbox and any other synced folder. `~/.ssh` is not synced,
which is exactly why keys belong there.

### 3.4 Tell SSH when to use it

**[MAC]**

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
```

This invents a nickname, `github-mixweek`, that means "github.com, using this
particular key".

`IdentitiesOnly yes` is load-bearing. Without it SSH offers every key you own,
GitHub accepts whichever matches some *other* repository first, and you get a
baffling "repository not found" for a repository that plainly exists.

---

## Part 4 — Put the code on GitHub

> **Already done?** If the repository exists and has been pushed to, skip to
> 4.4 and verify.

### 4.1 Create an empty repository

**[BROWSER]** — go to https://github.com/new

| Field | Value |
| --- | --- |
| Owner | `StebnykRo`, or an organisation from the dropdown |
| Repository name | `mixweek-web` |
| Description | leave blank |
| Visibility | **Private** |

Under *"Initialize this repository with"*, leave **all three unticked**:

- ☐ Add a README file
- ☐ Add .gitignore → stays `None`
- ☐ Choose a license → stays `None`

This matters. Your Mac already has the full history. If GitHub creates a README
the two histories share no common ancestor, and the push is rejected with
`unrelated histories`. The repository must be empty.

Click **Create repository**. You land on a "Quick setup" page — **ignore all of
it.** Those commands set up an HTTPS remote; you want SSH with a specific key.

### 4.2 Register key A on the repository

**[BROWSER]** — in the new repository: **Settings → Deploy keys → Add deploy
key**

| Field | Value |
| --- | --- |
| Title | `mac-push` |
| Key | the line you copied in 3.3 |
| Allow write access | **TICK THIS BOX** |

Without the tick, pushing fails. This is the one key that is allowed to write.

### 4.3 Push the code

**[MAC]**

```bash
cd "/Users/srv/Library/Mobile Documents/com~apple~CloudDocs/Projects/MixWeek app/mixweek-web"
git remote add origin git@github-mixweek:StebnykRo/mixweek-web.git
git push -u origin main
```

Change `StebnykRo` if you created it under an organisation.

You should see a long list of objects and then:

```
 * [new branch]      main -> main
branch 'main' set up to track 'origin/main'.
```

### 4.4 Verify

**[MAC]**

```bash
ssh -T git@github-mixweek
```

Expect:

```
Hi StebnykRo/mixweek-web! You've successfully authenticated, but GitHub does not provide shell access.
```

The bit about shell access is normal — GitHub says that to everyone. What
matters is the repository name. If it names a *different* repository, step 3.4
did not take effect.

---

## Part 5 — Key B: let your Mac log in to the server

> **Already done?** Check with `ls -l ~/.ssh/mixweek.pub`. If it exists, skip
> to 5.3.

### 5.1 Create the key

**[MAC]**

```bash
ssh-keygen -t ed25519 -C "mixweek-deploy" -f ~/.ssh/mixweek
```

Same two questions as before: a passphrase, twice. Save it in your password
manager.

Again the `-f` matters, for the same reason as in 3.1.

### 5.2 Remember the passphrase

**[MAC]**

```bash
ssh-add --apple-use-keychain ~/.ssh/mixweek
```

### 5.3 Show the public half

**[MAC]**

```bash
cat ~/.ssh/mixweek.pub
```

Copy the whole line. You will paste it in Part 7 — this is the key that gets
installed on the server.

---

## Part 6 — Copy the setup files to the server

The code is on GitHub, and in Part 10 the server will fetch it from there
properly. But right now the server is brand new: no keys, no git, and no way to
authenticate to a private repository.

So this part sends a one-off snapshot across using the root password — just
enough to run the setup script. The proper GitHub connection comes once the
server has been prepared.

### 6.1 Make a package

**[MAC]**

```bash
cd "/Users/srv/Library/Mobile Documents/com~apple~CloudDocs/Projects/MixWeek app/mixweek-web"
```

Prints nothing when it works. "No such file or directory" means the project has
moved — find it and use the real path.

```bash
git archive --format=tar.gz -o ~/mixweek-web.tar.gz HEAD
```

Also prints nothing. Check it exists:

```bash
ls -lh ~/mixweek-web.tar.gz
```

Expect roughly **1 to 3 MB**:

```
-rw-r--r--  1 srv  staff   1.8M 20 Aug 15:04 /Users/srv/mixweek-web.tar.gz
```

A few kilobytes means something is wrong — stop and ask.

### 6.2 Send it across

**[MAC]**

```bash
scp ~/mixweek-web.tar.gz root@SERVER_IP:/root/
```

The first connection to a new server asks:

```
The authenticity of host '203.0.113.45' can't be established.
ED25519 key fingerprint is SHA256:...
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

Type `yes`, press Enter, then enter the root password (nothing appears as you
type). A progress bar runs to 100%.

### 6.3 Log in and unpack

**[MAC]**

```bash
ssh root@SERVER_IP
```

Enter the root password. The prompt becomes `root@ubuntu:~#`.

**Everything until Part 8 is now [SERVER].**

```bash
mkdir -p /root/mixweek-web && tar xzf /root/mixweek-web.tar.gz -C /root/mixweek-web
```

Check it arrived intact:

```bash
ls /root/mixweek-web/deploy
```

You should see:

```
Caddyfile   GUIDE.md    README.md   backup.sh   bootstrap.sh
compose.production.yml  deploy.sh   env.production.example  git-hooks
harden.sh   install-app.sh  postgres-init  restore.sh  setup-git-remote.sh
```

A short or missing list means the transfer failed. Go back to 6.1.

---

## Part 7 — Prepare and secure the server

This creates the `usrmixweek` account, installs Docker, and locks the server
down.

### 7.1 Read this before running it

At the end of this step, **logging in with a password will no longer be
possible**. Only key B will work. This is a large improvement in security and
also the one place in this guide where a mistake is expensive.

The script refuses to disable passwords unless it can already see a valid key,
and Part 8 verifies the key works before you close anything. Follow the order
and you will be fine.

### 7.2 Run it

**[SERVER]**

```bash
cd /root/mixweek-web/deploy
```

Now the main command. **Paste the public key from step 5.3 between the
quotes**, replacing `PASTE_KEY_B_HERE`:

```bash
bash bootstrap.sh --ssh-key "PASTE_KEY_B_HERE"
```

Filled in, it looks like this — one long line:

```bash
bash bootstrap.sh --ssh-key "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleExample mixweek-deploy"
```

Keep the double quotes. The key contains spaces, and without quotes the script
sees only the first word.

The account is called `usrmixweek` by default. To use a different name, add
`--user SOMETHING`.

Press Enter.

### 7.3 What you should see

It runs for **five to ten minutes**, printing blue `==>` lines:

```
==> Updating the package index
==> Installing base packages
==> Creating usrmixweek
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
stopped — read what it says, then see Part 17.

It finishes with a box telling you to verify a second session. That is Part 8,
and it is not optional.

**Leave this window open. Do not close it. Do not type `exit`.**

### 7.4 What it just did

- Created the **`usrmixweek`** account. From now on you log in as that, not as
  root. Root login over SSH is off.
- Installed **Docker**, which runs the application in isolated containers.
- Added **2 GB of swap** so the build does not run out of memory.
- Turned on a **firewall** allowing only SSH, HTTP and HTTPS.
- Installed **fail2ban** — three failed SSH attempts earns a 24-hour ban.
- Turned on **automatic security updates**, with a reboot at 04:30 UTC if a new
  kernel needs one.

---

## Part 8 — Verify you can still get in (do not skip)

This is the safety check. You are proving the new way in works **while the old
way is still open** as a fallback.

### 8.1 In your SECOND Terminal window

Switch to the other window — the one on your Mac that is *not* logged into the
server.

**[MAC]**

```bash
ssh usrmixweek@SERVER_IP
```

It may ask for the passphrase for key B. If you ran 5.2 it will not ask at all.

**If you land at a prompt reading `usrmixweek@ubuntu:~$`, you are safe.**
Continue to 8.2.

**If you get `Permission denied (publickey)`** — do not close the first window.
Go to Part 17.3, which fixes it from the still-open root session.

### 8.2 Close the root session

Now, and only now, switch back to the **first** window (logged in as root) and
type:

```bash
exit
```

Everything from here happens in the `usrmixweek` session.

### 8.3 Make future logins short

**[MAC]** — in a Terminal on your Mac:

```bash
cat >> ~/.ssh/config <<'EOF'

Host mixweek
    HostName SERVER_IP
    User usrmixweek
    IdentityFile ~/.ssh/mixweek
    ServerAliveInterval 60
EOF
```

Then replace `SERVER_IP` with the real address:

```bash
nano ~/.ssh/config
```

Arrow keys to reach `SERVER_IP`, delete it, type the address. `Ctrl + O`, Enter
to save, `Ctrl + X` to exit.

Now this is all you need:

```bash
ssh mixweek
```

### 8.4 Adding another person's key later

Someone else needs access? They send you *their* `.pub` line, and you append it
as its own line:

**[SERVER]**

```bash
nano ~/.ssh/authorized_keys
```

Paste their line at the end, save, exit. One key per line. Nothing else is
needed — no restart, no password.

To take access away, delete their line from the same file.

---

## Part 9 — Log out and back in

The snapshot in `/root/mixweek-web` has done its job — it existed only to run
the setup script. Part 10 fetches a proper copy from GitHub, so leave it where
it is as a fallback and do not move it.

One thing does need doing first.

### 9.1 Why

Docker permissions only apply from a fresh login. Skipping this makes Part 11
fail with a confusing error.

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

You want an empty table with headings:

```
CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES
```

If you see `permission denied while trying to connect to the Docker daemon
socket`, the log-out did not take. Repeat 9.1.

---

## Part 10 — Key C: let the server pull from GitHub

What you copied across in Part 6 was a snapshot — a plain folder with no link
back to where it came from. A real clone is what makes future updates a single
command instead of another round of scp.

The server gets its **own key**, and that key is **read-only**. It only ever
needs to read.

### 10.1 Create the key on the server

**[SERVER]**

```bash
ssh-keygen -t ed25519 -C "mixweek-web server (read-only)" -f ~/.ssh/github_deploy -N ''
```

`-N ''` means no passphrase. That is correct here and wrong on your Mac: nobody
is sitting at the server at 3am to type one. The key is protected by the file
permissions and by the fact that it can only read.

### 10.2 Show it

**[SERVER]**

```bash
cat ~/.ssh/github_deploy.pub
```

Copy the whole line.

### 10.3 Register it on GitHub

**[BROWSER]** — the repository → **Settings → Deploy keys → Add deploy key**

| Field | Value |
| --- | --- |
| Title | `server-readonly` |
| Key | the line from 10.2 |
| Allow write access | **LEAVE UNTICKED** |

Leaving that box unticked is the entire point of this part. Do not tick it.

You should now have two deploy keys listed: `mac-push` (write) and
`server-readonly` (read).

### 10.4 Tell the server to use it

**[SERVER]**

```bash
cat >> ~/.ssh/config <<'EOF'

Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

Test:

```bash
ssh -T git@github.com
```

Expect `Hi StebnykRo/mixweek-web! You've successfully authenticated…`

### 10.5 Clone the code

**[SERVER]**

```bash
git clone git@github.com:StebnykRo/mixweek-web.git ~/app
```

Confirm:

```bash
ls ~/app/deploy && git -C ~/app log --oneline -1
```

You should see the file list and one line showing the latest commit.

If it says `destination path '~/app' already exists`, you have run this before.
Update it in place instead of cloning again:

```bash
cd ~/app && git pull --ff-only
```

Never delete `~/app` once Part 11 has run — it holds the generated passwords,
and they are not stored anywhere else.

---

## Part 11 — Install the application

### 11.1 Run the installer

**[SERVER]** — replace `YOUR_EMAIL` with your own address (row 3):

```bash
cd ~/app/deploy && ./install-app.sh --domain events.sunscript.tech --email YOUR_EMAIL
```

That email is used only by Let's Encrypt, the free certificate authority, to
warn you before a certificate expires. It is not shown publicly.

### 11.2 What happens, and how long

**Ten to twenty minutes.** Most of it is one long silent stretch during the
build. That is normal — do not interrupt it.

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

Partway through it prints a message about secrets. **Read it — Part 12 acts on
it.**

### 11.3 Confirm the site is up

**[MAC]**

```bash
curl -sS https://events.sunscript.tech/api/health
```

You want:

```
{"status":"ok"}
```

Then open **https://events.sunscript.tech** in a browser. It sends you to the
sign-in page, with a padlock in the address bar. Do not try to sign in yet —
that needs Parts 13 and 14 first.

If the certificate did not arrive, see Part 17.4.

---

## Part 12 — Save the two keys that cannot be recreated

The server has just generated two things that **cannot be regenerated**. If the
disk dies and you have no copies, the data is gone permanently. Not "difficult
to recover" — gone.

Do this now. It takes two minutes.

### 12.1 The master key

**[SERVER]**

```bash
grep APP_MASTER_KEY= ~/app/deploy/.env.production
```

Two lines print. Copy the value of the first — everything after the `=`:

```
APP_MASTER_KEY=EXAMPLE-ONLY-yours-will-be-44-random-characters=
APP_MASTER_KEY_PREVIOUS=
```

Into your password manager as *"MixWeek APP_MASTER_KEY — production"*.

This key encrypts every secret the application stores. Without it they become
permanently unreadable.

### 12.2 The backup key

**[SERVER]**

```bash
cat ~/app/deploy/backups/age.key
```

Three lines print, the last starting `AGE-SECRET-KEY-`. Copy **all three** into
your password manager as *"MixWeek backup key — production"*.

This is the only thing that can decrypt the nightly backups. A backup key
stored only on the machine it protects is not a backup key.

### 12.3 Where backups go

Automatically every night at 03:15 UTC into `~/app/deploy/backups`, kept for 30
days.

They currently live only on this server, which does not protect you against
losing the server. Once you have somewhere else to put them, set
`BACKUP_REMOTE` in `.env.production`. Until then, know the limitation.

---

## Part 13 — Create the first company and admin

The application is running but empty. There are no companies in it, and because
it works out who you are from your email address, **nobody can sign in yet**.

### 13.1 Two different domains

This trips people up, so read it twice.

- **`events.sunscript.tech`** is the *website address*. People type it into a
  browser. Already configured.
- **Your company email domain** (row 4 — say `yourcompany.com`) is what comes
  after the `@` in your staff's email addresses. This is what the application
  uses to work out who somebody is.

They are almost always different, and the next command needs the **email** one.

### 13.2 Run it

**[SERVER]** — replace the four capitalised values:

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml run --rm --entrypoint '' migrator pnpm exec tsx scripts/provision-tenant.ts --slug=COMPANY_SLUG --name="COMPANY NAME" --domain=COMPANY_EMAIL_DOMAIN --admin=ADMIN_EMAIL
```

| Placeholder | What to put | Example |
| --- | --- | --- |
| `COMPANY_SLUG` | Short name, lowercase and hyphens only, no spaces | `acme` |
| `COMPANY NAME` | Display name shown to users. Keep the quotes | `"Acme Corporation"` |
| `COMPANY_EMAIL_DOMAIN` | Row 4 — after the `@` in staff emails | `acme.com` |
| `ADMIN_EMAIL` | Row 5 — must end in the domain above | `you@acme.com` |

Filled in:

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml run --rm --entrypoint '' migrator pnpm exec tsx scripts/provision-tenant.ts --slug=acme --name="Acme Corporation" --domain=acme.com --admin=you@acme.com
```

### 13.3 What you should see

```
Tenant "acme" ready.
  email domain : acme.com
  admin        : you@acme.com (TENANT_ADMIN)
  Sign in with that address; the link arrives by email.
```

`--admin must be at @acme.com` means the admin address does not match the
company domain. Both must be the same domain. Fix it and run again — running it
twice is safe.

---

## Part 14 — Set up email

Signing in works by emailing a link. With no email settings configured the
application writes messages to a log file instead of sending them, so **nobody
can sign in until this is done**.

### 14.1 Get SMTP details

Five values, from whoever runs your company email or from a sending service
such as Postmark, SendGrid, Mailgun or Amazon SES:

| Setting | Looks like |
| --- | --- |
| Host | `smtp.postmarkapp.com` |
| Port | `587` |
| Username | provided by the service |
| Password | provided by the service |
| From address | `no-reply@yourcompany.com` |

A dedicated sending service is worth the small cost. Mail sent straight from a
new server is very often filed as spam, and a sign-in link in a spam folder is
indistinguishable from a broken application.

### 14.2 Enter them

**[SERVER]**

```bash
nano ~/app/deploy/.env.production
```

`nano` is a simple editor — arrow keys only, the mouse does nothing. Press
`Ctrl + W`, type `SMTP_HOST`, press Enter to jump there.

Fill in each value after the `=`, with no spaces around it:

```
SMTP_HOST=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USER=your-username-here
SMTP_PASSWORD=your-password-here
MAIL_FROM=no-reply@yourcompany.com
```

`Ctrl + O`, Enter, `Ctrl + X`.

### 14.3 Restart

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml restart app worker
```

### 14.4 Test

Open **https://events.sunscript.tech** and sign in with the admin address from
13.2. The link should arrive within a minute. Check spam if it does not.

### 14.5 If email is not ready yet

You can still get in. Request a sign-in link on the website, then:

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml logs --tail 100 app | grep -i "sign-in\|magic\|token"
```

The link appears in the output. Paste it into your browser. This is for testing
only, not something to rely on.

---

## Part 15 — Everyday commands

Save yourself typing. **[SERVER]**, once:

```bash
echo "alias dc='docker compose --env-file ~/app/deploy/.env.production -f ~/app/deploy/compose.production.yml'" >> ~/.bashrc && source ~/.bashrc
```

Then:

| What you want | Command |
| --- | --- |
| Live log | `dc logs -f app` (`Ctrl + C` to stop) |
| What is running | `dc ps` |
| Restart | `dc restart app worker` |
| Back up now | `cd ~/app/deploy && DEPLOY_DIR=~/app/deploy ./backup.sh` |
| List backups | `ls -lh ~/app/deploy/backups` |
| Another company | Part 13.2 with different values |
| Free disk space | `docker image prune -f` |

---

## Part 16 — Shipping updates later

The code lives on GitHub and the server has a read-only clone. Updating the
live site is two moves: publish the change, then tell the server to take it.

### 16.1 Publish

**[MAC]** — from the project folder:

```bash
git push origin main
```

That updates GitHub. The live site is untouched so far, deliberately — pushing
code and deploying it are separate decisions.

### 16.2 Deploy

**[MAC]** — one command, from anywhere:

```bash
ssh mixweek 'cd ~/app && git pull --ff-only && deploy/deploy.sh'
```

Output streams back so you can watch. It takes a backup first, builds the new
version, updates the database, and restarts. If the new version fails to start
it puts the previous one back automatically and says so.

`--ff-only` means "only move forward". If the server's copy has been edited
directly the pull stops rather than inventing a merge nobody asked for. See
16.4 if that happens.

### 16.3 From the server instead

Already logged in:

```bash
cd ~/app && git pull --ff-only && deploy/deploy.sh
```

Identical.

### 16.4 If the pull refuses

Something was edited directly on the server. GitHub is the source of truth, so
throw the local changes away:

```bash
cd ~/app && git fetch origin && git reset --hard origin/main
```

This does **not** touch `deploy/.env.production` or `deploy/backups` — git does
not track those, so a reset leaves them alone.

### 16.5 What is actually deployed

**[SERVER]**

```bash
git -C ~/app log --oneline -1
```

Compare with `git log --oneline -1` on your Mac. Different means the server has
not been updated.

---

## Part 17 — Troubleshooting

### 17.1 "Permission denied" or "command not found"

Check which machine you are on. Look at the start of the line where you type:
your Mac's name means [MAC], `usrmixweek@ubuntu` means [SERVER]. Running a
[SERVER] command on your Mac is the most common cause.

### 17.2 A script stopped with a red `[x]`

That line says what went wrong. The scripts stop deliberately rather than carry
on broken. Fix what it names and run the same command again — all of them are
safe to re-run.

### 17.3 `Permission denied (publickey)` connecting as usrmixweek

Key B did not get installed. **In the root window that is still open** (Part 7
told you not to close it):

```bash
mkdir -p /home/usrmixweek/.ssh
nano /home/usrmixweek/.ssh/authorized_keys
```

Paste the public key from 5.3 as a single line. `Ctrl + O`, Enter, `Ctrl + X`.
Then:

```bash
chown -R usrmixweek:usrmixweek /home/usrmixweek/.ssh
chmod 700 /home/usrmixweek/.ssh
chmod 600 /home/usrmixweek/.ssh/authorized_keys
```

Try again in the second window.

**If you already closed the root window** and cannot get in at all: log in
through your hosting provider's web console — called "Console", "VNC" or
"Remote Access" in their control panel. That route does not go through SSH and
still works. Then follow the steps above.

### 17.4 No certificate / browser says not secure

Check DNS still points here:

```bash
dig +short events.sunscript.tech
```

If that is right, read the certificate service's log:

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml logs caddy | tail -40
```

Common causes:

- **DNS wrong or not spread.** Fix, wait, then
  `docker compose --env-file .env.production -f compose.production.yml restart caddy`
- **Cloudflare's orange cloud is on.** Turn it grey (2.1), restart caddy.
- **Rate limited.** Let's Encrypt allows five failures per hour per domain.
  Retrying faster makes it worse. Wait an hour.

### 17.5 The application keeps restarting

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml logs --tail 60 app
```

Nearly always a missing or mistyped value in `.env.production`. The application
checks its settings on startup and refuses to run with bad ones — the log names
the offending setting.

### 17.6 `git pull` says "Permission denied (publickey)" on the server

Key C is not registered, or SSH is not using it. Check:

```bash
ssh -T git@github.com
```

Naming a different repository means another key is being offered — confirm
`IdentitiesOnly yes` is in `~/.ssh/config` (10.4). `Permission denied` outright
means the key is not on GitHub — repeat 10.3.

### 17.7 Checking the state of everything

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml ps
```

Every row should read `running` or `healthy`, except `migrator`, which should
read `exited (0)`. That one is meant to finish and stop.

---

## Part 18 — Honest limitations

Worth knowing rather than discovering:

- **This was never test-run end to end.** The scripts were written and checked
  for syntax on a machine without Docker, so the container images have never
  been built. Expect at least one snag on the first `install-app.sh`. Part 17
  covers the likely ones.
- **Backups sit on the same server they protect.** That covers "someone deleted
  the wrong thing", not "the server is gone". Set `BACKUP_REMOTE` when you have
  somewhere to send them.
- **A restore has never been rehearsed.** Do a practice restore soon, while
  nothing depends on it. `./restore.sh` handles it and takes a safety copy
  before overwriting anything.
- **Uploads are stored on the server's own disk**, not in object storage. Fine
  at small scale; include the disk in whatever you back up.
- **One server, no redundancy.** If it goes down, the site is down. A
  reasonable place to start, but know it rather than assume otherwise.

---

## Quick reference card

Print this, or keep it open in a tab.

```
Website          https://events.sunscript.tech
Repository       github.com/StebnykRo/mixweek-web   (private)
Connect          ssh mixweek
Working dir      ~/app/deploy                        (on the server)
Settings file    ~/app/deploy/.env.production
Backups          ~/app/deploy/backups   nightly 03:15 UTC, kept 30 days

THE THREE KEYS
  A  ~/.ssh/github_mixweek   Mac    -> GitHub   read + write
  B  ~/.ssh/mixweek          Mac    -> server   login as usrmixweek
  C  ~/.ssh/github_deploy    server -> GitHub   READ ONLY

EVERY DAY
  Status         dc ps
  Logs           dc logs -f app
  Restart        dc restart app worker

SHIPPING A CHANGE
  1. git push origin main                                        [MAC]
  2. ssh mixweek 'cd ~/app && git pull --ff-only && deploy/deploy.sh'
  3. git -C ~/app log --oneline -1        confirms what is live  [SERVER]

IN THE PASSWORD MANAGER, VERIFY YOU HAVE
  [ ] APP_MASTER_KEY                 from .env.production
  [ ] backups/age.key                all three lines
  [ ] passphrase for key A           github_mixweek
  [ ] passphrase for key B           mixweek
  [ ] server root password           for the provider's web console
```
