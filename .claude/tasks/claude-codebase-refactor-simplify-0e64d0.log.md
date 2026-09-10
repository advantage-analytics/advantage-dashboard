# Run log — claude/codebase-refactor-simplify-0e64d0

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T12 · Teach the drift checker to read stylesheets — done

**gate:** mechanical — lint 0 errors (39 pre-existing warnings), tsc clean,
652/652 Playwright tests pass. Completion review — `VERDICT: pass`; the
reviewer independently reproduced the exemption test rather than taking the
implementer's word. Guardrails — both skipped legitimately: the diff touches
only `scripts/`, so it reaches neither `pipeline-guardrails-reviewer`'s
surfaces (`src/app/dashboard/`, `src/components/dashboard/`, upload wizard)
nor `rls-boundary-reviewer`'s (`src/lib/supabase/`, `src/lib/data/`,
`src/app/api/`, `supabase/migrations/`). Confirmed from `git diff HEAD --stat`
AND `git ls-files --others --exclude-standard`, which was empty.

**changed:** `walk()` now covers `.css`, so a utility reached via `@apply` is
counted exactly like one written in a component — the T2 failure where
`@apply border-border` sat in globals.css's own base layer while the checker
stayed green and the build went red. No `@apply` parsing was needed:
`stripNonUtilities` never cared what kind of file it was blanking. Added a
sixth check for Tailwind's default palette (`bg-blue-600`, `text-gray-500`),
which nothing caught before — check 1 sees only literal hex and check 4 only
shadcn's oklch names, and a default-palette class is neither. Its seed is 1,
an honest measurement: one real `hover:bg-gray-100` survives. A
`CSS_TOKEN_DEFINITIONS` list keeps checks 1 and 3 off the files that DECLARE
colours rather than consume them, since widening the walk would otherwise turn
every `--ink-900: #0D0D0D` into a finding against itself. That exemption
deliberately does NOT extend to checks 4 and 6 — verified twice, by the runner
and again by the reviewer: a planted `@apply bg-blue-600` in globals.css is
caught, a planted hex there is not. Every pre-existing seed held unchanged.

**follow-ups:** 1. `hover:bg-gray-100` in
`src/components/dashboard/matches/match-event-header.tsx:24` is the single real
default-palette finding — swapping it for a DS ink/surface token would take
check 6 to 0. 2. `DEFAULT_PALETTE_RE` omits the gradient-stop prefixes
(`from-`, `via-`, `to-`); none exist today, worth revisiting if gradient work
lands. 3. `stripNonUtilities` is verified by hand each time it changes; a
fixture-based unit test over CSS content (comments, `@apply`, arbitrary
values) would catch a regex change breaking CSS support silently.
