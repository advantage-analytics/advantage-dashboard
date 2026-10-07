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
