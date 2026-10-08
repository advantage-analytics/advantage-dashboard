# Run log — first-run-onboarding

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add sample_tour_done_at and first_report_tour_done_at to users — done

**gate:** mechanical — lint pass (0 errors), typecheck pass, tests 4319 passed / 379 skipped / failures confined to browser specs (trim-step-navigation, viz-_-browser, film-playback-refresh, event-table, add-player-_) that fail identically with T1 stashed: `browserType.launch: Executable doesn't exist at /opt/pw-browsers/chromium_headless_shell-1200/…` — the container's Playwright browser build does not match. Environmental, not this task (SQL-only diff). completion — VERDICT: pass.
**changed:** `supabase/migrations/20261007024333_users_onboarding_tours.sql` adds nullable `sample_tour_done_at` and `first_report_tour_done_at` (timestamptz) to `public.users`; applied live via MCP `apply_migration`, recorded version 20261007024333 (filename matches). No function, grant or policy.
**follow-ups:**

1. **Blocks T9 as written:** `authenticated` has SELECT but **no UPDATE** on the two new columns (verified live in `information_schema.column_privileges`; `20260914100000_users_block_admin_self_update` replaced the table-wide UPDATE grant with a column list). T9's `markTourDone` updates via the cookie client and will fail with `permission denied` before RLS. Needs either a migration `grant update (sample_tour_done_at, first_report_tour_done_at) on public.users to authenticated;` (pattern: `20260926201548_onboarding_intake_column_grants.sql`) or a server-stamped write via the admin client. The migration header's "covers own-row reads and writes" line is inaccurate for writes for the same reason.
2. Live DB has migration `20261005072656_label_marks_and_site_removals` with no file on this branch — check before merging to `splitstep-integration`.
3. Test environment: Playwright expects chromium headless shell 1200; until fixed, every task's gate will show the same browser-spec failures.

## T19 · Grant UPDATE on the two onboarding-tour columns to authenticated — done

**gate:** mechanical — lint pass, typecheck pass, tests 4319 passed / 379 skipped; failures are the same browser-spec set as T1 (trim-step-navigation, viz-*-browser, film-playback-refresh, …) caused by the missing Playwright Chromium headless shell 1200 — treated as environmental per the author's ruling (SQL-only diff). completion — VERDICT: pass.
**changed:** `supabase/migrations/20261007061209_users_onboarding_tours_column_grants.sql` — `grant update (sample_tour_done_at, first_report_tour_done_at) on public.users to authenticated;` with a header explaining the column-list UPDATE grant from `20260914100000` and correcting T1's "covers writes" line. Applied live via MCP (version 20261007061209, filename matches); verified `authenticated` has SELECT+UPDATE on both columns, `anon` nothing. rls-boundary checklist (by hand): pass.
**follow-ups:**

1. Every new `public.users` column needs an explicit `grant update (...)` — second time this has bitten (after `20260926201548`). Worth a line in AGENTS.md's Conventions next to the function-grant rule.

## T2 · Pure onboarding tour logic: definitions, resolveSteps, soloDestination, eligibility, setupSteps — done

**gate:** mechanical — lint pass, typecheck pass, tests 4343 passed (+24 new) / 379 skipped; failures are the same environmental browser-spec set as T1 (missing Playwright Chromium headless shell 1200), per the author's ruling. completion — VERDICT: pass.
**changed:** new `src/lib/onboarding/tours.ts` (no React/Next imports): `TOUR_TARGETS`, `TourTarget`/`TourId`/`TourTab`/`TourStep` types, `TOURS` ("sample", "first-report"), `resolveSteps`, `soloDestination`, `firstReportTourEligible`, `setupSteps` (`SetupFacts` is a superset of `SetupProgress`). New offline spec `tests/onboarding-tours.spec.ts` (24 cases).
**follow-ups:**

1. T17: the tour steps' `phrase`/`link` copy ("Open sample", "Open matches") was invented here — review when wiring `SetupLine`; its hand-written all-outstanding sentence needs rewording for four steps.

## T3 · Sample-match build script, pure anonymiser and fixture guard spec — done

**gate:** mechanical — lint pass, typecheck pass, tests 4354 passed (+11 new) / 380 skipped (+1: fixture guard waiting on H3); failures are the same environmental browser-spec set (missing Playwright Chromium headless shell 1200), per the author's ruling. completion — VERDICT: pass.
**changed:** new `src/lib/sample-match/anonymise.ts` (`anonymiseMatchDetail`, `assertSampleClean`, `SAMPLE_NAMES`, `isSampleId`), `scripts/build-sample-match.ts` (admin client + real loader → anonymise → assert → write `fixture.json`; `--check` dry run), `tests/fixtures/sample-match-synthetic.ts`, `tests/sample-match-fixture.spec.ts` (11 unit tests + committed-fixture block that skips until H3). `src/lib/data/match-detail-server.ts`: body of `getMatchDetailData` extracted to exported `loadMatchDetail(client, matchId, options)`; the cached export delegates with identical semantics; optional `pinnedSeat` on `resolveYouSide`/`transformDbMatchToMatch`; exported `MatchDetailData` type.
**follow-ups:**

1. H3 (human, prod service-role key in `.env.local`): `npx tsx scripts/build-sample-match.ts --check` (expect "Jordan Avery d. Sam Ellis", 6-2 6-2, 87 points, 532 shots), then run without `--check`, `npm run test -- sample-match-fixture` (12 passed, 0 skipped), commit `src/lib/sample-match/fixture.json`, promote T12.
2. T12: the anonymiser turns `sourceProvider` "splitstep" into "Advantage Intelligence", but the UI branches on `sourceProvider === "splitstep"` (`isDerivedMatch`, film court overlay, `ProviderFact`) — `sampleMatchData()` should map it back at load time.
3. T12: fixture `kpiHistory` is `[]` but consumers type it `MatchKpiHistory | null` — coerce to `null` in `sampleMatchData()`.
4. `assertSampleClean` is substring-based, so "Quan" also flags words like "quantity" in insight text; the error names the JSON path, so a false positive will be obvious at H3.
5. `loadMatchDetail` is exported from a `-server` module for the script; consider a guard against other `src/` callers.

## T4 · TourPopover primitive with /design preview and keyboard/focus browser spec — done

**gate:** mechanical — lint pass, typecheck pass, tests 4354 passed / 380 skipped; failures are the environmental browser-spec set (missing Playwright Chromium headless shell 1200, per the author's ruling), now including the new `tour-popover.spec.ts`, which fails here with the same `Executable doesn't exist` error and passed 4/4 when the implementer temporarily shimmed headless shell 1194 into the 1200 path (shim removed; no repo config change). `check-design-drift` exit 0. completion — VERDICT: pass.
**changed:** new `src/components/ui/tour.tsx` — presentational `TourPopover` ({ open, anchor: HTMLElement | null, index, total, title, body, onNext, onSkip, side? }) on Radix Popover + `PopoverAnchor` virtualRef; 230px white box, 12px radius, hairline, `--shadow-dropdown`, no scrim/caret/animation; Escape → onSkip; focus to Next on open, back to the prior element on close; reduced-motion-aware scrollIntoView. `/design` gains `TourPreview` (`src/app/design/tour-preview.tsx`). New harness + browser spec `tests/tour-popover.spec.ts`.
**follow-ups:**

1. T9: close via `open={false}` or unmount (both return focus); never null `anchor` while open. Outside clicks are ignored by design — add an opt-in prop if T9 wants them to end the tour.
2. The popover's look and the `/design` preview have not been checked by eye (the spec bundles no Tailwind) — `/pr-check` Stage 3b should open `/design`.

## T5 · Read-only report chrome: sample and playbackEndpoint meta, hide menu/share/compare — done

**gate:** mechanical — lint pass, typecheck pass, tests 4354 passed / 380 skipped; failures are the same environmental browser-spec set (missing Playwright Chromium headless shell 1200), per the author's ruling. `match-share-format share-popover film-cut-intent` 25/25. completion — VERDICT: pass. widget-states: action controls only, the new `return null`s are deliberate read-only hides; no loader/Suspense change.
**changed:** `match-report-context.tsx`: `MatchReportMeta.sample` (default false) and `playbackEndpoint` (default null), documented beside `readOnly`. `MatchReportCompareButton` returns null on `readOnly`; `MatchReportMoreMenu` and `ShareMatchButton` split into a readOnly guard + inner component so no hook runs conditionally. `[matchId]/page.tsx` and `/m/[token]/page.tsx` untouched.
**follow-ups:**

1. T12: `MatchReportTitleActions` still draws its wrapper `div` when both children return null — check for a stray gap on the sample page, or leave the cluster out as `/m/[token]` does.
2. `meta.playbackEndpoint` has no reader yet — T6 consumes it.

## T6 · Read-only film tab: context playback endpoint, no viewed/bookmark/ball-path writes — blocked

**gate:** completion — VERDICT: needs-work (mechanical gate was stopped once completion failed). Unmet criterion: "`FilmEntryActions` is not rendered" when `readOnly` — it is still rendered by `film/film-unavailable-state.tsx` (~line 100), which `FilmTab` reaches through its no-video branch (`film-tab.tsx` ~line 165) with no `readOnly` guard. Secondary note from the reviewer: the new spec's `/__api-hits` filters on `/api/matches/<matchId>/`, narrower than "any `/api/matches/*` path" (the server records all of them; widen the assertion).
**stash:** 225c9d845f40d5cc33d73ecf1df866206ee3378f (`blocked: T6`) — the full implementation: endpoint threading through `useAttachmentPlayback` (`playbackEndpointFor`), `useOptionalMatchReport()` in `match-report-context.tsx`, readOnly guards on first-play view recording, bookmark writes/controls (optional `onToggleSaved` on player/transport/point list/drawer/fullscreen), `useBallPaths` enable, and `FilmEntryActions` in the player column; harness `?readOnly=1` + new spec case. Browser evidence under a temporary 1194 shim: failing set identical to HEAD baseline (all H.264-decode timeouts) plus the new case for the same reason; new case passed on a throwaway VP9 copy.
**follow-ups:**

1. To resume: `git stash apply 225c9d84`, guard the `FilmEntryActions` render in `film-unavailable-state.tsx` (or pass `readOnly` from the no-video branch), widen `/__api-hits` to every `/api/matches/` path, reset T6 to `todo`.
2. The harness pins every browser case to H.264; an opt-in VP9 fixture (`tests/fixtures/match-video/vp9.webm`) would make them runnable in containers without proprietary codecs.

## T7 · Read-only Shots tab: no saved-view or band writers — done

**gate:** mechanical — lint pass, typecheck pass, tests 4359 passed (+5) / 380 skipped; failures are the same environmental browser-spec set (missing Playwright Chromium headless shell 1200), per the author's ruling. `shots-read-only viz-bands saved-views-logic band-editor-state` 225 passed / 13 live-DB skips. completion — VERDICT: pass. widget-states: no loader/Suspense change; read-only wall with no saved views stays on Default (honest empty).
**changed:** new pure `shots/shots-write-access.ts` (`shotsWriteAccess(meta)` → both false when readOnly). `VizBandsProvider`/`useVizBands` fallback take `canEdit` from it; `SavedViewsBand`, `VizFocused`, `VizFullscreen` take `canSaveViews`. Gated: Create-view tiles (wall + focused), manage mode (rename/duplicate/share/delete/reorder), "Save this view…" in both cut menus + SaveViewDialog mounts, "Edit bands…" row (read-only note instead), band editor entry; `viz-wall` drops the Default/Saved switch when read-only with nothing saved. New spec `tests/shots-read-only.spec.ts`; harness passes the new required prop.
**follow-ups:**

1. A pasted `?draft=1` on a read-only report still opens the blank draft court headed "Create view" (no save action) — consider ignoring `draft` when `readOnly`.
2. `VizEmpty` still shows "Open the Video tab" on read-only reports (navigation, not a writer).
3. Only the predicate is spec-covered; once `/dashboard/matches/sample` exists, a browser spec should assert no "Create view" / "Save this view…" / "Edit bands…".
4. The non-readOnly "canManageSavedView per view" test is close to a tautology — strengthen it.

## T8 · Add data-tour attributes to the five tour targets — done

**gate:** mechanical — lint pass, typecheck pass, format:check pass, tests 4359 passed / 380 skipped (design-drift included); failures are the same environmental browser-spec set (missing Playwright Chromium headless shell 1200), per the author's ruling. completion — VERDICT: pass. widget-states: attribute-only, no state change.
**changed:** attribute-only. `data-tour="scoreboard"` on `RailScoreboard`'s root div (`rail-scoreboard.tsx` — `MatchReportScoreboard` only forwards props to it); `data-tour="insight"` on `MatchReportInsight`'s root section and on its `InsightEmpty` variant (only one renders at a time); `data-tour="head-to-head"` on `HeadToHeadCard`'s root section; `data-tour` = "shots" / "film" on those two tabs in `report-view-switcher.tsx` (undefined for Statistics).

## T9 · TourRunner component and markTourDone server action — done

**gate:** mechanical — lint pass, typecheck pass, tests 4359 passed / 380 skipped; failures are the environmental browser-spec set (missing Playwright Chromium headless shell 1200, per the author's ruling), now including the new `tour-runner.spec.ts` (same `Executable doesn't exist` error; 3/3 passed under a temporary, removed 1194 shim). completion — VERDICT: pass. RLS checklist (by hand): no findings.
**changed:** new `src/app/dashboard/onboarding-actions.ts` — `"use server"` `markTourDone(tour)` (const tour→column map with `Object.hasOwn`, cookie client, `.eq("id", user.id)`, returns `{ error, code? }`, never throws). New `src/components/dashboard/onboarding/tour-runner.tsx` — `TourRunner({ tour, start })`: resolves present `[data-tour]` targets via `resolveSteps`, switches tab via `selectView` before anchoring (rAF poll for the target, skips a target that never mounts), drives `TourPopover` (which owns reduced-motion-aware scrolling); Done/Skip set the sessionStorage guard and fire `markTourDone`, closing even on failure. New harness, recording action mock and browser spec.
**follow-ups:**

1. `markTourDone` doesn't `revalidatePath("/dashboard")`; add it if a client-cached Home shows the sample step undone right after the tour (T17).
2. Nothing mounts `TourRunner` yet — T12 (sample page) and T16 (first-report) do.

## T10 · GET /api/sample-match/video: session-gated SAS for the sample clip — done

**gate:** mechanical — lint pass, typecheck pass, tests 4370 passed (+11) / 380 skipped; failures are the same environmental browser-spec set (missing Playwright Chromium headless shell 1200), per the author's ruling. completion — first review VERDICT: needs-work solely because `npm run api:lint` could not run (the `postman` CLI is not installed in this container); installed `postman-cli@1.70.0` into the session scratchpad (outside the repo), `npm run api:lint` → "No issues found", exit 0; re-review VERDICT: pass (reviewer re-ran typecheck, lint, format:check and the specs). RLS checklist (by hand): clean.
**changed:** new `src/lib/services/sample-match/video.ts` (`SAMPLE_VIDEO_BLOB`, `SAMPLE_VIDEO_TTL_SECONDS`, `SAMPLE_VIDEO_ATTACHMENT`, `handleGetSampleVideo(deps)` — takes no request; 401 unauthenticated, 200 `{ attachment: {…, playbackUrl, playbackExpiresAt} }` matching the match video route, 503 storage_unavailable / 500 internal_error) and `src/app/api/sample-match/video/route.ts` (nodejs, force-dynamic, cookie client + `mintPlaybackSas`). New offline spec `tests/sample-match-video-route.spec.ts` (12). `openapi/advantage-api.yaml` gains the path; MAP.md API row updated; `tests/client-bundle-boundary.spec.ts` pins the new module and `azure-sas.ts` server-only. `src/proxy.ts` unchanged.
**follow-ups:**

1. Fixture/T12: carry `id = 00000000-0000-4000-8000-5a4d504c4531`, `version = 1` (`SAMPLE_VIDEO_ATTACHMENT`) in the sample's `MatchVideo`, or the first renewal reads as a replaced video and reloads the player once.
2. After H1, set `SAMPLE_VIDEO_ATTACHMENT.durationSeconds` (and the OpenAPI example) to the measured clip length if the Film timeline needs a fixed clock.
3. `npm run api:lint` needs the global Postman CLI; this container lacks it — worth adding to the environment setup.

## T11 · SampleBanner component and BetaWelcome suppression on the sample path — done

**gate:** mechanical — lint pass, typecheck pass, tests 4370 passed / 380 skipped; failures are the same environmental browser-spec set (missing Playwright Chromium headless shell 1200), per the author's ruling. completion — VERDICT: pass, with two deliberate deviations from the criteria's literal wording, both verified by the reviewer: (1) the copy reads "Sample match · Not your data" — lowercase "not" trips `check-design-drift`'s middot-segment sentence-case rule (seeded, must not rise), which criterion 3 requires to pass; (2) only the `<BetaWelcome />` guard (~line 147) gained the sample path — the ~line 102 check is the upload-wizard localStorage clear, unrelated to BetaWelcome, and changing it would have altered upload-draft behaviour.
**changed:** new `src/components/dashboard/onboarding/sample-banner.tsx` — server component, sticky `top-0` strip on `--surface-card` with a `--border-card` hairline, `--ink-600` text, "Send your own match" link to `/dashboard/matches/new` in `--blue`/`--blue-hover`. `dashboard-shell.tsx` skips `<BetaWelcome />` on `/dashboard/matches/sample` too.
**follow-ups:**

1. T12 mounts `SampleBanner` (it sits at `top-0` of the scroll container, under the header). T12's queue text still says "not your data" lowercase — use the shipped copy.

## T13 · Route solo onboarding by recording source — done

**gate:** mechanical — lint pass, typecheck pass, tests 4376 passed (+6) / 380 skipped; failures are the same environmental browser-spec set (missing Playwright Chromium headless shell 1200), per the author's ruling. `onboarding-answers onboarding-steps` 41 passed. completion — VERDICT: pass.
**changed:** `src/app/onboarding/answers.ts` gains pure `resolveDestination(choice, recordingSource)` (coach → `/claim/team`, college → `/claim/program?intent=join`, solo → `soloDestination(recordingSource)`); `OnboardingChoice` moved here from `actions.ts` (a pure module can't import from a `"use server"` file) and `onboarding-flow.tsx`'s type import follows. `actions.ts`: `RESOLUTION` keeps its keys (the allowlist) and `role` values, loses `destination`; `finishOnboarding` redirects to `resolveDestination(choice, intake.recording_source)` — the validated value also written to `users.recording_source`. Guardian/invite paths untouched. New spec cases in `tests/onboarding-answers.spec.ts`.
**follow-ups:**

1. Until T12 lands, a solo player who answers "I don't record yet" (or skips) is redirected to `/dashboard/matches/sample?tour=1`, which doesn't exist yet — T12 must land before this branch merges.
2. Confirm end-to-end that `/dashboard/matches/new?source=swing-vision` preselects SwingVision (not traced here).

## T16 · First-report tour on the match page — done

**gate:** mechanical — lint pass, typecheck pass, tests 4376 passed / 380 skipped; failures are the same environmental browser-spec set (missing Playwright Chromium headless shell 1200), per the author's ruling. completion — VERDICT: pass. pipeline-guardrails checklist (by hand): clean — short-circuit untouched, no wizard input or attribution change.
**changed:** new `src/lib/data/finished-match-count-server.ts` — `countFinishedMatchesFor(userId)` (cached; cookie client; counts the viewer's personal matches, `created_by = userId AND program_id IS NULL`, that have a `match_stats` row via `match_stats!inner`, `head: true, count: "exact"` — the same "stats published" signal as `withStatsPublished()`; `matches.status` is null on every live row so it was unusable). `[matchId]/page.tsx`: below the `isAwaitingAnalysis` return only, and only for a personal workspace whose viewer created the match, reads the count and `users.first_report_tour_done_at` in parallel (failure → no tour), computes `firstReportTourEligible`, mounts `<TourRunner tour="first-report" start />` inside `MatchReportProvider`. `Match.createdBy` added to `types.ts` and populated in `match-detail-server.ts` (already selected).
**follow-ups:**

1. T17 can reuse `countFinishedMatchesFor` (cached, so Home shares one query).
2. `/pr-check` Stage 3b: the verifier account needs exactly one finished personal match and a null `first_report_tour_done_at` to see the tour.
3. Consider moving the inline `users` read for `first_report_tour_done_at` into a data helper.

## T17 · Getting-started line: tour steps first, n of 4 — blocked

**gate:** completion — VERDICT: pass. mechanical — lint pass, typecheck pass, tests FAIL with one real regression beyond the environmental browser set: `tests/home-streaming.spec.ts:125` "Home returns its frame while independent analytics and serve reads remain pending" throws `TypeError: Cannot read properties of null (reading 'catch')` at `countFinishedMatchesFor(userId).catch(...)` in `startHomeResources` — the spec runs Home's page in a VM with stubbed data modules, and the new `finished-match-count-server` import has no stub, so it returns null. Passes with T17 stashed, fails with it applied (verified in isolation). Separately, `tests/upload-line-swap.spec.ts:402` failed once in the full run but passes in isolation both with and without T17 — flaky, unrelated.
**stash:** cbc4e8c34412bdc245e8263887bf4e2f28b722f7 (`blocked: T17`) — `(home)/page.tsx` (users select adds the two tour columns; `countFinishedMatchesFor` in the setup `Promise.all`; `Footer` passes `SetupFacts`), `setup-line.tsx` (renders from `setupSteps(facts)`, "n of 4", next-step sentence + link), `tours.ts` (drops unused `SetupStep.phrase`).
**follow-ups:**

1. To resume: `git stash apply cbc4e8c3`, then either add a stub for `@/lib/data/finished-match-count-server` to `tests/home-streaming.spec.ts`'s module map (matching how its other data modules are stubbed) or make the call robust (`Promise.resolve().then(() => countFinishedMatchesFor(userId)).catch(() => null)`); re-run `npm run test -- home-streaming home-empty-loading onboarding-tours`; reset T17 to `todo`.
2. Open author decision: the task note says veterans see "the same two-step line as today"; the shipped criterion gives them "2 of 4".
3. The gate's summary prints only the last 40 failures, which hid this regression among the environmental ones; a per-file diff against a baseline failing set would catch it reliably.

## T18 · First-upload caption under "{who} at the start" — done

**gate:** mechanical — lint pass, typecheck pass, full suite run with a JSON reporter and every failure classified: 4376 passed / 380 skipped; all failures are the environmental browser set (missing Playwright Chromium headless shell 1200) except `upload-line-swap.spec.ts:402`, which also failed in T17's run before T18 existed and passes 25/25 in isolation three times with T18 applied — load-dependent flake, pre-existing. Implementer ran all 18 spec files touching the changed files under a temporary (removed) 1194 shim: identical results with and without the change (19 `trim-step-navigation` H.264-decode failures either way). completion — VERDICT: pass. pipeline-guardrails checklist (by hand): clean — Question options/values, null-typed answer, stale reset and payload untouched. widget-states: caption only, no loader/Suspense change.
**changed:** `new/page.tsx` — local `viewerHasNoMatches(viewerId)` (`head: true` count on `matches` where `created_by = viewer`, any workspace; error → false), run in a `Promise.all` with `rosterSubjectFor`; `firstUpload` threaded `UploadMatchFlow` → `UploadWizardProvider` (`view.firstUpload`, default false) → `TrimStep` → `TrimStepContent` (default false). Caption "Top of frame means the far end, away from the camera, in the first frame of your selected window." renders in the camera-questions grid's second row under the top-player question when `firstUpload`; grid gap split into `gap-x-8 gap-y-2.5`.
**follow-ups:**

1. No spec pins the caption (true shows the exact sentence, false nothing) — a VM-render spec in the style of `upload-player-details` would work without a browser.
2. The count includes analysing/failed matches — fine for "first ever upload"; switch to `countFinishedMatchesFor` if the product means "first finished match".
3. `upload-line-swap.spec.ts:402` is flaky under full-suite load — worth a look independent of this branch.

## T17 · Getting-started line: tour steps first, n of 4 — done

**gate:** retry of the blocked attempt (stash cbc4e8c3 applied). mechanical — lint pass, typecheck pass, format:check pass, full suite with a JSON reporter and every failure classified: 4376 passed / 380 skipped; all failures are the environmental browser set except the known load-dependent flake `upload-line-swap.spec.ts:402` (pre-existing; see T18); `home-streaming.spec.ts` passes. completion — VERDICT: pass. widget-states: loading `HomeFooterPending` unchanged; the line hides when all steps are done or the count read fails; region keeps its `WidgetBoundary`.
**changed:** as in the blocked attempt — `(home)/page.tsx` (users select adds the two tour columns; `countFinishedMatchesFor` in the setup `Promise.all`; `Footer` passes `SetupFacts`), `setup-line.tsx` (renders from `setupSteps(facts)`: "Getting set up · n of 4", names the next undone step with one link), `tours.ts` (drops unused `SetupStep.phrase`) — plus the fix: `tests/home-streaming.spec.ts` stubs `@/lib/data/finished-match-count-server` (`countFinishedMatchesFor: async () => 0`) like the spec's other Home data modules, so the unstubbed import no longer falls through to a null placeholder.
**follow-ups:**

1. Open author decision: veterans read "2 of 4" (criterion) where the task note expected today's two-step count.
2. No spec pins the line's rendered copy or the all-done hide — a small offline spec over a pure "next step / count" helper would.

## T6 · Read-only film tab: context playback endpoint, no viewed/bookmark/ball-path writes — done

**gate:** retry of the blocked attempt (stash 225c9d84 applied). mechanical — lint pass, typecheck pass, format:check pass, full suite with a JSON reporter and every failure classified: 4379 passed (+3 new offline) / 380 skipped; all failures are the environmental browser set (now including the new read-only `film-playback-refresh` case) except the known load-dependent flake `upload-line-swap.spec.ts:402`. The read-only browser case passed 3/3 under a temporary 1194 shim with the VP9 fixture swapped in (alone and between two writing cases; fixture restored, shim removed). completion — VERDICT: pass (reviewer grepped every action render site in `film/`). widget-states: read-only gating only, no loader/fallback change.
**changed:** the blocked attempt (endpoint threading via `playbackEndpointFor` and `useAttachmentPlayback({ endpoint })`; `useOptionalMatchReport()`; readOnly guards on first-play view recording, bookmark writes and controls, `useBallPaths`, and the room's `FilmEntryActions`; harness `?readOnly=1` + new case) plus the fixes: `FilmTab`'s no-video branch passes `readOnly` to `FilmEmptyState`, `FilmExpiredState` and `FilmUnavailableState`, which suppress their add/replace/align offers (the empty state had offered "Add video" to every non-SwingVision match regardless of entry actions); `/__api-hits` returns every `/api/matches/` hit and the case asserts none since the page opened (mark/slice). New offline spec `tests/film-read-only-states.spec.ts` (3) renders the real no-video branch with readOnly true/false.
**follow-ups:**

1. The harness pins every browser case to H.264; an opt-in VP9 fixture would make them runnable in containers without proprietary codecs.

## T12 · Sample report page at /dashboard/matches/sample with tour and harness spec — done

**gate:** mechanical — lint pass, typecheck pass, format:check pass, full suite with a JSON reporter and every failure classified: 4383 passed (+4) / 379 skipped (the fixture guard now runs against the committed `fixture.json`); all failures are the environmental browser set (now including the 4 new `sample-page` browser cases, which passed under a temporary, removed 1194 shim) except the known load-dependent flake `upload-line-swap.spec.ts:402`. completion — VERDICT: pass. pipeline-guardrails checklist (by hand): clean — attribution through `getMatchSides` on the pinned seat, no `matches` read. widget-states: `MatchReportSkeleton` fallback, fixture always populated, tour-flag read failure only skips auto-start.
**changed:** new `src/lib/sample-match/index.ts` — static fixture import typed against the loader shape (`Widen<SampleMatchData>`, no cast), `SAMPLE_MATCH_ID`, `sampleMatchData()` (deep clone per call; `sourceProvider` → "splitstep" so the UI treats it as a video match; `kpiHistory` [] → null; `points` null → []; `MatchDetailData` has no `Date` fields, documented), `sampleMatchVideo()` (expired attachment carrying `SAMPLE_VIDEO_ATTACHMENT` id/version so the first renewal from `/api/sample-match/video` reads as "same video, fresh URL"). New `src/app/dashboard/matches/sample/page.tsx` — Server Component, `robots: { index: false, follow: false }`, mirrors the `[matchId]` full-report composition under `MatchReportProvider readOnly sample playbackEndpoint="/api/sample-match/video"`, `SampleBanner` first in the pane, omits title actions/share footer (null under readOnly, as `/m/[token]`); `TourRunner tour="sample"` starts in a personal workspace on `?tour=1` or when `users.sample_tour_done_at` is null (read error → no auto-start; team workspace never). MAP.md gains the route row. New browser harness + spec `tests/sample-page.spec.ts` (4) and 3 offline `sampleMatchData` tests.
**follow-ups:**

1. H1 (upload `sample/match-v1.mp4`) still gates film playback; until then the Video view shows the unavailable state with "Try again".
2. The harness mirrors the page's client composition by hand — extract a shared `SampleReport` component if drift becomes a worry.
3. The fixture carries `foldUnreconciled: true`, so the sample's Statistics view shows the unreconciled fold note — consider reconciling the source match and regenerating, or suppressing the note for the sample.
4. Team workspaces reaching the URL see the same "Send your own match" banner link.

## T14 · Day-zero "See a sample report" link — done

**gate:** mechanical — lint pass, typecheck pass, format:check pass, full suite with a JSON reporter and every failure classified: 4383 passed / 379 skipped; all failures are the environmental browser set except the known load-dependent flake `upload-line-swap.spec.ts:402`. completion — VERDICT: pass (whitespace-insensitive diff: the existing pair, `MATCH_OFFER_CONDITIONS` and `DayZeroOffer`'s props unchanged). widget-states: static link in the day-zero offer only.
**changed:** `day-zero-offer.tsx` — `MatchOfferActions` wraps the existing primary/ghost pair (unchanged, now one indent deeper inside its own flex row) in a centred column and adds a third, quietest `Link` beneath it: "See a sample report" → `/dashboard/matches/sample?tour=1`, `text-micro` (11px, ink-500) hovering to ink-900. Home and Matches day zeros both get it; team day zeros pass their own `actions` and don't.
