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

## T5 · /label area: layout, assigned-sessions list, 404 gate — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `requireLabelViewerOrNotFound()` in admin-guard.ts (login redirect with no session, `notFound()` unless `is_admin` or `is_labeller`, flags read service-role, fails closed). New `/label` layout with a minimal `LabelHeader` (wordmark, "Labels", Guide link, sign-out), `/label` page listing `listAssignedLabelSessions()` (viewer from the gate; no match, player, program or job fields) via `AssignedSessionsList`, placeholder `/label/[sessionId]` and `/label/guide`. `labels-server.ts` exports `countLabelPointProgress` and `readOpenCounts` for reuse. MAP.md regenerated. New `tests/label-routes.spec.ts` (8 tests).
**follow-ups:**

1. Show open-flag counts (`openCounts`) on the list rows.
2. The label area imports `AdminPage` for its column; consider a neutral shared wrapper.
3. Assignment dates use `shortDate()` (UTC).

## T6 · Labeller console view at /label/[sessionId] — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `LabelConsole` gains `viewerKind` ("admin" default): the labeller header drops avatars, names, program and derivation, sides read "Near player"/"Far player", and Mark complete/Reopen are replaced by "Submit for review" (confirm, disabled while saves are pending) or "Submitted — waiting for review". The admin header shows "· Submitted for review" with Reopen and Mark complete on a submitted session (admin markup unchanged for labelling, pinned byte for byte). `/label/[sessionId]` gates on a new `requireLabelReader` (admin, or assigned labeller on labelling or submitted; writes still go through `requireLabelActor`), strips player names, match id, job id and derivation server-side (`labellerSession`), and opens on `firstAmberStop`. `src/app/label/actions.ts` twins the admin console actions minus seed/complete/reopen plus submit. New `labeller-view.ts`, `label-confirm.ts` submit/reopen-from-submitted kinds, `tests/label-console-labeller.spec.ts` (10) and `requireLabelReader` cases in `label-actor.spec.ts`.
**follow-ups:**

1. `src/app/label/actions.ts` and `src/app/admin/labels/actions.ts` must be kept in step by hand.
2. Mark complete on a submitted session hides "Mark errors"; reconsider for the admin review flow.
3. `firstAmberStop` leaves out the "Players at the wrong end" slot.
4. Signed video URL path may carry the match id; harmless for the trial (own match) but worth checking for third-party matches.

## T7 · Admin assignment control and submitted indicator — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New `assign-session.ts`: `assignLabelSession` (requireAdmin; refuses missing/non-labeller users and complete sessions; service-role write of `assigned_to`/`assigned_at`, nulls on unassign; race-safe on `status <> complete`) and `listLabellers`. `assignLabelSessionAction`/`listLabellersAction` exported. `LabelJobRow.session` gains `assignedTo`, `assignedAt`, `submittedAt`, read in the same select (`users!assigned_to`; live FK `label_sessions_assigned_to_fkey` confirmed). `jobStatusText` gives "Submitted for review". Labels rows gain an "Assigned" column with an `AssignMenu` (FloatMenu pill, outside the row link). `/admin/labels` loads labellers once server-side. New `tests/label-assign.spec.ts`.
**follow-ups:**

1. `labels-server.ts` imports `labellerName` from a service file; consider moving it to a shared helper.
2. Not yet seen in a browser; `/pr-check` eyes-on covers `/admin/labels`.

## T8 · Active-time heartbeat and minutes worked — done

**gate:** mechanical — first run GATE FAIL (9137 passed vs 9138 on the re-run; one test did not pass and its output was not kept), re-run on the unchanged tree GATE PASS · completion VERDICT: pass
**changed:** Pure `work-beats.ts` (`shouldBeat`, `beatMinute`), `work-beats-session.ts` (`recordLabelWorkBeat`: gated on `requireLabelActor`, server-computed UTC minute, upsert with `ignoreDuplicates`, 23505 treated as ok, never throws), `use-work-beat.ts` hook (visibility + keydown/pointerdown, 60 s tick, 55 s gap allowance for timer jitter) mounted by `LabelConsole` when `operations.recordWorkBeat` is passed; both console pages pass it and both actions files export `recordLabelWorkBeatAction`. `listLabelJobs` adds `minutesWorked` (one paged read counted in JS); Labels rows gain a "Worked" column ("N min", "—" for 0). New `tests/label-work-beats.spec.ts`.
**follow-ups:**

1. The flaky test in the first gate run is unidentified; watch for it at `/pr-check`.
2. `labels-board.tsx` header `min-w-[1120px]` is now below the grid's width; raise to ~1250px.
3. Confirm live that the service-role upsert on `label_work_beats` with `ignoreDuplicates` works.

## T9 · Labeller guides at /label/guide — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New `src/lib/labels/guide-content.ts` (`GUIDE_VERSION` "2026-11-03", `HOW_TO_SECTIONS` with the nine required headings, `CLEANING_STANDARD_SECTIONS` with the six rules verbatim plus a working order) and `src/components/label/label-guide.tsx` (in-page nav, two sections, Keys generated from `LABEL_SHORTCUT_GROUPS`). `/label/guide` renders it behind the layout's gate. New `tests/label-guide.spec.ts` (8 tests).
**follow-ups:**

1. Guide text was written from the code; read it against the live console before sending it to the vendor (speed control, full-screen exit, dragging a game band, Submit only outside full screen).
2. The console still offers Delete point and C (contact/landing) although the standard says not to delete rallies or move coordinates; consider hiding them for labellers.
3. Bump `GUIDE_VERSION` whenever the wording changes.

## T10 · Eyes-on labeller verifier: harness prefix and seed script — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `parsePathSpec` accepts `labeller:` (and treats `/label…` as labeller), plus `fillSessionId`. `capture.mjs` signs in a second account from `EYES_ON_LABELLER_EMAIL`/`_PASSWORD` into `storage-state-labeller.json`, exits 2 with "EYES_ON_LABELLER credentials unset", fills `[sessionId]` from `EYES_ON_LABELLER_SESSION_ID`; verifier paths unchanged. New `seed-labeller-session.ts` (dry-run default, `--write`, `--cleanup`): sets `is_labeller`, seeds an "Eyes-on seed · labeller" match, one assigned labelling session with no job (5 points, 13 shots), refuses Cj vs Suhail ids, non-seed matches, admin or verifier labeller accounts. `.env.example`, pr-check Stage 3b and `ui-verifier.md` document the prefix. Path-spec spec extended (14 tests). No live writes made.
**follow-ups:**

1. The seeded session has no job, so the labeller console shows no video on eyes-on.
2. Cleanup leaves `is_labeller` set on the test account.
