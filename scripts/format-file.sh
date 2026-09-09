#!/usr/bin/env bash
# Format one or more files, each with the formatter that actually understands
# its language. The single entry point for every caller:
#
#   .claude/hooks/format-changed.sh   PostToolUse, one file, Claude Code only
#   .githooks/pre-commit              staged files, EVERY tool and every human
#
# It lives in scripts/ rather than under .claude/ or .githooks/ on purpose.
# Formatting is not owned by any one agent — Claude, Codex, Gemini and a plain
# `git commit` all reach the same script, so they cannot drift apart.
#
# Routing:
#   JS/TS/JSON/CSS/MD/HTML/YAML -> prettier   (config: prettier.config.mjs)
#   Shell                       -> shfmt      (optional)
#   Python                      -> black      (optional)
#   SQL, TOML                   -> nothing, deliberately (see below)
#
# NOT formatting SQL is a decision, not a gap. `supabase/migrations/` holds
# applied, immutable history, 55 of its 125 files carry dollar-quoted bodies
# ($$ ... $$) and 31 use CREATE POLICY / plpgsql / SECURITY DEFINER — the exact
# syntax SQL formatters corrupt. .prettierignore carries the long version.
#
# Optional formatters DEGRADE SILENTLY when absent, matching
# bootstrap-worktree.sh: a missing tool is a reason to do nothing, never a
# reason to fail a commit for someone who has not installed it yet.
#   brew install shfmt      # shell
#   pipx install black      # python  (or: brew install black)
set -uo pipefail

# Resolve the repo root so relative paths work from any worktree or subdir.
root=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$root" || exit 0

have() { command -v "$1" >/dev/null 2>&1; }

# One `npx prettier` invocation costs ~1s of Node startup, so batch every
# prettier-eligible path into a single call instead of paying it per file.
prettier_batch=()

for file in "$@"; do
  [ -f "$file" ] || continue
  case "$file" in
    *.ts|*.tsx|*.js|*.jsx|*.mjs|*.cjs|*.json|*.jsonc|*.css|*.md|*.html|*.yml|*.yaml)
      prettier_batch+=("$file") ;;
    *.sh)
      # -i 2 two-space indent, -ci indent switch cases: matches the existing
      # hook scripts, so this reformats nothing that is already correct.
      have shfmt && shfmt -w -i 2 -ci "$file" >/dev/null 2>&1 || true ;;
    *.py)
      have black && black -q "$file" >/dev/null 2>&1 || true ;;
    *) ;;  # .sql, .toml, images, binaries — left alone on purpose.
  esac
done

# prettier applies .prettierignore even to explicitly-named paths (verified),
# so callers may pass anything and the ignore file stays the single authority
# on what is exempt — including src/styles/design-system/colors.css.
if [ ${#prettier_batch[@]} -gt 0 ]; then
  npx --no-install prettier --write --ignore-unknown "${prettier_batch[@]}" \
    >/dev/null 2>&1 || true
fi

exit 0
