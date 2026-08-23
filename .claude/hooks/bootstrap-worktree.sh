#!/usr/bin/env bash
# SessionStart
#
# A worktree is a fresh checkout and .env.local is gitignored, so it does not
# come along. Without it the dev server and every gate that reads env vars fail
# with errors that never name the cause.
#
# This is a hook rather than something the agent does because guard-secrets.sh
# counts `cp` among its content-reading verbs and denies the agent the copy.
# That is the right call — it only means the agent cannot be the one to do it.
#
# Symlink, not copy: .env.local is not per-branch. Exactly one exists, in the
# main checkout. Linking keeps the service-role key on disk once, so rotating a
# key reaches every worktree and there is no second copy to drift or leak.
set -uo pipefail

# Any failure below is a reason to do nothing, never a reason to block a
# session from starting. Every path exits 0.
toplevel=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
common=$(git rev-parse --git-common-dir 2>/dev/null) || exit 0
case "$common" in
  /*) ;;
  *) common="$toplevel/$common" ;;
esac
main_root=$(cd "$(dirname "$common")" 2>/dev/null && pwd) || exit 0

# In the main checkout --git-common-dir is the relative `.git`, so main_root
# resolves back to toplevel. Only a worktree makes these differ.
[ "$main_root" = "$toplevel" ] && exit 0

notes=""
add() { notes="${notes}${notes:+ }$1"; }

if [ -e "$toplevel/.env.local" ]; then
  add ".env.local already present — left untouched."
elif [ -f "$main_root/.env.local" ]; then
  if ln -s "$main_root/.env.local" "$toplevel/.env.local" 2>/dev/null; then
    add ".env.local symlinked from the main checkout."
  else
    add ".env.local could not be linked; link it by hand from the main checkout."
  fi
else
  add "The main checkout has no .env.local, so none was linked."
fi

[ -d "$toplevel/node_modules" ] || \
  add "node_modules is absent — run \`npm ci\` before any build, test, or gate."

[ -z "$notes" ] && exit 0

python3 -c '
import json, sys
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "SessionStart",
        "additionalContext": "Worktree bootstrap: " + sys.argv[1],
    },
}))' "$notes"
exit 0
