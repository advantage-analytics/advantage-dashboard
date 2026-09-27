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

## T6 · Fix fullscreen filter overflow and selected-person avatar — blocked

**gate:** Mechanical: GATE FAIL. Lint and typecheck passed; full suite had 1 failure, 2948 passed, 64 skipped. tests/match-video-attachment-flow.spec.ts:848 (unmounting mid-upload cancels the attempt) timed out after 5000ms waiting for DELETE. Completion: not run because mechanical failed.

**changed:** Implementation preserved in stash `832b33a4383e3b8a5508079ef0e921c22ece9675`. Added fullscreen-only scrollable single-line filters, narrow control reachability and subject-bound avatar initials without score changes. Targeted browser regression at 320px with real Tailwind CSS passed, including both subjects, reopen, keyboard scrolling, filter removal and control reachability; typecheck, targeted lint and formatting passed.

## T7 · Enlarge ace stars slightly — done

**gate:** Mechanical: GATE PASS (lint, typecheck, full suite). Completion: VERDICT: pass.

**changed:** Enlarged shared preview/focused ace radius from 3.7 to 4.44 and fullscreen multiplier from 1.68 to 2.016, each exactly 20%, preserving centers, regular dots, classification, colors and interactions. Updated existing geometry size assertion; all 130 targeted geometry tests passed.

## T2 · Add rally placement — done

**gate:** Recovery mechanical: GATE PASS (complete lint, typecheck and full suite); completion: VERDICT: pass. Recovered exact stash f50821970837b589b51d78a3478e254077751071, retained as backup.

**changed:** Added role-resolved rally landing cut, default previews, Scatter/Heat projections, filters, URL and saved-view round trips. Applied only migration 20260923210000_saved_views_rally_placement atomically to verified project pouxujkhtbvkdwbzfvka: validated widened constraint and exactly one migration-history entry, saved rows unchanged, RLS and four policies preserved. Authenticated saved-view persistence suite passed25/25;501 targeted checks passed. Reviewer lacked direct SQL access; orchestrator verified the live result through execution-worker readback.

Recovery investigation:79/79 previously failing live tests passed serialized. Observed external worktrees overlapping full gates against shared database; set Playwright workers to1 without changing assertions/timeouts/retries. Reproduced unrelated upload-test failure with500ms reservation delay; replaced timing assumptions with held reservation and actual upload-block barriers, retaining assertions and adding no-publication check.30/30 cancellation repetitions and20/20 attachment-flow tests passed. These recovery fixes were expressly user-authorized; T7 sizing preserved.

## T4 · Remove the selected preview's duplicate while focused — done

**gate:** Recovery mechanical: GATE PASS. Completion: VERDICT: pass.

**changed:** Recovered exact stash d53c68234ca24de6cb7963940fc6219d32c80256, retained as backup. Focused gallery excludes only the selected player/cut/saved-view identity and restores tiles when changing selection or returning to overview. Browser regression covers default/saved selection, keyboard, filters, explicit fullscreen, reduced motion and back/forward; updated counts for T2 rally previews. Targeted checks and screenshot inspection passed.

## T6 · Fix fullscreen filter overflow and selected-person avatar — done

**gate:** Recovery mechanical: GATE PASS; completion: VERDICT: pass. Initial recovery full run had one search_programs statement timeout; isolated suite passed2/2 (RPC310ms), then complete gate passed without test/RPC changes.

**changed:** Recovered exact stash832b33a4383e3b8a5508079ef0e921c22ece9675, retained as backup. Fullscreen filter strip stays single-line and keyboard-scrollable; narrow top/bottom controls remain reachable; avatar uses the court subject identity without score changes. Real-CSS browser regression at320px and adjacent rally browser regression passed, plus local checks.

## T3 · Enable zones for every visualization type — done

**gate:** Mechanical: GATE PASS; completion: VERDICT: pass.

**changed:** Enabled Zones for all five cuts; serve retains six cells while other cuts derive bands/counts from shared filtered statistics. Preview/focused/fullscreen, saved views and URL parsing preserve chart combinations and react consistently to subject/filter/band edits. Explicit No bands preserves chart selection and shows explanatory empty state. Fresh live saved_views constraints confirmed no additional migration required.498 targeted logic tests,11 browser regressions, local checks and final screenshots passed.

## T5 · Redesign the statistics widget and match court height — done

**gate:** Mechanical: GATE PASS; completion: VERDICT: pass. Initial gate caught off-scale17px value text; corrected to documented16px without changing the drift baseline, then drift/layout tests and complete gate passed.

**changed:** Restyled statistics with documented typography/surfaces/spacing, removed unnecessary internal dividers, preserved values and accessible announcements. Pane container breakpoint aligns court and statistics top/bottom edges; long statistics scroll internally, narrow layouts stack without horizontal overflow. Styled production-component browser coverage verifies populated/empty states, all five cuts, equal edges, scroll and narrow containment. Worker and parent visually inspected wide/narrow screenshots in the task visualization folder.

**follow-ups:** 1. Existing focused toolbar can squeeze an applied Set3 chip beside Filters at390px in the empty fixture; left outside the statistics/court layout scope.
