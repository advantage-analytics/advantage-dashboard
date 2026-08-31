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
