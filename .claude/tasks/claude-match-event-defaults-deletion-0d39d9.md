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

- **status:** done
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

- **status:** done
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

- **status:** done
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

- **status:** done
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

## T6 · Palette: muted "No event" on match rows, no fake Events entry

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/search/search-command-palette.tsx, tests/match-no-event.spec.ts (guess; may be a new offline spec if the palette cannot be loaded there)
- **done when:**
  - [ ] `MatchResult.tournamentName` is `string | null`, and the match-result mapping (line ~563) passes `m.tournament_name` through; the string `"Unknown event"` no longer appears anywhere in `search-command-palette.tsx`.
  - [ ] The match row (line ~1135) renders the literal text "No event" with `color: var(--ink-400)` when `tournamentName` is null, and the real name in the existing style otherwise.
  - [ ] In the `eventCounts` loop (line ~579), rows with a null `tournament_name` are skipped, so the Events group never contains an entry named "Unknown event" or "No event"; opponent counting for those rows is unchanged.
  - [ ] An offline spec asserts, for a fixture with one null-event match and one named-event match, that the row markup contains "No event" and the events list contains only the named event (via an extracted pure helper or renderToStaticMarkup through `tests/fixtures/vm-modules.ts` `createLoader()`).
- **notes:** Interpretation: an event group is a searchable event name, so eventless matches simply do not appear in it. Follow the muted pattern already used in `match-card-list.tsx`. If the mapping logic is hard to load offline, extract it to a small pure function (never a `foo.ts` beside `foo.tsx` of the same basename).

## T7 · Delete unused featured-match-card and match-event-header

- **status:** done
- **model:** sonnet
- **files:** src/components/dashboard/matches/featured-match-card.tsx, src/components/dashboard/matches/match-event-header.tsx, MAP.md (only if `npm run map` changes it)
- **done when:**
  - [ ] Both files are deleted in the diff.
  - [ ] `grep -rn "featured-match-card\|match-event-header\|FeaturedMatchCard\|MatchEventHeader" src tests scripts` returns no matches after the change (docs/ux-overhaul-brief.md:299 is a point-in-time brief and is intentionally left untouched).
  - [ ] `npm run typecheck` passes and the diff touches no file other than the two deletions (plus MAP.md if the generator changes it).
- **notes:** Origin: T5 log follow-up #3. Re-run the grep before deleting.

## T8 · Clear `round` on both event detaches

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<ts>_detach_clears_round.sql (new), tests/schedule-event-delete-db.spec.ts, tests/detach-match-db.spec.ts, docs/ui-revamp-guardrails.md (guess)
- **done when:**
  - [ ] A new migration `create or replace`s `schedule_private.guard_event_delete()` and `public.detach_match_from_event_line(uuid)` with bodies identical to the live ones except that each detach UPDATE reads `set event_entry_id = null, tournament_name = null, round = null`; `matches_block_client_regraft` is not in the diff.
  - [ ] `tests/schedule-event-delete-db.spec.ts`'s detach assertion also checks `round is null`, and `tests/detach-match-db.spec.ts` asserts `round is null` after the detach and adds a dual-line case (`round = 'S1'`) ending with `round is null` and the entry's slot untouched.
  - [ ] In `docs/ui-revamp-guardrails.md`, both the event-delete and `detach_match_from_event_line` paragraphs say the detach touches only `event_entry_id`, `tournament_name` and `round`, and that `date`, `match_type` and `court_type` stay; the never-list is unchanged.
  - [ ] The migration file is named with the version live recorded for it (`list_migrations` shows it).
- **notes:** Author's decision: round is cleared for both dual and tournament. `guard_schedule_result` / `guard_reserved_schedule_result` return early when the new `event_entry_id` is null. Read live bodies with `pg_get_functiondef` first.

## T9 · Choose the round inside "Add to an event"

- **status:** done
- **model:** opus
- **files:** src/lib/schedule/attach-line-state.ts, src/components/dashboard/matches/match-actions/attach-line-picker.tsx, src/components/dashboard/matches/match-actions/edit-match-event.tsx, src/components/dashboard/matches/match-actions/edit-match-dialog.tsx, tests/edit-match-dialog-logic.spec.ts, tests/edit-match-event.spec.ts (guess)
- **routes:** /dashboard/matches
- **done when:**
  - [ ] In `attachLineGroups` with `mode: "attach"`, a tournament line whose `round` is null is `state: "available"`, `reason: null`, and every `AttachLine` carries `takenRounds: string[]` (normalized codes of the entry's match and outcome rounds); with `mode: "upload"` it is still `needsRound` / "Set the round first". `tests/edit-match-dialog-logic.spec.ts` updates the ~line 285 case, keeps `roundTaken` for a preset round, and asserts `takenRounds`.
  - [ ] In `LineRow`, an available tournament line with `round === null` shows "Choose a round" in the tail instead of "Awaiting result".
  - [ ] `edit-match-event.tsx` exports `EventRoundField({ value, takenRounds, onChange, disabled, error })`: label "Round", underline `MenuSelect`, placeholder "Not set", options = `roundOptionsFor("tournament")` minus `takenRounds`, `error` under it in `var(--danger)`. The dialog renders it in the event section when `pendingLine.eventKind === "tournament"`, and the header line and the "Saving makes this the result for …" sentence read the dialog's `round` state.
  - [ ] Save with a pending tournament line and an empty round sends no request and shows `fieldErrors.round` "Choose the round."; with a round set, the existing PATCH + `attachMatchToLine` path runs unchanged.
  - [ ] `tests/edit-match-event.spec.ts` renders `EventRoundField` with `takenRounds: ["QF"]` and asserts the markup lacks "Quarterfinal", contains "Semifinal", and renders the error text when given.
- **notes:** `attach_match_to_event_line`'s "That round already has a result." stays the backstop. Follow `.skills/advantage-analytics-design/SKILL.md`; no new icon.

## T10 · `set_match_round_on_line` RPC + regraft guard on `round`

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<ts>_set_match_round_on_line.sql (new), tests/set-match-round-db.spec.ts (new), docs/ui-revamp-guardrails.md (guess)
- **done when:**
  - [ ] Migration creates `public.set_match_round_on_line(p_match_id uuid, p_round text) returns jsonb`, SECURITY DEFINER, `search_path ''`, mirroring `attach_match_to_event_line`: 42501 when the caller is not `created_by` or can't manage the schedule; 23514 for no event ("This match is not on an event."), a dual line ("A dual line's round is its slot."), a blank round ("Set the round."), or a round held by another match on the entry ("That round already has a result."); otherwise, under marker `advantage.round_match_id`, updates only `round` and logs `match.round_changed` (`match_id`, `entry_id`, `event_id`, `from`, `to`); the audit CHECK is re-created from the live allowlist plus the new verb; `revoke … from public, anon` / `grant execute … to authenticated`.
  - [ ] The `matches_block_client_regraft` trigger is re-created as `BEFORE INSERT OR UPDATE OF program_id, event_entry_id, player1_id, source_provider, analysis_method, round`, and the function (otherwise the live body verbatim) refuses a client UPDATE changing `round` while the match stays on a line, unless `advantage.round_match_id = old.id::text`; a round change on an unlinked match and every existing branch are unchanged.
  - [ ] `tests/set-match-round-db.spec.ts` (shape of `tests/detach-match-db.spec.ts`) covers: creator+manager `SF → F` succeeds with an audit row; a round held by another match → 23514; a round with a saved outcome → 23514; a bare client round update on a linked match → 42501; the same on an unlinked match succeeds.
  - [ ] `docs/ui-revamp-guardrails.md` gains a fifth reviewed-exception paragraph on the attach exception's terms (tournament lines only, only `round`, audit-logged, bare client UPDATE refused).
  - [ ] The migration file is named with the version live recorded for it (`list_migrations` shows it).
- **notes:** No unique index on `matches(event_entry_id, round)` — the admin console's reserved-result flow is out of scope. Adding `round` to the trigger's column list is DDL on the trigger.

## T11 · Editable Round for a match on a tournament line

- **status:** todo
- **model:** opus
- **needs:** T9, T10
- **files:** src/app/api/matches/[matchId]/route.ts, src/lib/schedule/attach-line.ts, src/components/dashboard/matches/match-actions/edit-match-dialog.tsx, src/components/dashboard/matches/match-actions/edit-match-event.tsx, tests/edit-match-event.spec.ts (guess)
- **routes:** /dashboard/matches, /dashboard/team/schedule/[eventId]
- **done when:**
  - [ ] GET `/api/matches/[matchId]` returns `canEditRound: boolean` (match on a line, `event.eventKind === "tournament"`, and the same `runsSchedule` that gates `canDetach`) and `event.takenRounds: string[]` (the entry's other matches' rounds and its outcome rounds).
  - [ ] For a linked tournament match with `canEditRound`, the event section renders `EventRoundField` preset to the stored round (stored round not excluded), and the sentence reads "The date and surface come from the tournament. Change them in Schedule."; a dual match or `canEditRound: false` renders today's locked copy and no select.
  - [ ] Save on a linked tournament match with a changed round calls a new `setMatchRoundOnLine({ matchId, round })` server action in `attach-line.ts` (rpc `set_match_round_on_line`, error passed through, revalidates the same paths as `attachMatchToLine` plus `/dashboard/team/schedule/${eventId}`) after the PATCH; the PATCH still carries no `round` for a linked match; an empty round refuses Save with "Choose the round.".
  - [ ] The RPC's refusal is shown verbatim in the dialog's `error` slot and the dialog stays open.
  - [ ] `tests/edit-match-event.spec.ts` asserts the tournament sentence with and without `canEditRound`, and that the dialog calls `setMatchRoundOnLine` only for a linked tournament match.
- **notes:** The Schedule tournament page keys rows on `matches.round`, so a changed round moves the match to that round's row. Dual lines stay locked.
