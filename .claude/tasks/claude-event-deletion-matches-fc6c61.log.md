# Run log — claude/event-deletion-matches-fc6c61

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Let event deletion detach matches (migration + deleteEvent) — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite); completion `VERDICT: pass`.
**changed:** New migration `20260923021801_event_delete_detaches_matches.sql` — both `program_event_outcomes` scope FKs `restrict → cascade`, `guard_event_delete()` keeps the role checks and entry serialisation but drops the matches/outcomes/forfeit 23514 raise and records `detached_matches` in the audit row. Applied live by the session owner via the Supabase MCP after explicit sign-off (the auto-mode classifier blocked dispatching a subagent with live-DDL authority, so the subagent wrote files only and the live apply ran in-session). `deleteEvent` now also revalidates `/dashboard/matches`. `schedule-event-delete.spec.ts` and `-db.spec.ts` updated to the detach semantics; the db spec's race-order test was reworked too since it hard-coded the old refusal.
**follow-ups:**

1. Add a one-line pointer in the header of `20260910190731_delete_eligible_schedule_event.sql` to the superseding migration.
2. Matches list may want a "reassign to event" affordance now that detached matches are a first-class state (`route.ts:160` already computes `attachable`).
