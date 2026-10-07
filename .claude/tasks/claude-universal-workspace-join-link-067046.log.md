# Run log — claude/universal-workspace-join-link-067046

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Migration: `program_join_links` table, RLS and five RPCs — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `supabase/migrations/20261007214009_program_join_links.sql`, applied live (version 20261007214009). Table + partial unique live-link index + staff-only SELECT RLS; `_ensure_program_player_row` helper (service_role only) factored out of `accept_program_invite`'s player branch, which is re-created to call it; `set_program_join_link` (staff/admin, token ≥32 chars, locks programs row), `set_program_join_link_mode` + `revoke_program_join_link` (owner/coach/admin), `accept_program_join_link` (not_found / unconfirmed / ok-if-member / no_seats / requested / ok), `program_join_link_preview` (anon-callable; returns program_name, program_team, org_type, mode, seats_free, created_by_name, roster_match_name). `program_audit_log_action_check` widened with `join_link.created/.revoked/.accepted`. Approve-mode insert is idempotent via `program_requests_open_unique`. Live checks: anon cannot execute accept, can execute preview, cannot select the table.
**follow-ups:** 1. Widen `program_recent_joins` to include `join_link.accepted` so the Members tray shows link joins. 2. `set_program_join_link_mode` writes no audit row; add `join_link.mode_changed` if the card wants it. 3. `anon` holds SELECT on `public.program_invites` via default grants (RLS hides rows) — revoke in a follow-up. 4. Repo `program_seat_counts` file drifts from live (missing `contributed_by_program_id` filter is absent live) — pre-existing. 5. T2: compose the title with `programDisplayName(program_name, program_team)`.
