# Tasks — claude/new-session-c3f1ab

> Scope: static rebuild of all ten `Events & Lineups.dc.html` artboards, replacing the four DB-wired schedule routes with fixture-backed UI.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

---

## Rules every task below inherits

From `work/events-lineups/03_plan/output/plan.md`. Stated once so twelve task
bodies do not repeat them — a subagent running any of T1–T12 should read them.

1. Read `docs/ui-revamp-guardrails.md` before any dashboard UI change.
2. Read **only your own artboard** from `Events & Lineups.dc.html` (Claude
   Design project `afde9116-328b-445c-aeff-8b3c2a702d6f`, via the claude_design
   MCP). Reading all ten is what blows the context.
3. Copy is **verbatim**, typographic characters included — curly quotes, en and
   em dashes, `·` separators. Where the design and the current app disagree,
   the design wins.
4. Design copy that is factually **false about the app gets flagged, not
   fixed** — reproduce it as drawn and report it. T12 collects the flags.
5. **No database.** No Supabase import, no server action, no loader call
   anywhere under `static/`.
6. **Routes keep their guards** — `getWorkspaceContext()`, `redirect("/login")`,
   the non-team redirect, and the role gate. Only the data fetch goes.
7. **No token work.** `--shadow-card` is declared at `src/app/globals.css:63`;
   every token and utility class the design uses already exists.
8. `advButton()` for primary CTAs; Lucide icons only, stroke width 1.5.
9. Desktop only — 1280px is the target; narrow viewports need only not break.

---

## T1 · Build the schedule fixtures module
- **status:** done
- **model:** opus
- **files:** `src/lib/schedule/fixtures.ts` (new); reads `src/lib/schedule/types.ts`
- **done when:**
  - [ ] `src/lib/schedule/fixtures.ts` exports the design's sample content typed against `ScheduleRow`, `EventDetail`, `ProgramEvent`, `EventEntry` and `EntryMatch` from `src/lib/schedule/types.ts` — no `as` casts, no locally redeclared duplicate shapes
  - [ ] Every fixture `format` is an `EventFormat` object carrying an explicit `adScoring` boolean; no fixture omits the field or leaves it to a default
  - [ ] The fixtures carry Meridian State, Elena Vasquez, Ridgeline University, the 09-26 dual, the 10-03→10-05 tournament, and the string `3–1 in duals · 31 of 36 lines analyzed` with its en dash and `·` intact
  - [ ] The dual fixture has nine entries — six singles (S1–S6) and three doubles (D1–D3)
  - [ ] `npx tsc --noEmit` is clean
- **notes:** `EventFormat.adScoring` is `boolean | null` and null is a real state — the vision pipeline refuses a job without it, and `tournament-form.tsx`'s header records the outage that followed the last time it went missing. This is the one live guardrail seam in the run. The `"3|false"` string is the *form control's* value encoding used by the dormant forms (T6, T8 reproduce it); it is not the fixture type.

## T2 · Rebuild 3b — the event-type chooser
- **status:** done
- **model:** opus
- **needs:** T1
- **files:** `src/components/dashboard/schedule/static/static-event-chooser.tsx` (new), `src/app/dashboard/team/schedule/new/page.tsx`
- **done when:**
  - [ ] `/dashboard/team/schedule/new` renders two cards — dual and tournament — and a footer bar reading Cancel · the selection label · Continue, matching artboard `3b` at 1280px on spacing, type, colour, radii, borders, icons and grid
  - [ ] All copy on the screen matches `3b` character for character, typographic punctuation included
  - [ ] Selecting a card updates the footer's selection label through local `useState`
  - [ ] The route file no longer imports `NewEventChooser`, and keeps its `getWorkspaceContext`, `/login`, non-team and `isProgramStaff` redirects unchanged
  - [ ] `npx tsc --noEmit` is clean
- **notes:** Smallest complete artboard, and the pattern-setter for the other three routes — get the route-edit shape right here. Footer goes in `EventShell`'s `footer` slot.

## T3 · Rebuild 7e and 7d — the schedule shell and drawer
- **status:** done
- **model:** opus
- **needs:** T1
- **files:** `src/components/dashboard/schedule/static/static-schedule.tsx`, `src/components/dashboard/schedule/static/event-drawer.tsx` (both new), `src/app/dashboard/team/schedule/page.tsx`
- **done when:**
  - [ ] `/dashboard/team/schedule` renders a 340px drawer plus detail pane from fixtures, matching `7d` at 1280px with nothing selected — the pane prompts and carries the season facts
  - [ ] The no-events branch matches `7e`: drawer sections read "None yet" and the pane shows its empty state over the nine-line scaffold
  - [ ] `static-schedule.tsx` takes a `canCreate` prop; the drawer-footed "New event" CTA renders only when it is true, and the route passes `isProgramStaff(active)`
  - [ ] The route no longer calls `getProgramSchedule`, `scheduleRowsFrom` or `eventDetailFrom`, and keeps its `/login` and non-team redirects
  - [ ] The sidebar and the 44px topbar each appear exactly once on the rendered page
- **notes:** Both branches must be reachable to verify — a fixture flag or two exported fixture sets, whichever reads more plainly. The selected states are T4; until then a selection renders the `7d` prompt. **Check `7d`/`7e` for a `canAddOwnMatch` control before dropping that prop, and say which you found in the report.** Reproducing the sidebar or topbar from the artboards would render the app's chrome twice — that is the failure this architecture exists to avoid.

## T4 · Rebuild 7c and 4c — the dual widget
- **status:** done
- **model:** opus
- **needs:** T3
- **files:** `src/components/dashboard/schedule/static/dual-widget.tsx` (new), `src/components/dashboard/schedule/static/static-schedule.tsx`
- **done when:**
  - [ ] Selecting the dual in the drawer replaces the `7d` prompt with the nine-line pane — six singles, three doubles, results — matching `7c` at 1280px including its scoped detail header and inset hairlines
  - [ ] The same pane at full height matches `4c` with all nine lines resolved, and no second component was created for it
  - [ ] Each resolved line carries a `next/link` to `/dashboard/matches/<fixture id>`, with the hover and focus affordance the design draws
  - [ ] Walking 7d → 7c → 4c moves one component's local selection state — no route change and no fetch occurs
  - [ ] All pane copy matches `7c` and `4c` character for character
- **notes:** `7c` and `4c` are the same pane at two heights, not two components. Anything that differs between them and is *not* height-driven is a finding for the human, not a reason to split. The links 404 on fixture ids — that is the accepted decision, recorded in T12.

## T5 · Rebuild 2c — find the school
- **status:** done
- **model:** opus
- **needs:** T1
- **files:** `src/components/dashboard/schedule/static/static-dual-builder.tsx`, `src/components/dashboard/schedule/static/dual-school-step.tsx` (both new), `src/app/dashboard/team/schedule/new/dual/page.tsx`
- **done when:**
  - [ ] `/dashboard/team/schedule/new/dual` renders step one — conference first, then all programs, then free text — matching `2c` at 1280px
  - [ ] `static-dual-builder.tsx` owns a step state of `"find-school" | "build"` and nothing else; the build branch is an explicit, clearly-named stub
  - [ ] The route no longer calls `getLadder`, `getTeamSettings`, `getConferenceTable`, `getProgramSchedule`, `opponentDualHistory` or `divisionLabel`, no longer defines `toDirectoryRow`, and keeps its `/login`, non-team and `isProgramStaff` redirects
  - [ ] `npx tsc --noEmit` is clean and `npm run lint` is no worse than the 43-warning baseline — the deletion leaves no unused import behind
  - [ ] All step-one copy matches `2c` character for character
- **notes:** The largest single deletion in the run. Keeping the shell thin is what lets T6 and T7 extend it without re-reading it whole. Name the stub as a stub in the report so a reviewer does not read it as the finished screen.

## T6 · Rebuild 2b — the master-detail dual builder
- **status:** done
- **model:** opus
- **needs:** T5
- **files:** `src/components/dashboard/schedule/static/dual-build-step.tsx` (new), `src/components/dashboard/schedule/static/static-dual-builder.tsx`
- **done when:**
  - [ ] Choosing a school advances to step two, matching `2b` at 1280px — conference rail left, date / site / format / nine lines right
  - [ ] The body renders inside `EventShell` with `flush` and scrolls as two edge-to-edge panes, not as one padded column
  - [ ] Format renders as `2b` draws it, and its control's value uses the `"<bestOf>|<adScoring>"` encoding matching `dual-form.tsx:266`
  - [ ] Opponent cells render as `2b` draws them and are inert — their popup is T7
  - [ ] All step-two copy matches `2b` character for character
- **notes:** `flush` exists for this artboard by name — see the prop's doc comment in `event-shell.tsx`. It is the difference between the master-detail body and a padded column, and it is easy to miss.

## T7 · Rebuild 2d and 2e — the add-opponent popup
- **status:** done
- **model:** opus
- **needs:** T6
- **files:** `src/components/dashboard/schedule/static/opponent-popup.tsx` (new), `src/components/dashboard/schedule/static/dual-build-step.tsx`
- **done when:**
  - [ ] Opening an opponent cell shows the popup in its `2d` state — similar saved name found — matching the artboard at 1280px
  - [ ] Taking the save action moves that same component to its `2e` state; no second popup component exists
  - [ ] After `2e` the line in the row behind the popup reads as resolved
  - [ ] All popup copy in both states matches `2d` and `2e` character for character
- **notes:** One popup, two states of its local state — per the brief's decision that the paired frames are one component moving, not two screens.

## T8 · Rebuild 3c — the tournament builder
- **status:** done
- **model:** opus
- **needs:** T1
- **files:** `src/components/dashboard/schedule/static/static-tournament-builder.tsx` (new), `src/app/dashboard/team/schedule/new/tournament/page.tsx`
- **done when:**
  - [ ] `/dashboard/team/schedule/new/tournament` renders the roster rail feeding entries, matching `3c` at 1280px, inside `EventShell` with `flush`
  - [ ] Format renders `Bo3 · ad` as `3c` draws it, with the same value encoding T6 uses
  - [ ] The route no longer calls `getLadder` or `getTeamSettings`, and keeps its `/login`, non-team and `isProgramStaff` redirects
  - [ ] All copy matches `3c` character for character
  - [ ] `npx tsc --noEmit` is clean
- **notes:** Same master-detail shape as `2b`. Independent of T5–T7 — it may run before or between them. The artboard states there is no lineup and no matches until played; reproduce that, do not invent a lineup.

## T9 · Label the dormant schedule tree
- **status:** done
- **model:** opus
- **needs:** T2, T3, T5, T8
- **files:** `src/components/dashboard/schedule/README.md` (new); header comments only in `schedule-list.tsx`, `new-event-chooser.tsx`, `dual-form.tsx`, `school-search.tsx`, `tournament-form.tsx`, `event-detail-pane.tsx`, `dual-detail.tsx`, `opponent-name-cell.tsx`
- **done when:**
  - [ ] `src/components/dashboard/schedule/README.md` names which tree the four re-pointed routes actually render, and which components are dormant
  - [ ] Each of the eight dormant entry points carries a header line saying it is dormant and naming its `static/` replacement
  - [ ] `git diff` shows comment-and-README changes only — no logic, import, export or JSX changed in any dormant file
  - [ ] `npx tsc --noEmit` is clean
- **notes:** These eight files run 240–509 lines each; read each one's header block, not the whole file, or the context goes. This labels the `docs/ui-revamp-guardrails.md` §3.5 hazard — a dead near-duplicate beside working code is how the wrong one gets edited later — it does not remove it. Only deleting the dormant tree would, and the brief says not to.

## T10 · Add the copy-fidelity spec
- **status:** done
- **model:** opus
- **needs:** T2, T4, T7, T8
- **files:** `tests/schedule-static-copy.spec.ts` (new)
- **done when:**
  - [ ] `tests/schedule-static-copy.spec.ts` asserts distinguishing copy for each of the four static routes
  - [ ] The assertions use the design's own characters — en dash, `·`, curly quotes — not normalized ASCII
  - [ ] `npm test` passes
  - [ ] Mutating one fixture string by a single character makes the spec fail, and the mutation is reverted before the task ends
- **notes:** The strings are this run's fidelity contract, and copy drift is exactly what a reviewer's eye slides over. It is also the cheapest guard against a fixture being silently emptied. A copy spec that cannot fail is not a copy spec — criterion 4 is the point of the task, not a formality. Do not touch `team-home-schedule-reads.spec.ts` or `weekend-dual-reads.spec.ts`; they test the data layer this run does not modify and must stay green unedited.

## T11 · Full-set fidelity pass and gates
- **status:** done
- **model:** fable
- **needs:** T9, T10
- **files:** no source changes expected; findings recorded under `work/events-lineups/`
- **done when:**
  - [ ] All ten artboards checked side by side at 1280px in one pass, with every divergence found listed against its artboard and screen
  - [ ] Both stateful sequences walked end to end — 2d → 2e, and 7d → 7c → 4c
  - [ ] A grep of `src/components/dashboard/schedule/static/` and the four route files finds no `supabase` import, no loader call and no `"use server"`
  - [ ] With `canCreate` false the schedule renders without the New event CTA, and the three create routes still redirect a player
  - [ ] `npx tsc --noEmit` clean, `npm run lint` at or under the 43-warning baseline, `npm run build` green, `npm test` green
- **notes:** The whole-set pass no single task can do — its value is catching drift *between* screens, which per-screen checks cannot see. Per-artboard fidelity was already verified inside T2–T8 while the design detail was still in context; do not re-do that from memory, look for the cross-screen divergences.

## T12 · Write the regression note and the flagged-copy list
- **status:** done
- **model:** opus
- **needs:** T11
- **files:** `work/events-lineups/REGRESSION-NOTE.md` (new)
- **done when:**
  - [ ] The note names, per route, which working DB-wired behaviour `/dashboard/team/schedule`, `new`, `new/dual` and `new/tournament` lost
  - [ ] It states that the dormant components are retained for the later re-wiring, and that `4c`'s report links 404 on fixture ids
  - [ ] It names the loss of function in its opening lines, not only in a closing caveat
  - [ ] Any design copy flagged during T2–T8 as factually false about the app is collected into one list with its artboard, and is still unchanged in the code
- **notes:** Brief constraint 1 and success criterion 7: replacing working, DB-wired UI with static UI is a deliberate loss of function, chosen by the human with the cost stated. It must be recorded in the PR and never ship looking as if nothing regressed. This file is what stages 06 and 07 draw the PR body from.

---

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
9. **`tests/schedule-static-copy.spec.ts` is co-owned by every task that
   rewrites a screen it reads.** Added 2026-09-01 after T19 blocked. That spec
   holds 129 `drawn()` assertions that read *component source* for literal
   strings, across four screens: `dual-build-step.tsx` (27), `static-schedule.tsx`
   (22), `dual-school-step.tsx` (15), `opponent-popup.tsx` (10),
   `dual-widget.tsx` (10), `event-drawer.tsx` (8),
   `static-tournament-builder.tsx` (2) and `static-event-chooser.tsx` (2).
   Re-wiring a screen turns some of those literals into interpolated values, so
   the change that breaks an assertion and the retirement of that assertion are
   the same piece of work — and a task forbidden to touch the spec cannot pass
   its own gate. T19, T20, T21, T22 and T23 therefore each carry the spec in
   `files:` and retire only the assertions their own diff invalidates, with a
   reason per removal. T26 is the final sweep, not the whole job.

   **Retire, do not weaken.** An assertion whose literal genuinely left the
   component is removed and the reason recorded. An assertion that still holds
   stays. Deleting a failing assertion to get a green run is the one thing this
   rule is not licence for — that spec is the fidelity contract for a
   character-for-character design rebuild, and `npm test` going green is not
   evidence the screen still matches its artboard.

## T13 · Seed a verifiable schedule program
- **status:** done
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
- **status:** done
- **model:** opus
- **files:** `src/lib/data/schedule-server.ts`; `tests/schedule-season-summary.spec.ts` (new); reads `src/lib/schedule/entry-state.ts`
- **done when:**
  - [ ] `schedule-server.ts` exports a pure `seasonSummaryFrom()` taking a `ProgramSchedule` and constructing no Supabase client
  - [ ] It returns the three figures `7d`'s season block draws: the per-dual win/loss sequence, the dual record, and lines-analyzed over lines-total
  - [ ] The new spec covers zero events, an undecided dual, a forfeit, all lines analyzed and none analyzed, and passes with no database
  - [ ] `npm test` passes
- **notes:** Pure and exported beside `scheduleRowsFrom` for that function's own stated reason — "so this mapping can be tested without a database". `dualScore()` and `entryPlayed()` in `entry-state.ts` already answer most of it; port, do not re-implement.

## T15 · Re-point the schedule page at the database
- **status:** done
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
- **status:** done
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
- **status:** done
- **model:** sonnet
- **needs:** T15
- **files:** delete `src/components/dashboard/schedule/schedule-list.tsx` and `src/components/dashboard/schedule/event-detail-pane.tsx`; `src/components/dashboard/schedule/README.md`
- **done when:**
  - [ ] Both files are deleted, and `grep -rnE '(from|import\()[^;]*(schedule-list|event-detail-pane)|<(ScheduleList|EventDetailPane)[ />]' src` returns nothing — provenance mentions inside comment blocks are references to history, not to code, and may remain
  - [ ] README §2's table no longer lists either file
  - [ ] `npm run build` is green
- **notes:** **Amended 2026-09-01 after a blocked run.** Criterion 1 originally required a bare `grep` over all of `src` to return nothing, which two provenance comments in `event-drawer.tsx` and `opponent-history.ts` made unsatisfiable — neither file is in this task's `files:`, so the criterion demanded work the task was not allowed to do. It now matches imports and JSX only. **The stashed work from that run is good and applies cleanly: `git stash apply b3ed7738f06061390cecd10cfe26b0bf6de6bce4`** — apply it first rather than redoing the deletion. Mechanical. README §4's type-only lifeline means the import graph lies about what is safe to remove — these two are named safe by §2; the lifeline pair is not, and is T24.

## T18 · Retire the dormant event chooser
- **status:** done
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
- **status:** done
- **model:** opus
- **needs:** T13
- **files:** `src/app/dashboard/team/schedule/new/tournament/page.tsx`, `src/components/dashboard/schedule/static/static-tournament-builder.tsx`, `tests/schedule-static-copy.spec.ts`
- **done when:**
  - [ ] The route fetches `getLadder` and `getTeamSettings` in parallel and passes both down
  - [ ] The roster rail lists the seeded program's real players rather than `TOURNAMENT_FIELD`
  - [ ] Name, starts, ends, site and format are controlled inputs that hold what is entered
  - [ ] The format control carries an explicit boolean for ad scoring, never an interpolated `null`
  - [ ] The route's `/login`, non-team and `isProgramStaff` redirects are unchanged
  - [ ] Every `tests/schedule-static-copy.spec.ts` assertion that reads this screen's source for a literal this task now interpolates is retired or moved, each with a one-line reason, and `npm test` is green
- **notes:** **Amended 2026-09-01 after a blocked run** — see rule 9 above. The copy spec pins this component's drawn dates in its *source*, which criterion 3 necessarily replaces, so the spec is now in `files:`. **The stashed work applies cleanly: `git stash apply c4ac7d1e7aff3449eb7e21c12d9488f165beaef0`** — it already satisfies criteria 1–5 and removes the `"<bestOf>|<adScoring>"` string encoding from this file entirely; only the spec retirement is left. The route's own header names the target: "this route reading again and handing `TournamentForm` the same two props it always did" — handed to the static component instead. Submitting is T20; this task stops at the form holding its state.

## T20 · Tournament builder writes
- **status:** done
- **model:** opus
- **needs:** T15, T19
- **files:** `tests/schedule-static-copy.spec.ts`; `src/components/dashboard/schedule/static/static-tournament-builder.tsx`; reads `src/lib/schedule/actions.ts`; delete `tournament-form.tsx` and `entry-editor.tsx`; `README.md`
- **done when:**
  - [ ] Entries can be added from the rail with draw and seed, and removed again
  - [ ] Submitting calls `createTournament`, and its `ActionError` is shown rather than swallowed
  - [ ] A tournament created through the UI appears in the schedule list and opens at `/dashboard/team/schedule/<id>`
  - [ ] Its stored `format` is jsonb with a real boolean `ad_scoring`
  - [ ] `tournament-form.tsx` and `entry-editor.tsx` are deleted and README §2 no longer lists them
  - [ ] Every `tests/schedule-static-copy.spec.ts` assertion that reads this screen's source for a literal this task now interpolates is retired or moved, each with a one-line reason, and `npm test` is green
- **notes:** `createTournament` already exists in `actions.ts` — wire it, do not write a second one. `entry-editor.tsx` holds the draw and seed vocabulary ("Main draw", "Qualifying") that `rosterSubline()` reads; port it rather than inventing new values.

## T21 · Dual step one searches real schools
- **status:** done
- **model:** opus
- **needs:** T13
- **files:** `tests/schedule-static-copy.spec.ts`; `src/app/dashboard/team/schedule/new/dual/page.tsx`, `src/components/dashboard/schedule/static/dual-school-step.tsx`
- **done when:**
  - [ ] The route fetches `getLadder`, `getTeamSettings`, `getConferenceTable` and `getProgramSchedule`, then `opponentDualHistory()` over the last
  - [ ] The drawn field is a real input, and typing narrows the listed schools
  - [ ] The `seasonRecord` slot and the "Region" control are gone from the rendered screen
  - [ ] The "N of M" total is a real count rather than a literal
  - [ ] Selecting a school advances to step two
  - [ ] Every `tests/schedule-static-copy.spec.ts` assertion that reads this screen's source for a literal this task now interpolates is retired or moved, each with a one-line reason, and `npm test` is green
- **notes:** Dropping `seasonRecord` and "Region" applies the brief's "nothing fabricates a figure": `opponent-history.ts` says that record "does not exist anywhere in this app", and `programs` has no region column and no mapping to invent one from. The directory total is the one of the three that is backable. `school-search.tsx` is the dormant implementation of this screen — read it before writing.

## T22 · Carry the chosen school into step two, and make the format control real
- **status:** done
- **model:** fable
- **needs:** T21
- **files:** `tests/schedule-static-copy.spec.ts`; `src/components/dashboard/schedule/static/static-dual-builder.tsx`, `src/components/dashboard/schedule/static/dual-build-step.tsx`
- **done when:**
  - [ ] The school chosen in step one is what step two's header, rail and footer name, by every path through step one
  - [ ] `DUAL_DRAFT_SCHOOL` and `FORMAT_VALUE` no longer pin the screen to Ridgeline or to `"3|false"`
  - [ ] Date, site and format are controlled inputs
  - [ ] Ad scoring submits as a real boolean for both settings, and never as the string `"null"`
  - [ ] Every `tests/schedule-static-copy.spec.ts` assertion that reads this screen's source for a literal this task now interpolates is retired or moved, each with a one-line reason, and `npm test` is green
- **notes:** **The highest-risk edit in the run, and traps 2 of 3.** `FORMAT_VALUE = "3|false"` is hard-coded because an interpolated `adScoring` of `null` becomes the string `"null"`, which the decoder's `adScoring === "true"` reads as a confident `false` — the exact failure that made every tournament video fail submission long after the coach had left. Read `dual-build-step.tsx`'s header and `docs/ui-revamp-guardrails.md` §3.1 and §4 before editing. Separately, `static-dual-builder.tsx`'s header explains that the school deliberately does not travel today, because threading it put one school's name over another school's drawn data — the fix is that step two's data now travels too, not that the guard is simply removed.

## T23 · Dual lineup editing and submit
- **status:** todo
- **model:** opus
- **needs:** T22
- **files:** `tests/schedule-static-copy.spec.ts`; `src/components/dashboard/schedule/static/dual-build-step.tsx`, `src/components/dashboard/schedule/static/opponent-popup.tsx`; reads `src/lib/schedule/actions.ts` and `roster-match.ts`; delete `dual-form.tsx`, `school-search.tsx`, `opponent-rail.tsx`, `field-row.tsx`; `README.md`
- **done when:**
  - [ ] Lines are editable against the real ladder, with roster matching for typed names
  - [ ] The opponent popup's school and its saved roster travel together, so it dedupes against that school's pool
  - [ ] Submitting calls `createDual`; the dual appears in the schedule list and opens at its event page carrying the players chosen
  - [ ] The four dormant files are deleted and README §2 no longer lists them
  - [ ] Every `tests/schedule-static-copy.spec.ts` assertion that reads this screen's source for a literal this task now interpolates is retired or moved, each with a one-line reason, and `npm test` is green
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
  - [ ] Any assertion still reading component source for a literal this feature interpolates is removed or moved — T19–T23 retire their own as they land, so this is the sweep for whatever they missed — and the spec's header says it guards the design record rather than the live screen
  - [ ] README §2 and §4 are gone, or every remaining entry is still true of the tree
  - [ ] `npm run lint` shows no new warnings against a freshly measured baseline, and `npm run build` and `npm test` are green
- **notes:** The trap this task exists for: the spec asserts over `fixtures.ts` exports and over component source text, never over a rendered page — so demoting the fixtures to test-only leaves most of it green while it stops describing anything a user sees. `PROGRAM_NAME`, `USER_NAME` and `SEASON_LABEL` have no consumer in `src/` at all; this spec is their only reader. Do not touch `team-home-schedule-reads.spec.ts` or `weekend-dual-reads.spec.ts`.
