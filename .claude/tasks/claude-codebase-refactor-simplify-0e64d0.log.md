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

## T3 · Add the missing page-title step and normalize 14 sites — done

**gate:** mechanical — lint 0 errors (39 pre-existing warnings), tsc clean,
652/652 tests pass, drift checker green on all six checks. Completion review —
`VERDICT: pass`; the reviewer opened each disputed site rather than accepting
the implementer's word, and found reasons the implementer had not stated
(`program-hours-summary` colours its figure through an inline
`style={{ color: figureColor }}`, and `plan/page.tsx:185` switches between
muted and ink-900 by state — a fixed-colour class would have broken both).
Guardrails — `pipeline-guardrails-reviewer` ran and returned an explicit "No
findings"; it was required because the diff reaches `src/app/dashboard/`,
`src/components/dashboard/` and the upload wizard, and it confirmed
`UploadMatchFlow.tsx` and `edit-match-dialog.tsx` changed a className and
nothing else, leaving §4's three silently-corrupting inputs untouched.
`rls-boundary-reviewer` skipped legitimately — no `src/lib/supabase/`,
`src/lib/data/`, `src/app/api/` or `supabase/migrations/` in the diff, per
`git diff HEAD --stat` and an empty `git ls-files --others --exclude-standard`.

**changed:** THE TASK'S PREMISE WAS WRONG, and the correction is the most
useful thing here. `.text-title-lg` already existed in `typography.css` at
exactly 24px / weight 300 / line-height 1.2 / letter-spacing -0.4px /
`color: var(--ink-900)`, already load-bearing across 10 files at HEAD —
verified with `git show HEAD:`. The scale did not jump 16 → 28; SKILL.md's
Type Scale table was simply missing a row for a step the CSS had all along.
So nothing was invented: the row was added, the class got a comment recording
why -0.4px, and the sites moved onto what was already there.

Eight sites adopted the class. Six deliberately did not, and the reviewer
confirmed each: four are figures, not titles (a facts-strip value, a price, an
hours-remaining figure, and an `aria-hidden` avatar-initials badge at weight
400), and two — `edit-match-dialog.tsx` and `UploadMatchFlow.tsx` — render
`#1D1D1F`, which is not `--ink-900` (`#0D0D0D`); because typography.css's
semantic classes carry `color:` and are unlayered, adopting the class there
would have silently repainted them. Those two took the step's tracking and
leading as literals instead. `off-scale text-[Npx]` ratcheted 25 → 17, not the
11 the task predicted, precisely because those six correctly stayed off-scale.

**follow-ups:** 1. `edit-match-dialog.tsx` and `UploadMatchFlow.tsx` use a
hardcoded `#1D1D1F` where `--ink-900` is meant — already counted by check 1
(seed 70) and owned by T6; resolving it there would afterwards let both adopt
`.text-title-lg` cleanly and take check 2 down further. 2. SKILL.md's table
names steps `heading-xl/lg/md` while the CSS names classes
`.text-display/.text-title-lg/.text-title`; the two documents have never
matched 1:1, which is what let a real step go undocumented. Worth unifying. 3. The four figures left off-scale are a distinct role the scale does not
name — a "figure/metric" step may be the honest fix rather than leaving them
permanently flagged.

## T4 · Snap the remaining 11 off-scale font sizes — done

**gate:** mechanical — lint 0 errors (39 pre-existing warnings), tsc clean,
652/652 tests, checker green on all six. Completion review — `VERDICT: pass`;
it opened the neighbouring type at each site rather than accepting the
rationale, and confirmed the colour of all eleven is unchanged.
Guardrails — `pipeline-guardrails-reviewer` ran and returned an explicit "No
findings", required because the diff reaches `src/app/dashboard/` and
`src/components/dashboard/` including both match-action dialogs. It verified
the Tournament input's `value`/`onChange`/`UnderlineField` contract is
byte-identical, that `handleDelete` and its cleanup ordering are untouched,
and that set iteration order and winner-colour logic in `match-score-section`
did not move. `rls-boundary-reviewer` skipped legitimately — no
`src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or `supabase/migrations/`
in the diff, per `git diff HEAD --stat` and an empty
`git ls-files --others --exclude-standard`.

**changed:** Eleven sites snapped: five `15px` → 16px (the `opponents/**`
section titles, which sit above 11px captions), two `15px` → 14px
(`brand-panel.tsx`, whose own comment says the text was deliberately demoted
to read as body, and `event-page.tsx`'s score span), three `18px` → 16px, and
`profile-form.tsx:160`'s `19px` → 16px. Every hunk moves only the pixel value
inside `text-[Npx]`; no colour, weight, tracking or layout token was touched.

TWO MORE PREMISE ERRORS in the task, both caught by the implementer and
confirmed by the runner. First, the task called all three `18px` sites "dialog
titles"; only `delete-match-dialog.tsx:72` is one — a real `AlertDialogTitle`,
now `16px/font-medium` exactly per SKILL.md §"Dialog (v3)"'s `title: 16px/500`.
`edit-match-dialog.tsx:461` is the Tournament `<input>` (the dialog's actual
title is line 403, which T3 handled), and `match-score-section.tsx` contains
zero `Dialog` references. Both were treated on their own merits instead.
Second, criterion 4 ("check 2 reads 0 and its assertion is flipped") was
unsatisfiable by construction: the six sites T3 correctly left are still
off-scale, so eleven fixes take the count 17 → 6, not to 0. The seed ratcheted
to 6 and the assertion was deliberately NOT flipped — forcing it would have
meant undoing T3's judgment to make a number go green.

**follow-ups:** 1. The checker's `TYPE_SCALE` set omits 24 even though
`title-lg` IS a documented 24px step — so a component that legitimately needs
24px as a literal (because it needs a colour other than the class's
`--ink-900`) has no on-scale literal to snap to, and stays flagged forever.
Either add 24 to the set or document that 24px must always go through
`.text-title-lg`. This is the direct cause of two of the six remaining
findings. 2. `match-score-section.tsx` and `match-card-gallery.tsx` render
near-duplicate set-score rows at different sizes with independent colour
logic; worth consolidating if a future task touches match-list styling.
