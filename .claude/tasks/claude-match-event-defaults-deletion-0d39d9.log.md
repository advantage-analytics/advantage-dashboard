# Run log — claude/match-event-defaults-deletion-0d39d9

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T4 · Wizard saves no event instead of "P1 vs P2" — done

**gate:** mechanical GATE FAIL on one unrelated live spec (`claim-eyebrow-width.spec.ts`, programs page query error) that passed 3/3 re-run in isolation — known full-suite flake; the other 4252 passed. completion `VERDICT: pass`.
**changed:** `useUploadMatchWizard.ts` drops the `${playerName} vs ${opponentName}` fallback, so an empty Event field saves `tournament_name: null`; preset/attached lines still carry their event name. New `tests/wizard-event-default.spec.ts` covers empty and named cases through `buildMatchData`.
**follow-ups:**

1. Live repair after T5: `update matches set tournament_name = null where tournament_name = player1_name || ' vs ' || player2_name` (known row `973c2645…`).
2. T1 dispatch was refused by the auto-mode classifier (applies a migration to prod); T1 reset to `todo` and T4 run out of order. T1/T2 need the author to allow the live `apply_migration`.

## T5 · Render a match with no event as "No event" — done

**gate:** mechanical GATE PASS; completion `VERDICT: pass`. widget-states: loading/empty/error paths untouched in every changed widget.
**changed:** Loaders (`matches-list-types.ts`, `match-detail-server.ts`, `home-recent-data.ts`) pass a null `tournament_name` through; `tournamentName` is `string | null` on `Match`, `DisplayMatch`, `EventGroup`. Matches list cell, match drawer and Home event heading show muted "No event" (`var(--ink-400)`); match-detail breadcrumb omits the event crumb; hero already skipped it. Search/sort in `matches-page-content.tsx` null-safe (no-event sorts last ascending). Delete-dialog labels fall back to "P1 vs P2". New offline spec `tests/match-no-event.spec.ts`.
**follow-ups:**

1. `search-command-palette.tsx:563,579` still fall back to "Unknown event".
2. Drawer Court and Home/Away fields still read "Not specified".
3. `featured-match-card.tsx` and `match-event-header.tsx` look dead (no importers) — candidates for deletion.
4. Live repair from T4 is now due: `update matches set tournament_name = null where tournament_name = player1_name || ' vs ' || player2_name`.

## T1 · Let an event delete detach its matches under a client session — done

**gate:** mechanical GATE PASS; completion `VERDICT: pass` (last criterion judged under the author's in-chat amendment: write the migration, do not apply it).
**changed:** New `supabase/migrations/20260929170000_event_delete_detaches_under_client.sql` — `guard_event_delete` sets a transaction-local `advantage.detach_event_id` marker and detaches its matches itself (`event_entry_id` + `tournament_name` → null) before the entry cascade; `matches_block_client_regraft` (copied verbatim from live) accepts entry→null only under that marker for an entry of that event. Spec actor now sets `request.jwt.claims`; detach asserts `tournament_name is null`. Guardrails doc gains the fourth reviewed exception. **NOT applied to live** — the author applies it.
**follow-ups:**

1. After applying live, delete event `bc14ddbf-16ba-4359-a762-9c846d4882a9` from the app and confirm its match shows "No event".
2. Add a negative spec case: a bare client `update matches set event_entry_id = null` must still raise 42501.
3. `20260923021801_event_delete_detaches_matches.sql` header still says the FK does the detaching — a pointer to the new migration would help.

## T2 · Add detach_match_from_event_line RPC — done

**gate:** mechanical GATE PASS; completion `VERDICT: pass` (last criterion under the author's amendment: not applied live).
**changed:** New `supabase/migrations/20260929170100_detach_match_from_event_line.sql` (applies after T1's): re-creates `program_audit_log_action_check` from the live allowlist + `match.detached`; `matches_block_client_regraft` = T1's body plus a `advantage.detach_match_id` branch gated on `can_manage_program_schedule`; new SECURITY DEFINER `detach_match_from_event_line(uuid)` mirroring the live attach RPC, audit-logged, grants to `authenticated` only. New opt-in local-container spec `tests/detach-match-db.spec.ts` (not run — Docker down). Guardrails exception extended. **NOT applied to live.**
**follow-ups:**

1. Apply 20260929170000 then 20260929170100 live. If another audit verb lands live first, add it to the re-created CHECK.
2. Run the spec against the local container (`DETACH_MATCH_LOCAL_CONTAINER=…`) — the SQL has not been parsed by Postgres yet.
3. A match with `program_id` null on a line cannot be detached (matches the attach rule) — confirm that's wanted.

## T3 · "Remove from event" in the Edit Match dialog — done

**gate:** mechanical GATE PASS; completion `VERDICT: pass`. widget-states: dialog loading/empty/error paths unchanged; only an inline confirm pending label added.
**changed:** GET `/api/matches/[matchId]` returns `canDetach` beside `canAttach`. New `detachMatchFromLine` server action in `src/lib/schedule/attach-line.ts` calls `detach_match_from_event_line` and passes the RPC error through. Event rows extracted to new `edit-match-event.tsx` (shared `EVENT_ACTION_CLS`); a linked match with `canDetach` shows blue-text "Remove from event" → danger `ConfirmDialog` naming the event → toast "Removed from <event>" and the dialog reloads with an empty, editable Event field. New offline spec `tests/edit-match-event.spec.ts`; `edit-match-pending.spec.ts` follows the extraction.
**follow-ups:**

1. The button errors ("function not found") until 20260929170100 is applied live.
2. Eyes-on: a team match on an event, signed in as a schedule manager; check Esc in the confirm closes only the confirm.

## T6 · Palette: muted "No event" on match rows, no fake Events entry — done

**gate:** mechanical GATE PASS; completion `VERDICT: pass`. widget-states: palette loading/empty/error paths untouched.
**changed:** `search-command-palette.tsx` — `MatchResult.tournamentName` is `string | null`, match rows show muted "No event" (`var(--ink-400)`), "Unknown event" gone; Events group built by new pure `countEvents()` (`search/event-counts.ts`), which skips null-event rows. `ResultRow` exported for the spec; two new tests in `tests/match-no-event.spec.ts`.

## T7 · Delete unused featured-match-card and match-event-header — blocked

**gate:** mechanical GATE FAIL — `tests/design-drift.spec.ts`: "Tailwind default-palette class: 0 (seed 1) — seed is stale — lower it to 0 in scripts/check-design-drift.mjs". The deleted files held the last such class. Completion review not run.
**reason:** the fix (lower the seed) touches `scripts/check-design-drift.mjs`, which criterion 3 forbids ("the diff touches no file other than the two deletions"). Needs the author to widen the criterion.
**stash:** eb0fb2d796ad15775fe3449b65611f7f2ad63c56

## T7 · Delete unused featured-match-card and match-event-header — done

**gate:** mechanical GATE PASS; completion `VERDICT: pass` (criterion 3 widened by the author in chat to allow the drift seed change).
**changed:** Restored stash eb0fb2d7: `featured-match-card.tsx` and `match-event-header.tsx` deleted (no importers). `scripts/check-design-drift.mjs` `defaultPalette` seed 1 → 0 — the deleted files held the last Tailwind default-palette class. MAP.md unchanged.

## T8 · Clear `round` on both event detaches — done

**gate:** mechanical GATE PASS; completion `VERDICT: pass`.
**changed:** `supabase/migrations/20260929213016_detach_clears_round.sql` — `guard_event_delete` and `detach_match_from_event_line` now also set `round = null` (dual and tournament); applied live via `apply_migration` (version 20260929213016) and the file named to match. Both DB specs assert `round is null`; `detach-match-db.spec.ts` gains a dual-line case. Guardrails paragraphs updated.
**follow-ups:**

1. The T1/T2 migration headers still say the round stays; the new migration's header supersedes them (applied migrations aren't edited).

## T9 · Choose the round inside "Add to an event" — done

**gate:** mechanical GATE PASS; completion `VERDICT: pass`. widget-states: dialog loading/empty/error paths unchanged; adds a field-level error only.
**changed:** `attachLineGroups` (attach mode) leaves roundless tournament lines available and every line carries `takenRounds`; upload mode unchanged. Picker tail reads "Choose a round". New `EventRoundField` in `edit-match-event.tsx`, shown in the dialog's event section for a pending tournament line (taken rounds filtered out); Save refuses an empty round with "Choose the round."; picking a tournament line resets a non-tournament round. Specs updated/added.
**follow-ups:**

1. "Keep as one-off" after choosing a round in the event section leaves that round in Details (same state) — harmless.

## T10 · `set_match_round_on_line` RPC + regraft guard on `round` — done

**gate:** mechanical GATE PASS; completion `VERDICT: pass`.
**changed:** `supabase/migrations/20260929215610_set_match_round_on_line.sql`, applied live via `apply_migration`: new SECURITY DEFINER `set_match_round_on_line(uuid, text)` (tournament lines only, taken-round refusal, `match.round_changed` audit, same-round no-op); `matches_block_client_regraft` trigger now also fires on `round` and refuses a client round change on a match that stays on a line unless `advantage.round_match_id` is set. Opt-in spec `tests/set-match-round-db.spec.ts`; fifth guardrails exception. Rolled-back live probe: a client round change on an unlinked match still passes.
**follow-ups:**

1. The three DB specs (detach, event-delete, set-round) have never run — they need the local container.
2. A partial unique index on `matches(event_entry_id, round)` would make the taken-round rule race-proof beyond the entry lock.
3. The author deleted "ITA All-American Tournament" from the app at 21:15 UTC — it detached 1 match (audit row), before T8 made detaches clear `round`.
