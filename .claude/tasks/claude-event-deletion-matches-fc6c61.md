# Tasks — claude/event-deletion-matches-fc6c61

> Scope: deleting a team schedule event detaches its matches instead of being blocked, with a prose warning in the confirm dialog

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

## T1 · Let event deletion detach matches (migration + deleteEvent)

- **status:** todo
- **model:** fable
- **files:** supabase/migrations/20260922<HHMMSS>_event_delete_detaches_matches.sql (new, guess), src/lib/schedule/actions.ts (`deleteEvent`, ~line 233), tests/schedule-event-delete.spec.ts, tests/schedule-event-delete-db.spec.ts
- **done when:**
  - [ ] A new file in `supabase/migrations/` does `create or replace function schedule_private.guard_event_delete()` keeping the program-gone early return, the anon/authenticated role check (42501), and the `update public.program_event_entries set id = id where event_id = old.id` serialisation from `20260910190731_delete_eligible_schedule_event.sql`, with the matches/outcomes/forfeit `raise ... 23514` removed; the audit insert's `details` jsonb gains a `detached_matches` integer counted as `count(*) from public.matches m join public.program_event_entries l on l.id = m.event_entry_id where l.event_id = old.id` before the return. The same file alters `program_event_outcomes_entry_scope_fkey` and `program_event_outcomes_event_scope_fkey` to `on delete cascade` (drop + re-add, keeping their column lists and `on update restrict`).
  - [ ] The DDL is applied to the live project via the Supabase MCP `apply_migration` with the same name as the file. Reviewer check via `execute_sql`: `select pg_get_functiondef('schedule_private.guard_event_delete'::regproc)` no longer contains `cannot be deleted` and does contain `detached_matches`; `select conname, confdeltype from pg_constraint where conname in ('program_event_outcomes_entry_scope_fkey','program_event_outcomes_event_scope_fkey')` returns `c` for both.
  - [ ] `deleteEvent` in `src/lib/schedule/actions.ts` calls `revalidatePath("/dashboard/matches")` in addition to the two existing schedule paths, and the owner/coach assertion in `tests/schedule-event-delete.spec.ts` expects `refreshed` to equal exactly `["/dashboard/team/schedule", "/dashboard/team/schedule/event", "/dashboard/matches"]`.
  - [ ] `tests/schedule-event-delete.spec.ts`'s "failures return without revalidation" case no longer lists the "recorded matches or outcomes" message (a generic message such as "Audit unavailable" remains), and `tests/schedule-event-delete-db.spec.ts`'s dependency loop (the three `insert into matches` / `set forfeit` / `set_schedule_outcome` cases) asserts instead that `delete_schedule_event` returns the event id, `program_events` row count for the event is 0, the match row still exists with `event_entry_id is null`, no `program_event_outcomes` row remains for the event, and the `event.deleted` audit row's `details->>'detached_matches'` is `'1'` for the match case and `'0'` for the other two. The audit-failure rollback case (23514 via the local check constraint) is kept.
  - [ ] `npm test -- tests/schedule-event-delete.spec.ts` passes and `npm run lint && npm run typecheck` are clean; the db spec is only run if `SCHEDULE_DELETE_LOCAL_CONTAINER` is set (it self-skips otherwise) — do not point it at any remote.
- **notes:** Decision (user, 2026-09-22): deletable events, matches survive as unassigned program matches. `matches.event_entry_id` is already `on delete set null` and entries cascade from events, so only the trigger raise and the two outcome FKs block this. Inspect the live catalog first (`list_tables` / `execute_sql` on `pg_constraint`) — verified 2026-09-22: both outcome FKs are `r` live, latest applied migration is `20260922042309`, ahead of the repo folder. Before-delete trigger, so the count runs before the entry cascade. Add a header comment superseding "Never detach recorded matches" in the 20260910190731 file. Plan: /Users/cjgimena/.claude/plans/twinkly-sleeping-kahan.md.

## T2 · Warn about attached matches in the delete-event dialog

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** src/components/dashboard/schedule/static/event-actions-menu.tsx, src/components/dashboard/schedule/static/event-drawer.tsx (call site ~line 236, guess), tests/schedule-drawer-actions.spec.ts
- **done when:**
  - [ ] `EventActionsMenu` takes the drawer's already-loaded data (e.g. an `entries: EventEntry[]` prop, or `matchCount` / `hasOutcome` / `teamScore` precomputed in `event-drawer.tsx` from `detail.entries` and `dualScore`), passed from `event-drawer.tsx`; no new fetch, query, or server action is added anywhere in the diff.
  - [ ] When the summed `entry.matches.length` is 0 and no entry has an outcome or legacy `forfeit`, the `ConfirmDialog` keeps a short description with the sentence "Events with recorded matches or outcomes can't be deleted" removed; the `FloatMenuItem` `description` likewise no longer implies deletion can be blocked.
  - [ ] When the count is non-zero (or an outcome/forfeit exists), the dialog renders `<ConfirmProse>` children in the `delete-match-dialog.tsx` style (load-bearing nouns in `Em`) that name the count with correct pluralisation ("1 match stays" / "9 matches stay"), say the matches remain in the library but lose their line, name the dual team result via `dualScore` (e.g. "9–0") when the event is a dual with a non-0–0 score, and end with "There is no undo."
  - [ ] `tests/schedule-drawer-actions.spec.ts` gains a case that opens "Settled Dual" as owner or coach, opens Delete event, asserts the `alertdialog` text contains "9 matches" and "9–0", confirms, and asserts `window.actionCalls` equals `[{ action: "deleteEvent", input: "dual-settled" }]`; the existing "Long Open Dual" flow still asserts the count copy is absent, and the refusal test's `failNextDelete` string is changed to a generic server message (not the old "cannot be deleted" copy).
  - [ ] `npm test -- tests/schedule-drawer-actions.spec.ts` passes and `npm run lint && npm run typecheck` are clean.
- **notes:** No type-to-confirm, no two-step (user decision 2026-09-22). `ConfirmProse` and `Em` live in `src/components/ui/confirm-dialog.tsx` (~line 213); `ConfirmDialog` renders `children` as the body when present. `dualScore` is in `src/lib/schedule/entry-state.ts:347`. The harness fixture `dual-settled` already has 9 played matches with `teamScore { us: 9, them: 0 }` — no new fixture needed. Watch the settled-dual spec at line ~195, which assumes staff-capable viewers see a specific footer; open it as owner/coach so the Event actions menu is rendered. Plan: /Users/cjgimena/.claude/plans/twinkly-sleeping-kahan.md.
