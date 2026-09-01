# Plan — team-schedule-db-wiring

13 steps. Each is sized for one fresh subagent context and touches one
surface. Dependencies are stated per step; the graph is at the end.

---

## Corrections to the design, found while sizing

Four items in `02_design/output/design.md` do not survive contact with the
components. They are recorded here rather than edited into the design
(pipeline invariant 2), and three of them **remove** work.

**C1 — Three of the five "header strings" render nowhere.** `PROGRAM_NAME`,
`USER_NAME` and `SEASON_LABEL` have no consumer anywhere in `src/`; their
only references are `tests/schedule-static-copy.spec.ts`. The program name
and the viewer's name are already real on screen, supplied by the app's own
sidebar and header — which is exactly what `event-drawer.tsx`'s header
records: "Both are the app's own chrome … and are already on screen by the
time this renders." **No work.** The design's header-strings table
over-scopes by three rows.

**C2 — The drawer's "6 events · 2 upcoming · 4 completed" is not rendered.**
`event-drawer.tsx`'s header: the topbar count is the "one drawn element with
nowhere to go … Left unrendered rather than approximated; reported as a
divergence." Computing it would mean *adding* a header element no artboard
draws, which the brief's first non-goal forbids. **No work.**

**C3 — `Workspace.season` is unnecessary.** The design added it to back
`SEASON_LABEL`. Nothing renders a season year: `static-schedule.tsx:137`
draws the literal word "Season" as an eyebrow label, not a year.
Dropping it avoids changing a load-bearing shared type for nothing. **No
work.**

**C4 — The upcoming/completed rule conflicts, and needs your decision.**
The design specifies a date partition. `event-drawer.tsx:50-51` already
partitions by `playedCount`, and its header gives three reasons:

1. the fixture calendar is Sept 2025, so a date split would file every drawn
   row under Completed — *this reason dies with the fixtures*;
2. "`playedCount` is the durable signal — an event with no line played has
   not happened" — survives;
3. it avoids a clock read in a `"use client"` component that would need
   hydration guarding — survives.

**Recommendation: keep `playedCount`.** It satisfies the design's own stated
goal ("Two rules that can disagree about one row are the defect this
avoids") with no change to a drawn screen and no hydration hazard. Step 3
assumes this. If you prefer the date rule, say so before step 3 runs — it
changes which section a row lands in, and adds a server-computed "today"
threaded down as a prop.

**C5 — the season block is two targets, not one.** Beside `SEASON_FACTS`,
`static-schedule.tsx:141-163` draws **four hard-coded form marks**
(`CircleX`, `CircleCheck` ×3) with a comment saying they are deliberately
NOT derived, because the artboard claimed a fourth dual the fixtures never
named. That reason also dies with the fixtures. Step 2 derives both.

---

## Steps

### 1 — Seed a verifiable program

- **Files:** new `scripts/seed-schedule-fixtures.ts` (or equivalent);
  no `src/` changes.
- **Change:** idempotent seed of `program_events` and
  `program_event_entries` against **ZZ Test Program**
  (`edaf1aa0-b346-4a9f-aa8d-d47d586d25a4`, active, mens, 1 member, 0 events)
  — the designated test program, so no real user's rows are touched. Must
  produce: several events across duals and at least one tournament; at least
  one decided dual and one undecided; entries linked to matches in more than
  one analysis state; and one program left with zero events for the `7e`
  day-zero frame (UCLA, 0 events, already serves).
- **Verification:** re-running the script twice leaves the same row counts;
  `select` over the seeded program returns the intended spread.
- **Depends on:** nothing. **Run first** — every later step's verification
  needs it. Live counts today are 1 event, 3 entries, **0 matches linked to
  any entry**, so without this a correctly wired page is
  indistinguishable from a broken one.

### 2 — `seasonSummaryFrom`, pure

- **Files:** `src/lib/data/schedule-server.ts` (+~40 lines);
  new `tests/schedule-season-summary.spec.ts`. Reads
  `src/lib/schedule/entry-state.ts` for `dualScore` / `entryPlayed`.
- **Change:** exported pure function over a `ProgramSchedule`, returning the
  form sequence (per completed dual, won/lost — C5's marks), the dual record
  (`3–1`), and lines analyzed over lines total (`31 of 36`). Exported beside
  `scheduleRowsFrom` for its stated reason: "so this mapping can be tested
  without a database."
- **Verification:** unit spec, no DB — zero events; one undecided dual;
  mixed decided/undecided; a forfeit; all lines analyzed; none analyzed.
- **Depends on:** nothing.

### 3 — Re-point `/dashboard/team/schedule`

- **Files:** `src/app/dashboard/team/schedule/page.tsx`;
  `src/components/dashboard/schedule/static/static-schedule.tsx` (416).
- **Change:** route calls `getProgramSchedule`, `scheduleRowsFrom`,
  `eventDetailFrom` and `seasonSummaryFrom`, and passes the result to the
  component's existing `{rows, details}` prop plus a new `summary` prop.
  Remove the `SEASON_FACTS` import and the four literal marks. Keep the
  `isProgramStaff` / `canUploadForProgram` guards exactly as they are.
- **Verification:** `npm run build`; the seeded program renders its events
  with real scores; UCLA renders the `7e` frame; two programs' schedules do
  not bleed (RLS already enforces this — confirm by switching workspace).
- **Depends on:** 1, 2.
- **Note:** `event-drawer.tsx` and `dual-widget.tsx` are already fully
  prop-driven and import no fixtures — they need no edit, which is what
  keeps this step inside one context.

### 4 — Delete the read path's dormant pair

- **Files:** delete `schedule-list.tsx` (354) and `event-detail-pane.tsx`
  (366); update `src/components/dashboard/schedule/README.md` §2.
- **Change:** deletion only.
- **Verification:** `grep -rn "schedule-list\|event-detail-pane" src` returns
  nothing; `npm run build`.
- **Depends on:** 3.

### 5 — `/new` chooser

- **Files:** `src/app/dashboard/team/schedule/new/page.tsx` (guards only,
  likely untouched); delete `new-event-chooser.tsx` (247); README §2.
- **Change:** `StaticEventChooser` "reads nothing" and needs nothing; this
  step confirms that and retires the dormant twin.
- **Verification:** both destinations reachable; `npm run build`.
- **Depends on:** 4 (README edits serialise).

### 6 — Tournament builder: route reads, fields become real

- **Files:** `src/app/dashboard/team/schedule/new/tournament/page.tsx`;
  `static/static-tournament-builder.tsx` (566). Reference:
  `tournament-form.tsx` (280).
- **Change:** route fetches `getLadder` and `getTeamSettings` in parallel
  and hands them down, "the same two props it always did" per its own
  header. The five literal fields (name, starts, ends, site, format) become
  controlled inputs; the roster rail renders the real ladder.
- **Verification:** fields accept input and hold state; rail lists the
  seeded roster; nothing submits yet.
- **Depends on:** 1.

### 7 — Tournament builder: entries and submit

- **Files:** `static/static-tournament-builder.tsx`; reads
  `src/lib/schedule/actions.ts` (`createTournament`). Reference:
  `entry-editor.tsx` (424). Delete `tournament-form.tsx`,
  `entry-editor.tsx`; README §2.
- **Change:** entries add/remove/seed/draw against the rail; submit through
  `createTournament`; `ActionError` surfaced.
- **Verification:** a tournament created through the UI appears in the
  schedule list and opens at `[eventId]`; `format` lands as jsonb
  `{"best_of": …, "ad_scoring": …}` and never as a string.
- **Depends on:** 3, 6.

### 8 — Dual step one: the school directory

- **Files:** `static/dual-school-step.tsx` (344);
  `src/app/dashboard/team/schedule/new/dual/page.tsx`. Reference:
  `school-search.tsx` (517).
- **Change:** route fetches `getLadder`, `getTeamSettings`,
  `getConferenceTable`, `getProgramSchedule`, then `opponentDualHistory()`
  over the last. The drawn field becomes a real `<input>`; the `<span>` rows
  become selectable controls via `advButton()` where a button is right.
  Per the design: **drop the `seasonRecord` slot** and **drop the "Region"
  control** (neither has any source), and **compute the directory total**
  (a count is cheap and this one is backable).
- **Verification:** typing filters the list; the total is real; selecting a
  school advances the step.
- **Depends on:** 1.

### 9 — Dual step two: the school travels, and the format control

- **Files:** `static/static-dual-builder.tsx` (52);
  `static/dual-build-step.tsx` (622). Reference:
  `docs/ui-revamp-guardrails.md` §3.1 and §4.
- **Change:** the chosen school now travels to step two — `static-dual-
  builder.tsx`'s header states the re-wiring "DOES have to make the school
  travel", and its current flag-only state is a deliberate defence against
  one school's name sitting over another's data. Date, site and format
  become real controls.
- **⚠ Highest-risk edit in the run.** `FORMAT_VALUE = "3|false"` is
  hard-coded because an interpolated `adScoring` of `null` becomes the
  string `"null"`, which the decoder's `adScoring === "true"` reads as a
  confident `false` — "a wrong answer that looks like a real one", and the
  exact failure that made every tournament video fail submission long after
  the coach had left. The control must carry an explicit boolean. Read
  `dual-build-step.tsx`'s header and guardrails §4 before editing.
- **Verification:** the header names the school actually picked, for every
  path through step one; format round-trips to jsonb with `ad_scoring` a
  real boolean for both settings; never the string `"null"`.
- **Depends on:** 8.

### 10 — Dual step two: lineup editing and submit

- **Files:** `static/dual-build-step.tsx`; reads `actions.ts`
  (`createDual`). Reference: `dual-form.tsx` (503), `lineup-editor.tsx`
  (474). Delete `dual-form.tsx`, `school-search.tsx`, `opponent-rail.tsx`,
  `field-row.tsx`; README §2.
- **Change:** lines editable against the real ladder with roster matching;
  submit through `createDual`.
- **Verification:** a dual created through the UI appears in the list, opens
  at `[eventId]`, and its lines carry the players chosen.
- **Depends on:** 9.

### 11 — The type-only lifeline

- **Files:** `lineup-editor.tsx` (474), `opponent-name-cell.tsx` (414);
  wherever `LineupLine` should now live.
- **Change:** port the `LineupLine` type and, if still needed,
  `OpponentNameCell`, then delete both files **only if** step 10 leaves them
  genuinely unused. The brief explicitly permits them to survive the run —
  leaving them is an acceptable outcome, deleting them while something still
  compiles against them is not.
- **⚠** README §4 flags `opponent-name-cell.tsx`'s re-target `key` contract
  as required reading before touching it, and it was **not** read during
  design — carried forward as design open question 3.
- **Verification:** `npm run build`; `grep -rn "LineupEditor\|OpponentNameCell" src`.
- **Depends on:** 10.

### 12 — The two already-live routes

- **Files:** none expected. `[eventId]/page.tsx`,
  `single/[matchId]/page.tsx` and their detail components, read-only.
- **Change:** verification pass. These are already DB-wired; the check is
  that six routes now agree about one event.
- **Verification:** an event created in step 7 or 10 opens correctly; a
  seeded single match opens; no double-fetch introduced.
- **Depends on:** 7, 10.

### 13 — Tests and the map

- **Files:** `tests/schedule-static-copy.spec.ts` (710);
  `src/lib/schedule/fixtures.ts` (1108) — import-graph demotion only;
  `src/components/dashboard/schedule/README.md`.
- **Change:** per the design's three-part resolution — keep the assertions
  over `fixtures.ts` exports as the design record, retitle the spec for what
  it now guards, and delete or move every assertion that reads component
  *source* for a literal this run interpolates. Rewrite the README to the
  tree as it then stands: §2 and §4 should be gone, §6's regeneration note
  stays.
- **Verification:** `npm run lint`, `npm run build`, `npm test` all green;
  no route under `src/app/` imports `fixtures.ts`.
- **Depends on:** all.

---

## Dependency graph

```
1 (seed) ──┬─→ 3 ─→ 4 ─→ 5
2 ─────────┘   │
               ├─→ 7 ──────────┐
1 ─→ 6 ────────┘               ├─→ 12 ─→ 13
1 ─→ 8 ─→ 9 ─→ 10 ─→ 11 ───────┘
```

Steps 1 and 2 are independent and can run in either order. Steps 6 and 8
both need only the seed, so the tournament and dual tracks are independent
of each other until step 12.

## Test strategy

**Four layers, because the failure modes are different at each.**

1. **Unit, no database** — `seasonSummaryFrom` (step 2). The derivations are
   pure by construction, following `scheduleRowsFrom`'s precedent, and the
   boundary cases (no events, undecided duals, forfeits) are cheap here and
   expensive anywhere else.
2. **Render against seeded data** (steps 3, 6, 8) — that the wired screens
   draw real rows, and that an empty program still lands on the `7e` frame.
   This layer is why step 1 comes first.
3. **Write round-trip** (steps 7, 10) — created through the UI, read back
   through the list and the event page. The assertion that matters most is
   structural, not visual: `format` is jsonb with real booleans. Guardrails
   §4's whole point is that a wrong value here renders a page that looks
   entirely correct.
4. **Isolation** — two programs' schedules never bleed. RLS already enforces
   this (`SELECT` is `program_id IN user_program_ids()`; writes are
   `is_program_staff`), so this is a confirmation, not a new guarantee.

**What the existing suite cannot tell us.** `schedule-static-copy.spec.ts`
asserts over `fixtures.ts` exports and over component source text — never
over a rendered page. Demoting `fixtures.ts` to test-only therefore leaves
most of it green while it stops describing anything a user sees. Step 13
exists so the suite's meaning is corrected deliberately rather than
discovered later by someone trusting a passing run.

**Regression watch:** `npm run build` after every step that deletes a file
(4, 5, 7, 10, 11) — the type-only lifeline in README §4 means the import
graph lies about what is safe to remove.

## Also consulted

Declared inputs were `02_design/output/design.md` and
`01_brief/output/brief.md`; `references/` was empty. Beyond those, to size
steps and to check the design against the code:

- `wc -l` over the dormant tree, the `static/` tree and the schedule data
  layer — every line count quoted above
- `src/components/dashboard/schedule/static/static-schedule.tsx` (the season
  block, lines 125–175, and its fixture imports) — C1, C5
- `src/components/dashboard/schedule/static/event-drawer.tsx` (lines 18–80)
  — C2, C4
- `static/dual-school-step.tsx`, `dual-build-step.tsx`,
  `static-tournament-builder.tsx`, `dual-widget.tsx`,
  `static-event-chooser.tsx` — which fixture constants each imports
- `tests/schedule-static-copy.spec.ts` — the only consumer of
  `PROGRAM_NAME`, `USER_NAME`, `SEASON_LABEL`
- `src/lib/workspace/types.ts` — that nothing renders a season year (C3)
- **Live database** via Supabase MCP, project `pouxujkhtbvkdwbzfvka`:
  claimed programs with member and event counts, to name a seed host that is
  not a real user's program
