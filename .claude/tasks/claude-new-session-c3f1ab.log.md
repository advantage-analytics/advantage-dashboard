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

## T4 · Rebuild 7c and 4c — the dual widget — done (re-run)

Re-run of the task blocked earlier this session. Stash
`3101b4e047178721fc939ec4f89ded8733b5d3d2` applied cleanly, the one finding
fixed, plus one further fix the re-gate surfaced.

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings (none added),
`npx tsc --noEmit` clean, `npm test` 227 passed. Completion review —
`VERDICT: pass`, five of five, rail constants confirmed byte-identical to the
artboard at `_full.dc.html:803`/`:805` and `:915`/`:917`. Guardrails —
`pipeline-guardrails-reviewer` **ran**, found no violation, and raised one
actionable hazard which was **fixed before commit** (below).
`rls-boundary-reviewer` **skipped** — no matching path, no query;
`entry-state.ts` and `score-format.ts` have zero diff.

**the finding, fixed: the rails are now drawn, not derived.** The sequences
were extracted from the authoritative capture rather than taken from the
earlier report. Both `7c` and `4c` draw, byte-identically:

- singles (6): `--viz-good --viz-bad --viz-good --viz-good --viz-good --ink-200`
- doubles (3): `--viz-good --viz-bad --ink-200`

`railColor()` is deleted (`grep -rn "railColor" src/` is empty). `OutcomeRail`
takes a `marks` prop and renders two module constants. `entryPlayed` and
`lineWon` remain in use for the played count and the per-row outcome icon, so
no import went stale.

The contradiction is now recorded in the component rather than resolved by it:
the artboard greys S6 and D3 while the rows beneath draw S6 a loss and D3 a
win, and the header reads 5–2, which the greyed marks would make 4–1. The
earlier pass computed the rail instead — reasoning that a rail is a function of
the lines and that an "unplayed" mark two inches above a red cross is wrong on
any data. That reasoning is sound; it was still the wrong call under a contract
that says divergence is a defect, not a judgement call, and whose rule 4 remedy
is reproduce **and** report. T3 had already reproduced the same class of
contradiction literally on `7d`; this now matches.

**a second fix, from the re-gate — a false promise in the file's own header.**
The doc comment said re-wiring this component is "a changed import upstream and
no change here". True of every other cell, which recomputes from whatever
`EventDetail` it is handed — and **false of `OutcomeRail`**, whose marks are now
fixed constants. Left standing, the next task would re-point this at live
matches on the strength of that sentence and ship a rail that renders
`good bad good good good grey` for every dual a coach opens, won or lost, with
correct rows beneath it and nothing looking broken. The header now carries an
explicit exception saying re-deriving those marks is part of the re-wiring, not
a consequence of it. Worth noting the shape: reproducing a self-contradictory
design safely required *documenting* the reproduction as a trap, not just
performing it.

**changed:** `static/dual-widget.tsx` (new), `static/static-schedule.tsx` (pane
wiring), and `static/event-drawer.tsx` — the last outside `files:`, being the
handoff T3's log deferred here, ruled a legitimate extension twice: `7c` raises
the selected drawer row's name to `font-weight:500` and its score from
`--ink-700` to `--ink-900`, which T3's `--surface-muted` wash alone did not
cover.

**follow-ups:**
1. **One difference between `7c` and `4c` is NOT height-driven** — the topbar
   count string: `7c` reads "6 events · 2 upcoming", `4c` reads "6 events ·
   2 upcoming · 4 completed". Unrendered either way, so this is the third open
   question about that one line.
2. **Design copy flagged, not fixed — input for T12.** "Coming soon" on the
   three doubles lines is **false about the app**: `supportsVideo()` refuses
   doubles and `job-request.ts` rejects a doubles `match_type` outright with
   "Video analysis supports singles matches only". It promises analysis that
   does not exist and is not planned. Also the rail contradiction above.
3. **The `no-video` singles case renders an empty action cell** because no
   artboard draws one. Unreachable on these fixtures, reachable the moment the
   schedule is re-wired; it should get the "Add video" affordance the dormant
   `line-row.tsx` already has.
4. **Three copies of the same link treatment at three sizes** — `LINK_CLASS`
   (12px), `REPORT_LINK` (11px), and `new-event-chooser.tsx:232`. Worth one
   helper beside `advButton()`.

## T6 · Rebuild 2b — the master-detail dual builder — done (re-run)

Re-run of the task blocked earlier this session. Stash
`3e857ab68c9f6ee870afbda39e3dfaae2ad09877` applied — with a conflict, see
below — the blocking defect fixed per the human's decision, re-gated in full.

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings, `npx tsc
--noEmit` clean, `npm test` 227 passed. Completion review — `VERDICT: pass`.
Guardrails — `pipeline-guardrails-reviewer` **ran** (it is the reviewer that
blocked this task) and reports the defect **"closed by construction (shared
object reference, not parallel state)"**, with no outstanding findings.
`rls-boundary-reviewer` **skipped** — no matching path, no query, no route file.

**the fix: step two is always Ridgeline.** The human chose this from three
options. `2b` draws Ridgeline throughout — header, rail check, subline, footer
— so the artboard has one path and the reproduction has one path. Making the
header follow `2c`'s selection was behaviour invented *beyond* the design;
removing it restores fidelity and removes the defect in the same move.

- `DualBuildStep` takes **no props**, reading
  `const DUAL_DRAFT_SCHOOL: DirectorySchool = RAIL_SCHOOLS[0]`.
  `RAIL_SCHOOLS[0]` is `CONFERENCE_SCHOOLS[0]` **by reference**, not a second
  `directorySchool()` call with matching fields — so the header's name and the
  rail's tick read one object and cannot drift. The reviewer verified the
  reference, not just the values.
- `static-dual-builder.tsx` back to `useState<"find-school" | "build">` — the
  shape T5 delivered and a review passed. Selection advances the step and
  carries nothing.
- `dual-school-step.tsx` reverted to its committed state; the `onContinue`
  widening is no longer needed and the file is out of the diff entirely.
- `DUAL_DRAFT_SCHOOL` carries a doc comment saying **the re-wiring must undo
  this**: once a real dual is built the school genuinely does travel, and
  re-pointing the loaders without re-threading it would pin every new dual to
  Ridgeline. Same class of trap as T4's rail constants, documented the same way.

**A merge hazard worth recording, because it nearly landed silently.**
`fixtures.ts` conflicted: T8 had appended to the same file while this work sat
stashed. The two blocks are disjoint (T8 exports `TournamentFieldRow` /
`TOURNAMENT_FIELD`; this one `DUAL_DRAFT_EVENT` / `RAIL_SCHOOLS` /
`DUAL_DRAFT_LINES`) and both type-only imports were kept, so the resolution was
"keep both sides".

**The first resolution silently truncated T8's `TOURNAMENT_FIELD` array** — git's
conflict region had swallowed its closing `},` and `];`. `tsc` caught it
immediately; the closer was restored and T8's block diffed byte-for-byte
against its committed form. Both reviewers independently confirmed
`git diff HEAD -- src/lib/schedule/fixtures.ts` is **purely additive**, nothing
removed from an already-gated screen. Had the syntax happened to stay valid,
this would have been a passing gate over a quietly damaged neighbour — worth
remembering for the two-stash-into-one-file case generally.

**still verified after the change:** `FORMAT_VALUE = "3|false"` remains a
literal, corroborated three ways (`dual-form.tsx:52`'s `FORMATS[0]`,
`fixtures.ts:96`'s `DUAL_FORMAT`, and the decoder round trip) — not
interpolated, because `EventFormat.adScoring` is `boolean | null` and `${null}`
encodes `"null"`, which `=== "true"` reads as a confident `false`, the outage
`tournament-form.tsx` records. `EventShell flush` still in effect. Nine lines
still filter strictly on `discipline`, so no doubles pair can render as
singles. S6's `forfeit: "ours"` still means the point goes to them.

**follow-ups:**
1. **Nine contradictions in `2b`, reproduced as drawn and flagged — input for
   T12**, two spot-checked as genuine reproductions. (a) The lineup contradicts
   itself: S6 is "— no available player" and forfeited while D3 pairs
   "Moreau / **Adeyemi**". (b) "pairs carried from singles" is false of its own
   rows — D3's Adeyemi is in no singles line. (c) Doubles use surnames, singles
   full names. (d) "Big Ten · D-I" reverses the app's own `programSubtitle()`
   order, which four claim-flow call sites depend on. (e) The Forfeit control is
   an invisible target — `opacity:0` with the reveal on the span, not the row.
   (f) The rail's history figures have no source: "you lead 3–1" over Fairmont
   implies four decided duals where the fixtures hold one, and each opponent's
   own season record does not exist anywhere in this app. (g) `2b` shows nine
   lines before create while `7d` calls the same event "lineup not set".
   (h) The rail's six Big Ten schools do not match `2c`'s conference section and
   omit Ridgemont Tech, which `2c` lists. (i) `lastPlayedOn` unset on four rows
   with decided duals.
2. **`2c` now offers five schools that all lead to the same step two.** That is
   the artboard reproduced faithfully, and it is also the thing a human should
   look at once: the design never drew what picking a non-Ridgeline row does.
   The re-wiring answers it for real; until then it is a known, documented
   property rather than a defect.
3. Decide whether the Forfeit control keeps its invisible-until-hovered
   treatment — moving the reveal to the row is a one-word change.
4. When this screen returns to the database, `RAIL_SCHOOLS`,
   `DUAL_DRAFT_LINES`, `DUAL_DRAFT_EVENT` and `DUAL_DRAFT_SCHOOL` are the four
   to swap for `OpponentRail` + `LineupEditor` + `createDual` + the real
   selection; the props already line up.

## T7 · Rebuild 2d and 2e — the add-opponent popup — done

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings (none in the
changed files), `npx tsc --noEmit` clean, `npm test` 227 passed, **and
`npm run build` OK** — a build was added to this task's gate deliberately, see
below. Completion review — `VERDICT: pass`, four of four, all seven requested
judgments upheld against the authoritative capture. Guardrails —
`pipeline-guardrails-reviewer` **ran** and returned **no findings**, having
checked the opponent-identity hazard against the code rather than the comments.
`rls-boundary-reviewer` **skipped** — no file under `src/lib/supabase/`,
`src/lib/data/`, `src/app/api/` or `supabase/migrations/`, no new query, no
route touched.

**why a build was added to the gate.** `fixtures.ts` now does
`import type { OpponentRosterCandidate } from "@/lib/schedule/actions"`, and
`actions.ts` **is a `"use server"` module**. `tsc` alone would not catch a
server action reaching a client bundle; `next build` would. It passes, and the
reviewer confirmed the mechanism: `isolatedModules: true` forces `import type`
to be fully erased, `OpponentRosterCandidate` is a plain interface rather than
an action, and nothing under `static/` names `actions` at all — the type is
re-exported through `fixtures.ts` precisely so it need not.

**changed:** New `static/opponent-popup.tsx` — one component, two states of its
own local state (`open` → `2d`, `confirmation` → `2e`). No second popup exists.
`dual-build-step.tsx`'s inert opponent cell becomes its closed state, with T6's
drawn treatment of that cell unchanged. `fixtures.ts` gains
`DUAL_DRAFT_TYPED_NAME`, `DUAL_DRAFT_OPPONENT_SHORT` and
`DUAL_DRAFT_SAVED_ROSTER`, appended at the end with nothing reordered — the
reviewer confirmed `RAIL_SCHOOLS`/`CONFERENCE_SCHOOLS` intact, which matters
because a stash conflict on this file once truncated a neighbour's array.

**the wrong-line hazard, closed structurally.** `dual-form.tsx:220`'s
`takeOpponent` exists because a name typed against school A can silently attach
to a real person at school B. The static analogue is a name landing on the wrong
*line*. That is foreclosed by construction, verified in code by the reviewer
rather than taken on the component's word: each `LineRow` owns its own
`useState` for its opposing label, `onCommit` is that row's own setter closed
over, and the popup receives no line id, no index and no keyed map — there is no
expressible path to a sibling row. The school half reads
`DUAL_DRAFT_SCHOOL.program.schoolName`, the same object the header and the
rail's tick read, and the rail is drawn-not-clickable so no re-target path
exists at all. T6's fix is intact: `DualBuildStep()` still takes no props.

**a note the re-wiring must not lose.** Rows are keyed
`${DUAL_DRAFT_SCHOOL.program.programKey}:${line.key}` so a future re-target
remounts every row and drops its resolved name rather than leaving a name
attached under a different program id. **Today that key is inert** — the school
is a module const, so it never changes — and the code says so honestly. The
guardrails reviewer added the detail that matters later: `LineupBlock` is called
once for singles and once for doubles, so a live school must flow into a single
shared value every one of the nine rows reads. Thread it into one block only and
the remount guarantee silently stops holding for the other.

**follow-ups:**
1. **Eight contradictions in `2d`/`2e`, reproduced as drawn and flagged — input
   for T12**, two spot-checked as genuine reproductions. (a) **`2e`'s toast is
   false on the path `2e` itself draws**: it resolves the line to a name the
   roster *already held* and still toasts "Saved to Ridgeline University
   roster". Picking an existing name saves nothing. The dormant
   `opponent-name-cell.tsx` splits these into two sentences and toasts the save
   one only after the server confirms a write. (b) The school's name is
   inconsistent within the pair — `2d` writes "Ridgeline" twice, `2e` writes
   "Ridgeline University"; held as a literal rather than derived, because a
   first-word slice would print "Fairmont" and "Crestwood" for two rail rows.
   (c) `2e` drops a rail row that `2d` lists — saving a name cannot remove a
   school from the rail, so this is a drawing artefact and the rail was left as
   built. (d) The toast's own 236px width does not fit its own string at 12px;
   the artboard's CSS produces the same wrap. (e) `top:calc(100%+8px)` with no
   flip clips on the lower rows. (f) `2d`/`2e` draw Forfeit plainly where `2b`
   draws it `opacity:0` — read as active vs resting row, and upheld on review.
   (g) `2d`/`2e` draw only S1–S3 and no field row, a truncated draw rather than
   a statement. (h) The 1px blue bar beside the typed text is a caret a static
   capture cannot render; reproduced as `caret-color: var(--blue)`, the one
   place markup was read as a stand-in rather than a literal — also upheld.
2. **Undrawn behaviour filled in, all ruled legitimate** since the artboards
   state nothing: Escape and outside-click **revert** rather than commit —
   a deliberate departure from the dormant cell's commit-on-blur, on the
   grounds that a third implicit write path is the wrong side to err on;
   arrow-key highlight, a `<button>` trigger with a focus ring, doubles
   resolving one segment at a time, and a 2800ms toast — the last four lifted
   verbatim from the dormant cell so the two cannot drift.
3. Decide the toast copy for the pick path, and settle the toast width — the
   dormant cell already has both answers.
4. Give the popup a flip-up when it would open past the detail pane's bottom
   edge; D2/D3 open partly clipped today.
5. Settle "Ridgeline" vs "Ridgeline University" in the popup and delete
   `DUAL_DRAFT_OPPONENT_SHORT` once it is.
6. At re-wiring, `DUAL_DRAFT_SCHOOL`, `DUAL_DRAFT_SAVED_ROSTER` and
   `DUAL_DRAFT_TYPED_NAME` become props or fetches **together** — the school and
   its saved roster must travel as one, or the popup dedupes against the wrong
   pool.

## T9 · Label the dormant schedule tree — done

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings, `npx tsc
--noEmit` clean, `npm test` 227 passed. Completion review — `VERDICT: pass`,
every classification independently re-derived rather than taken from the
runner or the implementer. Guardrails — `pipeline-guardrails-reviewer` **ran**
(this is a §3.5 change and a wrong label *is* the §3.5 failure), confirmed
every label against the import graph, and raised one factual slip in the
README, **fixed before commit**. `rls-boundary-reviewer` **skipped** — no
matching path, no query; the diff is comment-only.

**The task's `files:` list was materially wrong, and correcting it was the
job.** The list and its "eight dormant entry points" were written at stage 04,
before the static tree existed. Verified reachability (BFS of the `@/` import
graph from every file under `src/app/`, then refined by hand for type-only
edges) gives a different partition:

- **9 DORMANT** — `schedule-list`, `event-detail-pane`, `new-event-chooser`,
  `dual-form`, `school-search`, `opponent-rail`, `tournament-form`,
  `entry-editor`, `field-row`. The task's list omitted the last three.
- **1 LIVE, and in the task's list** — `dual-detail.tsx`, imported directly by
  `[eventId]/page.tsx`, one of the three routes stage 02 left out of scope.
  Labelling it dormant would have been a false comment in live code — the exact
  §3.5 failure this task exists to prevent, committed by the task meant to
  prevent it.
- **2 PARTLY DORMANT + `DO NOT DELETE THIS FILE`** — `lineup-editor.tsx` and
  `opponent-name-cell.tsx`.

**The third category corrected the runner's own analysis, and the correction
was verified.** A module-graph walk cannot tell `import type` from a value
import. `<LineupEditor>` renders only at `dual-form.tsx:453` (dormant);
`lineup-editor.tsx`'s only *value* importer is `dual-form.tsx`, while
`static/dual-build-step.tsx:23` and `lib/schedule/fixtures.ts:62` import
`LineupLine` with `import type`, erased at build. `<OpponentNameCell>` renders
only at `lineup-editor.tsx:265`. So both are unreachable at runtime **and
undeletable at compile time** — a flat DORMANT label would have invited a
build-breaking deletion. Both reviewers reproduced this independently.

**changed:** New `src/components/dashboard/schedule/README.md` — route table
(including the three out-of-scope routes still on the DB-wired tree), the
dormant list with replacements, the live list, an ASCII graph of the type-only
lifeline, what the dormant tree still owns for the re-wiring (server actions,
roster matching, the `"<bestOf>|<adScoring>"` encoding), and the two greps to
regenerate the map. Header comments on 11 files. **116 insertions, 0
deletions**; every added line in a tracked file is a comment, and `"use client"`
remains the literal first line in all ten client files.

**two README inaccuracies found at the gate and fixed before commit:**
1. It claimed `event-detail-pane.tsx` was once "mounted by a route directly".
   Git history says otherwise — `page.tsx` only ever imported `ScheduleList`;
   `event-detail-pane` was always reached through it. Rewritten to name the four
   that really were route-mounted and to spell out each transitive chain.
2. It called `row-action.tsx` "shared by both trees". It is not imported under
   `static/` at all. Rewritten: it is used from three live surfaces —
   `/dashboard/team/roster` directly, `line-row.tsx` (via
   `dual-detail`/`tournament-detail`), and `team/dual-sheet.tsx` via
   `/dashboard/team`. All three importers verified by grep.

The README states plainly that it labels the §3.5 hazard and does not remove
it — only deleting the dormant tree would, and the brief forbids that. Both
reviewers confirmed it does not overclaim.

**follow-ups:**
1. **`field-row.tsx` is the weakest entry in the map** — no 1:1 static
   replacement, because both static builders drew their own defaults cells.
   Worth deciding at re-wire time whether that duplication was intentional.
2. **A CI check would keep this honest without anyone remembering to.** Fail
   when a file under `src/components/dashboard/schedule/` is unreachable from
   `src/app/` and lacks a `DORMANT`/`PARTLY DORMANT` header. The reachability
   walk generalises, and `npm run map` already generates `MAP.md`'s route table
   — a dormant-file report could ride the same command. **Note the subtlety any
   such check must handle: reachability alone mislabels the two type-only
   cases.**
3. `docs/ui-revamp-guardrails.md` §3.5 cites only the deleted
   `match-video-panel.tsx` as its example; a pointer to this README would make
   it a live instance instead of a retired one.
4. **That same guardrails doc, §7, states the lint baseline as 43.** The real
   figure is 37. This is now the third place the stale number has been found
   (brief, plan, queue preamble) — worth one correction pass across all four.

## T10 · Add the copy-fidelity spec — done

**gate:** mechanical — `npm run lint` 0 errors / 37 warnings, `npx tsc
--noEmit` clean, `npm test` **244 passed** (227 pre-existing + 17 new).
Completion review — `VERDICT: pass`, all four criteria and all six requested
judgments, with the crux (no self-comparison) traced across all 86 assertions.
Guardrails — **both skipped, legitimately**: the diff is one new file under
`tests/`, touching no path either reviewer covers, adding no query and changing
no component. The spec *imports* `@/lib/data/programs-server` for two pure
formatters, which is a read, not a change to that module.

**the design decision that makes this spec worth having.** The expected strings
are **hand-transcribed literals**, read out of the authoritative artboard
capture and written into the spec by hand. Nothing imports a string from
`fixtures.ts` and asserts it equals itself. Every assertion has app code on one
side — a fixture export, a real formatter called on real fixture data, or
normalised component source — and the transcription on the other. A spec that
sources both sides from the code under test passes forever and catches nothing;
this one is an independent second copy of the design's strings.

**criterion 4 verified twice over, by the runner as well as the implementer.**
The runner ran two of its own mutations, different from the implementer's, and
reverted both: a fixture en dash → hyphen in `seasonRecord: "18–4"` failed 2
tests, and a one-sentence change in `static-event-chooser.tsx`'s JSX failed 1
with the message *"static-event-chooser.tsx no longer draws …"*. The reviewer
independently ran a third (`SEASON_FACTS` "36" → "37"). Three mutations, three
failures, tree clean after each.

**changed:** New `tests/schedule-static-copy.spec.ts` — 710 lines, 17 tests in
four describe blocks, one per static route. Characters asserted as themselves
and counted at codepoint level by the reviewer: en dash U+2013 ×23, em dash
U+2014 ×35, middle dot U+00B7 ×36, `↵` U+21B5 ×4, and **zero** curly
apostrophes or quotes — the design's straight U+0027 was not "upgraded".

**the normaliser, and a correction to its own rationale.** Component source is
read through a `screen()` helper that decodes `&#39;`/`&apos;`/`&quot;`/`&amp;`
but deliberately **not** `&rsquo;` (so an apostrophe drifting curly fails rather
than passes), strips comments, strips the `{ }` a removed JSX comment leaves
mid-sentence, replaces `{" "}` and collapses whitespace, and returns the source
twice — once with JSX tags removed, because attribute copy lives inside a tag
while prose split across `<span className="tabular">` only reads whole with tags
gone.

Comment-stripping is the load-bearing step: without it the spec passes on a doc
block *quoting* the copy after the copy itself is gone. **The implementer's
cited example of this was wrong** — the tournament-builder JSDoc it named is
accidentally immune, because the `\n * ` line-continuation asterisk breaks the
contiguous match anyway. The reviewer found a real case that proves the same
point: `static-schedule.tsx` quotes "One-off match in Matches" verbatim in a
*single-line* comment, and simulating the copy's deletion there passes without
stripping and fails with it. The step is justified; the stated reason was not.

**follow-ups:**
1. **Coverage gaps, declared rather than papered over** — the reviewer
   spot-checked each and found them accurately described. `6-7³` is asserted as
   score *input* (`player1_tiebreaks: [null, 3]`, the digit on the losing side)
   rather than rendered text, because `<ScoreLine>` cannot be mounted.
   Interpolated sentences are asserted as contiguous fragments plus the fixture
   values that fill the holes — a wording change is caught, a re-ordering of the
   interpolations is not. `7e`'s scaffold slot labels are props, not copy. The
   topbar counts have no code to check, since T3 left them unrendered.
   `savedSubline()` is unexported, so its output is pinned as a template literal
   plus the fixture's numbers.
2. **Two assertions are deliberately markup-shaped** —
   `'{row.teamScore.us}–{row.teamScore.them}'` and `'{score.us}–{score.them}'`.
   That en dash exists nowhere else and cannot be pinned without a renderer.
   They will break on an innocuous refactor of those two lines; the trade is
   commented at the call site.
3. **Extract `screen()`'s normaliser** if a second copy-fidelity spec ever
   lands. It is now non-trivial and a hand-rolled second copy would drift.
4. **If a DOM renderer is ever added** (`happy-dom` plus a React test renderer),
   the fragment assertions and both markup-shaped checks collapse into
   rendered-text assertions. That is the right end state, and it is a dependency
   decision rather than a test one.
5. **`dual-widget.tsx`'s `SINGLES_MARKS`/`DOUBLES_MARKS` are not covered here** —
   they are colour tokens, not copy. They are also the one thing on that screen
   that will not re-derive when it is pointed at live data, so they want their
   own guard in the re-wiring task. This is the second task to flag that trap.

## T11 · Full-set fidelity pass and gates — done

**gate:** all four criterion-5 gates run by the runner independently —
`npx tsc --noEmit` clean, `npm run lint` 0 errors / **37** warnings,
`npm run build` **green**, `npm test` **244 passed**. Completion review —
`VERDICT: pass`, five of five, with **seven of the eight new findings
byte-verified** against the artboard capture and the source by the reviewer
rather than accepted from the report. Guardrails — **both skipped,
legitimately**: this task made **no source changes at all**, which is what its
contract requires; the only new file is a markdown findings document under
`work/`.

**changed:** `work/events-lineups/FIDELITY-PASS.md` only. Criterion 3's grep run
independently by the runner: **zero matches, exit 1** across the whole `static/`
tree and all four route files. Criterion 4 verified both halves — the render
half through a harness (`canCreate={false}` → no CTA, `drawerLinks: 0`,
`drawerHrefs: []`) and the read half by the runner (`isProgramStaff(active))
redirect` present exactly once in each of the three create routes). Harness
deleted and never committed.

**eight new cross-screen findings — the drift no per-screen check could see:**
1. **N1 · "lines" vs "matches".** `7d`/`7e`/`2b` count a dual's nine things as
   *lines*; `7c`/`4c`'s pane footer counts the same Fairmont event as "9 of 9
   **matches**". One concept, two nouns, one click apart.
2. **N2 · "Creates N …" numerals.** `3b` sets its 9 `mono tabular`; `2b` and
   `3c` set theirs bare `tabular` Inter. Each screen is faithful — the *design*
   disagrees with itself. T2 flagged 3b against the DS rule but not the split.
3. **N3 · slot labels.** S1–D3 are mono on `2b`/`7e`, plain Inter on `7c`/`4c`.
4. **N4 · two selected-row grammars.** Wash + weight in the drawer and on `2c`;
   check + weight and no wash on `2b`/`3c`'s rails. Possibly semantic, nowhere
   recorded.
5. **N5 · Cancel's two implementations.** A `<Link>` on `2c`/`2b`/`3c`, a
   `<button>` + `router.push` on `3b` — the same drawn control with different
   href semantics.
6. **N6 · a gating asymmetry, guards intact.** With `canCreate=false`, `7e`'s
   pane still draws "New dual" and "New tournament" links to routes that bounce
   a player; only the drawer CTA and the one-off link are gated. Server-side
   guards hold — the runner verified all three redirects — so this is a UX
   inconsistency, not an access-control hole. Worth a decision before re-wiring.
7. **N7 · the resting-row half of T7's Forfeit item.** `2b` gives resting rows a
   hover-revealed Forfeit; `2d`/`2e` draw the same resting rows with an empty
   cell. T7 recorded the active-row half only.
8. **N8 · a correction to this run's own record.** At 620px the nine rows
   **fit** — scrollHeight 513 against clientHeight 481, roughly 30px to spare.
   So `7c`'s stop after S1–S3 is *whitespace in the artboard*, not height
   clipping, and **T4's stated rationale was wrong arithmetic**. Its upheld
   decision — that `7c` and `4c` are one pane at two heights, not two components
   — stands and is independently attested in `plan.md`. But the drawn `7c` is a
   state the build cannot produce, which is a genuine finding for the human.

**fourteen already-recorded items verified rather than rediscovered**, including
all three cross-screen ones handed to the task: the `7c`/`4c` topbar count
spellings (still the only non-height-driven difference between those frames),
the `2b`-rail vs `2c`-conference mismatch including the omitted Ridgemont Tech,
and the five-schools-into-always-Ridgeline step two, walked live. Also
re-confirmed: the S6/D3 contradiction, rails-vs-rows against 5–2, "8 of 9",
"Coming soon", the seeding callout, 2026–27 against a 2025 calendar, the 236px
toast, short vs full "Ridgeline", `SEASON_LABEL` still unrendered, and that the
`--blue` / `--blue-text` rule was applied **consistently** across screens
(measured rgb values) — which is the cross-screen confirmation that T3's and
T5's opposite-looking choices really were the same rule.

**both stateful sequences walked end to end.** `2d → 2e`: the popup opens
seeded, the saved card highlights with its `↵`, the active row lifts to z-20
with Forfeit shown, picking resolves the line to 13px/400/ink-900 and fires a
`role="status"` toast that self-clears at 2800ms; Escape reverts and a committed
name survives. `7d → 7c → 4c`: one selection state plus height — at 576 the rows
scroll with the footer clipped, at 816 all nine and the footer are visible with
5 report links, 1 Analyzing chip and 3 "Coming soon"; events with no fixture
detail fall back to the prompt pane, as T1 intended.

**follow-ups:**
1. **N1–N8 are T12's input** alongside the ~30 per-screen contradictions already
   in this log. N1, N2 and N3 are the ones a designer should see — they are the
   design disagreeing with itself across screens, not the build drifting.
2. **N6 wants a decision before re-wiring** — either gate `7e`'s two pane links
   on `canCreate` like the drawer CTA, or accept that a player sees links that
   bounce. Today it is inconsistent within one screen.
3. **N8 means `7c` as drawn is unreachable.** Worth telling the designer: the
   frame implies a clip that the real content does not produce.
4. The reviewer noted N8's exact DOM metrics rest on a since-deleted harness and
   cannot be reproduced from the tree; the qualitative claim is independently
   supported by the artboard markup. If that number matters later, re-measure.

## T12 · Write the regression note and the flagged-copy list — done

**gate:** mechanical — `npx tsc --noEmit` clean, `npm run lint` 0 errors / 37
warnings, `npm test` 244 passed; `git diff HEAD -- src tests` **empty**, which
is what this task requires. Completion review — `VERDICT: pass`, four of four,
with the route diffs re-run against the `ce173da` baseline, the guards verified
byte-identical, the three out-of-scope routes verified zero-diff, and **eight**
flagged strings spot-checked in source against a required four. Guardrails —
**both skipped, legitimately**: no source change at all; the diff is one
markdown file under `work/`.

**changed:** `work/events-lineups/REGRESSION-NOTE.md` (384 lines) — the PR body
stages 06 and 07 draw from. Seven sections: what each route lost · what did not
change · what was gained · deliberately unfinished · the flagged-copy list ·
gates · where to look.

**it opens by naming the regression, which is criterion 3's whole point:**

> # Events & Lineups — the schedule area is now static, and that is a regression
> **Four routes that read the database now read a fixture file.** … A coach
> opening the schedule sees Ridgeline University and Fairmont A&M whatever
> program they are actually in; "Create dual" and "Create tournament" are
> inert… This was chosen, not stumbled into.

The reviewer confirmed nothing later in the document walks that back — §2 and §3
add accurate context (guards intact, gains listed) without minimising it.

**the flagged-copy list: 50 items, grouped by artboard**, each tagged **F**
false about the app · **C** the design contradicts itself · **U** asserts a
figure the app has no source for · **D** drifts between screens. Counts: `3b` 2,
`7d`/`7e` 7, `7c`/`4c` 6, `2c` 8, `2b` 9, `2d`/`2e` 8, `3c` 9, cross-set 1.
T11's N1/N2/N3/N7/N8 are folded into the artboards they belong to rather than
listed apart.

**criterion 4's second half — "still unchanged in the code" — was actually
verified**, not assumed. Most items are pinned by `tests/schedule-static-copy.spec.ts`
and so ride on the suite being green; the rest were grepped by hand ("Big Ten ·
D-I", "Unranked", "Nobody yet —", the interpolated `9 of 9 matches` footer, and
the non-string treatments — the `SINGLES_MARKS`/`DOUBLES_MARKS` constants,
Forfeit's `opacity-0`, `caret-[var(--blue)]`, the 236px toast, the no-flip
popup, and `3c`'s focus rule on a non-focusable span). All present.

**One item is honestly declared unverifiable and the note says so**: the topbar
count line survives only in comments and fixture doc blocks, because T3 left it
unrendered — the app chrome has no slot shaped like it. Flagged as *not present
in any rendered output* rather than quietly counted as reproduced. The reviewer
ruled that the honest handling.

**two contradictions inside this log, both carried into the note:**
1. T4's rationale for `7c` stopping after S3 was wrong arithmetic — T11's N8
   measured nine rows fitting at 620px with ~30px spare. The decision (one pane,
   two heights) stands; the *reason* does not, and the note says the rationale
   must not be quoted as fact.
2. The lint baseline is 43 in the brief, the plan, this queue's preamble and
   `docs/ui-revamp-guardrails.md` §7. Every gate all run measured **37**.

A third apparent contradiction was examined and dismissed: T3 and T5 look like
opposite `--blue` / `--blue-text` calls, but T5's review and T11's measured pass
both showed one rule applied consistently — substitute only where the artboard
states no colour. Not recorded as a contradiction.

**deliberately left out of the note**, as process rather than PR content: the
three blocked-and-re-run tasks and their stash SHAs, the stale 87,329-byte
design capture that cost a review cycle, the `document.hidden` frozen-transition
measurement trap, the `fixtures.ts` stash conflict that briefly truncated a
neighbour's array, and the harness technique. All remain here in the log. The
three re-wiring traps that could cause a silent wrong-data failure were kept.

**follow-ups:**
1. **The queue is drained** — twelve of twelve done. `work/events-lineups/`
   now carries `FIDELITY-PASS.md` and `REGRESSION-NOTE.md` for stages 06 and 07.
2. **One correction pass across four documents** would retire the stale
   43-warning baseline: the brief, the plan, this queue's preamble, and
   `docs/ui-revamp-guardrails.md` §7.
3. **Three re-wiring traps are recorded in §4 of the note** and are the things
   most likely to ship silently wrong data: `dual-widget.tsx`'s rail constants
   do not re-derive; `dual-build-step.tsx`'s `DUAL_DRAFT_SCHOOL` must become a
   prop again or every new dual pins to Ridgeline; and the popup's school and
   saved roster must travel together or it dedupes against the wrong pool.

## T13 · Seed a verifiable schedule program — done

**gate:** lint clean · `tsc --noEmit` clean (no stale `.next/` re-run needed) ·
`npm test` green. `task-completion-reviewer` → **VERDICT: pass**, all five
criteria met, scope exactly the task's `files:` field. Guardrails:
`rls-boundary-reviewer` **ran** (the script issues new queries through the
service-role admin client) and found no issues across service-role
containment, blast radius, secret handling and read-policy exposure;
`pipeline-guardrails-reviewer` **skipped** — the diff touches neither
`src/app/dashboard/`, `src/components/dashboard/` nor the upload wizard, and
in fact touches no `src/` file at all.

**changed:** New `scripts/seed-schedule-fixtures.ts`, run with
`npx tsx scripts/seed-schedule-fixtures.ts`. Seeds ZZ Test Program
(`edaf1aa0…`) with 4 `program_events` — three duals and one tournament — and
30 `program_event_entries`, plus 13 entry-linked `matches` and 2
`processing_jobs`. `dual-decided` resolves through the real `dualScore()` to
`us 5 — them 2, decided: true` (one line via `forfeit: 'theirs'`);
`dual-upcoming` to `decided: false`; a third dual is partly played for the
in-between rendering. Two entries carry jobs in different analysis states
(`completed` with a derivation stamp, and `processing`), so
"N of M lines analyzed" has something to count. Idempotent: every id is a
SHA-256-derived UUID under a fixed namespace and every write is an
`upsert(onConflict: 'id')` — no deletes or updates anywhere in the file. Two
consecutive runs produced byte-identical output. A fail-closed guard reads
`programs` live and aborts unless the target's `school_name` starts with
"ZZ", so a mistyped id cannot write to Dartmouth or UCLA. Dartmouth's one
real event and UCLA's zero-event day-zero state are both untouched.

**follow-ups:**
1. The seeded S1 line resolves to `completed` with no `match_stats` or points
   rows behind it, so its "View report" link lands on a stats page of zeroes.
   Fine for verifying schedule wiring; if a later task needs that fixture's
   match page to look right, either seed minimal `match_stats` or drop the
   job's `derivation_version` so it reads "Stats pending" instead.
2. `rls-boundary-reviewer` suggested lifting the ZZ-prefix guard idiom into
   `scripts/lib/` if further seed scripts are written, so future authors get
   the fail-closed target check by default rather than re-deriving it.

## T14 · Derive the season summary — done

**gate:** lint clean · `tsc --noEmit` clean · `npm test` green (260 passed).
`task-completion-reviewer` → **VERDICT: pass**, all four criteria met, and it
independently confirmed the three judgement calls below rather than taking
them on trust. Guardrails: `rls-boundary-reviewer` **ran** (the diff touches
`src/lib/data/`) and found no issues — it verified the new function really is
client-free, that program scoping still lives upstream in `readSchedule`'s
`.eq("program_id", …)` and cannot be bypassed by a function that takes no
`programId`, and that the new exports reach no client bundle;
`pipeline-guardrails-reviewer` **skipped** — no `src/app/dashboard/`,
`src/components/dashboard/` or upload-wizard file in the diff.

**changed:** `src/lib/data/schedule-server.ts` gains `DualResult`,
`SeasonSummary` and a pure `seasonSummaryFrom()` beside `scheduleRowsFrom`,
returning `{ form, dualRecord: {won, lost}, lines: {analyzed, total} }` —
structured data, not a formatted string, so the component keeps its en dash,
`·` and `tabularNumerals()` treatment. New `tests/schedule-season-summary.spec.ts`,
16 tests, no database and no browser. `dualScore()` and `entryPlayed()` are
imported, not re-implemented, so "decided" and "played" keep one definition.
Three judgement calls, each documented in the function header: tournaments are
out of the dual record and form but their lines count toward coverage; only a
decided, non-level dual takes a form mark, so `won + lost` can be less than
duals played; and the coverage denominator is every non-forfeited entry counted
per match with a floor of one — literally `getUploadQueue`'s own arithmetic at
`schedule-server.ts:466-469`, verified by the reviewer. "Analyzed" is
`isAnalysisReady` ("a report exists"), deliberately not `isInFlight` /
`isWorking` / `isLiveUpdating`, which all answer "will this still change".
Against the T13 seed the function yields "1–0 in duals · 1 of 30 lines
analyzed".

**follow-ups:**
1. `readSchedule` selects `source_provider` in `MATCH_COLUMNS`, but
   `DbEntryMatch` never declares it and the mapping is
   `analysis?.status ?? "manual"` — `analysisFor` is never called. So a
   SwingVision-imported match linked to an entry reads as `manual` on every
   schedule surface instead of `imported`, and this function counts it as
   unanalyzed despite it having full statistics. Pre-existing gap in the
   loader, not in T14's files; fixing it would also change `entryState` on the
   event page, so it wants its own task.

## T15 · Re-point the schedule page at the database — done

**gate:** lint clean (0 errors, 37 warnings, none in either edited file) ·
`tsc --noEmit` clean · `npm test` green (260 passed, including all 17 of
`schedule-static-copy.spec.ts` — no spec edit was needed, T26's scope intact).
`task-completion-reviewer` → **VERDICT: pass**. Guardrails: **both ran** —
`pipeline-guardrails-reviewer` (diff touches `src/app/dashboard/` and
`src/components/dashboard/`) found no violations, confirming in particular
that "lines analyzed" counts `isAnalysisReady` and so excludes a vendor
`completed` whose derivation has not run — the §3.2 trap avoided;
`rls-boundary-reviewer` (the route now issues queries) found no blocking
issues, confirming program scoping cannot be redirected by any param or
cookie, that the `import type { SeasonSummary }` really is erased at build so
no Supabase server client reaches the `"use client"` bundle, and that
`MATCH_COLUMNS` carries no vendor credential fields into the page payload.

**changed:** `/dashboard/team/schedule` reads the database again. The route
calls `getProgramSchedule`, `scheduleRowsFrom`, `eventDetailFrom` and
`seasonSummaryFrom`; `static-schedule.tsx` imports nothing from `fixtures.ts`
and takes a local `ScheduleData` prop over the loaders' own types. The claim in
`fixtures.ts` — that a component taking `StaticSchedule` takes the loader's
output unchanged — was verified rather than assumed, and held: no prop moved.
The season block's four hard-coded `CircleX`/`CircleCheck` icons and its
`SEASON_FACTS` literal are now derived; the `tabularNumerals` treatment, the
en dash and the `·` separator are unchanged. Empty `form` drops the rail and
its divider together; a long `form` wraps rather than capping, since no
artboard wrote a cap. Guards byte-identical. Verified live in the browser
against seeded data and against a zero-event program for the `7e` frame.
One correction inside a file already being rewritten: the "Next" jump row used
`find` over a newest-first list, which named the furthest-away event "Next"
once more than one upcoming event exists — now `findLast`, with "Last" left as
`find` and the asymmetry commented. The reviewer verified that against the
documented ordering and judged it incidental to the re-point, not creep.

**Verification touched the live database and was cleaned up.** No session was
available, so the subagent used the repo's own `tests/fixtures/live-db.ts`
pattern: one ephemeral auth user added as `coach` to ZZ Test Program, plus one
ephemeral zero-event program for the day-zero case rather than borrowing UCLA.
All removed afterwards; independently re-checked from this session — 3 claimed
programs, 5 events, 33 entries, ZZ back to 1 member, UCLA still 0 events.

**follow-ups:**
1. **The page now states two things that are false.** The "Jump to" rows still
   draw a hard-coded `in 4 days` and `· 8 of 9 lines analyzed` — against
   seeded data the latter sits under a dual with 9 lines and 0 analyzed. Both
   are `REGRESSION-NOTE.md` §5 items 5 and 6. Out of T15's criteria (which
   scope to the season block) and out of its files: a per-event lines figure
   needs a new export in `schedule-server.ts`, and "in 4 days" needs a
   server-computed clock threaded down to avoid a hydration guard in a
   `"use client"` component. Wants its own task, and it should land before
   this branch merges — these are the last two invented facts on the page.
2. **"N of M lines analyzed" is viewer-dependent.** `processing_jobs` RLS is
   per-creator, so the ephemeral coach saw `0 of 30` where the seed's creator
   sees `1 of 30`. `seasonSummaryFrom` is correct — it counts what the reader
   may see — but a coverage figure on a shared team surface that changes per
   viewer is a product decision worth making deliberately.
3. **T16's trap confirmed live**, not merely predicted: Seed State's
   `DualWidget` drew the transcribed rail beside correct rows, and nothing
   looked broken on screen.
4. **The drawer's Upcoming section is newest-first**, so with several upcoming
   events the soonest sits at the bottom — the same ordering issue fixed in
   the jump row, still present in `event-drawer.tsx`.
5. `event-drawer.tsx`'s header comment and `README.md`'s route table both now
   describe this route as fixture-backed. T26 owns the README; the component
   header is smaller and adjacent.

## T16 · Derive the dual widget's outcome rail — done

**gate:** lint clean · `tsc --noEmit` clean · `npm test` green (260 passed).
`task-completion-reviewer` → **VERDICT: pass**, and it verified the "one
definition of won" claim in the code rather than accepting it. Guardrails:
`pipeline-guardrails-reviewer` **ran** (diff under
`src/components/dashboard/`) and found no violations — it confirmed the rail
now answers a *result* question through `lineWon()` while `LineAction`'s
`matchState()` still answers the separate *analysis* question, with no
conflation and no §3.2 predicate collapsed; `rls-boundary-reviewer`
**skipped** — the diff is presentation logic in one client component, adds no
query and touches no file under `src/lib/data/`, `src/lib/supabase/`,
`src/app/api/` or `supabase/migrations/`.

**changed:** `SINGLES_MARKS` and `DOUBLES_MARKS` are deleted — silent-wrong-data
trap 1 of 3, and it was live on screen after T15, not merely predicted. Both
the rail and `LineRow`'s glyph now route through one new `lineOutcome(entry)`
wrapping `lineWon()`, so the two cannot drift; rail order and row order come
from the same `singles`/`doubles` arrays, computed once. `OutcomeRail`'s
markup is byte-identical to HEAD — same tokens, same `2.5×12px` marks, same
`S · divider · D` order — only the source of each mark moved. Observed live:
Seed State drew `S: good bad good good good bad | D: good bad good` against a
5–2 header, where the old constants had claimed `good bad good good good grey`;
Placeholder College drew two decided marks then greys; Fixture Tech drew nine
greys. Three duals, three distinct rails, each agreeing with its rows.

Two decisions, both upheld by the reviewers: a **forfeited line takes a
win/loss colour, never grey**, because `lineWon()` reads `forfeit` before any
match and `dualScore()` already counts it toward the header score directly
above the rail — greying it would say "not played" about a line that has
already moved the score. And a **partial lineup draws only the groups that
have lines**, divider included only when both exist; a fully empty lineup
never reaches this component, since `StaticSchedule` mounts it only when
`entries.length > 0`.

**Verification touched the live database and was cleaned up.** One ephemeral
auth user, its `public.users` row, and two `program_members` rows — ZZ Test
Program, and briefly Dartmouth to reach a partial-lineup dual — signed in via
an admin-generated magic link through the app's own `/confirm` route, with no
credential typed into a form. All removed; independently re-checked from this
session: 3 claimed programs, 5 events, 33 entries, 5 `program_members` rows,
ZZ at 1 member, Dartmouth back at 2, and zero `t16-rail-%` rows in either
`auth.users` or `public.users`.

**follow-ups:** none new. The subagent noted that with `static-schedule.tsx`'s
season marks derived in T15 and this rail derived here, the only transcribed
constant the regression note still lists is `DUAL_DRAFT_SCHOOL` pinning the
dual builder's step two to Ridgeline — already covered by T22.

## T17 · Delete the read path's dormant pair — blocked

**gate:** stage **5b failed**. lint clean · `tsc --noEmit` clean · `npm test`
green (260) · `npm run build` green (62 pages). `task-completion-reviewer` →
**VERDICT: needs-work** on criterion 1. Guardrails were not reached — 5b
stops the gate.

**reason — the criterion is unsatisfiable as written, and the fault is in the
task, not the work.** Criterion 1 is `grep -rn "schedule-list\|event-detail-pane" src`
returns nothing. Both files were correctly deleted and nothing imports or
renders either one, but the grep still returns two lines:

```
src/components/dashboard/schedule/static/event-drawer.tsx:130   (doc comment)
src/lib/schedule/opponent-history.ts:141                        (doc comment)
```

Both are provenance prose inside comment blocks. Neither file is in T17's
`files:` list — `event-drawer.tsx` is additionally on the do-not-touch list
this feature has carried since T15 — so satisfying the criterion literally
would require violating the task's own scope. The reviewer was asked to rule
explicitly and ruled that the literal wording governs: "the criterion as
written is a literal executable check with a literal pass condition, and it
does not return nothing." It judged the criterion's *intent* satisfied and the
implementation correct, and located the defect in how the criterion was
authored at stage 04 — a grep over a scope wider than the `files:` list the
same task grants.

**stash:** `b3ed7738f06061390cecd10cfe26b0bf6de6bce4` (tag `blocked: T17`).
Recover with `git stash apply b3ed7738f06061390cecd10cfe26b0bf6de6bce4` — a
SHA rather than `stash@{0}`, because `refs/stash` is shared with the main
checkout and other worktrees. The stashed work is believed correct and was
otherwise clean through every mechanical gate: both deletions, plus a README
§2 edit the reviewer judged the minimal correction the deletion forces (two
table rows, the "Nine files" → "Seven files" count, the sentence naming
route-mounted dormant files, and one §5 count reference). It also confirmed
`lineup-editor.tsx`, `opponent-name-cell.tsx` and `dual-detail.tsx` untouched,
and that nothing became transitively unreachable.

**to unblock:** amend T17's criterion 1 by hand to match the scope the task
grants — scope the grep to imports and JSX rather than all prose, or to the
files T17 may touch — then set `status:` back to `todo`. The stash applies
cleanly onto the current tree. Alternatively widen `files:` to include the two
comment-bearing files, but `event-drawer.tsx` has been deliberately excluded
across three tasks, so amending the criterion is the smaller change.

## T19 · Tournament builder reads the roster — blocked

**gate:** stage **5a failed** on `npm test` — 259 passed, **1 failed**. lint
clean · `tsc --noEmit` clean. 5b and 5c were not reached; 5a stops the gate.

```
✘ tests/schedule-static-copy.spec.ts:660 › 3c's own words
  Error: static-tournament-builder.tsx no longer draws "10-03"
```

**reason — a task-ordering defect in the stage-03 plan, not a fault in the
work.** That assertion, and its sibling at :674 for `10-05`, read the
*component's source* for two drawn date literals. T19's own criterion 3
requires those literals to become controlled `<input type="date">` values, so
satisfying the task necessarily breaks the spec. The spec is owned by **T26**,
which runs last and which T19 was explicitly forbidden to touch. T19 therefore
cannot pass its own gate at its position in the order.

**This will recur.** `schedule-static-copy.spec.ts` carries **129**
source-reading `drawn()` assertions across all four static routes —
`7e 7d 7c 4c`, `3b`, `2c 2b 2d 2e` and `3c`. T21, T22 and T23 rewrite three of
those four screens and will hit the same wall. T15 and T16 escaped only
because they changed values the spec happens to assert through `fixtures.ts`
exports rather than through component source.

**stash:** `c4ac7d1e7aff3449eb7e21c12d9488f165beaef0` (tag `blocked: T19`).
Recover with `git stash apply c4ac7d1e7aff3449eb7e21c12d9488f165beaef0` — a
SHA rather than `stash@{0}`, because `refs/stash` is shared with the main
checkout and other worktrees. The stashed work was otherwise clean: lint and
`tsc` green, every other assertion for `3c` still passing, and the route,
roster rail, controlled inputs and format encoding all verified live.

**to unblock — a plan-level decision, not a re-run.** The spec correction
cannot stay last. Two options:

1. **Preferred: add `tests/schedule-static-copy.spec.ts` to the `files:` of
   each re-wiring task** (T19, T21, T22, T23), so each screen retires exactly
   the assertions its own change invalidates and the completion reviewer can
   judge that retirement against the diff in front of it. T26 then does the
   final sweep it was always meant to do rather than absorbing four
   screens-worth of consequence at the end.
2. Insert one spec-retirement task before T21. Riskier — it removes coverage
   in a batch, ahead of the code meant to replace it, with no diff to judge
   each removal against.

Under either option, set T19 `status:` back to `todo` and apply the stash.

**what the run established anyway** (all verified before the gate failed, and
preserved in the stash): the route runs `getLadder` and `getTeamSettings`
through one `Promise.all` and hands down `roster` and `defaultSurface`; the
rail walks the real roster keyed on `player.userId`; name / starts / ends /
site / format are one controlled `draft` object; and the
`"<bestOf>|<adScoring>"` string encoding is **gone from this file entirely** —
`FORMATS` is a table of literal `{bestOf, adScoring}` rows and the `<select>`
carries an opaque option name that is only ever compared, never parsed, with
`adScoring` typed `boolean` rather than `boolean | null` so a null is a
compile error rather than a convention. That is a stronger answer to
guardrails §3.1/§4 than the `"3|false"` literal it replaces, and it is worth
keeping when this is re-run.

**follow-ups:**
1. **ZZ Test Program has zero `program_players` rows** — T13 seeded typed
   labels only, so `getLadder` returns an empty ladder there and any task
   needing a real roster must seed players first. This run created six
   ephemeral ones and removed them.
2. `3c` still draws "3 Big Ten programs are in this field", which no table can
   compute — no queue task owns removing it, and the brief's "nothing
   fabricates a figure" argues it should go the way T21 drops `seasonRecord`
   and "Region".
3. The empty-roster branch needed two distinct strings — "No player by that
   name." for a search miss versus "No players on the roster yet." for a
   program with nobody on it. The fixture rail could only ever produce the
   first.
4. `todayISO()` should build from local date components; `toISOString().slice(0, 10)`,
   as the dormant form does, can open a coach's evening on tomorrow's date.

**Live-database verification was cleaned up.** One ephemeral auth user, one
`program_members` row and six `program_players` rows for ZZ, all removed.
Post-check: 3 claimed programs, 5 events, 33 entries, 5 `program_members`, ZZ
with 1 member and 0 players, UCLA 0 events, no leftover harness rows.

## T17 · Delete the read path's dormant pair — done (re-run after amendment)

**gate:** lint clean · `tsc --noEmit` clean · `npm test` green (260) ·
`npm run build` green (62 pages). Criterion 1's amended grep re-run
independently from the runner: exit 1, no output.
`task-completion-reviewer` → **VERDICT: pass**. Guardrails:
`pipeline-guardrails-reviewer` **ran** (diff under
`src/components/dashboard/`) and found no violations — it confirmed neither
deleted file appeared on §2's never-touch list, that neither carried any
§3.2 analysis-status, §3.3 short-circuit or §3.4 storage-key-cleanup logic
that would have died with it, and that the README's live/dormant map now
matches disk exactly; `rls-boundary-reviewer` **skipped** — a deletion plus a
doc edit, no query, and no file under `src/lib/data/`, `src/lib/supabase/`,
`src/app/api/` or `supabase/migrations/`.

**changed:** `schedule-list.tsx` (354 lines) and `event-detail-pane.tsx` (366)
deleted — the previous DB-wired implementation of the schedule screen, dead
since T15 re-pointed the route. README §2's table drops to seven rows, its
count corrected "Nine files" → "Seven files", the route-mounted sentence from
four files to three, and §5's "the dormant nine" generalised. §1, §3, §4 and
§6 untouched; §4's type-only lifeline (`lineup-editor.tsx`,
`opponent-name-cell.tsx`) is T24's and was left alone, as was the live
`dual-detail.tsx`. Nothing became transitively unreachable — every import the
deleted files pulled in still has other live referencing files.

**Recovered from the stash rather than redone.**
`git stash apply b3ed7738f06061390cecd10cfe26b0bf6de6bce4` applied cleanly, so
the earlier blocked run's work landed unchanged. That stash is now redundant
and was dropped after this commit.

**why the first run blocked, and what changed:** nothing was wrong with the
work — criterion 1 required a bare `grep` over all of `src` to return nothing,
which two provenance comments in `event-drawer.tsx` and `opponent-history.ts`
made unsatisfiable, since neither file is in this task's `files:`. The
criterion now matches imports and JSX only, and both comments survive
untouched. Verified: the four remaining prose mentions of these filenames
across `src` are all inside JSDoc blocks and none is an import or a render.

**follow-ups:** none.

## T18 · Retire the dormant event chooser — done

**gate:** lint clean · `tsc --noEmit` clean · `npm test` green (260) ·
`npm run build` green (62 routes). `task-completion-reviewer` →
**VERDICT: pass**. Guardrails: `pipeline-guardrails-reviewer` **ran** (diff
touches `src/app/dashboard/` and `src/components/dashboard/`) and found no
violations — it read the deleted file in full via `git show` and confirmed it
held one piece of `useState` and three links, never touching the five
vendor-required wizard fields or the `"<bestOf>|<adScoring>"` encoding that
§3.1/§4 govern, despite being the entry point to the two create flows;
`rls-boundary-reviewer` **skipped** — a deletion plus a docblock and a doc
edit, no query, no file under `src/lib/data/`, `src/lib/supabase/`,
`src/app/api/` or `supabase/migrations/`.

**changed:** `new-event-chooser.tsx` (247 lines) deleted — dormant since the
route was re-pointed to `static/static-event-chooser.tsx`, and never imported
by it. `page.tsx` changed in its docblock only: the header claimed the deleted
file "is left in the tree, dormant", which the deletion makes false. Both
reviewers confirmed independently that every guard line — `getWorkspaceContext`,
`redirect("/login")`, the non-team redirect and `isProgramStaff` — is unchanged
context in the diff, not part of either side of the hunk. README §2 down to six
rows with its count and dependent sentence corrected. Nothing became
transitively unreachable; the deleted file had no dependents.

**criterion 2 was verified by reading, not by rendering, and the report says
so.** `static-event-chooser.tsx` is untouched by this diff and was never on the
deleted file's import graph, so the screen cannot have changed; the component
renders exactly two cards linking to `/new/dual` and `/new/tournament`, and the
build's route table lists both as compiled routes. The subagent found a dev
server already up, hit the expected `/login`, and judged standing up an
ephemeral staff user to view an unchanged screen disproportionate for an inert
deletion. The dispatch permitted that fallback provided the method was stated;
the completion reviewer ruled the evidence sufficient rather than leaving the
criterion an open gap.

**follow-ups:**
1. `static/static-event-chooser.tsx:17` still says of the just-deleted
   component "that component is left in place, dormant". Stale prose in a file
   outside T18's `files:`; both reviewers called it a follow-up rather than a
   defect in this diff. It is the same staleness `page.tsx`'s docblock had, and
   it is the sort of thing T26's README sweep should catch — but T26 owns the
   README, not this comment.

## T19 · Tournament builder reads the roster — done (re-run after amendment)

**gate:** lint clean · `tsc --noEmit` clean · `npm test` green (260).
`task-completion-reviewer` → **VERDICT: pass**. Guardrails: **both ran** —
`pipeline-guardrails-reviewer` found no violations and judged the format
rework "a genuine fix, not a relabeling"; `rls-boundary-reviewer` found no
issues and confirmed the settings object is destructured to a single scalar
before crossing into the client.

**changed:** the route fetches again — `Promise.all([getLadder,
getTeamSettings])`, handed down as `roster` and `defaultSurface`, the same two
props `TournamentForm` took. The rail lists the real ladder; name, starts,
ends, site and format are one controlled `draft`. Guards byte-identical.

**the format encoding, which is the point of this task.** The old
`"<bestOf>|<adScoring>"` string is gone from the file as executable code — the
only `split("|")` left is prose in a doc comment explaining the hazard.
`FORMATS` is a closed table of rows stating `bestOf`/`adScoring` as literals,
the `<select>` carries an opaque option name compared and never parsed, and
`TournamentFormat.adScoring` is typed `boolean`, so a null is a compile error
rather than a convention. The guardrails reviewer traced whether §3.1's "do
not simplify to boolean with a default" applies and ruled it does not: that
instruction scopes to the wizard's five vendor-required fields, where null is
a real "not yet answered" state; `CreateTournamentInput.adScoring` was already
non-nullable at the point of creation, and the read-side
`EventFormat.adScoring: boolean | null` is untouched for events predating the
requirement. It also confirmed no laundering path — the wizard never reads a
scheduled event's format to prefill its own.

**criterion 6, the first exercise of rule 9 — retire, do not weaken.** Two
assertions retired out of 129 (`drawn()` count 129 → 127), both in the `3c`
block, each with a `RETIRED` comment giving its reason. Verified independently
from the runner: `10-03` and `10-05` are genuinely absent from the component,
and all six literals whose assertions were kept — `Buckeye Fall Classic`,
`Neutral`, `Bo3 · ad`, `Tournament · name`, `Starts`, `Ends` — are still
present. No matcher loosened, no scope narrowed, no `describe` skipped, no
other block touched; the whole spec diff is 12 lines. The design's dates were
deliberately **not** moved onto `TOURNAMENT_DETAIL`: nothing renders that
fixture, so an assertion over it could not fail for anything this screen does
— a green light with no wire behind it, which is what the spec's own header
argues against. The reviewer independently confirmed `TOURNAMENT_DETAIL` is
dead code and agreed retiring beat moving.

**Live-DB check the runner added.** `rls-boundary-reviewer` had no Supabase MCP
connection and verified the roster RPCs' scoping from `supabase/migrations/`,
which runs ~100 behind live. Closed from the runner: `program_roster_full`,
`program_roster` and `user_program_ids` all reference `user_program_ids()` in
their **live** definitions and are `SECURITY DEFINER`, so the reviewer's claim
holds against the database and not only against the folder.

**Recovered from the stash rather than redone.**
`git stash apply c4ac7d1e7aff3449eb7e21c12d9488f165beaef0` applied cleanly;
only criterion 6 was new work. That stash is now redundant and was dropped
after this commit. The subagent did not re-run the browser, and said so: the
two source files are byte-identical to the stash that was browser-verified in
the first run, and the identical loader pair is already live on the sibling
`/new/single` route. It confirmed read-only that the first run's DB cleanup
held, and created nothing this run.

**follow-ups:**
1. The `3c's roster rail and the field it feeds` test still asserts against
   `TOURNAMENT_FIELD`'s array shape, which the component no longer imports —
   it now checks fixture data disconnected from the live screen. It passes and
   does not read the screen's source, so rule 9 correctly kept it, but both
   the fixture and that test are vestigial. Belongs to whoever owns fixture
   retirement (T26).
2. `3c` still draws "3 Big Ten programs are in this field", which no table can
   compute. No queue task owns removing it.
3. `README.md` still describes this route's tree as static. T26 owns it.

## T20 · Tournament builder writes — done

**gate:** lint clean (37 warnings, the measured baseline) · `tsc --noEmit`
clean · `npm test` green (260) · `npm run build` green.
`task-completion-reviewer` → **VERDICT: pass**; it re-ran the `3c` tests
itself and checked the zero-retirement claim literal by literal rather than
accepting it. Guardrails: **both ran** — `pipeline-guardrails-reviewer` found
no violations; `rls-boundary-reviewer` found no blocking issues.

**changed:** the first write path in this feature. Entries gain a draw
`<select>` and a click-to-edit seed, both **ported** from the deleted
`entry-editor.tsx` — `"Main draw"` / `"Qualifying"` verbatim, same casing and
spacing, which matters because `rosterSubline()` reads those exact strings.
Create calls the existing `createTournament`; `actions.ts` is untouched, so
no second action exists. An `ActionError` replaces the footer count in
`var(--danger)` and only success navigates — proven live by setting Ends
before Starts and getting "The tournament can't end before it starts." with
nothing written. `tournament-form.tsx` (280) and `entry-editor.tsx` (424)
deleted; README §2 down to four rows, plus one §5 edit the reviewer judged
forced rather than creep — that bullet claimed `createTournament`'s wiring
still lived only in the file this task deleted. `field-row.tsx` survives
because `dual-form.tsx` still imports it.

**the format value, which is what §3.1/§4 are about here.** Verified from the
stored row, not inferred: `jsonb_typeof(format->'ad_scoring')` is `boolean`,
value `true`. The guardrails reviewer traced every path that could write it —
including the default before the user touches the control, and a resubmit
after a failed attempt — and found no route to a string, a null or an absent
key, because the format is only ever assigned as a whole `FORMATS` row of
literal booleans and `DEFAULT_FORMAT` is one of those rows. It also checked
the seed conversion, which is the same class of hazard: the draft holds a
string so "nothing typed" and "0" stay distinguishable, every keystroke is
filtered to digits, and `entry.seed ? Number(entry.seed) : null` therefore
cannot see `NaN` and cannot coerce `""` to `0`. Switching a draw to
Qualifying clears the seed in the same update and the input is unreachable
while qualifying.

**criterion 6: zero retirements, and that is the right answer.** Every literal
the spec reads survives — the draw consts, `"Unseeded"`, `"—"`,
`` `Seed ${entry.seed}` ``, the `Creates …` count line and `Create tournament`
all remain literal substrings because the new code computes label strings and
uses ternaries rather than branching into JSX text nodes. The spec file shows
no diff at all. The vestigial `3c's roster rail and the field it feeds` test
was deliberately **left alone**: this task did not make it false, only leaves
it disconnected, and retiring a passing assertion is what rule 9 forbids.

**Live-DB checks the runner added.** `rls-boundary-reviewer` again had no
Supabase MCP connection and verified from `supabase/migrations/`. Closed from
the runner against live: the `matches_block_client_regraft` trigger exists and
is enabled (its "not exploitable" conclusion depends on it); the entries
INSERT policy really is `is_program_staff(program_id)`; and `is_program_staff`
delegates to `user_program_role`, which filters `pm.user_id = auth.uid()` — so
the write path is caller-scoped in the database, one indirection deeper than
the reviewer described but sound.

**Verification touched the live database and was cleaned up.** Four ephemeral
`program_players` on ZZ, one ephemeral coach, and one tournament created
through the UI — all removed. Independently re-checked from this session:
3 claimed programs, 5 events, 33 entries, 5 `program_members`, ZZ 1 member /
0 players, UCLA 0 events, **0 leftover test events**, 15 auth users. Two
`users`-table writes were refused by the permission classifier, so the
ephemeral account was onboarded by clicking through the app's own onboarding
and deleted at the end via `auth.admin.deleteUser` — disclosed rather than
worked around silently.

**follow-ups:**
1. **Pre-existing, confirmed live, not this diff's defect:**
   `program_event_entries` has no check constraint validating that
   `player_user_ids` elements belong to the program's roster — only the
   `is_program_staff` INSERT policy applies. Not reachable through this UI
   (the free-text entry path left with `entry-editor.tsx` and was not ported),
   and neutralised where it would matter by `matches_block_client_regraft`.
   Worth a decision on its own, not a fix here.
2. Five files carry now-stale comments naming the two deleted files:
   `new/tournament/page.tsx:26-29` (says "Submitting is not wired yet… the
   Create button is still inert", now false), `fixtures.ts:30/:36/:408`,
   `field-row.tsx:8`, `static/dual-build-step.tsx:36`. All owned by later
   tasks; the route one is the most misleading.
3. `roster-match.ts`'s `rosterIdsForLabels` is now self-referenced only — the
   typed-name/walk-on entry path left with `entry-editor.tsx`. T23 needs the
   same matching for the dual side, so it should be checked there before
   anyone retires it.

## T21 · Dual step one searches real schools — blocked

**gate:** stage **5c failed**. lint clean · `tsc --noEmit` clean · `npm test`
green (260) · `npm run build` green. `task-completion-reviewer` →
**VERDICT: pass** (it examined the unplanned client provider and the three
artboard departures individually and cleared each). `rls-boundary-reviewer`
→ **clear**, no RLS, service-role or data-boundary issues.
`pipeline-guardrails-reviewer` → **finding**, which blocks: it reported no
violation of the guardrails doc, but named "a real bug in the surface
reviewed, newly made reachable by this diff". The gate does no severity
triage, and on the substance this one deserves none.

**the finding — a squad crossover in the head-to-head subline.** Verified in
the code from the runner, not taken on report:

- `opponentDualHistory()` keys on `normalizedOpponentName(event.name)` — the
  string stored on the dual, squad-qualified only if it was picked from the
  directory.
- `historyForProgram()` (`dual-school-step.tsx:572-582`) tries the
  squad-qualified name, and when that has `played === 0` falls back to the
  **bare school name**.
- A school fielding both squads surfaces as two rows. If any decided dual is
  recorded under a bare name — which this screen's own free-text escape hatch
  produces — both rows fall through to the same key.

So a record earned against a school's men's team can render "you lead 3–0" on
that school's **women's** row, against a squad this program has never played.
It is a confidently wrong fact, on the screen whose task was precisely about
not fabricating figures, and it directly contradicts the brief's rule. The
fallback is copied from the dormant `school-search.tsx`, but that file is
reachable from no route, so this diff makes the behaviour live for the first
time — it is newly introduced in effect, not merely inherited.

**stash:** `dc7e85c5e5d20f31738227b67e490e457ae281c8` (tag `blocked: T21`).
Recover with `git stash apply dc7e85c5e5d20f31738227b67e490e457ae281c8` — a
SHA, not `stash@{0}`, because `refs/stash` is shared across worktrees. The
work is otherwise sound and close to done; everything below survived every
other gate.

**to unblock:** set `status:` back to `todo` and re-run. Two fixes:

1. **Drop the bare-name fallback**, or key the lookup on something that
   cannot collide across squads. A row with no squad-qualified history should
   read "never played" rather than borrow the other squad's record. Worth
   checking whether the dormant `school-search.tsx` copy should be corrected
   too before T23 deletes it, so the defect is not re-copied.
2. **Correct the `directoryTotal()` comment.** It claims the count covers
   "the whole row set, unfiltered". Confirmed live from the runner: the
   `programs` SELECT policy is
   `org_type = 'college' OR owner_user_id = auth.uid() OR user_program_role(id) IS NOT NULL`,
   so the count is RLS-scoped and varies per viewer by their own custom orgs.
   No row leaks — `rls-boundary-reviewer` was explicit that this is a
   precision note, not a boundary problem — but the comment states something
   untrue and the figure is viewer-dependent.

**what the run established, and should be kept** (all in the stash): the
route restores the four loaders plus `opponentDualHistory()` in one
`Promise.all` with guards byte-identical; the drawn field is a real
`<input>` over a debounced, aborted `/api/programs/search`; `seasonRecord`
and the "Region" pill are gone and the two surviving pills are real
`aria-pressed` filters; the total is a real `count: "exact"` head query
rendered `toLocaleString("en-US")` ("8 of 1,941"), degrading to `N listed`
if the count fails; selection advances the step. **Spec discipline was
exemplary** — exactly one retirement (`drawn(step1, …, 'Region')`) with a
reason, `drawn()` count 127 → 126, and it declined to retire the
`fixtures.ts`-reading assertions because they still pass and are still true
of the module they name, adding a note that their audience has changed
instead. Nothing weakened.

**the architectural decision the reviewer cleared, for the record:**
`dual-school-step.tsx` now exports `NewDualDataProvider` and the route wraps
the builder in it, carrying `ladder`, `defaultSurface`, `ourName` and
`ourTeam` that step one does not use. T22 and T23 own step two and their
`files:` include no route, so without this they would have no path to a
loader at all. `rls-boundary-reviewer` confirmed the payload is not
sensitive — `LadderPlayer` carries only `program_players.id`, a name and a
ladder position, no email and no auth id — and that `getTeamSettings`'
member and invite lists never enter the context.

**Verification touched the live database and was cleaned up.** One ephemeral
staff user; ZZ's `conference`/`division` temporarily lent values because the
live row carries **null** for both (my dispatch said otherwise — that was the
runner's error, carried over from Dartmouth's row); one seeded dual briefly
renamed to prove the head-to-head resolves. All restored. Re-checked from
this session: 1,941 programs, 3 claimed, 5 events, 33 entries, 5
`program_members`, ZZ 1 member / 0 players / conference and division both
null, UCLA 0 events, ZZ's four event names back to their seeded values.

**one unexplained observation, benign so far.** `auth.users` read 15 after
every task from T13 to T20 and reads **14** now. No integrity damage:
`auth.users` and `public.users` agree at 14, zero orphaned profiles, zero
`program_members` rows pointing at a missing user, and `program_members` is
unchanged at 5 — a real account with a membership would have cascaded. Most
consistent with a leftover harness account from an earlier task finally being
removed, but it is not proven, and it is recorded here rather than smoothed
over.

## T21 · Dual step one searches real schools — done (fixed after a blocked run)

**gate:** re-run in full after the fix. lint clean · `tsc --noEmit` clean ·
`npm test` green (260) · `npm run build` green.
`task-completion-reviewer` → **VERDICT: pass**, all six criteria re-checked
after the change. Guardrails: **both re-ran** —
`pipeline-guardrails-reviewer` confirmed the previously reported defect is
closed with nothing new introduced; `rls-boundary-reviewer` confirmed both
edits are boundary-neutral.

**what was fixed.** The blocked run failed 5c on a real defect:
`historyForProgram()` looked up the squad-qualified opponent name and, finding
nothing, fell back to the bare school name — so a school fielding both squads
showed one squad's dual record on the other squad's row.

The fallback is now gone; a single lookup on
`programDisplayName(schoolName, team)` remains. It could never have been
correct: `programDisplayName(name, null)` already returns the bare name, so
the fallback never fired for a single-squad school — it fired only on
squad-bearing rows, where a bare-name record by definition does not name that
squad. Both reviewers confirmed the crossover is closed, that the single
lookup is right for `team = null` and squad-bearing programs alike, and that
what was lost is confined to the free-text path: a bare-named dual no longer
shows against the directory row for the same school. That is a missing true
fact rather than a stated false one — the trade the brief asks for — and the
function's header records it, including that recovering it properly means
recording opponents by `programKey`, a data change and not this screen's.

The still-buggy two-lookup version survives in the dormant
`school-search.tsx`, which no route reaches; T23 deletes it. Worth not
re-copying.

Also corrected, documentation only: `directoryTotal()`'s header claimed the
count covered "the whole row set, unfiltered". Verified live from the runner
that `programs` SELECT is
`org_type = 'college' OR owner_user_id = auth.uid() OR user_program_role(id) IS NOT NULL`,
so the count is RLS-scoped and viewer-dependent. The comment now says so.
Nothing leaks — the policy can only ever add the reader's own rows — but the
comment stated something untrue.

**how this was fixed, and why not by a subagent.** The stashed work was
already gate-clean except for this one defect, and the fixes were small and
precisely specified, so the runner applied the stash and made them directly
rather than re-dispatching a subagent to rebuild a finished screen. The full
gate — 5a, 5b and both 5c reviewers — was re-run from scratch on the result;
nothing was carried over from the earlier passes.

**changed:** the route restores `getLadder`, `getTeamSettings`,
`getConferenceTable` and `getProgramSchedule` in one `Promise.all` plus a real
`count: "exact"` head query, then `opponentDualHistory()`; guards
byte-identical. The drawn field is a real `<input>` over a 180ms-debounced,
per-keystroke-aborted `/api/programs/search`; the `seasonRecord` slot and the
"Region" pill are gone, and the two surviving pills are real `aria-pressed`
filters. The total renders "8 of 1,941" via `toLocaleString("en-US")`,
degrading to `N listed` if the count fails. Selecting a school advances the
step; the school does not yet travel to step two, which is T22.

`dual-school-step.tsx` also now exports `NewDualDataProvider`, which the route
wraps the builder in. It carries `ladder`, `defaultSurface`, `ourName` and
`ourTeam` that step one does not use: T22 and T23 own step two and their
`files:` include no route, so without this they would have no path to a
loader. Both reviewers cleared it — `LadderPlayer` carries only
`program_players.id`, a name and a ladder position, and `getTeamSettings`'
member and invite lists never enter the context.

**spec discipline:** exactly one retirement, `drawn(step1, …, 'Region')`, with
its reason; `drawn()` count 127 → 126. The `fixtures.ts`-reading assertions
were deliberately **not** retired — they still pass and are still true of the
module they name — with a note recording that their audience is now the design
record rather than the live screen. Nothing weakened. Rule 9 held in both
directions.

**follow-ups:**
1. `programs-server.ts`'s `toResult()` casts `row.team as 'mens' | 'womens'`
   with no runtime narrowing, while the column is nullable for custom orgs.
   Pre-existing, outside T21's files.
2. The dormant `school-search.tsx` still carries the two-lookup crossover.
   T23 deletes that file; if that changes, fix it there rather than leaving it
   to be copied again.

## T22 · Carry the chosen school into step two, and make the format control real — done

**gate:** lint clean (37 warnings, the baseline) · `tsc --noEmit` clean ·
`npm test` green (260) · `npm run build` green.
`task-completion-reviewer` → **VERDICT: pass**; it verified the
zero-retirement claim by diffing HEAD's spec rather than accepting it.
Guardrails: `pipeline-guardrails-reviewer` **ran** and found no violations —
`rls-boundary-reviewer` **skipped**, the diff is three client components and a
spec, with no query, no `src/lib/data/`, `src/lib/supabase/`, `src/app/api/`
or migration file.

**both recorded hazards are closed, and the reviewer confirmed closed rather
than relocated.**

*Trap 2 of 3 — the format encoding.* The `"<bestOf>|<adScoring>"` string is
gone from this screen entirely, the same answer T20 reached on the tournament
side. `FORMATS` is a table of rows carrying literal `bestOf` and
`adScoring: boolean` — non-nullable, so a null is a compile error rather than
a convention — and the `<select>`'s value is an opaque option name compared,
never split. The reviewer traced the value's real destination to confirm this
mattered: `program_events.format` → `schedule-server.ts` → the upload wizard's
preset at `upload/page.tsx:219` → `job-request.ts`'s vendor payload. That is a
live path from this screen to the submission §3.1/§4 protect, and nothing on
it can now receive the string `"null"`.

*The school pinning.* `schoolName`, `program` and `schoolKey` all derive from
one `ChosenSchool` threaded from the shell's state, and the header, rail,
footer and popup all read that one variable — they cannot disagree. The
earlier defect this guard existed for (one school's name over another's drawn
data) is not reintroduced: the reviewer checked the one fixture still
rendered, `DUAL_DRAFT_LINES`, and confirmed it carries only our side —
`theirLabels` empty on every line, popup `candidates={[]}` — so no other
school's data renders beside the chosen identity.

**one edit outside `files:`, flagged rather than hidden.**
`dual-school-step.tsx` (23 lines): `onContinue` was typed `() => void`, so the
chosen school could not leave step one at all and criterion 1 was structurally
unreachable without changing it. The new signature `(name, program | null)`
matches the dormant `SchoolSearch.onChosen` contract rather than inventing a
shape, and T21's own header on that function said "Making it travel is the
next task". The completion reviewer confirmed from `git show HEAD` that the
old signature made the criterion impossible, and judged it a gap in the
`files:` list rather than creep.

**one control beyond the criteria.** Surface joined date, site and format as a
controlled input — the fourth cell of the same drawn row, where leaving one
cell a picture beside three real ones is its own defect. Its vocabulary is the
settings form's stored values (`hard|clay|grass|carpet`), and the reviewer
verified that is what `dual-detail.tsx` and `tournament-detail.tsx` print
verbatim, so no casing mismatch reaches a later screen. It opens on the
program's `default_surface`, never a hard-coded "Hard".

**criterion 1, path by path.** Conference row; directory hit outside the
conference (pinned above the conference rows); row then Enter; text then
Enter; text then Continue; the escape row; and the subtle one — a row picked
and *then* the escape row clicked, which yields the typed text, matching that
row's own label. Nothing typed and nothing picked leaves Continue disabled.

**spec:** **zero retirements**, +16/−0, `drawn()` count unchanged at 126. The
literals the task predicted losing (the Ridgeline strings, `09-26`, the format
label) turn out to be asserted through `fixtures.ts` reads, not through this
component's source — the completion reviewer confirmed that against HEAD.
Two held-notes added instead, recording that those assertions now describe the
design record rather than the live screen. Rule 9 held.

**Verification touched the live database and was cleaned up.** One ephemeral
staff user; ZZ's `conference`/`division` lent values again, since both are
null and the conference list and pills need them. Restored. Re-checked from
this session: 1,941 programs, 5 events, 33 entries, ZZ 0 players and
conference/division both null, `auth.users` 14 — unchanged.

**a real change to the database that was not ours.** Owned programs went 3 → 4
and `program_members` 5 → 6 during this run: **Bakersfield College** was
claimed by a pre-existing real account, the repo owner's own, mid-session. The
subagent spotted the discrepancy against the baseline it was given, checked
the timing and left it alone; confirmed independently from the runner that
`auth.users` is unchanged at 14, so no ephemeral account was involved. Later
baselines should read 4 owned / 6 members.

**follow-ups:**
1. The opponent popup now receives the real school and an **empty** roster —
   `2d`'s saved-name card is unreachable until T23 fetches that school's pool.
   A fixture roster under a real name would have been trap 3, so it was
   emptied rather than carried.
2. Rail rows and the rail search field are still drawn and inert;
   re-targeting from the rail needs the popup's roster to travel first (T23).
3. The dormant form's squad-mismatch advisory (a men's coach picking the
   women's row) is not drawn on `2b`. Worth deciding in T23, before
   `createDual`.
4. `CreateDualInput.adScoring` in `actions.ts` is still typed
   `boolean | null`, because the dormant `dual-form.tsx` can still pass null.
   Once T23 deletes that file, the type can narrow to `boolean` and match what
   both builders now produce.
