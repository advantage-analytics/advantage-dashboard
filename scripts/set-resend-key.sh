#!/usr/bin/env bash
#
# Set RESEND_API_KEY everywhere it is needed, without the value being echoed,
# logged, or left in shell history.
#
#   bash scripts/set-resend-key.sh
#
# Get the key from https://resend.com/api-keys — "Create API Key", permission
# "Sending access", domain advantage-analytics.com. Resend shows the value once.
#
# What this does, in order:
#   1. reads the key with no echo
#   2. VERIFIES it against Resend before storing it anywhere
#   3. writes it to .env.local here and in the main checkout
#   4. pushes it to the Vercel environments you pick
#
# It verifies first on purpose. A typo'd key stored in four places fails later
# as "invites silently do not send", which is the exact failure this whole
# feature exists to end.

set -euo pipefail

WORKTREE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MAIN_CHECKOUT="/Users/cjgimena/Desktop/vscode/advantage-dashboard"

printf 'Paste the Resend API key (input hidden), then press return:\n> '
read -rs RESEND_KEY
printf '\n\n'

if [ -z "${RESEND_KEY}" ]; then
  echo "Nothing entered. Nothing changed." >&2
  exit 1
fi

case "${RESEND_KEY}" in
  re_*) ;;
  *)
    echo "That does not look like a Resend key — they start with 're_'." >&2
    echo "Nothing changed." >&2
    exit 1
    ;;
esac

# --- 1. Verify before storing -------------------------------------------------
echo "Checking the key against Resend…"
HTTP_STATUS="$(curl -s -o /tmp/resend-check.json -w '%{http_code}' \
  -H "Authorization: Bearer ${RESEND_KEY}" \
  https://api.resend.com/domains)"

if [ "${HTTP_STATUS}" != "200" ]; then
  echo "Resend refused that key (HTTP ${HTTP_STATUS}). Nothing has been stored." >&2
  rm -f /tmp/resend-check.json
  exit 1
fi

# Confirms the key can actually send from the domain the templates are built
# around, not merely that it authenticates.
if ! grep -q 'advantage-analytics.com' /tmp/resend-check.json; then
  echo "That key authenticates, but cannot see advantage-analytics.com." >&2
  echo "Check its domain restriction in Resend. Nothing has been stored." >&2
  rm -f /tmp/resend-check.json
  exit 1
fi
rm -f /tmp/resend-check.json
echo "  key is valid and can see advantage-analytics.com"
echo

# --- 2. Local .env.local files ------------------------------------------------
# Both checkouts: the worktree is where you are working, the main one is where
# `npm run dev` runs from most days. A key in only one of them is a flow that
# works in one terminal and silently prints to the console in the other.
write_env() {
  local dir="$1"
  local file="${dir}/.env.local"

  [ -d "${dir}" ] || return 0

  if [ ! -f "${file}" ]; then
    echo "  ${file} does not exist — skipped"
    return 0
  fi

  # Rewrite through a temp file rather than sed -i, so a failure part way
  # through cannot leave a half-written .env.local behind.
  local tmp
  tmp="$(mktemp)"
  grep -v '^RESEND_API_KEY=' "${file}" > "${tmp}" || true
  printf 'RESEND_API_KEY=%s\n' "${RESEND_KEY}" >> "${tmp}"
  cat "${tmp}" > "${file}"
  rm -f "${tmp}"
  chmod 600 "${file}"
  echo "  wrote ${file}"
}

echo "Writing local env files…"
write_env "${WORKTREE}"
write_env "${MAIN_CHECKOUT}"
echo

# --- 3. Vercel ----------------------------------------------------------------
echo "Push to Vercel? Preview runs this branch, so Preview is where the invite"
echo "flow will actually send mail. Production has no invite feature deployed"
echo "yet, so a key there is harmless and ready for when it does."
printf 'Environments — [p]review, p[r]oduction, [b]oth, [n]one: '
read -r WHICH
printf '\n'

push_vercel() {
  local env="$1"
  echo "  ${env}…"
  # `vercel env rm` first so a re-run replaces rather than erroring on a
  # duplicate. `|| true` because the first ever run has nothing to remove.
  (cd "${MAIN_CHECKOUT}" && vercel env rm RESEND_API_KEY "${env}" --yes >/dev/null 2>&1) || true
  printf '%s' "${RESEND_KEY}" | (cd "${MAIN_CHECKOUT}" && vercel env add RESEND_API_KEY "${env}" >/dev/null)
  echo "    set for ${env}"
}

case "${WHICH}" in
  p|P) push_vercel preview ;;
  r|R) push_vercel production ;;
  b|B) push_vercel preview; push_vercel production ;;
  *)   echo "  skipped Vercel." ;;
esac

unset RESEND_KEY

echo
echo "Done. Nothing above printed the key."
echo
echo "Next:"
echo "  - A Vercel change needs a redeploy to take effect."
echo "  - Locally: restart 'npm run dev', then send yourself an invite from"
echo "    Settings › Team. It should arrive instead of printing to the console."
