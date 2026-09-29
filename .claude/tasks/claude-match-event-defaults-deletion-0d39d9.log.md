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
