# Tasks — claude/match-event-defaults-deletion-0d39d9

> Scope: Match event defaults, remove-from-event, and event delete detaching matches

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

## T1 · Let an event delete detach its matches under a client session

- **status:** todo
- **model:** fable
- **files:** supabase/migrations/<ts>_event_delete_detaches_under_client.sql (new), tests/schedule-event-delete-db.spec.ts, docs/ui-revamp-guardrails.md (guess)
- **done when:**
  - [ ] A new migration replaces `schedule_private.guard_event_delete()` so that, before returning `old`, it sets a transaction-local marker (e.g. `set_config('advantage.detach_event_id', old.id::text, true)`) and itself runs `update public.matches set event_entry_id = null, tournament_name = null where event_entry_id in (select id from public.program_event_entries where event_id = old.id)`, and replaces `public.matches_block_client_regraft()` so its UPDATE branch accepts `old.event_entry_id is not null and new.event_entry_id is null` only when that marker names the event the old entry belongs to; every other existing refusal in the trigger is unchanged.
  - [ ] `tests/schedule-event-delete-db.spec.ts` sets `request.jwt.claims` to `{"role":"authenticated","sub":"<user>"}` (not only `request.jwt.claim.sub`) in its `actor` string, and its detach assertion also checks `tournament_name is null` on the detached match; a comment states it failed against the pre-migration trigger.
  - [ ] The audit row's `detached_matches` count still equals the number of matches detached (spec asserts it for the one-match case).
  - [ ] `docs/ui-revamp-guardrails.md` gains a fourth reviewed-exception paragraph for the event-delete detach, on the same terms as the `attach_match_to_event_line` one (single explicit staff action, only `event_entry_id` + `tournament_name`, never score/format/player1_id/program_id, audit-logged).
  - [ ] The migration file is in the diff and the commit message records that it was applied to the live project (`pouxujkhtbvkdwbzfvka`) via `apply_migration`.
- **notes:** Root cause: FK `ON DELETE SET NULL` fires `matches_block_client_regraft`, which refuses entry→NULL for any `authenticated` JWT. The live spec never reproduced it because it doesn't set `request.jwt.claims`. Interpretation: "unassigns" also clears `tournament_name`; `match_type` is left alone. Verify the live trigger body with `pg_get_functiondef` before writing — repo migrations are ~100 behind. Author's repro: event `bc14ddbf-16ba-4359-a762-9c846d4882a9` (1 match) on cjgimena@g.ucla.edu — do not delete it yourself.

## T2 · Add detach_match_from_event_line RPC

- **status:** todo
- **model:** fable
- **needs:** T1
- **files:** supabase/migrations/<ts>_detach_match_from_event_line.sql (new), tests/detach-match-db.spec.ts (new), docs/ui-revamp-guardrails.md (guess)
- **done when:**
  - [ ] Migration creates `public.detach_match_from_event_line(p_match_id uuid) returns jsonb`, SECURITY DEFINER, `search_path ''`, mirroring `attach_match_to_event_line`: refuses (42501) when the caller is not `created_by` of the match or `can_manage_program_schedule(program_id)` is false; refuses (23514) when `event_entry_id is null`; otherwise sets a transaction-local marker (`advantage.detach_match_id`), updates only `event_entry_id = null, tournament_name = null`, and inserts `program_audit_log` action `match.detached` with match_id, entry_id, event_id.
  - [ ] `matches_block_client_regraft()` accepts the entry→NULL transition when `advantage.detach_match_id = old.id::text`, and still refuses a bare client `update matches set event_entry_id = null` (live spec asserts both, with `request.jwt.claims` set).
  - [ ] `revoke execute … from public, anon` and `grant execute … to authenticated` are in the migration.
  - [ ] Live spec covers: creator+manager succeeds and audit row exists; non-creator manager is refused; a `program_event_outcomes` row for the entry is untouched.
  - [ ] Migration applied to live (noted in the commit message); the guardrails exception paragraph from T1 is extended to name this function.

## T3 · "Remove from event" in the Edit Match dialog

- **status:** todo
- **model:** opus
- **needs:** T2
- **files:** src/components/dashboard/matches/match-actions/edit-match-dialog.tsx, src/app/api/matches/[matchId]/route.ts, tests/edit-match-dialog-logic.spec.ts (guess)
- **routes:** /dashboard/matches
- **done when:**
  - [ ] GET `/api/matches/[matchId]` returns `canDetach: boolean` (true when `event_entry_id` is set, the viewer is `created_by`, and the workspace role can manage the schedule), computed next to `canAttach`.
  - [ ] For a linked match with `canDetach`, the event context section renders a text action "Remove from event" (blue text, no icon, same classes as "Add to an event"); without `canDetach` it renders the existing "Change them in Schedule" copy only.
  - [ ] Clicking it opens a `ConfirmDialog` (tone danger, copy names the event) and on confirm calls `detach_match_from_event_line`; on success the dialog reloads its match, the Event field is empty and editable, and a toast reads "Removed from <event name>".
  - [ ] The RPC's error message is shown in the confirm's `error` slot verbatim.
  - [ ] An offline spec asserts the action is present/absent by `canDetach` and that the post-detach render shows the empty Event field.
- **notes:** Interpretation of "remove a match from editing the match": remove it from its event, since "Delete match" already exists in `match-actions-menu.tsx`. Use `createLoader()` from `tests/fixtures/vm-modules.ts` for the spec.

## T4 · Wizard saves no event instead of "P1 vs P2"

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts, tests/wizard-event-default.spec.ts (new) (guess)
- **done when:**
  - [ ] `useUploadMatchWizard.ts` no longer builds `${formData.playerName} vs ${formData.opponentName}`; the `eventName` passed to `buildMatchData` is `formData.eventName` as typed, so an empty field yields `tournament_name: null` (`utils.ts:162` unchanged).
  - [ ] A preset/attached line still carries its event name (`preset.eventName`) into the saved row — a spec covers both the empty and preset cases through `buildMatchData`.
  - [ ] `grep -rn "vs \${" src/components/dashboard/matches/new-match-wizard` finds no tournament/event-name construction.
- **notes:** One-off live repair, not code: `update matches set tournament_name = null where tournament_name = player1_name || ' vs ' || player2_name` (known row `973c2645…`); run it by hand after T5 lands.

## T5 · Render a match with no event as "No event"

- **status:** todo
- **model:** opus
- **needs:** T4
- **files:** src/lib/data/matches-list-types.ts, src/lib/data/match-detail-server.ts, src/lib/data/home-recent-data.ts, src/components/dashboard/matches/match-card-list.tsx, src/components/dashboard/matches/match-drawer.tsx (guess)
- **routes:** /dashboard/matches, /dashboard/matches/[matchId], /dashboard
- **done when:**
  - [ ] No loader substitutes `"Unknown Event"` / `"Unknown event"` for a null `tournament_name`; `tournamentName` is `string | null` end to end, and `matches-page-content.tsx` search/sort handle the null without throwing.
  - [ ] The Matches list event cell and the match drawer field render the literal "No event" in `var(--ink-400)` when null; the match-detail hero omits the event line rather than printing a placeholder.
  - [ ] `realTournamentName()` and the `/m/[token]` share page behave as before (existing spec unchanged or extended).
  - [ ] An offline spec renders a list row and the drawer with `tournament_name: null` and asserts the "No event" text.
- **notes:** Muted "No event" is the interpretation of "default should be no event"; follow `.skills/advantage-analytics-design/SKILL.md` for the muted token.
