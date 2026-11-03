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

## T2 · requireLabelActor guard and session resolver — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `admin-guard.ts` gains `requireLabelActor(sessionId, deps?)` (admin via `checkAdmin` with no session read; labeller needs `is_labeller`, `assigned_to = uid`, `status = 'labelling'`, read service-role; otherwise `null`) with injectable `LabelActorDependencies`; existing guards untouched. New `src/lib/services/labels/label-actor.ts` with `LabelActorTarget`, `resolveLabelSessionId` and `requireLabelActorFor`. New offline `tests/label-actor.spec.ts` (16 tests).
**follow-ups:**

1. Batch targets use one `.in("id", ids)`; switch to `idChunks` if a batch can exceed ~100 ids.
2. The labeller branch calls `getUser()` again because `checkAdmin`'s 403 carries no uid; widening it would save a call.
3. A join could cut a labeller's check from three reads to two.

## T3 · Swap label services onto requireLabelActor — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Every per-row/per-session label service now gates on `requireLabelActor(target)` with the row's real target (`gated(deps, work, what, target)`, actor passed to `work`). New `ACTOR_REQUIRED` and `SUBMITTED` sentences and `requireAdminActor`; `readSessionGate` answers `SUBMITTED` for submitted sessions. Seed, complete and reopen refuse any non-admin (`adminGated` in session-status-session.ts) with `ADMIN_REQUIRED`. `label-actor.ts` gains `NO_SESSION`, `targetId`, `targetIds`. 17 label specs converted to `requireLabelActor` fakes, none skipped; new refusal specs for seed/complete/reopen and the submitted/frozen gate.
**follow-ups:**

1. `src/lib/data/labels-server.ts` reads (`getLabelSession`, `readLabelPointsByIds`, …) still gate on `requireAdmin`; the labeller console (T6) must pass its own actor.
2. `editLabelShots` gates each linked write separately (up to 4 round trips per click for a labeller); a single `{ shotIds }` gate would be cheaper.
3. Labeller-facing UI may want to branch on `ACTOR_REQUIRED` vs `ADMIN_REQUIRED`.

## T4 · Submit-for-review service and admin status paths — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New `submit-session.ts` (`submitLabelSession`, gated on `requireLabelActor`): snapshot into `label_submissions` (`rows = { points }`, shots nested), then `label_sessions` → `submitted` / `submitted_at` / `labeller`, matched on `labelling`. Complete accepts a submitted session via `checkSessionOpen(..., { allowSubmitted: true })` and clears `submitted_at` (forced by the live `label_sessions_submitted_check`; the snapshot row keeps the hand-in time). Reopen from submitted → labelling without `unverify_match`. `submitLabelSessionAction` exported; status unions widened to include `submitted`. New `tests/label-submit.spec.ts` (12 tests).
**follow-ups:**

1. Review diff: read the newest `label_submissions` row for a session and diff against current label rows.
2. A status race after the snapshot insert leaves an orphan submission row; delete it or have the diff reader take the newest.
3. Labels board could give submitted sessions their own "review" group instead of folding them into "doing".
