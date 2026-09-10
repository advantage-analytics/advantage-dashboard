#!/usr/bin/env bash
# Tests for the git hooks in this directory. Run: ./.githooks/hooks.test.sh
#
# Same convention as .claude/hooks/*.test.sh. Every case runs under the shell
# the hooks actually get on a stock Mac (bash 3.2), so a bash-4-ism cannot
# pass here and fail on a teammate's machine.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ROOT=$(pwd)
pass=0; fail=0
ok()   { pass=$((pass+1)); printf '  \033[32mok\033[0m   %s\n' "$1"; }
bad()  { fail=$((fail+1)); printf '  \033[31mFAIL\033[0m %s\n' "$1"; }
check(){ [ "$2" = "$3" ] && ok "$1" || bad "$1 (expected exit $3, got $2)"; }

# ---------------------------------------------------------------- commit-msg
printf '\ncommit-msg\n'
msg() { f=$(mktemp); printf '%s\n' "$1" > "$f"; .githooks/commit-msg "$f" >/dev/null 2>&1; e=$?; rm -f "$f"; return $e; }

msg "fix(date-field): line the Date rule up with the cells";      check "conventional prefix accepted"        $? 0
msg "T34: Write the design system's date-field rule";             check "T<n> task prefix accepted"           $? 0
msg "pipeline(date-field): land — remove queue pair";             check "pipeline type accepted"              $? 0
msg "Merge pull request #178 from advantage-analytics/foo";       check "merge subject skipped"               $? 0
msg "Revert \"fix(x): y\"";                                       check "revert subject skipped"              $? 0
msg "fixup! fix(x): y";                                           check "fixup subject skipped"               $? 0
msg "Redesign coach Team Home onto the personal Home's layout";   check "no prefix warns but passes"          $? 0
msg "fix(x): trailing period.";                                   check "trailing period rejected"            $? 1
msg "$(printf 'fix(x): %0.sa' $(seq 1 130))";                     check "subject past hard limit rejected"    $? 1
msg "";                                                           check "empty subject rejected"              $? 1

# ---------------------------------------------------------------- pre-commit
# A throwaway repo so nothing here can touch the real index.
printf '\npre-commit\n'
TMP=$(mktemp -d)
setup() {
  rm -rf "$TMP"; mkdir -p "$TMP"; cd "$TMP" || exit 1
  git init -q .; git config user.email t@t; git config user.name t
  mkdir -p scripts
  cp "$ROOT/scripts/format-file.sh" scripts/ 2>/dev/null || true
  cp "$ROOT/.githooks/pre-commit" ./pre-commit
  chmod +x ./pre-commit scripts/format-file.sh 2>/dev/null || true
}
run_pc() { ./pre-commit >/dev/null 2>&1; }

setup; printf 'SECRET=abc\n' > .env.local; git add -f .env.local
run_pc; check ".env.local staged is rejected" $? 1

setup; printf 'X=1\n' > .env.example; git add .env.example
run_pc; check ".env.example staged is allowed" $? 0

# Probe values are ASSEMBLED AT RUNTIME and never written here as literals.
# A committed string shaped like a real credential trips GitHub's push
# protection and blocks the push outright — a fixture that proves the scanner
# works must not itself be scannable. The strings below are still contiguous by
# the time pre-commit sees them, which is what the assertions exercise.
SK_PREFIX="sk_$(printf 'live')_"
setup; printf 'const k = "%s51QQQQQQQQQQQQQQQQQQQQQQQQ";\n' "$SK_PREFIX" > a.ts; git add a.ts
run_pc; check "live Stripe key in content is rejected" $? 1

setup; printf 'const k = process.env.STRIPE_KEY;\n' > a.ts; git add a.ts
run_pc; check "env-var reference is allowed" $? 0

# `service_role` is a Postgres role name, not a secret — migrations say
# `grant ... to service_role` routinely and must not be blocked.
setup; printf 'grant execute on function public.f() to service_role;\n' > m.sql; git add m.sql
run_pc; check "service_role in a migration is allowed" $? 0

B64="eyJ"   # split for the same reason as SK_PREFIX above
setup; printf 'const k="%shbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.%syb2xlIjoic2VydmljZV9yb2xlIn0";\n' \
  "$B64" "$B64" > a.ts; git add a.ts
run_pc; check "an actual service-role JWT is rejected" $? 1

setup; printf '"integrity": "sha512-eyJIkqGIDMZPwPx24pUMfwSxxI8phr"\n' > p.json; git add p.json
run_pc; check "base64 integrity hash is not a false positive" $? 0

cd "$ROOT" || exit 1; rm -rf "$TMP"

printf '\n%d passed, %d failed\n' "$pass" "$fail"
[ "$fail" -eq 0 ]
