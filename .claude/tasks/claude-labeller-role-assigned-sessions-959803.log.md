# Run log — claude/labeller-role-assigned-sessions-959803

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Migration: labeller role, assignment, submitted status, beats, submissions — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New migration `supabase/migrations/20261103204519_labeller_role.sql`, applied live 2026-11-03 via the claude.ai Supabase connector and verified: `users.is_labeller` (no client UPDATE grant; `users_block_admin_self_update` now guards `is_admin` and `is_labeller`), `label_sessions.assigned_to/assigned_at/submitted_at`, status CHECK with `submitted` plus `label_sessions_submitted_check`, one-open-per-job index and `claim_label_publish_lease` widened to `labelling|submitted`, new service-role-only tables `label_work_beats` and `label_submissions`. SELECT on `users` is table-wide live, so no column SELECT grant was needed.
**follow-ups:**

1. Note in the users-column-grants memory: SELECT on `users` is table-wide, so only UPDATE needs a column grant.
2. Consider a CHECK `(assigned_to is null) = (assigned_at is null)` once T7's unassign semantics settle.
3. A live spec asserting an authenticated user cannot set their own `is_labeller`.
