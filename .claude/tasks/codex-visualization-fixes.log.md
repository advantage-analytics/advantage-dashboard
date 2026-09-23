# Run log — codex/visualization-fixes

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Reconcile serve zones and plotted coordinates — done

**gate:** Mechanical: GATE PASS (lint, typecheck, full test suite). Completion: VERDICT: pass.

**changed:** Unified serve resolution, zone membership, service-side filters, and zone statistics with the verified server-facing dot orientation. Corrected mirrored zone counts; retained empty zone cells and documented in-serve denominators. Added asymmetric source fixtures and Chromium regressions covering production chart selection and both court renderers. Targeted validation: 451 pure tests and 2 browser tests passed.

**follow-ups:** 1. Audit other consumers of legacy serve-zones.ts; they were intentionally outside T1 scope.

## T2 · Add rally placement — blocked

**gate:** Mechanical: GATE FAIL. Lint and typecheck passed; full suite had 11 live-database test failures, 2863 passed, 64 skipped, 81 did not run. Failures included live user creation and PostgreSQL statement timeout (57014), across account deletion, admin RPCs, claim eyebrow, leave program, video attachments, owner names, workspace isolation, saved views, and team settings. Completion: not run because mechanical failed.

**changed:** Implementation preserved in stash `f50821970837b589b51d78a3478e254077751071`. Added rally landing cut, previews, Scatter/Heat, URL/saved-view support, and targeted fixtures/browser regression; 383 targeted tests and Chromium regression passed. Live read-only inspection found saved_views_cut_check excludes rallyPlacement; stash includes an additive local migration, not applied live. Parent visually inspected the fixture screenshot.

**follow-ups:** 1. Existing Scatter accessible count says points for shot-counted rally cuts; visible counts and Heat already say shots.

## T4 · Remove the selected preview's duplicate while focused — blocked

**gate:** Mechanical: GATE FAIL. Lint and typecheck passed; full suite had 5 live-database failures, 2900 passed, 64 skipped, 44 did not run. Failures were in video cleanup, owner names, seat counting, team management, and visualization-band RLS; multiple fixture program inserts timed out. Completion: not run because mechanical failed.

**changed:** Implementation preserved in stash `d53c68234ca24de6cb7963940fc6219d32c80256`. Focused gallery omits only selected stable view identity. Targeted browser regression passed for default/saved switching, keyboard, fullscreen, overview, back/forward and reduced motion; typecheck, targeted lint and format passed.
