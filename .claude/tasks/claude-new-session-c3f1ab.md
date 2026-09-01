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
- **status:** blocked
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
- **status:** blocked
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
- **status:** blocked
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
- **status:** todo
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
- **status:** todo
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
- **status:** todo
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
- **status:** todo
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
- **status:** todo
- **model:** opus
- **needs:** T11
- **files:** `work/events-lineups/REGRESSION-NOTE.md` (new)
- **done when:**
  - [ ] The note names, per route, which working DB-wired behaviour `/dashboard/team/schedule`, `new`, `new/dual` and `new/tournament` lost
  - [ ] It states that the dormant components are retained for the later re-wiring, and that `4c`'s report links 404 on fixture ids
  - [ ] It names the loss of function in its opening lines, not only in a closing caveat
  - [ ] Any design copy flagged during T2–T8 as factually false about the app is collected into one list with its artboard, and is still unchanged in the code
- **notes:** Brief constraint 1 and success criterion 7: replacing working, DB-wired UI with static UI is a deliberate loss of function, chosen by the human with the cost stated. It must be recorded in the PR and never ship looking as if nothing regressed. This file is what stages 06 and 07 draw the PR body from.
