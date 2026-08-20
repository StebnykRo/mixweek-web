#!/usr/bin/env bash
#
# Sets up push-to-deploy on the server. Run once, as the usrmixweek user:
#
#   bash setup-git-remote.sh
#
# Creates a bare repository, installs the post-receive hook, and prints the
# `git remote add` line to run on your own machine.

set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/repo/mixweek.git}"
WORK_TREE="${WORK_TREE:-$HOME/app}"
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

log() { printf '\n\033[1;34m==>\033[0m %s\n' "$*"; }

if [[ -d $REPO_DIR ]]; then
	log "Repository already at $REPO_DIR"
else
	log "Creating the bare repository at $REPO_DIR"
	mkdir -p "$REPO_DIR"
	git init --bare --initial-branch=main "$REPO_DIR"
fi

# The checkout target must exist before the first push.
mkdir -p "$WORK_TREE"

log 'Installing the post-receive hook'
install -m 755 "$HERE/git-hooks/post-receive" "$REPO_DIR/hooks/post-receive"

# The hook needs to know where to check out if the defaults were overridden.
git -C "$REPO_DIR" config --local deploy.worktree "$WORK_TREE"
if [[ $WORK_TREE != "$HOME/app" ]]; then
	sed -i "s|\${DEPLOY_WORK_TREE:-\$HOME/app}|\${DEPLOY_WORK_TREE:-$WORK_TREE}|" \
		"$REPO_DIR/hooks/post-receive"
fi

HOST=$(hostname -I | awk '{print $1}')
USER_NAME=$(id -un)

cat <<EOF

────────────────────────────────────────────────────────────────────────
  Push-to-deploy ready.

  On your own machine, in the mixweek-web checkout:

      git remote add production $USER_NAME@$HOST:$REPO_DIR
      git push production main

  The first push checks the code out into $WORK_TREE but the deploy will
  stop, because deploy/.env.production does not exist yet. That is
  expected — run deploy/install-app.sh on the server once, then every
  later push deploys on its own.
────────────────────────────────────────────────────────────────────────
EOF
