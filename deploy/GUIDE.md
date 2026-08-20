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

- **Ubuntu 26.04 LTS** (codename `resolute`). 24.04 also works.
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

## Part 6 — The one and only root session

A brand-new server hands you exactly one way in: the root account. There is no
other account to use yet, so the first login is root by necessity.

That session exists to do one thing — create `usrmixweek` and let it in — and
then it is closed for good. Everything after this happens as `usrmixweek`.

### 6.1 Log in as root

**[MAC]**

```bash
ssh root@SERVER_IP
```

The first connection to a new server asks:

```
The authenticity of host '203.0.113.45' can't be established.
ED25519 key fingerprint is SHA256:...
Are you sure you want to continue connecting (yes/no/[fingerprint])?
```

Type `yes`, press Enter, then the root password from row 2 (nothing appears as
you type).

The prompt becomes `root@ubuntu:~#`.

**Keep this window open until Part 7 says otherwise.**

### 6.2 Create the account

Run these one at a time. **[SERVER]**

```bash
apt-get update && apt-get install -y git
```

Git is needed to fetch everything else. A page or two of output.

```bash
adduser --disabled-password --gecos '' usrmixweek
```

`--disabled-password` means the account has no password at all. That is
intentional — it will be reachable only by SSH key, which is stronger than any
password you would choose.

```bash
usermod -aG sudo usrmixweek
```

Administrator rights, for the parts of the setup that genuinely need them.

### 6.3 Install key B so you can log in as usrmixweek

**[SERVER]** — replace `PASTE_KEY_B_HERE` with the line from step 5.3:

```bash
install -d -m 700 -o usrmixweek -g usrmixweek /home/usrmixweek/.ssh
echo "PASTE_KEY_B_HERE" > /home/usrmixweek/.ssh/authorized_keys
chown usrmixweek:usrmixweek /home/usrmixweek/.ssh/authorized_keys
chmod 600 /home/usrmixweek/.ssh/authorized_keys
```

Filled in, the second line looks like:

```bash
echo "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIExampleExample mixweek-deploy" > /home/usrmixweek/.ssh/authorized_keys
```

Keep the double quotes — the key contains spaces.

Check it landed as exactly one line:

```bash
cat /home/usrmixweek/.ssh/authorized_keys
```

### 6.4 Let it use sudo without a password

**[SERVER]**

```bash
echo 'usrmixweek ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/90-usrmixweek
chmod 440 /etc/sudoers.d/90-usrmixweek
visudo -c
```

The account has no password, so there is none to type at a sudo prompt. The
SSH key is the real credential.

`visudo -c` must print `parsed OK`. If it does not, **do not close this
window** — a broken sudoers file locks everyone out of administrator rights.
Delete the file with `rm /etc/sudoers.d/90-usrmixweek` and try again.

That is everything root does. Six commands.

---

## Part 7 — Move to usrmixweek, and stop using root

### 7.1 In your SECOND Terminal window

Switch to the other window — the one on your Mac that is *not* logged into the
server.

**[MAC]**

```bash
ssh usrmixweek@SERVER_IP
```

It may ask for the passphrase for key B. If you ran 5.2 it will not ask.

**If you land at a prompt reading `usrmixweek@ubuntu:~$`, it worked.**

**If you get `Permission denied (publickey)`** — do not close the root window.
Go back to 6.3; the key was probably pasted incompletely or split across lines.

This check happens now, before anything is locked down, precisely so that a
mistake here is a small one. Password login still works as a fallback at this
point. It will not later.

### 7.2 Confirm sudo works

**[SERVER]** — in the new `usrmixweek` session:

```bash
sudo whoami
```

Should print `root` with no password prompt. If it asks for a password, 6.4 did
not take.

### 7.3 Close the root session for good

Switch back to the **first** window and type:

```bash
exit
```

That window is finished. Nothing else in this guide uses root directly.

From here everything runs as `usrmixweek`, using `sudo` only for the few steps
that genuinely need administrator rights — installing packages, configuring the
firewall, editing the SSH server's settings. The application itself never runs
as root: its files are owned by `usrmixweek`, and the containers run as an
unprivileged user inside.

### 7.4 If you ever land as root again

You should not need to. `ssh mixweek` logs you straight in as `usrmixweek`,
and after Part 9 the SSH server refuses root outright.

The exception is a recovery through your provider's web console, which always
drops you at a root prompt. Switch across before doing anything:

```bash
sudo su - usrmixweek
```

The `-` matters: it loads the account's environment, so `~` means
`/home/usrmixweek` and the `dc` alias from Part 15 works. Without it you keep
root's environment and commands quietly operate on the wrong home directory.

Run everything for the application from that shell. Nothing to do with the
application should be run as root.

### 7.5 Make future logins short

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

### 7.6 Adding another person's key later

Someone else needs access? They send you *their* `.pub` line, and you append it
as its own line:

**[SERVER]**

```bash
nano ~/.ssh/authorized_keys
```

Paste their line at the end, save, exit. One key per line. Nothing else — no
restart, no password.

To take access away, delete their line from the same file.

---

## Part 8 — Key C: let the server pull from GitHub

The server gets its **own key**, separate from both keys on your Mac, and that
key is **read-only**. It only ever needs to read.

Everything in this part runs as `usrmixweek`, so the key and the code end up
owned by the account that uses them.

### 8.1 Create the key

**[SERVER]**

```bash
ssh-keygen -t ed25519 -C "mixweek-web server (read-only)" -f ~/.ssh/github_deploy -N ''
```

`-N ''` means no passphrase. That is right here and wrong on your Mac: nobody
is sitting at the server at 3am to type one. This key is protected by file
permissions and by the fact that it can only read.

### 8.2 Show it

**[SERVER]**

```bash
cat ~/.ssh/github_deploy.pub
```

Copy the whole line — from `ssh-ed25519` to the end of the comment. Select it
with the mouse, then `Cmd + C`.

### 8.3 Register it on GitHub

**[BROWSER]** — the repository → **Settings → Deploy keys → Add deploy key**

| Field | Value |
| --- | --- |
| Title | `server-readonly` |
| Key | the line from 8.2 |
| Allow write access | **LEAVE UNTICKED** |

Leaving that box unticked is the entire point of this part. Do not tick it.

You should now have two deploy keys listed: `mac-push` (write) and
`server-readonly` (read).

### 8.4 Tell the server to use it

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

Test it:

```bash
ssh -T git@github.com
```

Type `yes` when it asks about authenticity. Expect:

```
Hi StebnykRo/mixweek-web! You've successfully authenticated, but GitHub does not provide shell access.
```

The bit about shell access is normal. What matters is the repository name.

`Permission denied (publickey)` means the key did not register — repeat 8.3.

### 8.5 Clone the code

**[SERVER]**

```bash
git clone git@github.com:StebnykRo/mixweek-web.git ~/app
```

Confirm:

```bash
ls ~/app/deploy && git -C ~/app log --oneline -1
```

You should see the deployment files and one line showing the latest commit:

```
Caddyfile   GUIDE.md    README.md   backup.sh   bootstrap.sh
compose.production.yml  deploy.sh   env.production.example  git-hooks
harden.sh   install-app.sh  postgres-init  restore.sh  setup-git-remote.sh
```

The server now has the code, fetched from the same place your Mac pushes to.
Nothing was ever copied onto it by hand.

---

## Part 9 — Secure the server

The setup script came down with the clone. This runs it.

### 9.1 What it will do

At the end of this step, **logging in with a password will no longer be
possible**. Only key B will work.

You already proved key B works in 7.1, which is why this is safe to do now.

### 9.2 Run it

**[SERVER]** — in your `usrmixweek` session:

```bash
cd ~/app/deploy && sudo bash bootstrap.sh
```

No `--ssh-key` is needed: key B is already in place from 6.3, and the script
leaves an existing key alone.

`sudo` is required because this installs system packages and rewrites the SSH
and firewall configuration. That is privileged work whichever account asks for
it — what matters is that the session, the files and the application all belong
to `usrmixweek`.

### 9.3 What you should see

Five to ten minutes, printing blue `==>` lines:

```
==> Updating the package index
==> Installing base packages
==> User usrmixweek already exists
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

`User usrmixweek already exists` is expected — you created it in 6.2.

Yellow `[!]` lines are warnings and usually fine. A red `[x]` means it stopped
— read what it says, then see Part 17.

### 9.4 What it just did

- Installed **Docker**, which runs the application in isolated containers.
- Added **2 GB of swap** so the build does not run out of memory.
- Turned on a **firewall** allowing only SSH, HTTP and HTTPS.
- Installed **fail2ban** — three failed SSH attempts earns a 24-hour ban.
- Turned on **automatic security updates**, with a reboot at 04:30 UTC if a new
  kernel needs one.
- Switched SSH to **key-only**, refused root login, and restricted logins to
  `usrmixweek` alone.

### 9.5 Check you are still in

**[MAC]** — in your other Terminal window, prove the lockdown did not lock you
out:

```bash
ssh mixweek
```

If that works, the server is secured and still reachable. If it does not, see
Part 17.3 — and use the session you already have open rather than closing it.

---

## Part 10 — Log out and back in

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
socket`, the log-out did not take. Repeat this part.

---

## Part 11 — Install the application

### 11.1 Run the installer

**[SERVER]** — replace `YOUR_EMAIL` with your own address (row 3):

```bash
cd ~/app/deploy && ./install-app.sh --domain events.sunscript.tech --email YOUR_EMAIL
```

Note there is no `sudo` here. The application is installed and run by
`usrmixweek`, not by root. The script uses `sudo` internally for exactly one
thing — registering the nightly backup timer with the system scheduler.

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

## Part 14 — Letting people sign in

Signing in works by emailed link. Until a mail transport is configured the
application sends nothing — and in production it writes nothing to disk
either, because a sign-in link is a credential and is not allowed to leave the
process.

So there are two ways in, and you can start with the first.

### 14.1 Hand out a link yourself (no mail needed)

**[SERVER]**

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml run --rm --entrypoint '' migrator pnpm ops:signin-link --email=SOMEONE@yourcompany.com
```

It prints a link and a six-digit code:

```
  Sign-in link for you@yourcompany.com (tenant: yourco)

  https://events.sunscript.tech/auth/verify?token=...

  Code if asked:  482913
  Valid for:      10 minutes, one use
```

Send both to that person over something private — a direct message, not a
group chat. **Treat the link like a password**: for the next ten minutes
anyone holding it can sign in as them.

Two things to know:

- The address must be in a domain that has a tenant (Part 13). Anything else
  is refused, because there would be no company to sign in to.
- Issuing a new link cancels the previous one. Only the most recent works.

The person does not need an account first — one is created when they use the
link, and they join the tenant their email domain belongs to.

This is fine for the first few people. It does not scale, and it means you are
personally in the loop for every sign-in, so set up mail before rolling out
widely.

### 14.2 Configure mail properly

The application sends through **Resend**, over its HTTP API. There is no SMTP
setting — an API key over HTTPS avoids a long-lived password sitting in a
config file, and lets the key be rotated without a redeploy.

Sign up at resend.com, verify your sending domain, and create an API key. Then
store it — it goes in the database encrypted, not in a file:

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml run --rm -it --entrypoint '' migrator pnpm ops:rotate-secret --key=mail.resend_api_key --tenant=YOUR_TENANT_ID
```

It asks for the value and reads it from your keyboard, so the key never
reaches your shell history or the process list. It cannot be read back
afterwards — only replaced.

To find `YOUR_TENANT_ID`:

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml exec -T postgres psql -U app_admin -d mixweek -tAc 'SELECT id, slug FROM "Tenant";'
```

Set the sender name and address from the admin interface under Settings —
`mail.from_name` and `mail.from_email`. The address must be on the domain you
verified with Resend, or messages will be rejected.

Then restart:

```bash
cd ~/app/deploy && docker compose --env-file .env.production -f compose.production.yml restart app worker
```

### 14.3 Test

Open **https://events.sunscript.tech**, enter an address in your company
domain, and the link should arrive within a minute. Check spam if it does not.

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

Key B is not installed correctly. Which fix applies depends on how far you got.

**If the root window from Part 6 is still open** — the usual case, because 7.1
happens while it is — use it. Nine times out of ten the key was pasted
incompletely or wrapped onto two lines:

```bash
cat /home/usrmixweek/.ssh/authorized_keys
```

It must be exactly one line, starting `ssh-ed25519` and ending in the comment.
If it is wrong, redo it:

```bash
nano /home/usrmixweek/.ssh/authorized_keys
```

Delete everything, paste the line from 5.3, save with `Ctrl + O`, Enter,
`Ctrl + X`. Then fix the ownership:

```bash
chown -R usrmixweek:usrmixweek /home/usrmixweek/.ssh
chmod 700 /home/usrmixweek/.ssh
chmod 600 /home/usrmixweek/.ssh/authorized_keys
```

Try the second window again.

**If root is closed but password login still works** — you have not run Part 9
yet, so it does:

```bash
ssh root@SERVER_IP
```

Then the same steps.

**If root is closed and Part 9 has run**, SSH will not let you in at all. Use
your hosting provider's web console — called "Console", "VNC" or "Remote
Access" in their control panel. It does not go through SSH and still works. Log
in as root there and follow the steps above.

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
`IdentitiesOnly yes` is in `~/.ssh/config` (8.4). `Permission denied` outright
means the key is not on GitHub — repeat 8.3.

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
