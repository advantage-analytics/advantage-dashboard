
---

> **Amended after this stage ran — the branch queue is authoritative.**
> On 2026-09-01, T17 and T19 blocked during stage 05 on defects in these task
> definitions, and `.claude/tasks/claude-new-session-c3f1ab.md` was amended:
> T17's criterion 1 grep was narrowed to imports and JSX (it had scoped wider
> than the task's own `files:`), and `tests/schedule-static-copy.spec.ts` was
> added to T19–T23 with a matching criterion, because that spec reads component
> *source* and a task forbidden to touch it cannot pass its own gate. See rule 9
> in the queue. This file stays as the record of what stage 04 originally
> produced; read the queue for current task state.

# Re-wiring the schedule to the database — T13–T26

> Scope: `work/team-schedule-db-wiring/`. Appended by pipeline stage 04 from
> `work/team-schedule-db-wiring/03_plan/output/plan.md`.

## Rules T13–T26 inherit — these SUPERSEDE the rules above

The twelve tasks above ran the events-lineups static rebuild. **Their rule 5
— "No database. No Supabase import, no server action, no loader call anywhere
under `static/`" — is exactly what this feature reverses.** Rules 1, 3, 4, 7,
8 and 9 above still hold. Rules 2, 5 and 6 do not apply as written; read the
list below instead.

1. Read `docs/ui-revamp-guardrails.md` before any dashboard UI change. §3.1
   and §4 govern the format encoding and are live seams, not documentation.
2. **The `static/` tree may now read and write.** Routes fetch through the
   existing server loaders; components take real props. Nothing new is
   invented at the data layer — `getProgramSchedule`, `scheduleRowsFrom`,
   `eventDetailFrom`, `getLadder`, `getTeamSettings`, `getConferenceTable`,
   `opponentDualHistory`, `createDual` and `createTournament` all exist.
3. **Routes keep their guards** — `getWorkspaceContext()`,
   `redirect("/login")`, the non-team redirect, and the role gate. RLS is the
   authorization (`SELECT` is `program_id IN user_program_ids()`; every write
   is `is_program_staff`); the guards only turn a refusal into a redirect.
4. **Preserve the rebuild's appearance.** The brief's first non-goal: the
   events-lineups visual result is the target to preserve, not a starting
   point to improve on. A drawn control becoming a real control keeps its
   drawn appearance — `advButton()` and the existing variants.
5. **Never fabricate a figure to fill a designed slot.** Where the schema
   cannot back a drawn value, remove the slot and say so. Three are already
   known unbackable and are handled in T21.
6. `src/components/dashboard/schedule/README.md` is the authority on which
   files are live and which are dormant. Read it, not a paraphrase, and do
   not treat "has a static counterpart" as evidence a file is dead.
7. **Three silent-wrong-data traps** are recorded in
   `work/events-lineups/REGRESSION-NOTE.md` §4. Each has a task below:
   T16 (the outcome rail), T22 (the Ridgeline pin and the format encoding),
   T23 (the popup's school and roster travelling together). Each renders a
   screen that looks entirely correct while being wrong.
8. The queue preamble's "43-warning baseline" is **stale** — the
   events-lineups gates all measured 37. Compare against a fresh measurement,
   not against either number.

## T13 · Seed a verifiable schedule program
- **status:** todo
- **model:** fable
- **files:** `scripts/seed-schedule-fixtures.ts` (new, guess); no `src/` changes
- **done when:**
  - [ ] Running the script against ZZ Test Program (`edaf1aa0-b346-4a9f-aa8d-d47d586d25a4`) creates at least four `program_events` — three duals and one tournament — with their `program_event_entries`, and writes rows under no other `program_id`
  - [ ] At least one seeded dual has every line decided and at least one has none, so `dualScore()` returns both a decided and an undecided result
  - [ ] At least two seeded entries link to `matches` rows in different analysis states, so "N of M lines analyzed" has something to count
  - [ ] Running the script twice leaves the same row counts as running it once
  - [ ] Every seeded event's `format` is jsonb carrying an explicit boolean `ad_scoring`, never the string `"null"`
- **notes:** ZZ Test Program is the designated test program — active, mens, one member, zero events at time of writing. Live counts before this task: 1 event, 3 entries, **0 matches linked to any entry**, which is why a correctly wired page would otherwise be indistinguishable from a broken one. UCLA already has zero events and serves as the day-zero program — do not seed it. Dartmouth College is a real claimed program; do not seed it either.

## T14 · Derive the season summary
- **status:** todo
- **model:** opus
- **files:** `src/lib/data/schedule-server.ts`; `tests/schedule-season-summary.spec.ts` (new); reads `src/lib/schedule/entry-state.ts`
- **done when:**
  - [ ] `schedule-server.ts` exports a pure `seasonSummaryFrom()` taking a `ProgramSchedule` and constructing no Supabase client
  - [ ] It returns the three figures `7d`'s season block draws: the per-dual win/loss sequence, the dual record, and lines-analyzed over lines-total
  - [ ] The new spec covers zero events, an undecided dual, a forfeit, all lines analyzed and none analyzed, and passes with no database
  - [ ] `npm test` passes
- **notes:** Pure and exported beside `scheduleRowsFrom` for that function's own stated reason — "so this mapping can be tested without a database". `dualScore()` and `entryPlayed()` in `entry-state.ts` already answer most of it; port, do not re-implement.

## T15 · Re-point the schedule page at the database
- **status:** todo
- **model:** opus
- **needs:** T13, T14
- **files:** `src/app/dashboard/team/schedule/page.tsx`, `src/components/dashboard/schedule/static/static-schedule.tsx`
- **done when:**
  - [ ] The route calls `getProgramSchedule`, `scheduleRowsFrom`, `eventDetailFrom` and `seasonSummaryFrom`, and `static-schedule.tsx` imports nothing from `src/lib/schedule/fixtures.ts`
  - [ ] The seeded program's real events render in the drawer with their own opponents, dates and team scores
  - [ ] A program with no events still renders the `7e` day-zero frame
  - [ ] The season block's form marks and its facts line both come from `seasonSummaryFrom` rather than from literals
  - [ ] The `getWorkspaceContext`, `/login`, non-team, `isProgramStaff` and `canUploadForProgram` guards are unchanged
- **notes:** Upcoming/completed grouping stays `playedCount`-based, as `event-drawer.tsx:50-51` already does — see plan correction C4; the drawer needs no edit. `dual-widget.tsx` does need one, but that is T16. The season block's marks are currently four hard-coded `CircleX`/`CircleCheck` icons at `static-schedule.tsx:141-163`, with a comment saying they are deliberately not derived because the artboard claimed a dual the fixtures never named — that reason dies with the fixtures.

## T16 · Derive the dual widget's outcome rail
- **status:** todo
- **model:** opus
- **needs:** T15
- **files:** `src/components/dashboard/schedule/static/dual-widget.tsx`
- **done when:**
  - [ ] `SINGLES_MARKS` and `DOUBLES_MARKS` are gone, and `OutcomeRail` renders marks derived from `detail.entries`
  - [ ] Two different seeded duals render two different rails, each matching the rows beside it
  - [ ] A dual with unplayed lines renders those positions in the unplayed treatment rather than as a win or a loss
  - [ ] The rail's colours and order for a given outcome are unchanged from the artboard
- **notes:** **Silent-wrong-data trap 1 of 3**, recorded in `work/events-lineups/REGRESSION-NOTE.md` §4 and in this file's own header exception. Point the component at live data without re-deriving these and every dual — won or lost — renders the identical `good bad good good good grey` rail with correct rows beneath it and nothing on screen looking broken. The header states re-deriving them "is part of the re-wiring, not something that follows from it."

## T17 · Delete the read path's dormant pair
- **status:** todo
- **model:** sonnet
- **needs:** T15
- **files:** delete `src/components/dashboard/schedule/schedule-list.tsx` and `src/components/dashboard/schedule/event-detail-pane.tsx`; `src/components/dashboard/schedule/README.md`
- **done when:**
  - [ ] Both files are deleted and `grep -rn "schedule-list\|event-detail-pane" src` returns nothing
  - [ ] README §2's table no longer lists either file
  - [ ] `npm run build` is green
- **notes:** Mechanical. README §4's type-only lifeline means the import graph lies about what is safe to remove — these two are named safe by §2; the lifeline pair is not, and is T24.

## T18 · Retire the dormant event chooser
- **status:** todo
- **model:** sonnet
- **needs:** T17
- **files:** `src/app/dashboard/team/schedule/new/page.tsx`; delete `src/components/dashboard/schedule/new-event-chooser.tsx`; `src/components/dashboard/schedule/README.md`
- **done when:**
  - [ ] `new-event-chooser.tsx` is deleted and nothing imports it
  - [ ] `/dashboard/team/schedule/new` still renders both choices and both destinations are reachable
  - [ ] The route's `/login`, non-team and `isProgramStaff` redirects are unchanged
  - [ ] README §2 no longer lists the file
- **notes:** `StaticEventChooser` "reads nothing" per its route header, so no data wiring is expected here. If it turns out to need any, stop and report rather than inventing it.

## T19 · Tournament builder reads the roster
- **status:** todo
- **model:** opus
- **needs:** T13
- **files:** `src/app/dashboard/team/schedule/new/tournament/page.tsx`, `src/components/dashboard/schedule/static/static-tournament-builder.tsx`
- **done when:**
  - [ ] The route fetches `getLadder` and `getTeamSettings` in parallel and passes both down
  - [ ] The roster rail lists the seeded program's real players rather than `TOURNAMENT_FIELD`
  - [ ] Name, starts, ends, site and format are controlled inputs that hold what is entered
  - [ ] The format control carries an explicit boolean for ad scoring, never an interpolated `null`
  - [ ] The route's `/login`, non-team and `isProgramStaff` redirects are unchanged
- **notes:** The route's own header names the target: "this route reading again and handing `TournamentForm` the same two props it always did" — handed to the static component instead. Submitting is T20; this task stops at the form holding its state.

## T20 · Tournament builder writes
- **status:** todo
- **model:** opus
- **needs:** T15, T19
- **files:** `src/components/dashboard/schedule/static/static-tournament-builder.tsx`; reads `src/lib/schedule/actions.ts`; delete `tournament-form.tsx` and `entry-editor.tsx`; `README.md`
- **done when:**
  - [ ] Entries can be added from the rail with draw and seed, and removed again
  - [ ] Submitting calls `createTournament`, and its `ActionError` is shown rather than swallowed
  - [ ] A tournament created through the UI appears in the schedule list and opens at `/dashboard/team/schedule/<id>`
  - [ ] Its stored `format` is jsonb with a real boolean `ad_scoring`
  - [ ] `tournament-form.tsx` and `entry-editor.tsx` are deleted and README §2 no longer lists them
- **notes:** `createTournament` already exists in `actions.ts` — wire it, do not write a second one. `entry-editor.tsx` holds the draw and seed vocabulary ("Main draw", "Qualifying") that `rosterSubline()` reads; port it rather than inventing new values.

## T21 · Dual step one searches real schools
- **status:** todo
- **model:** opus
- **needs:** T13
- **files:** `src/app/dashboard/team/schedule/new/dual/page.tsx`, `src/components/dashboard/schedule/static/dual-school-step.tsx`
- **done when:**
  - [ ] The route fetches `getLadder`, `getTeamSettings`, `getConferenceTable` and `getProgramSchedule`, then `opponentDualHistory()` over the last
  - [ ] The drawn field is a real input, and typing narrows the listed schools
  - [ ] The `seasonRecord` slot and the "Region" control are gone from the rendered screen
  - [ ] The "N of M" total is a real count rather than a literal
  - [ ] Selecting a school advances to step two
- **notes:** Dropping `seasonRecord` and "Region" applies the brief's "nothing fabricates a figure": `opponent-history.ts` says that record "does not exist anywhere in this app", and `programs` has no region column and no mapping to invent one from. The directory total is the one of the three that is backable. `school-search.tsx` is the dormant implementation of this screen — read it before writing.

## T22 · Carry the chosen school into step two, and make the format control real
- **status:** todo
- **model:** fable
- **needs:** T21
- **files:** `src/components/dashboard/schedule/static/static-dual-builder.tsx`, `src/components/dashboard/schedule/static/dual-build-step.tsx`
- **done when:**
  - [ ] The school chosen in step one is what step two's header, rail and footer name, by every path through step one
  - [ ] `DUAL_DRAFT_SCHOOL` and `FORMAT_VALUE` no longer pin the screen to Ridgeline or to `"3|false"`
  - [ ] Date, site and format are controlled inputs
  - [ ] Ad scoring submits as a real boolean for both settings, and never as the string `"null"`
- **notes:** **The highest-risk edit in the run, and traps 2 of 3.** `FORMAT_VALUE = "3|false"` is hard-coded because an interpolated `adScoring` of `null` becomes the string `"null"`, which the decoder's `adScoring === "true"` reads as a confident `false` — the exact failure that made every tournament video fail submission long after the coach had left. Read `dual-build-step.tsx`'s header and `docs/ui-revamp-guardrails.md` §3.1 and §4 before editing. Separately, `static-dual-builder.tsx`'s header explains that the school deliberately does not travel today, because threading it put one school's name over another school's drawn data — the fix is that step two's data now travels too, not that the guard is simply removed.

## T23 · Dual lineup editing and submit
- **status:** todo
- **model:** opus
- **needs:** T22
- **files:** `src/components/dashboard/schedule/static/dual-build-step.tsx`, `src/components/dashboard/schedule/static/opponent-popup.tsx`; reads `src/lib/schedule/actions.ts` and `roster-match.ts`; delete `dual-form.tsx`, `school-search.tsx`, `opponent-rail.tsx`, `field-row.tsx`; `README.md`
- **done when:**
  - [ ] Lines are editable against the real ladder, with roster matching for typed names
  - [ ] The opponent popup's school and its saved roster travel together, so it dedupes against that school's pool
  - [ ] Submitting calls `createDual`; the dual appears in the schedule list and opens at its event page carrying the players chosen
  - [ ] The four dormant files are deleted and README §2 no longer lists them
- **notes:** **Trap 3 of 3** — the popup's school and saved roster "must travel together or it dedupes against the wrong pool". `roster-match.ts` already holds the matching and name splitting, and `createDual` already exists; port both rather than re-implementing. `lineup-editor.tsx` and `opponent-name-cell.tsx` are NOT deleted here — they are T24.

## T24 · Resolve the type-only lifeline
- **status:** todo
- **model:** fable
- **needs:** T23
- **files:** `src/components/dashboard/schedule/lineup-editor.tsx`, `src/components/dashboard/schedule/opponent-name-cell.tsx`, and wherever `LineupLine` should now live; `README.md`
- **done when:**
  - [ ] `LineupLine` lives somewhere `fixtures.ts` and `dual-build-step.tsx` can import without pulling in a dormant component
  - [ ] `npm run build` is green, and either no renderer of `LineupEditor` or `OpponentNameCell` remains, or the task reports why both files must stay
  - [ ] README §4 is deleted if the lifeline is gone, or corrected if it is not
- **notes:** Deleting both is optional — the brief permits them to survive the run: leaving them is an acceptable outcome, deleting them while something still compiles against them is not. README §4 flags `opponent-name-cell.tsx`'s re-target `key` contract as required reading before touching it, and design open question 3 records that it was **not** read during design — that debt comes due here.

## T25 · Confirm the already-live routes still agree
- **status:** todo
- **model:** opus
- **needs:** T20, T23
- **files:** none expected — `src/app/dashboard/team/schedule/[eventId]/page.tsx`, `.../single/[matchId]/page.tsx` and their detail components, read-only
- **done when:**
  - [ ] A dual created in T23 and a tournament created in T20 each open correctly at `/dashboard/team/schedule/<id>`
  - [ ] A seeded single match opens at `/dashboard/team/schedule/single/<matchId>`
  - [ ] `4c`'s per-line report links resolve to real matches instead of 404ing on fixture ids
  - [ ] Any source change this task makes is reported as a finding first, since none is expected
- **notes:** These two routes stayed DB-wired and live throughout the static rebuild; the check is that six routes now agree about one event. The 404 links were a deliberate stage-03 decision in the previous run — real `<Link>`s against fixture ids — chosen so this re-wiring would be a no-op rather than a rewrite.

## T26 · Correct the tests and the map
- **status:** todo
- **model:** fable
- **needs:** T16, T18, T24, T25
- **files:** `tests/schedule-static-copy.spec.ts`, `src/components/dashboard/schedule/README.md`, `src/lib/schedule/fixtures.ts` (import graph only)
- **done when:**
  - [ ] No file under `src/app/` imports `src/lib/schedule/fixtures.ts`
  - [ ] Assertions reading component source for a literal this feature now interpolates are removed or moved, and the spec's header says it guards the design record rather than the live screen
  - [ ] README §2 and §4 are gone, or every remaining entry is still true of the tree
  - [ ] `npm run lint` shows no new warnings against a freshly measured baseline, and `npm run build` and `npm test` are green
- **notes:** The trap this task exists for: the spec asserts over `fixtures.ts` exports and over component source text, never over a rendered page — so demoting the fixtures to test-only leaves most of it green while it stops describing anything a user sees. `PROGRAM_NAME`, `USER_NAME` and `SEASON_LABEL` have no consumer in `src/` at all; this spec is their only reader. Do not touch `team-home-schedule-reads.spec.ts` or `weekend-dual-reads.spec.ts`.
