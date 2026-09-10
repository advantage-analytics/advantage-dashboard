# Dual-match workflow implementation plan

## Assumptions adopted from the design review

- Owner and coach may delete an event; staff and player may not.
- A non-played result is cleared before it is changed to another result.
- Tournament creation remains singles-only; supported draw values are the
  existing values, each with explanatory copy.
- Viewer footer copy is **Open dual** / **Open tournament**.

## 1. Persist non-played results at the correct grain

**Files**

- `supabase/migrations/<timestamp>_add_program_event_outcomes.sql`
- `src/lib/schedule/types.ts`
- `src/lib/schedule/entry-state.ts`
- `src/lib/data/schedule-server.ts`
- `src/lib/schedule/line-status.ts`
- Focused unit tests under `tests/` or the existing schedule unit-test location

**Change**

Create a schedule-outcome table keyed by event entry and round, with outcome
kind, side, actor, and timestamp. Enforce one outcome per dual line or
tournament round and reject impossible kind/round combinations. Extend the
schedule domain types and loader so a displayed line/round resolves to exactly
one of: unplayed, played, or a non-played result. Keep outcomes out of
`matches`, analysis, and statistics.

**Verification**

Apply the migration to the development database; verify constraints and RLS.
Run domain tests for every outcome kind and side, clearing, a dual line, and
multiple tournament rounds under one entry. Run typecheck.

## 2. Add authorized outcome and event-management server actions

**Files**

- `src/lib/schedule/actions.ts`
- `src/lib/workspace/types.ts`
- `src/lib/schedule/outcomes.ts` (new, if outcome validation needs a pure home)
- Focused server-action/unit tests

**Change**

Add one staff-authorized action to set or clear a non-played outcome, with
conflict checks against a recorded match. Update `recordResult` to refuse a
score when an outcome exists. Add an owner-or-coach event-deletion action that
first refuses events with matches or outcomes, then deletes only a safe empty
event and revalidates Schedule and the event route. Introduce named capability
helpers so the Schedule presentation and server actions derive the same role
policy.

**Verification**

Test owner, coach, staff, and player authorization; result/match conflict
refusal; successful set and clear; blocked deletion with dependent records;
and successful safe deletion. Confirm all writes revalidate list and detail
paths.

## 3. Make Schedule drawer actions role-aware and remove fake import

**Files**

- `src/app/dashboard/team/schedule/page.tsx`
- `src/components/dashboard/schedule/static/static-schedule.tsx`
- `src/components/dashboard/schedule/static/event-drawer.tsx`
- `src/components/ui/alert-dialog.tsx` or the repository’s existing alert
  dialog wrapper, only if it requires a small shared extension
- Schedule drawer/component tests

**Change**

Pass explicit schedule capabilities from the server page into the table and
drawer. Replace the viewer’s header **Open event** link with the sole
full-width footer ghost action **Open dual** or **Open tournament**. Keep the
staff footer primary as **Enter results**. Add a staff action menu containing
edit and, when eligible, delete; show deletion confirmation and server errors
in the drawer. Remove the nonfunctional Schedule Import button.

**Verification**

Component and Playwright coverage for the player, staff, owner, and coach
drawer states; exactly one viewer event-open action; no Schedule Import
control; deletion confirmation and blocked-delete message; keyboard/focus and
tooltip behavior for the action menu.

## 4. Make dual lineup assignment structured and duplicate-safe

**Files**

- `src/components/dashboard/schedule/static/dual-build-step.tsx`
- `src/components/dashboard/schedule/static/lineup-name-picker.tsx`
- `src/lib/schedule/entry-plan.ts`
- `src/lib/schedule/actions.ts`
- Focused lineup draft/validation tests

**Change**

Replace typed slash-pair entry with an identity-based two-player doubles
selection. Give each lineup row the standard rounded hover wash and neutral
resting selection treatment. Prevent duplicate identity inside one line and
duplicate exact doubles pairs in the client, while allowing an athlete to
appear once in singles and once in doubles. Repeat the same checks in the
server-side update/create path so stale or forged clients cannot persist an
invalid lineup. Change the builder’s forfeit control to distinguish our side
from the opponent’s side.

**Verification**

Unit tests for all valid and invalid lineup combinations, including equal
display names with distinct ids. Browser coverage for selecting and clearing a
doubles pair, the unavailable-choice explanation, both forfeit sides, hover,
focus, and settled-line read-only behavior.

## 5. Clarify tournament field, draw, and venue presentation

**Files**

- `src/components/dashboard/schedule/static/static-tournament-builder.tsx`
- `src/components/dashboard/schedule/static/pinned-event-bar.tsx`
- `src/components/dashboard/schedule/static/dual-build-step.tsx`
- `src/lib/schedule/format.ts`
- Focused tournament-builder tests

**Change**

Make the tournament field’s roster inclusion control unmistakably identify
which team athlete is competing before exposing draw and optional seed. Add
plain-language descriptions to the existing draw options rather than inventing
new values. Route venue rendering through the shared title-case formatter in
the pinned gray bar and every affected wizard label.

**Verification**

Test roster inclusion by stable identity, retained draw/seed values on edit,
draw descriptions, and Home/Away/Neutral title casing. Run relevant browser
wizard coverage for new and edit tournament flows.

## 6. Unify the score UI around played and non-played results

**Files**

- `src/components/dashboard/schedule/score-entry.tsx`
- `src/components/dashboard/schedule/score-only-flow.tsx`
- `src/components/dashboard/schedule/line-row.tsx`
- `src/components/dashboard/schedule/dual-detail.tsx`
- `src/components/dashboard/schedule/tournament-detail.tsx`
- `src/components/dashboard/schedule/static/event-drawer.tsx`
- Schedule score and result tests

**Change**

Add a single result choice to inline and full-page scoring: played score,
ours/theirs × forfeit/default/withdrawal, and clear outcome. Render the same
outcome vocabulary consistently in the detail page, drawer, result marks, and
team score calculation. Ensure tournament result selection is scoped to the
selected round rather than the whole entry.

**Verification**

Playwright coverage for each non-played result from both sides, clear then
score, conflict messaging, dual team-total changes, and a tournament with
different outcomes across rounds. Confirm no outcome path creates a video or
analysis job.

## 7. Run the full regression and generated-file checks

**Files**

- `tests/` additions from steps 1–6
- `MAP.md` only if route changes were actually introduced (none are expected)

**Change**

Run the focused checks while implementing each surface, then perform the
cross-surface regression pass. Regenerate `MAP.md` only if a route is added or
removed; this plan intentionally reuses all existing routes.

**Verification**

Run `npm run typecheck`, `npm run lint`, `npm run format:check`, and the
relevant Playwright suite. Run `npm run map` followed by the repository’s map
check only if the route tree changes. Validate the migration and live schema
before any production application.

## Test strategy

Test from the data boundary outward: database constraints and outcome-state
derivation first; authorization and conflict behavior second; component role
states and browser flows last. Keep result calculation tests pure, and use
Playwright only to prove each role sees one truthful next action and that the
same result behavior is reachable in the drawer, detail page, and score flow.
The full regression must preserve the existing event-edit planner’s settled
entry protections and must prove that no non-played outcome enters match
analysis or changes historical statistics.
