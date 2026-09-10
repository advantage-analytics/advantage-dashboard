# Tasks — codex/dual-match-workflow

> Scope: Team Workspace Schedule drawer, lineup, tournament setup and result workflows.

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

## Also consulted

- `MAP.md` and `.claude/skills/trace-route/SKILL.md` for file ownership; route traces established in stage 02.
- `work/dual-match-workflow/04_tasks/output/BLOCKED.md` to resolve the detached-HEAD blocker with the user's branch approval.

The tasks below decompose the approved stage 03 plan. Model names are the queue
runner's routing labels, not claims that those models are available in this
Codex session. Fable planning was unavailable; task-add's inline fallback was
used. Suggested new test paths are explicitly marked as guesses.

## T1 · Persist schedule outcome records

- **status:** done
- **model:** fable
- **files:** Best guess: supabase/migrations/<timestamp>_add_program_event_outcomes.sql (new); tests/schedule-outcomes-db.spec.ts (new)
- **done when:**
  - [ ] An additive migration records forfeit/default/withdrawal, ours/theirs, entry, round, actor and time, with one outcome per dual line or tournament round.
  - [ ] Database constraints reject invalid kind/side and event-kind/round combinations; workspace membership scopes reads and staff authorization scopes mutations.
  - [ ] Tests against a verified development database demonstrate uniqueness and cross-program/role restrictions without altering historical matches or analysis data.
- **notes:** Plan §1. Verify the live schema and intended development target first; the earlier constraint lookup failed with insufficient scope. Do not treat migration files as the live schema or apply to production. Preserve legacy entry forfeits during rollout.

## T2 · Resolve outcome state in the schedule domain

- **status:** done
- **model:** fable
- **needs:** T1
- **files:** Best guess: src/lib/schedule/types.ts; src/lib/schedule/entry-state.ts; src/lib/schedule/line-status.ts; tests/schedule-outcomes.spec.ts (new)
- **done when:**
  - [ ] Domain types distinguish played matches, non-played outcomes and unanswered lines/rounds.
  - [ ] Every outcome kind and side resolves consistently, including independent rounds on one tournament entry and clear-to-unanswered transitions.
  - [ ] Dual result arithmetic counts a forfeiting/defaulting/withdrawing side correctly and regression cases preserve existing played results and legacy forfeits.
- **notes:** Plan §1 and §6. Keep pure derivation separate from data access; outcomes do not become analyzed matches.

## T3 · Load outcomes with team schedule data

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** Best guess: src/lib/data/schedule-server.ts; tests/schedule-outcome-loader.spec.ts (new)
- **done when:**
  - [ ] The workspace-scoped loader associates outcomes with the correct entry and round.
  - [ ] An outcome-only line/round remains visible when no matches row exists.
  - [ ] Loader tests demonstrate no cross-event association and no contribution to analysis totals or analyzed-match counts.
- **notes:** Plan §1. Keep the existing server/client split and cached schedule data flow.

## T4 · Define schedule role capabilities

- **status:** done
- **model:** opus
- **files:** Best guess: src/lib/workspace/types.ts; tests/schedule-capabilities.spec.ts (new)
- **done when:**
  - [ ] Named capabilities allow all team roles to view, owner/coach/staff to create/edit/score, and only owner/coach to delete events.
  - [ ] Personal workspace roles do not grant team schedule capabilities.
  - [ ] Tests cover every team role and show that a player's upload entitlement does not grant scheduled-line writes.
- **notes:** Plan §2. These are presentation helpers as well as server-action inputs; database authorization remains necessary.

## T5 · Authorize outcome writes and score conflicts

- **status:** done
- **model:** fable
- **needs:** T3, T4
- **files:** Best guess: src/lib/schedule/actions.ts; src/lib/schedule/outcomes.ts (new if needed); new outcome migration/RPC additions; tests/schedule-outcome-actions.spec.ts (new)
- **done when:**
  - [ ] Staff can set or clear an outcome for an entry in their active program; players and cross-program requests are refused.
  - [ ] A recorded match and a non-played outcome cannot coexist for the same line/round, including competing writes; recordResult rejects the conflict.
  - [ ] Changing outcome kind/side requires clearing the saved outcome first, and clearing restores the played-score path.
  - [ ] Successful writes refresh Schedule and event detail; authorization and conflict failures return actionable errors and create no match or processing job.
- **notes:** Plan §2. Align database enforcement with server actions. Preserve legacy forfeit behavior without producing two authoritative results.

## T6 · Delete eligible events with server enforcement

- **status:** done
- **model:** fable
- **needs:** T5
- **files:** Best guess: src/lib/schedule/actions.ts; new deletion RPC/migration if required; tests/schedule-event-delete.spec.ts (new)
- **done when:**
  - [ ] Only owner or coach in the event's program can delete an event.
  - [ ] Deletion refuses an event with recorded matches or outcomes, including legacy forfeits, and checks dependencies at mutation time.
  - [ ] Eligible deletion removes the targeted event safely, records the audited action, and revalidates Schedule and event detail.
  - [ ] Tests cover denied roles, foreign events, dependency refusal and successful eligible deletion without deleting match media or historical statistics.
- **notes:** Plan §2. Verify actual FK/cascade and audit constraints before implementing; do not infer them from the incomplete earlier schema lookup.

## T7 · Wire Schedule capabilities and remove Import

- **status:** done
- **model:** opus
- **needs:** T4
- **files:** Best guess: src/app/dashboard/team/schedule/page.tsx; src/components/dashboard/schedule/static/static-schedule.tsx; src/components/dashboard/schedule/static/event-drawer.tsx (prop boundary only)
- **done when:**
  - [ ] The server page derives and supplies named Schedule capabilities through StaticSchedule to EventDrawer.
  - [ ] Create/day-zero affordances preserve role gating and the separate one-off upload entitlement.
  - [ ] The nonworking Schedule Import button is absent while the Matches file-import entry point remains intact.
- **notes:** Plan §3. Trace: schedule/page.tsx → static/static-schedule.tsx → static/event-drawer.tsx. Restrict drawer edits here to capability plumbing.

## T8 · Add the viewer drawer footer

- **status:** todo
- **model:** opus
- **needs:** T7
- **files:** Best guess: src/components/dashboard/schedule/static/event-drawer.tsx; tests/schedule-drawer-actions.spec.ts (new)
- **done when:**
  - [ ] A player sees a full-width ghost Open dual or Open tournament footer linking to that event, with the duplicate header Open event link removed for the player.
  - [ ] Owner/coach/staff retain Enter results while lines are open; settled duals do not acquire a substitute primary.
  - [ ] Keyboard/browser cases cover both event kinds and role states, including players with upload permission and long scrollable drawer content.
- **notes:** Plan §3. Preserve drawer stepping, dismissal and focus restoration; use advButton for the ghost and primary.

## T9 · Expose event edit and delete in the drawer

- **status:** todo
- **model:** opus
- **needs:** T6, T8
- **files:** Best guess: src/components/dashboard/schedule/static/event-drawer.tsx; src/components/dashboard/schedule/static/event-actions-menu.tsx (new); tests/schedule-drawer-actions.spec.ts
- **done when:**
  - [ ] Staff-capable viewers can open the existing event edit route from the drawer overflow menu; players see no write menu.
  - [ ] Only eligible owners/coaches are offered event deletion, with a confirmation naming the event and consequence.
  - [ ] Server refusal remains visible without closing the drawer or reporting success; successful deletion updates the selection/list.
  - [ ] The overflow trigger has an accessible label and existing dark tooltip, and menu/dialog focus behavior is tested.
- **notes:** Plan §3. Reuse existing menu and confirmation primitives. This task is event deletion only, not deletion of a recorded match.

## T10 · Validate lineup identities and pairs

- **status:** done
- **model:** fable
- **needs:** T6
- **files:** Best guess: src/lib/schedule/entry-plan.ts; src/lib/schedule/actions.ts; src/lib/schedule/lineup-validation.ts (new if needed); tests/schedule-lineup-validation.spec.ts (new)
- **done when:**
  - [ ] Create/update validation rejects a repeated identity within a line and duplicate exact doubles pairs, including reversed pair order.
  - [ ] An athlete can participate in singles and doubles, and distinct IDs sharing a display name are not conflated.
  - [ ] Invalid submissions identify the affected line and write no invalid lineup; settled-entry protection remains enforced.
- **notes:** Plan §4. Apply only the duplicate rules the plan specifies; do not invent broader cross-line participation restrictions.

## T11 · Choose doubles partners by roster identity

- **status:** blocked
- **model:** opus
- **needs:** T10
- **files:** Best guess: src/components/dashboard/schedule/static/lineup-name-picker.tsx; src/components/dashboard/schedule/static/dual-build-step.tsx; tests/schedule-doubles-picker.spec.ts (new)
- **done when:**
  - [ ] A doubles line offers two explicit roster selections and persists both stable identities with their labels.
  - [ ] The second partner must be distinct; duplicate-pair choices/validation explain why the assignment is unavailable.
  - [ ] Selecting, clearing and editing a pair preserve other lines, respect settled-line locks, and retain the server validation from T10.
  - [ ] Browser cases cover same-name athletes and permitted singles-plus-doubles participation.
- **notes:** Plan §4. Keep the picker and draft integration together so identity is not lost by reparsing slash-separated labels.

## T12 · Support either forfeit side in the lineup builder

- **status:** todo
- **model:** opus
- **needs:** T11
- **files:** Best guess: src/components/dashboard/schedule/static/dual-build-step.tsx; src/lib/schedule/actions.ts (builder write adapter); tests/schedule-lineup-forfeit.spec.ts (new)
- **done when:**
  - [ ] The lineup control explicitly distinguishes normal play, our forfeit and opponent forfeit.
  - [ ] Both sides round-trip through create/edit to the outcome model without minting played matches or losing unrelated line assignments.
  - [ ] A saved outcome is read-only until explicitly cleared; tests cover both side choices and settled-line protection.
- **notes:** Plan §4 with the outcome foundation from T5. Use the approved result vocabulary; do not imply an unanswered line has already been played.

## T13 · Round lineup hover treatment

- **status:** todo
- **model:** sonnet
- **needs:** T12
- **files:** Best guess: src/components/dashboard/schedule/static/dual-build-step.tsx
- **done when:**
  - [ ] Editable lineup rows use the design-system rounded surface-subtle hover wash.
  - [ ] A resting row selection does not carry the retired blue underline.
  - [ ] Keyboard focus remains visibly indicated by the existing design-system treatment.
- **notes:** Plan §4. This affects lineup row decoration, not the blue focus indicator required by a genuinely focused underline field. Verify visually.

## T14 · Clarify tournament roster inclusion and draws

- **status:** blocked
- **model:** opus
- **files:** Best guess: src/components/dashboard/schedule/static/static-tournament-builder.tsx; tests/schedule-tournament-field.spec.ts (new)
- **done when:**
  - [ ] Each roster athlete has an explicit inclusion control, with draw and optional seed attached to that athlete's identity.
  - [ ] Only supported existing draw values are offered, each with explanatory copy.
  - [ ] New/edit browser cases preserve included IDs, saved draw/seed values and settled-entry locks; the builder remains singles-only.
- **notes:** Plan §5. Do not add a new draw taxonomy or doubles tournament entry creation.

## T15 · Title-case the wizard venue labels

- **status:** todo
- **model:** sonnet
- **needs:** T13
- **files:** Best guess: src/components/dashboard/schedule/static/pinned-event-bar.tsx; src/components/dashboard/schedule/static/dual-build-step.tsx; src/lib/schedule/format.ts (reuse siteTitle)
- **done when:**
  - [ ] The pinned gray event bar displays Home, Away and Neutral in title case.
  - [ ] Affected dual wizard venue readouts reuse the shared title formatter.
  - [ ] Stored site values and the creation/edit payload remain unchanged.
- **notes:** Plan §5. Verify the three rendered labels; avoid tests that merely copy a formatting expression.

## T16 · Add result choice to inline scoring

- **status:** blocked
- **model:** opus
- **needs:** T5
- **files:** Best guess: src/components/dashboard/schedule/score-entry.tsx; src/components/dashboard/schedule/line-row.tsx; src/components/dashboard/schedule/result-choice.tsx (new reusable control); tests/schedule-inline-outcomes.spec.ts (new)
- **done when:**
  - [ ] Inline scoring offers played score and every forfeit/default/withdrawal option for either side.
  - [ ] Non-played submissions call the outcome action without requiring fabricated set scores, and saved outcomes can be explicitly cleared.
  - [ ] Tournament writes include the selected round; errors preserve the entered state and explain conflicts.
  - [ ] Focused browser cases exercise both sides and clear-then-score without starting video or analysis work.
- **notes:** Plan §6. The shared selector's wording and action contract are reused by the full-page form.

## T17 · Add result choice to the full-page score flow

- **status:** todo
- **model:** opus
- **needs:** T16
- **files:** Best guess: src/components/dashboard/schedule/score-only-flow.tsx; src/app/dashboard/team/schedule/[eventId]/score/page.tsx; src/lib/schedule/line-choices.ts (if routing needs adjustment); tests/schedule-score-flow-outcomes.spec.ts (new)
- **done when:**
  - [ ] The full-page score flow uses the same played/non-played result options and server actions as inline scoring.
  - [ ] Both sides and all three outcome kinds can be recorded without invented games; clear-then-score is reachable.
  - [ ] Changing lines resets the outcome/score draft to the selected line, and successful save/next counts non-played results as resolved.
  - [ ] Browser cases cover denied players, conflict errors, saved outcomes and transitions between lines.
- **notes:** Plan §6. Route/preset files are best guesses necessary to make the existing full-page flow reach the new states; preserve the dual-only route guard.

## T18 · Render outcomes on the dual detail page

- **status:** todo
- **model:** opus
- **needs:** T3, T16
- **files:** Best guess: src/components/dashboard/schedule/dual-detail.tsx; src/components/dashboard/schedule/line-row.tsx; tests/schedule-dual-outcomes.spec.ts (new)
- **done when:**
  - [ ] Dual lines render the saved outcome kind and side using the shared result vocabulary.
  - [ ] The displayed team score and result marks agree with the pure outcome calculation, including either forfeiting side.
  - [ ] Outcome-only lines contribute no analyzed match or team analysis statistics, and settled-line protections still apply.
- **notes:** Plan §6. Keep normal played-match navigation and scoring behavior.

## T19 · Render tournament outcomes by round

- **status:** todo
- **model:** opus
- **needs:** T18
- **files:** Best guess: src/components/dashboard/schedule/tournament-detail.tsx; src/components/dashboard/schedule/line-row.tsx; tests/schedule-tournament-outcomes.spec.ts (new)
- **done when:**
  - [ ] A tournament entry displays each outcome on its own round, including rounds without a matches row.
  - [ ] A played round and a different non-played round on the same entry retain separate results and edit/clear targets.
  - [ ] Outcome labels match dual/inline scoring vocabulary and do not add unplayed records to analysis totals.
- **notes:** Plan §6. Any supporting run-grouping adapter must preserve the existing round order and be limited to this rendering contract.

## T20 · Render outcomes in the Schedule drawer

- **status:** todo
- **model:** opus
- **needs:** T9, T19
- **files:** Best guess: src/components/dashboard/schedule/static/event-drawer.tsx; tests/schedule-drawer-outcomes.spec.ts (new)
- **done when:**
  - [ ] Drawer lines and tournament round summaries expose the saved kind/side consistently with event detail.
  - [ ] Outcome-only results receive no played-match report link and resolve drawer score/tick state through shared domain functions.
  - [ ] Player footer and staff action eligibility remain correct as outcomes are recorded and cleared.
- **notes:** Plan §6. Preserve the role states delivered by T8/T9 and do not resurrect Import.

## T21 · Verify the complete Schedule workflow

- **status:** todo
- **model:** opus
- **needs:** T15, T14, T17, T20
- **files:** Best guess: tests/ schedule regression coverage; MAP.md only if routes actually changed
- **done when:**
  - [ ] Required typecheck, lint, format:check and relevant Playwright checks pass, with actual commands/results recorded by the task runner.
  - [ ] Regression coverage exercises all four roles, both event types, both sides of each outcome, clear-then-score, invalid pairs and deletion refusals.
  - [ ] Database verification demonstrates constraints/RLS in the intended development target; non-played outcomes create no match/processing job and do not change historical analysis statistics.
  - [ ] Existing settled-entry and route-map checks pass; MAP.md is regenerated only if the route tree changed.
- **notes:** Plan §7. This is the final integration check, not authorization to deploy or apply production migrations. Fix only failures within this feature's scope.
