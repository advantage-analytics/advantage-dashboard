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

## T5 · Centralize inlined chart hex onto data-viz exports — done

**gate:** mechanical — lint 0 errors (39 pre-existing warnings), tsc clean,
652/652 tests, checker green on all six. Completion review — `VERDICT: pass`;
it verified `VIZ_BLUE` is byte-identical and independently confirmed the
`#EFF4FF` justification against `player-colors.ts` and `colors.css` rather
than taking it on trust, since the whole decision to leave line 286 rests on
it. Guardrails — `pipeline-guardrails-reviewer` ran and returned an explicit
"No findings"; required because `serve-placement-widget` is live on personal
Home AND the match-detail shots tab. It confirmed the one changed line is a
zone-highlight `<rect>`'s fill with `x`/`y`/`width`/`height`/`opacity`
untouched, so no coordinate maths, dot placement or zone ordering moved — the
failure mode that would misrepresent where a player's serves landed.
`rls-boundary-reviewer` skipped legitimately — no `src/lib/supabase/`,
`src/lib/data/`, `src/app/api/` or `supabase/migrations/` in the diff.

**changed:** Seven `#3B82F6` on chart and SVG colour props now import
`VIZ_BLUE`, enforcing the rule `data-viz.ts`'s own header states: "Do not
inline a raw hex in a component." Six were in `kpi-detail-chart` (gradient
stops, tooltip cursor, Area stroke, Dot fill, activeDot fill); one was
`serve-placement-widget`'s active-zone marker, which already had the import
from T8. `VIZ_BLUE` is exactly `"#3B82F6"`, so all seven are byte-identical
and nothing renders differently. No new export was needed or invented.

The eighth was left deliberately, and it is a real finding rather than a
shortfall. `serve-placement-widget.tsx:286` fills the entire court `<rect>`
with `#EFF4FF` — which is `PLAYER_1_SOFT` / `--player-1-soft` /
`--blue-pressed`, a PLAYER WASH, not a court colour. `colors.css:153` defines
`--viz-court-fill: #D6E4F9`, which SKILL.md §"Court Visualization Colors"
names as the court fill, and it has no export in `data-viz.ts` at all. So the
court is painted with the wrong token's value, and correcting it is a visible
recolour on two live surfaces — a value decision, not the centralization this
task is about, and flatly contradicting criterion 3's "byte-identical".
Criterion 4 was therefore unreachable: seven fixes take the count 8 → 1. Seed
ratcheted to 1; assertion deliberately not flipped.

**follow-ups:** 1. The court-fill decision above — either promote
`--viz-court-fill` to a `VIZ_COURT_FILL` export and recolour the court to
`#D6E4F9`, or re-document `#EFF4FF` as the intended court styling and correct
SKILL.md. Either way a person decides, not a sweep. 2. `serve-placement-widget`
carries many more `#3B82F6` / `#EFF4FF` as Tailwind arbitrary classes
(`bg-[#3B82F6]`, `bg-[#EFF4FF]`, ~8 sites). `COLOR_PROP_RE` only matches JSX
colour props, so the checker does not see them — and they are palette-legal
under check 1, so they are arguably the DS's sanctioned build form rather than
drift. Worth a decision on whether class-form centralization is wanted at all
before anyone treats it as a task.

## T6 · Resolve the off-palette hex — blocked

**gate:** mechanical passed — lint 0 errors, tsc clean, 652/652 tests, checker
green at `off-palette hex: 2`. Completion review returned **`VERDICT:
needs-work`**, so per the fail-closed rule the run stopped there and the
guardrail stage never ran. That matters: the diff reached BOTH
`src/components/dashboard/` (so `pipeline-guardrails-reviewer` was due) AND
`src/lib/data/performance-server.ts` (so `rls-boundary-reviewer` was due).
Neither has seen this work yet, and both must run before it lands.

**why blocked:** two criteria came back unmet. One was pre-authorised and is
not the blocker — "check 1 reads 0" is unreachable, since two findings survive
honestly (a `#F7F7F7` quoted inside `adv-field.ts`'s own doc comment
explaining why that value is deliberately NOT tokenised, and `#3F8A39`, a
success-ink role SKILL.md names no token for). The real defect is the fourth
criterion: the task said fix `performance-server.ts`'s colour VALUES and
_note_ its layering violation without refactoring. The implementer did neither
half — no note was added anywhere in the diff, and the fix itself introduced
`import { VIZ_BLUE, VIZ_SLATE } from "@/lib/design/data-viz"` into a server
data loader, a new cross-layer dependency from `src/lib/data/` into a design
module. That deepens the violation it was told to leave alone.

**recoverable work:** stash `4bd24db0f402392b0b5570c7894576cdf1b75bfc`
(31 files, +96/-66). It is genuinely good work — 70 findings resolved down to
2, five tokens added to `colors.css` of which three (`--warning-bg`,
`--warning-border`, `--warning-text`) were verified as TRANSCRIBED from
SKILL.md:239-241 rather than invented. Restore with
`git stash apply 4bd24db0f402392b0b5570c7894576cdf1b75bfc` — apply, not pop,
because `refs/stash` is shared across worktrees.

**to unblock, smallest change first:** restore the stash, then either revert
`performance-server.ts` to literal hex values with a comment naming the
layering violation, or keep the import and get an explicit decision that a
data loader may depend on the design layer. Then re-run the gate from 5b and
let 5c's TWO reviewers run. One visual question also needs a human before this
ships: the upload wizard's warning banner border moves `#FEF3C7` → `#FDE68A`
and its icon `#D97706` → `#92400E`. That is defensible — SKILL.md names those
exact values and the originals were stock Tailwind amber — but it is the most
user-visible change in the queue so far, it sits in a guardrails seam, and no
one has looked at it rendered.

## T10 · Decide the data-viz green ramp — done

**gate:** mechanical — lint 0 errors, tsc clean, 652/652 tests, checker green
on all six. Completion review — `VERDICT: pass`; it verified the load-bearing
quote at `data-viz.ts:19` verbatim rather than trusting it, and counted the
resulting colour collisions in the diff itself to confirm the code says what
the report claimed. Guardrails — `pipeline-guardrails-reviewer` ran and
returned an explicit "No findings"; required because the diff reaches
`src/components/dashboard/`, and because `data-viz.ts` is a SHARED design
module whose deleted exports could in principle have reached a live chart. It
grepped the whole tree for the three deleted names (zero remaining) and
confirmed `VIZ_GREEN`, `VIZ_OUTCOME`, `VIZ_SHOT` and `VIZ_SURFACE` are
byte-for-byte unchanged. `rls-boundary-reviewer` skipped legitimately —
`src/lib/design/` is not one of its surfaces, and no `src/lib/supabase/`,
`src/lib/data/`, `src/app/api/` or `supabase/migrations/` is in the diff.

**changed:** The green ramp is deleted. The task offered both paths — add to
colors.css, or delete — and the argument for deleting turned out stronger than
the one this queue anticipated. It is not merely that colors.css never
transcribed the ramp: `data-viz.ts:19` states its own rule that "Won / lost in
any chart MUST use VIZ_OUTCOME so a green dot on the court matches a green
'WON' badge elsewhere", and a four-step green SERIES contradicts that outright
— four greens in one line chart mean green no longer reads as won. The module
was internally inconsistent, and colors.css's silence was the symptom rather
than the cause. `VIZ_GREEN` itself is untouched and still feeds `VIZ_SHOT.won`
and `VIZ_SURFACE.Grass`; only the DEEP/MID/LIGHT steps went.

Two things the implementer got right that were not asked for. It also
repointed `VIZ_GREEN`'s own use inside `STAT_CONFIG`, on the grounds that one
green series among blue and slate ones preserves the exact collision the
deletion exists to remove — the reviewer judged that as satisfying criterion 2
rather than exceeding it. And its explanatory comment deliberately does NOT
quote the deleted hex values, because check 5 scans comments and naming them
would re-trip the very finding the deletion clears.

TWO CORRECTIONS to this queue's own claims, both verified. The runner asserted
`stat-progression-chart.tsx` has zero external importers; it does not —
`statistics/statistics-page-content.tsx:16` imports it. It is unreachable
because the ROUTE renders `ComingSoonPage`, not because nothing imports the
file. And this task said "five green assignments"; there were four.

Check 5 is now **0** — the first check in this queue to genuinely reach zero.

**follow-ups:** 1. Repointing made `STAT_CONFIG`'s separability worse, and the
file now records it: `VIZ_SLATE` ×5, `VIZ_SLATE_DEEP` ×4, `VIZ_SLATE_LIGHT` ×3
across 20 series. Within each category group members stay distinct, so a user
toggling inside one group still sees separable lines; enable across groups and
they collide. Tolerable only because the page is unreachable. Twenty series
cannot be separated by a closed five-role palette — the fix when Statistics
ships is a different encoding (one series at a time, or shape/dash), not more
hues. 2. `VIZ_SURFACE` is still RETIRED-but-compiling and hands three of five
surfaces a slate step; that decision is now the last unresolved palette hole in
`data-viz.ts`. 3. `STAT_CONFIG` uses raw `"#0D0D0D"` twice, exempt only
because the file is in the checker's UNREACHABLE list. 4. `STAT_CONFIG` is
still private to its file; AGENTS.md already says it must be extracted before a
second consumer, and this colour decision should land in the extracted module
rather than be re-derived.

## T11 · Reconcile the docs with what is actually reachable — blocked

**gate:** mechanical passed — lint 0 errors, tsc clean, 652/652 tests
(including the MAP.md staleness check), format clean. Completion review
returned **`VERDICT: needs-work`**, so the run stopped there. Guardrails were
not due in any case: the diff touched only `AGENTS.md`, no `src/` surface.

**why blocked:** the replacement prose asserts that "the 19 files in
`src/components/dashboard/statistics/` are fully wired to each other", and that
is false. Verified independently: the directory holds **20** files, not 19;
`statistics-page-content.tsx` imports **11** of them; and **8 component files
are orphaned even inside the unreachable subtree** — `duration-profile`,
`performance-ratings-card`, `pressure-index`, `rally-breakdown`,
`stat-trajectory-chart`, `stats-grid`, `surface-chart`, `win-rate-chart` —
plus `statistics-page-content.tsx` itself, which nothing imports because it is
the root of the dead tree. There is dead code inside the dead code.

That is precisely the class of overclaim this task exists to eliminate, moved
down one level rather than removed, so it fails on the criterion the task is
built around: a documentation task that swaps one false statement for another
is worse than no change.

A second, smaller imprecision: the new text says `visuals/configs/` and
`useVisualFilters` are "still live via `serve-placement-widget.tsx`". True of
the hook, which the widget imports directly; the configs are reached only
transitively, through `use-visual-filters.ts` calling `getFilterConfig`. Worth
saying accurately rather than glossing.

**the queue's own error, which this uncovered:** the "19 files" figure did not
come from nowhere — it is copied from the comment the runner wrote on
`UNREACHABLE` in `scripts/check-design-drift.mjs:74`, which says "19 files,
behind /dashboard/statistics". That comment is committed and also wrong. It
needs correcting to 20, and ideally to say how few of them are actually wired.
The subagent was right to work from the code; it simply did not go far enough.

**recoverable work:** stash `dc44a024948cd06cc39fd745a264a5aaa26839d5`
(1 file, AGENTS.md). The Court-visualization half is correct and verified —
1,239 lines, zero importers, superseded by `shots-tab.tsx`, only a prose
mention at `splitstep/derivation/court.ts:90` — and the register matches the
surrounding document, which the reviewer confirmed. Restore with
`git stash apply dc44a024948cd06cc39fd745a264a5aaa26839d5` — apply, not pop,
because `refs/stash` is shared across worktrees.

**to unblock:** restore, then correct the Statistics paragraph to the verified
shape — 20 files, 11 reachable from `statistics-page-content.tsx`, 8 orphaned
even within the subtree — and tighten the configs sentence to say the hook is
imported directly and the configs come with it. Fix
`check-design-drift.mjs:74`'s count in the same pass so the doc and the
checker agree. Then re-run the gate from 5b.

## T11 · Reconcile the docs with what is actually reachable — done (unblocked)

**gate:** re-run from 5b after correcting the blocking defect. Mechanical —
lint 0 errors, tsc clean, 652/652 tests including the MAP.md staleness check,
format clean, drift checker green on all six. Completion review —
`VERDICT: pass`; it re-derived every number from the code rather than from the
brief, and separately confirmed the `useVisualFilters` → `getFilterConfig` →
`visuals/configs/` chain. Guardrails not due: the diff touches `AGENTS.md` and
one comment line in the checker, no `src/` surface.

**changed:** The claim that blocked this — "the 19 files are fully wired to
each other" — is replaced with what the code actually shows: 20 files,
`statistics-page-content.tsx` imports 11, and the other eight are imported by
nothing at all, not even by each other. The paragraph now says what that costs
a reader: reviving the route lights up 11 components and leaves eight
unreferenced, and whether those were abandoned directions or unfinished ones
is not recoverable from the imports. That is the fact worth documenting; the
original phrasing would have sent someone into the subtree expecting it to
work as a unit.

Also corrected the source of the wrong figure. `19 files` came from the
comment this queue itself wrote on `UNREACHABLE` in
`scripts/check-design-drift.mjs:74`, which was committed and wrong; it now
says 20. The doc and the checker agree.

The court-visualization half needed one tightening rather than a rewrite: it
had said `visuals/configs/` and `useVisualFilters` are "both still live via
serve-placement-widget", which overstates. The widget imports the hook
directly; the configs are reached through it via `getFilterConfig`. The prose
now states that chain, so "live one step removed" is visible rather than
glossed.

**follow-ups:** 1. `docs/ux-overhaul-brief.md` still says "~730 lines" and
frames both files as things to "resurrect". It is a point-in-time planning doc
and was not in this task's `files:`, but it now contradicts AGENTS.md. Either
correct it or mark it explicitly point-in-time, per docs/README.md's own
convention. 2. `src/app/dashboard/statistics/page.tsx`'s own comment says
"twenty-one components"; the directory holds 20 files, 19 of them `.tsx`.
Same class of drift, one more place.

## T6 · Resolve the off-palette hex — done (unblocked)

**gate:** re-run in full after fixing the blocking defect. Mechanical — lint 0
errors, tsc clean, 652/652 tests, format clean. Completion review —
`VERDICT: pass`; it confirmed no design-layer import survives anywhere under
`src/lib/data/` and spot-checked six values against the role each site uses
them for. Guardrails — BOTH ran, which the blocked run never reached.
`rls-boundary-reviewer`: explicit "No findings" — no query, filter, scoping
predicate, service-role usage or RPC moved, and `git diff | grep '^\+import'`
returned nothing across all 31 files. `pipeline-guardrails-reviewer`: "No
guardrail violations", with one item raised for human sign-off (below) and a
useful aside — the sweep is "colour-only, NEAREST-token rendering" rather than
byte-exact, since `#BFBFBF` and `#B3B3B3` both collapse onto `--ink-400` and
`#E7E7E7` onto `--border-medium`. That is what near-twin merging means and the
task asked for it, but the distinction is worth having on record.

**the blocking defect, fixed:** the rejected run had added
`import { VIZ_BLUE, VIZ_SLATE } from "@/lib/design/data-viz"` to
`performance-server.ts` — coupling a server data loader to the design layer,
after the task said to note the layering violation and NOT refactor. The
import is gone. The six `barColor` values are literals `#64748B` / `#3B82F6`,
which are the same values those exports carry AND are declared in colors.css,
so they pass check 1 without any import at all. A doc comment above
`DEFAULT_PERFORMANCE` now records that `barColor` is presentation, that the
import was tried and reverted and why, and that the real fix is for the loader
to emit a role so `OverallPerformanceData.barColor` disappears — cheap now,
while the only consumer sits behind ComingSoonPage.

**human decision, granted:** the upload wizard's warning banner was the one
non-value-preserving hunk — border `#FEF3C7` → `#FDE68A`, icon `#D97706` →
`#92400E`. Rendered side by side in a throwaway preview route before deciding
(deleted again immediately; a stray route makes MAP.md stale). The change is
smaller than the hex suggests: background and body text do not move at all,
the border gains a little definition, and the icon goes from orange to brown.
The icon change is a repair — the banner has been shipping TWO different
ambers on its icon and its text, and `--warning-text` unifies them. Accepted
on that basis: `SettingsAlert`, the app's house notice used in six places,
sets icon colour and text colour to the same value in every one of its three
registers, so this converges on the established pattern rather than inventing
one.

**follow-ups:** 1. The better long-term answer for this banner is to route it
through `SettingsAlert` with a new `warning` register, which needs an amber
tint family (`--warning-tint-08` / `-20`) the palette does not have —
`SettingsAlert` ships success/error/info and no warning at all. That is design
work, not a sweep, and it needs a decision on whether "warning" is a register
this product has. 2. Relatedly, SKILL.md's v3 `Notice` primitive says notices
have NO borders and a surface-subtle ground, which contradicts the bordered
amber banner the colour table implies. The two halves of the spec disagree;
worth reconciling. Note the warning triple lives in the same "Match Detail
Colors" table that carried the retired violet player-2 values until T8 — that
table has form for going stale. 3. `--surface-dark-hover`,
`--surface-dark-pressed` and the `--warning-*` triple have no `.dark` values;
whoever ships dark mode owes them three measured entries. 4.
`performance-server.ts` should emit a role rather than a hue, retiring
`OverallPerformanceData.barColor` in `src/lib/data/types.ts`.
