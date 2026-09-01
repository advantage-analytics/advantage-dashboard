# Run log — claude/new-session-c3f1ab

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Build the schedule fixtures module — done

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings (no new; see follow-up 5),
`npx tsc --noEmit` clean, `npm test` 227 passed. Completion review —
`VERDICT: pass`, all five criteria met, en dash U+2013 and middot U+00B7
verified at byte level, no scope creep. Guardrails — **both skipped, legitimately**:
the diff is one new file under `src/lib/schedule/`, checked against both
`git diff HEAD --name-only` and `git ls-files --others --exclude-standard`.
`pipeline-guardrails-reviewer` covers `src/app/dashboard/`,
`src/components/dashboard/` and the upload wizard — none touched.
`rls-boundary-reviewer` covers `src/lib/supabase/`, `src/lib/data/`,
`src/app/api/`, `supabase/migrations/` and any new table, view or query — none
touched, and the file's only import is `import type … from "./types"` (no
Supabase import, no `.from(`, no `"use server"`, no `await`).

**changed:** New `src/lib/schedule/fixtures.ts` (545 lines), the fixture
foundation T2–T8 render from and T10 asserts against. Exports `PROGRAM_NAME`,
`USER_NAME`, `SEASON_LABEL`, `SEASON_FACTS`, `SCHEDULE_ROWS`, `EVENT_DETAILS`,
`TOURNAMENT_DETAIL`, and two `StaticSchedule` sets — `POPULATED_SCHEDULE` and
`EMPTY_SCHEDULE`. Two sets rather than a flag, because `7e` is not `7d` with
rows removed: it has a different header line, "None yet" drawer sections and a
nine-line scaffold, so a flag would save no branch and could disagree with
`rows.length`. The guardrail seam is held: two `EventFormat` consts,
`DUAL_FORMAT { bestOf: 3, adScoring: false }` and `TOURNAMENT_FORMAT
{ bestOf: 3, adScoring: true }`, referenced by all three `ProgramEvent`s, so no
fixture can reach a `format` without an explicit boolean. `adScoring: false` on
duals is the drawn answer (`2b`'s "No-ad scoring"), not a default. The one new
interface, `StaticSchedule`, composes the existing types and redeclares none.
Artboards read for data only: `4c`, `3c`, `7d`, `7e` — `3b`, `2b`, `2c`, `2d`,
`2e` deliberately never entered context. Design-file provenance: DesignSync was
unreachable, so the bytes came from a same-day cached `get_file` capture
(2026-08-31 14:21, `truncated: false`), with the ten artboard ids confirmed
against a live `list_files`. Worth re-verifying against a live pull if any later
task finds a copy mismatch.

**follow-ups:**
1. `EVENT_DETAILS` is deliberately partial — only Ridgeline and Fairmont have
   panes, because only those two are drawn. T3/T4 must not assume a lookup hit;
   selecting State College of Ash or Harlow Valley has a designed answer already
   (`7d`'s prompt pane).
2. The tournament is not on `SCHEDULE_ROWS` — `TOURNAMENT_DETAIL` is exported
   separately because `3c` is the screen that creates it. Adding a row for
   `BUCKEYE_ID` is a one-line change that would make `7d`'s "dual or tournament"
   copy true and let "2 upcoming" derive. Flagged rather than decided.
3. `SEASON_FACTS` is one flat string; `7d` renders its four numerals in
   `.tabular` spans. T3 will need to split it or rebuild the spans — the parts
   were deliberately not exported, to avoid a second source of the same truth.
4. **Design copy flagged, not fixed (inherited rule 4) — input for T12.** Seven
   items, all reproduced as drawn: (a) the drawer's "6 events · 2 upcoming · 4
   completed" is not derivable from the four rows drawn; (b) "3–1 in duals"
   needs a lost dual no artboard names, and "31 of 36 lines" implies four
   completed duals; (c) `7d`'s "8 of 9 lines analyzed" for Fairmont disagrees
   with `4c`'s own pane (5 reports + 1 analyzing + 3 "Coming soon"); (d) `4c`'s
   header indicator bars contradict its rows — the greyed bars would give 4–1,
   the rows give the drawn 5–2; (e) cross-artboard name drift — `4c`'s "L.
   Moreau" (S4) and "K. Sato" (S6) vs `3c`'s "Jules Moreau" (S5) and "Lena
   Adeyemi" (S6), no Sato anywhere; (f) `7e`'s season label "2026–27" contradicts
   the drawn weekdays, which are correct for 2025 — 2025 dates were used so
   `formatEventDay()` reproduces the drawn strings, and "2026–27" exported
   verbatim; (g) `7d`'s pane says "Pick a dual or tournament on the left" but the
   drawer draws four duals and no tournament.
5. The queue preamble's stated lint baseline is wrong: this worktree reports
   **37** warnings, not 43. The brief and plan both carry the 43 figure. Worth
   correcting by hand — the queue file is the author's, so this run did not
   touch it beyond the `status:` line.

## T2 · Rebuild 3b — the event-type chooser — blocked

**gate:** mechanical **passed** — `npm run lint` 0 errors / 37 warnings (none
added), `npx tsc --noEmit` clean, `npm test` 227 passed. Completion review
**FAILED** — `VERDICT: needs-work`, three findings against `done when:` line 1
(the 1280px fidelity criterion). Guardrails — `pipeline-guardrails-reviewer`
**ran** (diff touches `src/app/dashboard/` and `src/components/dashboard/`) and
returned **clean**: the chooser holds only `choice: EventKind` and neither sets
nor drops `adScoring`, the route's guard block is byte-identical so no player
reaches a builder they could not before, no provider-naming or
misattribution hazard. `rls-boundary-reviewer` **skipped** — no
`src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or `supabase/migrations/`
file in the diff (checked tracked and untracked) and no new query, table or
view; the new component has no Supabase import, no `.from(`, no `fetch` and no
`"use server"`.

**why it failed:** three fidelity divergences from artboard `3b`, all inside
the task's own first criterion.

1. **The "Add it in Matches" link points at a live external route.** The
   artboard's own anchor is the placeholder `href="#3b"`; the implementer wired
   it to `/dashboard/matches/new`. The brief's non-goal is categorical — *"Links
   may be inert or point within the rebuilt set; wiring them to real
   destinations is later work"* — and `/dashboard/matches/new` is outside this
   run's four rebuilt routes. `design.md`'s carve-out for `4c`'s report links is
   a specific, reasoned exception for a different artboard and was never
   extended to this one.
2. **The selected card's inner divider is the wrong colour.** The artboard
   specifies `rgba(59,130,246,0.15)`; the implementer used
   `--blue-tint-12` (0.12), reasoning that no token carries 0.15. **That
   reasoning is factually wrong** — `--blue-glow: rgba(59,130,246,0.15)` is
   declared at `src/styles/design-system/colors.css:72`, the exact value,
   currently unused. Verified independently by the runner. Reusing an existing
   token is not the token work inherited rule 7 forbids, so an exact-fidelity
   option was available and was not taken.
3. **The bottom inset is unreconciled and unflagged.** The artboard's content
   pane is `padding: 36px 48px 0`. The `pt-[10px]` wrapper correctly makes the
   top edge 36px against `EventShell`'s `pt-[26px]`, but `EventShell`'s `pb-8`
   (32px) stands against the artboard's 0. Declining to edit the shared
   `EventShell` — which three other in-flight screens sit in — is a defensible
   scope call; leaving the gap uncommented in the code is what makes it a
   finding rather than a documented trade-off.

**stash:** `29062bef5efd3795ad1e071e5ebad613936d9b95` (`git stash apply
<sha>`, not `stash@{n}` — the stash stack is shared across this repo's
worktrees and the index shifts). The stash holds the full T2 implementation:
the new `static-event-chooser.tsx` and the route re-point. It is close to
passing — the three findings are small, local edits, and the copy check,
the state behaviour, the route-edit shape and every measured spacing/type/
radius value were all verified correct.

**changed:** nothing landed in the tree. This commit carries only the
`status:` line and this log entry.

**follow-ups:**
1. **The route-edit shape T2 established is sound and worth keeping** even
   though the task is blocked — T3, T5 and T8 copy it: change one import line,
   change the `return`, leave the guard block untouched, append a paragraph to
   the route's existing doc comment naming the dormant component, and do not
   touch the dormant file. Net diff per route: two code lines plus a comment.
   Verified byte-identical guards on this attempt.
2. **A signed-in browser session does not exist in this worktree**, so no task
   in this run can load a guarded route directly. T2 worked around it with a
   temporary unguarded harness route sized to the artboard's content region
   (1048×796 = 1280−232 sidebar, 840−44 topbar), measured computed styles
   there, then deleted the harness. That technique works and later tasks will
   need it — but a harness left behind would ship an unguarded route, so it
   must be deleted before the gate every time.
3. **Design copy flagged, not fixed — input for T12.** "Add it in Matches"
   names a destination a team workspace's sidebar does not expose; the coach
   cannot navigate there from the rail. Reproduced verbatim per inherited
   rule 4. Note the dormant `new-event-chooser.tsx` had silently reworded this
   to "Add a single match" pointing at the team single-match route — that
   rewording is a divergence from the design, and the design wins here.
4. **`Creates 9 lines` sets the 9 in `mono tabular`** per the artboard's own
   class list, while the dormant component deliberately dropped `mono` on the
   argument that Roboto Mono is reserved for timestamps, quota readouts and job
   ids — never a count inside a sentence. The design was followed per rule 3.
   Worth settling once in the design system rather than per component; it has
   now been decided in two directions from the same artboard.

## T3 · Rebuild 7e and 7d — the schedule shell and drawer — done

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings (none added),
`npx tsc --noEmit` clean, `npm test` 227 passed. Completion review —
`VERDICT: pass`, five of five criteria, all six requested judgments resolved in
the implementation's favour on independently verified evidence (see below).
Guardrails — `pipeline-guardrails-reviewer` **ran** (diff touches
`src/app/dashboard/` and `src/components/dashboard/`) and returned **no
findings**: both permission answers still derive from the live workspace
(`isProgramStaff`, `canUploadForProgram`) and never from fixtures, the "New
event" CTA is absent rather than disabled when `canCreate` is false, the create
route independently re-checks `isProgramStaff` server-side, and the screen never
renders `adScoring`. `rls-boundary-reviewer` **skipped** — no file under
`src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or `supabase/migrations/`
is modified (the diff *removes* imports of `src/lib/data/schedule-server`, which
cannot open an RLS hole) and no new query, table or view; `grep` over
`static/` finds no `supabase`, no `.from(`, no `"use server"`.

**Verification caveat, recorded honestly:** the completion reviewer had no
browser MCP and could not run a pixel diff; it verified fidelity at the
code/token level. The 1280px visual check was the implementer's, through a
temporary unguarded harness sized to each artboard's content region
(1048×576 = 1280−232 sidebar, 620−44 topbar), measuring computed styles against
the artboard's declared values. Harness deleted and confirmed absent from tree,
`git status` and `git log --all`.

**changed:** Two new components — `static/static-schedule.tsx` (397 lines: the
drawer+pane frame, selection state, the `7d` prompt pane, the `7e` day-zero pane
and its nine-line dashed scaffold) and `static/event-drawer.tsx` (222 lines: the
340px drawer, Upcoming/Completed groups, "None yet" readings, drawer-footed
CTA). The route drops `getProgramSchedule`, `scheduleRowsFrom`,
`eventDetailFrom`, the `details` map, the `EventDetail` type import, `teamLabel`,
the `eyebrow` computation and the padded `max-w-screen-2xl` wrapper; the guard
block is byte-identical and a paragraph was appended to the existing doc comment
naming the dormant `ScheduleList`. `schedule-list.tsx` untouched (zero diff).

**Four judgment calls, all upheld on verified evidence:**
1. **`--blue-text` rather than `--blue` on `7e`'s three links.** The artboard
   sets only size and weight and inherits `a { color: var(--blue) }` from a
   DS v3 `tokens/base.css` this repo's `index.css` deliberately does not import —
   so this fills an inheritance gap the design never resolved for this app rather
   than overriding a stated colour. `--blue` is 3.68:1 on white and fails WCAG
   1.4.3 AA below 24px; `--blue-text` is 5.17:1 and exists for this. The reviewer
   confirmed those numbers are pre-existing text in `colors.css`, not invented.
2. **The topbar count line is left unrendered** — `7d` draws "6 events · 2
   upcoming" and `7e` "0 events · nothing scheduled for 2026–27" in the 44px bar.
   Rendering it in the body would draw the app's chrome twice, which the task
   forbids by name; the shared `Header`'s status slot exists
   (`usePublishHeaderStatus`) but is styled differently and no artboard draws the
   app's header carrying it. Omitted and documented rather than approximated.
3. **`canAddOwnMatch` KEPT** — the check the task asked for by name. **`7e`
   draws the control** as the third item of "New dual · New tournament · One-off
   match in Matches"; **`7d` draws none**. The prop gates that item, which is
   rendered as an inert `<span>`, not a link: its real destination
   `/dashboard/matches/new` is outside the rebuilt set, and wiring exactly that
   link is what blocked T2.
4. **Upcoming/Completed splits on `playedCount`, not the clock.** Fixture dates
   are pinned to September 2025 so `formatEventDay()` reproduces the drawn
   weekday strings; against a real clock every row files under Completed and the
   artboard becomes unreproducible under any date rule. `playedCount` is the only
   signal that reproduces `7d`'s grouping.

`SEASON_FACTS` was split on digit runs by a `tabularNumerals()` helper rather
than hand-written spans, so the sentence has one source. Emitted HTML is
byte-identical to the artboard's.

**Design provenance:** live DesignSync worked (`list_files`, and a live
`get_file` on the DS v3 `tokens/base.css`), but the artboard bytes came from the
same-day on-disk capture, md5 `045f55b3a44cfa304c7772fd6bddcdaf` — byte-identical
to T1's and T2's. `Events & Lineups.dc.html` was deliberately not re-pulled:
`get_file` returns all ten artboards into context, which inherited rule 2 forbids.

**follow-ups:**
1. **Design copy flagged, not fixed — input for T12.** Five items, all
   reproduced as drawn: (a) `7d`'s season marks show three completed duals, all
   wins (5–2, 6–1, 4–3) — the loss in "3–1" belongs to a fourth dual no artboard
   names; (b) `SEASON_FACTS`'s "3–1 in duals" (T1's flag, now confirmed from a
   second artboard); (c) `7d`'s "8 of 9 lines analyzed" is not merely underivable
   but **false about the app** — three of Fairmont's nine lines are doubles,
   which the vendor cannot analyze at all, and the rows support at most 5;
   (d) `7d`'s "in 4 days" is a clock claim the frozen fixtures cannot produce;
   (e) the topbar count lines contradict both the four rows drawn and the
   calendar ("2026–27" against dates that land on their weekdays only in 2025).
2. **Decide where the topbar count line lives** — reach the app `Header` via
   `usePublishHeaderStatus`, or drop it for good. It is the only drawn element in
   `7d`/`7e` with nowhere to render.
3. **`SEASON_LABEL` in `fixtures.ts` is now exported and unused** — it belonged
   to that topbar line. Keep or drop with the decision above.
4. **T4 should reconcile the selected-row treatment against `7c`** and remove
   the standing comment in `event-drawer.tsx` that says so. T3 used the
   artboard's own `--surface-muted` hover token as a placeholder because `7c`
   owns the settled selected state and is outside T3's artboard set.
5. **T12 should record two more losses**: `7e`'s "One-off match in Matches" lost
   its live `/dashboard/matches/new` link (the DB-wired empty state had it), and
   the drawer's per-row links to `/dashboard/team/schedule/[eventId]` are gone in
   favour of in-page selection.
6. **The `EventRow` "vs" prefix is the drawn treatment for duals**; a tournament
   row has none designed. Worth a design answer before the re-wiring, since the
   live loader can return one.

## T4 · Rebuild 7c and 4c — the dual widget — blocked

**gate:** mechanical **passed** — `npm run lint` 0 errors / 37 warnings (none
added), `npx tsc --noEmit` clean, `npm test` 227 passed. Completion review
**FAILED** — `VERDICT: needs-work`, criteria 1 and 2 not met on one element.
Criteria 3, 4 and 5 met. Guardrails — `pipeline-guardrails-reviewer` **ran**
(diff is entirely under `src/components/dashboard/`) and returned **no
findings**, having traced the surface that matters most on a results screen:
`player1`-is-our-side ordering, the tiebreak-against-the-set's-loser
convention, forfeit precedence (`'ours'` → the point goes to them), and
singles/doubles segregation all correct — and correct *because* the widget
never re-derives them, calling the existing `entry-state.ts` and
`score-format.ts` helpers instead, so it has no path to introduce a side flip.
`rls-boundary-reviewer` **skipped** — no file under `src/lib/supabase/`,
`src/lib/data/`, `src/app/api/` or `supabase/migrations/`, no new query;
`grep` over the three files for `supabase|createClient|\.from(|await|use
server` returns nothing.

**why it failed: one knowing divergence from the artboard.**

The implementer did not reproduce the header's outcome rails as drawn. Both
`7c` and `4c` draw the singles rail as five decided marks with a sixth in
`--ink-200`, and the doubles rail as two decided with a third in `--ink-200`.
It rendered them derived from `lineWon`/`entryPlayed` instead, which colours
S6 `--viz-bad` and D3 `--viz-good`.

**Its factual claim was verified true** before the reasoning was judged: the
artboard really does contradict itself. Its own rows draw S6 as a loss
(`circle-x`) and D3 as a win (`circle-check`), and its own header reads `5–2`,
which is only reachable if both lines count — the greyed reading totals 4–1.
The implementer's argument was that a rail derived from the lines is not copy,
and that drawing an "unplayed" mark two inches above a row showing a red cross
would be wrong on any data.

**Ruled not sanctioned, on three grounds:**
1. The brief forecloses exactly this move — *"Divergence is a defect, not a
   judgement call"* exists to stop a reasoned "I know this is more correct".
2. Inherited rule 4's remedy is *"reproduce it as drawn and report it"*. The
   implementer did the report half and skipped the reproduce half — which is
   the branch rule 4 names as forbidden, not the sanctioned one.
3. **Precedent inside this same run, in the same file, decided the other way.**
   T3 hit a structurally identical contradiction a few components away —
   `SelectAnEventPane`'s season marks (three wins drawn) against
   `SEASON_FACTS`'s "3–1 in duals" — and reproduced it literally, with a
   comment reading "NOT derived… Reproduced as drawn and reported". That
   contradiction was just as locally visible, which undercuts any
   "this one is worse because it's adjacent" distinction. Reproduce-then-flag
   is this run's established convention and T4 broke it.

The implementer itself offered the fix: *"If the human wants the literal, it is
a two-line change."* It is `railColor()` at `dual-widget.tsx:149-152`.

**stash:** `3101b4e047178721fc939ec4f89ded8733b5d3d2` (`git stash apply <sha>`,
not `stash@{n}` — the stash stack is shared across this repo's worktrees).
Holds the new `dual-widget.tsx` plus the `static-schedule.tsx` and
`event-drawer.tsx` edits. **Everything else in it passed**, verified at
measured-value level: header padding `20px 32px 14px`, the inset hairline as an
`::after` at `left/right 32px` rather than a full-bleed border, `text-score`
40/300/−1px, rail mark geometry, the row grid, and 53/53 copy tokens identical
codepoint by codepoint including the en dash in `5–2` and the raised `3` on
`6-7³`. Both frame heights were measured (1048×576 and 1048×816) and one
component serves both with no variant prop.

**changed:** nothing landed. This commit carries only the `status:` line and
this log entry.

**follow-ups:**
1. **`event-drawer.tsx` was edited outside T4's `files:` list and the reviewer
   ruled it a legitimate extension, not creep** — T3's log deferred this exact
   edit and left a standing code comment saying so. The finding: T3's
   `--surface-muted` wash was right but incomplete; `7c` also raises the
   selected row's name to `font-weight:500` and its score from `--ink-700` to
   `--ink-900`. That edit is correct and is in the stash — keep it on re-run.
2. **One difference between `7c` and `4c` is NOT height-driven**, which the
   task said to report rather than resolve: the topbar count string. `7c` reads
   "6 events · 2 upcoming"; `4c` reads "6 events · 2 upcoming · 4 completed".
   Unrendered either way (T3 established the app header has no slot shaped like
   it), so this is now the third open question about that one line.
3. **Design copy flagged, not fixed — input for T12.** "Coming soon" on the
   three doubles lines is not merely unverifiable but **false about the app**:
   `supportsVideo()` refuses doubles and `job-request.ts` rejects a doubles
   `match_type` outright with "Video analysis supports singles matches only".
   It promises analysis that does not exist and is not on a roadmap.
4. **The `no-video` singles case renders an empty action cell** because no
   artboard draws one. Unreachable on these fixtures, but reachable the moment
   the schedule is re-wired — it should get the "Add video" affordance the
   dormant `line-row.tsx` already has.
5. **Three copies of the same link treatment now exist** at three sizes —
   `LINK_CLASS` (12px, `static-schedule.tsx`), `REPORT_LINK` (11px,
   `dual-widget.tsx`) and `new-event-chooser.tsx:232`. Worth one helper beside
   `advButton()`.
6. **Measurement note for anyone repeating the harness technique:** the Browser
   pane runs with `document.hidden === true`, which freezes CSS transitions at
   t=0, so a `transition-colors` background reads as `rgba(0,0,0,0)` until you
   call `getAnimations().forEach(a => a.finish())`. It looks exactly like a
   broken class and is not one.

## T5 · Rebuild 2c — find the school — done

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings (none in the
changed files), `npx tsc --noEmit` clean, `npm test` 227 passed. Completion
review — `VERDICT: pass`, five of five, all seven requested judgments resolved
in the implementation's favour on byte-level evidence. Guardrails —
`pipeline-guardrails-reviewer` **ran** (diff touches `src/app/dashboard/` and
`src/components/dashboard/`) and returned **no findings**: the `isProgramStaff`
gate on this create route sits entirely outside the diff's ± lines (genuine
unmodified context, not a retyped copy that happens to match), the new
components hold only local step state with no write path, and the
`"<bestOf>|<adScoring>"` encoding is untouched because `dual-form.tsx` — one of
the two components that own it — is now unimported and has a zero-line diff.
`rls-boundary-reviewer` **skipped** — no file under `src/lib/supabase/`,
`src/lib/data/`, `src/app/api/` or `supabase/migrations/` is modified, and no
new query; the route *removes* four loader calls, which cannot open an RLS hole.

**Runner-resolved before review, so it did not reach the gate:**
`dual-school-step.tsx` value-imports `divisionLabel`/`teamLabel` from
`@/lib/data/programs-server` into a `"use client"` component, which looks like a
rule-5 violation. It is not: both are pure string functions, that module's only
Supabase reference is a type-only `SupabaseClient` import, and six other client
components — including the dormant `school-search.tsx` this replaces — already
do exactly this. Established house practice.

**changed:** Two new components — `static/static-dual-builder.tsx` (30 lines:
one `useState<"find-school" | "build">`, one branch, no props, no other state)
and `static/dual-school-step.tsx` (artboard `2c`). The route drops the four
parallel loaders, `toDirectoryRow`, `opponentDualHistory`, `divisionLabel`, the
`self` lookup and the entire `DualForm` prop wall — the largest single deletion
in the run — with the guard block byte-identical and a paragraph appended to the
existing doc comment. `school-search.tsx` and `dual-form.tsx` untouched.

**Declared extension outside `files:`, sanctioned at dispatch:**
`src/lib/schedule/fixtures.ts` gained program-directory data, because `2c` is a
school-search screen and T1's fixtures carried none. Reviewed for quality:
`DirectorySchool` **nests** `ProgramSearchResult` and `OpponentDualHistory` as
`program`/`history` rather than flattening them, so it composes the existing
shapes and shadows neither; both imports are `import type`, so nothing
server-side can reach a client bundle; the one new field, `seasonRecord`, is the
single figure on the artboard that neither existing type can hold, and it is
documented against `opponent-history.ts`'s own header saying that figure does
not exist in this app.

**The consistency question, settled with byte evidence.** T5 reproduced
`color: var(--blue)` exactly as `2c` draws it on 11px and 12px text and flagged
the WCAG AA failure (3.68:1) rather than substituting `--blue-text` — the
opposite of what T3 did on `7e`. The reviewer verified the distinction holds:
`7e`'s three links are `<a>` tags setting only `font-size`/`font-weight` with
**no `color` property at all**, so T3 filled a genuine inheritance gap left by a
stylesheet this app does not load; `2c`'s coloured elements are `<span>`/`<div>`
that **state `color:var(--blue)` inline**, so there is no gap to fill and
substituting would be the T4 error. Both tasks are right, and the run is
consistent.

**`EventShell` deliberately not used** — `2c` draws `32px 40px` body and
`16px 40px 20px` footer against `EventShell`'s `48/32/26` and `48/22/16`.
Reusing the shell would recreate exactly the unreconciled padding gap that
contributed to T2's failure. The reviewer confirmed this creates no seam with
T6, whose `2b` is a structurally different master-detail layout that *does*
require `EventShell` with `flush`.

**Design provenance:** cached fallback, stated plainly — the same same-day
on-disk capture T1–T4 used, md5 `045f55b3a44cfa304c7772fd6bddcdaf`, reading only
lines 188–286 (`2c`). `get_file` returns all ten artboards in one blob, which
inherited rule 2 forbids taking into context.

**follow-ups:**
1. **Seven contradictions in `2c`, all reproduced as drawn and flagged — input
   for T12.** Three were spot-checked against the artboard bytes and confirmed
   genuine reproductions rather than quiet normalisations. (a) The opponent's
   own season record — "18–4", "11–10", "14–7", "9–12", "16–5" — **does not
   exist anywhere in this app**; `opponent-history.ts`'s header says so outright
   and the dormant `SchoolSearch` deliberately omits the slot. (b) The "Big Ten"
   pill is drawn **active**, with "Clear" present, while the list below shows
   Coastal, Mountain West and D-III rows and the counter reads "5 of 1,940" —
   the pill and the list cannot both be right. (c) "Region ⌄" filters on a
   column that does not exist; `programs` has `state`, `division` and
   `conference` and no way to derive a region. (d) "5 of 1,940" is a total the
   API cannot return — `/api/programs/search` answers with a capped 8-row page
   and no count, which is why the dormant component says "5 listed". (e) The
   mono column is MM-DD; `formatLastPlayed()` renders "12 Apr". (f) One row's
   subline carries a division where the other four carry a conference. (g) The
   free-text row uses straight ASCII quotes where the design's own prose uses
   typographic ones.
2. **Every directory fixture row hardcodes `team: "mens"`** — noted by the
   guardrails reviewer as a fidelity gap, explicitly not filed as a finding
   since nothing here reads the workspace. A women's-team workspace would see
   "Men's" on every subline once this is re-wired.
3. **`2c`'s search field is drawn, not wired** — the artboard renders a `<span>`
   plus a caret rule, not an `<input>`, and there is no directory behind the
   screen for a second term. Reproduced as a static field.
4. **T6 will need `DualSchoolStep` to hand the chosen `DirectorySchool` up
   through `StaticDualBuilder`.** `onContinue` deliberately takes no argument
   today; that is a one-line widening, left for the task that needs it.
5. Before re-wiring, decide: drop the season-record slot or source it (an ITA
   scrape); add a `region` concept or drop the pill; give
   `/api/programs/search` a total count or accept "N listed"; and settle MM-DD
   against "12 Apr" before two formats for one fact drift apart.

## T6 · Rebuild 2b — the master-detail dual builder — blocked

**gate:** mechanical **passed** — `npm run lint` 0 errors / 37 warnings (none
added), `npx tsc --noEmit` clean, `npm test` 227 passed. Completion review
**passed** — `VERDICT: pass`, five of five criteria, all eight requested
judgments resolved in the implementation's favour on byte-level evidence.
Guardrails — `pipeline-guardrails-reviewer` **ran and returned a finding**,
which blocks: task-next's fail-closed rule is that any finding from a guardrail
agent blocks, with no severity triage at this gate.
`rls-boundary-reviewer` **skipped** — no file under `src/lib/supabase/`,
`src/lib/data/`, `src/app/api/` or `supabase/migrations/`, no new query, no
route file touched.

**why it failed: one school's data renders under another's name.**

`DualSchoolStep` lets the user pick any of five schools — `CONFERENCE_SCHOOLS`
(Ridgeline University, Ridgemont Tech) plus `ALL_PROGRAM_SCHOOLS` (Ridgeway
College, Ridge Valley State, Ridgefield Academy). Whichever is picked is passed
to `DualBuildStep`, where it feeds **only** the header, the subline and the
rail's selected highlight. The date, site, surface, format and all nine lineup
lines are unconditional module-level imports of `DUAL_DRAFT_EVENT` and
`DUAL_DRAFT_LINES` — which are Ridgeline's, field for field.

So: pick "Ridgemont Tech" on step one, hit Continue, and step two reads
**"vs Ridgemont Tech"** above Ridgeline's 09-26 / Home / Hard / Bo3-no-ad and
the Dana Brooks / Marcus Reid lineup, with the rail showing six Big Ten schools
and none checked. Reachable without any code change, **four of the five ways
through step one**.

It is inert — nothing writes, "Create dual" does nothing — and the reviewer
noted it sits in §3.5 "safe to redesign freely" territory rather than being a
guardrail violation in the doc's technical sense. **That distinction is
deliberately not applied here.** The gate does not triage severity, and
"one school's data under another's name" is the exact pattern this repo's
guardrails exist to catch; letting it through because it is currently inert
would be inventing the triage the skill forbids.

**Two fixes the reviewer named**, either of which resolves it: restrict step
one's selectable set to what step two can depict consistently (Ridgeline only,
for now), or have step two visibly acknowledge that the detail pane is fixed
regardless of selection.

**stash:** `3e857ab68c9f6ee870afbda39e3dfaae2ad09877` (`git stash apply <sha>`,
not `stash@{n}` — the stash stack is shared across this repo's worktrees).
**Everything else in it passed and is worth keeping.** Verified: 80 rendered
strings diffed against the artboard with **zero** differences; `EventShell`'s
`flush` proven in effect by squeezing the frame to 420px and confirming two
independent inner scrollers (rail 353/251, pane 658/347) inside a
non-scrolling body; and the format seam handled correctly (below).

**The format seam, handled well and worth preserving on re-run.** The component
emits the literal `FORMAT_VALUE = "3|false"` rather than interpolating from
`DUAL_DRAFT_EVENT.format`. Both reviewers confirmed the reasoning: `adScoring`
is `boolean | null`, and `${null}` encodes as the string `"null"`, which
`dual-form.tsx:266`'s `adScoring === "true"` reads as a **confident `false`** —
a wrong answer that looks like a real one, and the exact failure
`tournament-form.tsx`'s header records. Round-trip verified against that
decoder and corroborated against `tournament-form.tsx:97`'s own `FORMATS` table
(`{ value: "3|false", label: "Best of 3 · no-ad" }`). Forfeit encoding also
checked: `LineupLine.forfeit` is narrowed to `"ours" | null` because a builder
can only forfeit its own line, `"ours"` correctly means the point goes to them,
and the rendered "— no available player" is copied verbatim from the live
`line-row.tsx`'s vocabulary for the same state rather than reinvented.

**changed:** nothing landed. This commit carries only the `status:` line and
this log entry.

**follow-ups:**
1. **Three sanctioned or in-scope changes in the stash that the completion
   reviewer explicitly upheld — keep them on re-run.** (a) The shell's state was
   collapsed from `useState<"find-school" | "build">` to
   `useState<DirectorySchool | null>`; ruled legitimate because the file is in
   T6's own `files:` list, T5's "and nothing else" was a gate criterion for T5's
   delivered diff rather than a frozen interface, T7 consumes the
   `DualBuildStep({ school })` prop boundary which is untouched, and the
   collapse removes the very two-values-can-drift risk the plan warned of.
   (b) The stub's "Back to step one" control was deleted — correct, since the
   artboard's footer draws only Cancel and Create dual, and keeping an undrawn
   control would itself be a divergence. (c) The footer is hand-rolled at `2b`'s
   `16px 32px 20px` rather than through `EventShell`'s `footer` slot (48/22/16);
   criterion 2 scopes the shell requirement to the body, and using the slot
   would have introduced a measurable divergence.
2. **A cross-task fixture mutation was verified inert**, not merely claimed:
   `division: "D1"` was added to the Ridgeline row that `2c` already renders.
   `SchoolRow`'s `program.conference ?? divisionLabel(program.division)`
   short-circuits on that row's non-null conference, so committed `2c` is
   unchanged. Confirmed by direct code read.
3. **`fixtures.ts` now type-imports `LineupLine` from `lineup-editor.tsx`** — a
   lib importing a type from a component. Erased at runtime and consistent with
   this run's reuse-don't-duplicate principle, but a layering purist would hoist
   the type to a neutral module. Noted, not blocking.
4. **Nine contradictions in `2b`, reproduced as drawn and flagged — input for
   T12.** Two were spot-checked against the artboard and confirmed genuine
   reproductions. (a) **The lineup contradicts itself**: S6 reads "— no
   available player" and is forfeited while D3 pairs "Moreau / **Adeyemi**" —
   Adeyemi is available for doubles and not for singles, so any real
   `seedLineup()` must contradict one half of the drawing. (b) "pairs carried
   from singles" is false of its own rows — D3's Adeyemi appears in no singles
   line. (c) Doubles use surnames where singles use full names. (d) "Big Ten ·
   D-I" reverses the app's own `programSubtitle()` order, which four claim-flow
   call sites depend on. (e) **The Forfeit control is an invisible target** —
   `opacity:0` with the hover reveal on the span itself, not the row, so it
   appears only once the pointer is already over something unseeable.
   (f) The rail's history figures have no source: "you lead 3–1" over Fairmont
   implies four decided duals where the fixtures hold one. (g) `2b`'s Ridgeline
   dual has nine lines before create while `7d` calls the same event "lineup not
   set". (h) The rail's six Big Ten schools do not match `2c`'s conference
   section and omit Ridgemont Tech, which `2c` lists. (i) `lastPlayedOn` is
   unset on four rail rows with decided duals, because the rail draws no
   last-played cell.
5. Decide whether the Forfeit control keeps its invisible-until-hovered
   treatment — moving the reveal to the row's hover is a one-word change.
6. When this screen returns to the database, `RAIL_SCHOOLS`,
   `DUAL_DRAFT_LINES` and `DUAL_DRAFT_EVENT` are the three imports to swap for
   `OpponentRail` + `LineupEditor` + `createDual`; the props already line up.

## T8 · Rebuild 3c — the tournament builder — done

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings (none in the
changed files), `npx tsc --noEmit` clean, `npm test` 227 passed (the reviewer
also ran `npm run build` green). Completion review — `VERDICT: pass`, five of
five, all eight requested judgments resolved in the implementation's favour
against a live artboard capture. Guardrails —
`pipeline-guardrails-reviewer` **ran** (diff touches `src/app/dashboard/` and
`src/components/dashboard/`) and stated plainly that **nothing breaks a
guardrail**. `rls-boundary-reviewer` **skipped** — no file under
`src/lib/supabase/`, `src/lib/data/`, `src/app/api/` or `supabase/migrations/`,
no new query; the route *removes* two loader calls.

**changed:** New `static/static-tournament-builder.tsx` — the `3c` roster rail
feeding an entries list, inside `EventShell flush`. The route drops `getLadder`,
`getTeamSettings` and their `Promise.all`, guard block byte-identical, with a
paragraph appended to the existing doc comment. `tournament-form.tsx`,
`entry-editor.tsx` and `field-row.tsx` untouched.

**Declared extension:** `src/lib/schedule/fixtures.ts`, **98 insertions / 0
deletions** — a pure append plus one `import type { LadderPlayer }` slotted into
the existing import block with nothing reordered. Deliberately shaped that way
because three tasks are stashed and T6's stash also edits this file; the
conflict surface is now one import line at worst.

**The format seam — this run's most dangerous point, handled correctly.**
The component emits `FORMAT = { value: "3|true", label: "Bo3 · ad" }` as a
literal. Both reviewers verified independently: `"3|true"` is genuinely
`FORMATS[1]` in `tournament-form.tsx:42`, it round-trips through
`dual-form.tsx:266`'s decoder to `{ bestOf: 3, adScoring: true }`, and the
fixture agrees (`TOURNAMENT_FORMAT = { bestOf: 3, adScoring: true }`) — one
tournament, one format, stated twice, both statements matching. The
literal-not-interpolated choice is right for the recorded reason: `adScoring` is
`boolean | null`, `${null}` encodes as `"null"`, and `"null" === "true"` is a
confident `false` — the exact outage `tournament-form.tsx`'s header describes,
on this exact screen.

**The T6 defect is absent, by construction rather than by discipline.** T6 was
blocked because a rail selection could render one school's name over another's
data. Here `TOURNAMENT_FIELD` pairs each `LadderPlayer` with its own
`EventEntry` in one object literal — no parallel arrays, no name or index join.
Both panes read `row.player.name`; `entered` is a `Map` keyed on
`player.userId`; the entries list is a `flatMap` over the same array the rail
iterates, so each rendered row carries the entry it was filtered by; the footer
count is `field.length`, not a literal. `enter()`/`remove()` touch only the
passed key, so no other row's draw or seed can shift. Verified live by both
reviewers and by interaction.

**A ruling worth recording — the missing Surface cell is NOT a pipeline
defect.** `3c` draws Name / Starts / Ends / Site / Format and no Surface, while
the dormant `tournament-form.tsx` deliberately adds one so an event cannot be
created without it. The runner's dispatch assumed surface might be a
vendor-required field; **the guardrails reviewer checked `job-request.ts`
directly and it is not.** The five fields §3.1 names are both player names, a
non-zero set score, `initialTopPlayerIsPlayer1`, `fixedCamera` and `adScoring` —
surface appears nowhere in `SplitStepJobRequest` or its validation. `surface` is
a display/analytics field: `actions.ts:481` writes `court_type: event.surface ??
undefined`, and `statistics-server.ts` already falls back to "Unknown". So a
null surface degrades a statistics grouping, it does not fail a submission.
Reproduce-and-flag was correct.

**follow-ups:**
1. **Nine contradictions in `3c`, reproduced as drawn and flagged — input for
   T12.** (a) **The info callout is the big one**: "3 Big Ten programs are in
   this field — matches against them count toward conference seeding." Nothing
   in this app records which programs attend a tournament, and nothing models
   conference seeding; `tournament-form.tsx`'s own header says such a callout
   "is not built, and should not be… A hardcoded one would be a confident lie
   about a field nobody entered." Drawn verbatim anyway, per rule 4 — the
   reviewer upheld this, distinguishing a frozen fixture where the sentence is
   true of the data it names from a live tool computing it over real data.
   (b) No Surface and no Hosted-by cell (see the ruling above). (c) Dates are
   drawn year-less (`10-03`, `10-05`) while `startsOn`/`endsOn` are YYYY-MM-DD
   and the dormant form uses `<input type="date">`, which cannot render a
   year-less value. (d) No doubles section and no typed-name path, so there is
   no way to enter a walk-on, guest or unrostered recruit — a capability
   `entry-editor.tsx` calls out as necessary. (e) No draw or seed editing, so a
   re-added player returns as Main draw / Unseeded with no way back to
   "Qualifying". (f) "Bo3 · ad" is the artboard's shorthand, not the app's label
   for that value ("Best of 3 · ad" in both dormant `FORMATS` tables) — the
   label diverges, the value does not. (g) Site and Format draw chevrons but
   state one value each; rendered as one-option selects rather than inventing
   options the design never wrote. (h) Every rail row asserts a ladder number,
   though `LadderPlayer.ladderPosition` is nullable and renders "Unranked".
   (i) The name field carries a 2px blue focus rule on non-focusable text.
2. **Two invented empty-state strings**, both outside anything `3c` draws: the
   zero-entries message "Nobody yet — add players from the roster." (reachable
   via the `x` the artboard does draw, and marked in source as scaffolding), and
   the rail's "No player by that name." The reviewer accepted both but noted the
   second **lacks the inline scaffolding flag** the first has — worth
   annotating for consistency.
3. **`"<bestOf>|<adScoring>"` now lives in three places** — both dormant
   `FORMATS` tables and this component's `FORMAT`. A shared encode/decode pair
   would close the `${null}` → `"null"` trap permanently, which is worth doing
   given this seam has already caused one real outage.
4. **The component hardcodes "Buckeye Fall Classic" / "10-03" / "10-05" as JSX
   literals** rather than reading them off `TOURNAMENT_DETAIL.event`, which
   holds the same values. Consistent today; a DRY nit the reviewer flagged as
   out of scope.
5. Extract `stateLine()` and `DRAWS` from `entry-editor.tsx` so the static and
   dormant screens cannot drift on the four subline shapes.
6. `getTeamSettings` may now have no live caller under the schedule subtree —
   worth confirming it is dormant by design rather than orphaned.
7. **`--blue` on white at 11px keeps failing WCAG 1.4.3 AA across these
   artboards** (`3c`'s callout neighbours, `2c`'s "Clear"). Third task to raise
   it; worth one deliberate design-system decision rather than a per-task note.

## T2 · Rebuild 3b — the event-type chooser — done (re-run)

Re-run of the task blocked earlier this session. Stash
`29062bef5efd3795ad1e071e5ebad613936d9b95` applied cleanly (note: `git stash
apply --check` reports a false conflict on any stash containing untracked
files — the real apply succeeded), the three findings fixed, re-gated in full.

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings (none added),
`npx tsc --noEmit` clean, `npm test` 227 passed. Completion review —
`VERDICT: pass` on the second pass (the first pass is described below).
Guardrails — `pipeline-guardrails-reviewer` **ran** and returned **no
findings**: guard block byte-identical, the chooser never touches `adScoring`,
both onward routes carry their own unmodified `isProgramStaff` gate so
`router.push` cannot ride a player into a builder.
`rls-boundary-reviewer` **skipped** — no matching path, no query.

**the three fixes:**
1. **The aside link is inert.** The artboard's own anchor is the placeholder
   `href="#3b"`; it had been wired to `/dashboard/matches/new`, outside the
   rebuilt set. Now an inert `<span>` with the link treatment, matching how
   `7e`'s "One-off match in Matches" is handled. `next/link` dropped as its
   sole use. Verified the artboard's anchor carries no `style-hover`, so losing
   the hover/focus classes is not a new divergence.
2. **The divider is `--blue-glow`.** `colors.css:72` is exactly the artboard's
   `rgba(59,130,246,0.15)`. The header comment that asserted "no token carries
   0.15" was rewritten — that claim was the actual defect, not just the class.
3. **The bottom inset is documented.** `EventShell`'s `pb-8` stands against the
   artboard's `padding-bottom: 0`; editing the shared shell would move three
   other screens in this run, so the divergence is recorded in the wrapper's
   comment rather than left silent.

**A stale design capture is loose on this machine, and it cost a review cycle.**
The first re-review returned `VERDICT: needs-work` on two new findings — a
missing `New event` eyebrow above the `3b` heading, and a body padding of
`0 48px` with `justify-content:center`. **Both are false.** It had read a
different capture of `Events & Lineups.dc.html`:

| | current | stale |
|---|---|---|
| md5 | `045f55b3a44cfa304c7772fd6bddcdaf` | `5cb178cd252bffbd4dc8b3d2cf88f31d` |
| size | 125,343 bytes | 87,329 bytes |
| artboards | `7e 3b 2c 2b 2d 2e 3c 7d 7c 4c` | `5a 5b 4c 3b 3c 2b 2c 2d 2e` |

The stale one carries **`5a` and `5b`** — the artboards of the earlier
`events-lineups` run this workspace's `CONTEXT.md` says the human **abandoned**
— and is **missing `7e`, `7d` and `7c`**, three of this run's ten. It is the
pre-revision morning file (10:20), superseded by the 14:21 capture the brief
was written against.

Verified against the current capture's bytes: line 147 is `3b`'s body div at
`padding:36px 48px 0` with no `justify-content`, and line 148 is the `<h1>` as
its first child — no eyebrow. The one `eyebrow` string near that frame is
`3 · Dual branch`, a section label in the document's annotation layer
**outside** the 1280×840 frame. A second completion review, given the
provenance and asked to check for itself, confirmed both findings false and
passed the task.

**Every task T1–T8 reported md5 `045f55b3`, so no delivered work is built on
the stale bytes** — only that one review was. But the file is still sitting in
a scratchpad and will mislead the next agent that finds it by globbing.

**changed:** `static/static-event-chooser.tsx` (new) and the route re-point —
one import, one `return`, guard block byte-identical, a paragraph appended to
the existing doc comment. `new-event-chooser.tsx` untouched.

**follow-ups:**
1. **Pin the design capture.** Three sessions independently re-captured this
   file, and a fourth (superseded) copy is indistinguishable by filename. Later
   tasks and reviewers should be handed the md5 and the absolute path, as this
   re-run was, rather than left to glob for `*.dc.html`.
2. Design copy flagged, not fixed — input for T12: "Add it in Matches" names a
   destination a team workspace's rail does not expose. Reproduced verbatim;
   the dormant component had silently reworded it to "Add a single match", and
   that rewording is the divergence, not the design.
3. `Creates 9 lines` sets the 9 in `mono tabular` per the artboard's own class
   list, while the dormant component dropped `mono` on the argument that Roboto
   Mono is reserved for timestamps and job ids. The design was followed; worth
   settling once in the design system.
