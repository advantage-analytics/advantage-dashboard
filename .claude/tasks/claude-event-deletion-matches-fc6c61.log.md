# Run log — claude/event-deletion-matches-fc6c61

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Let event deletion detach matches (migration + deleteEvent) — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion `VERDICT: pass`.
**changed:** New migration `20260923021801_event_delete_detaches_matches.sql` — both `program_event_outcomes` scope FKs `restrict → cascade`, `guard_event_delete()` keeps the role checks and entry serialisation but drops the matches/outcomes/forfeit 23514 raise and records `detached_matches` in the audit row. Applied live by the session owner via the Supabase MCP after explicit sign-off (the auto-mode classifier blocked dispatching a subagent with live-DDL authority, so the subagent wrote files only and the live apply ran in-session). `deleteEvent` now also revalidates `/dashboard/matches`. `schedule-event-delete.spec.ts` and `-db.spec.ts` updated to the detach semantics; the db spec's race-order test was reworked too since it hard-coded the old refusal.
**follow-ups:**

1. Add a one-line pointer in the header of `20260910190731_delete_eligible_schedule_event.sql` to the superseding migration.
2. Matches list may want a "reassign to event" affordance now that detached matches are a first-class state (`route.ts:160` already computes `attachable`).

## T2 · Warn about attached matches in the delete-event dialog — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion `VERDICT: pass`.
**changed:** `EventActionsMenu` takes `entries` + `isDual` from the drawer's loaded `detail`; a local `deleteCost()` derives match count, outcome presence and `dualScore` — no new query. Empty events keep a one-line description; events with matches/outcomes render `ConfirmProse` naming the count (pluralised), that matches stay in the library but lose their line, the dual team result, and "There is no undo." Menu-item description now reads "Recorded matches stay in the library". Spec gains the Settled Dual case; refusal test uses a generic server error. Deviation from criterion 4: test asserts "7–0" not "9–0" — `dualScore` applies ITA scoring (6 singles + 1 doubles) so nine won lines are 7–0, matching the drawer's own score row; the "9–0" in the criterion was the fixture's stale list-row `teamScore`. Reviewer verified and accepted.
**follow-ups:**

1. Fix the `dual-settled` fixture's list-row `teamScore { us: 9, them: 0 }` (`tests/fixtures/schedule-drawer-actions-harness.tsx:184`) to 7–0 so it agrees with its own lines.
2. The outcome-only sentence ("Lines settled by forfeit, default or withdrawal…") has no harness fixture with an outcome, so it is untested.

## T3 · Rewrite doubles-via-SwingVision copy to score-only — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion `VERDICT: pass`.
**changed:** Every claim that doubles arrive via SwingVision now says doubles lines record a score only: the help page's SwingVision card ("Singles only.") and video section, the Team Home dual card footer, the design-system primitives reference, the `supportsVideo` doc comment in `entry-state.ts`, the court-record note, the schedule README's post-save footer sentence (a doubles line offers nothing), and the D8 row of `docs/ux-overhaul-brief.md` (outside `files:`, required by the grep criterion). Comments and copy only; no logic. The first dispatch was cut off by a session rate limit after lint/typecheck passed; the same subagent was resumed to finish the README line and the spec.
**follow-ups:**

1. Sweep `supabase/functions/` and the email templates for the same "doubles via SwingVision" phrasing — the grep criterion covered only `src`, `.skills` and `docs`.
