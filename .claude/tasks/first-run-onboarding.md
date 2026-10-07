# Tasks — first-run-onboarding

> Scope: first-run onboarding for personal workspaces — read-only sample match report with a guided tour, onboarding routing by recording source, first-report tour, getting-started line, first-upload caption (pipeline: work/first-run-onboarding/).

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Add sample_tour_done_at and first_report_tour_done_at to users

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<YYYYMMDDHHMMSS>\_users_onboarding_tours.sql (guess)
- **done when:**
  - [ ] A new migration file `supabase/migrations/<ts>_users_onboarding_tours.sql` adds two nullable `timestamptz` columns, `sample_tour_done_at` and `first_report_tour_done_at`, to `public.users` using `ADD COLUMN IF NOT EXISTS`
  - [ ] The migration creates or alters no function, trigger, grant or RLS policy — the diff contains only the two `ALTER TABLE public.users ADD COLUMN` statements and a header comment naming the feature
  - [ ] The timestamp in the filename is the same version stamp passed to `apply_migration` (recorded in the file's header comment)
  - [ ] `npm run format:check` and `npm run lint` pass
- **notes:** Plan step 1. The existing ALL policy on `auth.uid() = id` already covers own-row reads and writes; do not add a policy. Apply to the live project `pouxujkhtbvkdwbzfvka` with the Supabase MCP `apply_migration` using the same name/version as the file, then confirm with `execute_sql` against `information_schema.columns` that both columns exist. If the MCP cannot connect, write that in the run log so a human applies it; the diff criteria above are what the gate judges. No generated TypeScript DB types file exists in this repo, so nothing to regenerate. Run `rls-boundary-reviewer` on the diff before finishing.

## T2 · Pure onboarding tour logic: definitions, resolveSteps, soloDestination, eligibility, setupSteps

- **status:** todo
- **model:** opus
- **files:** src/lib/onboarding/tours.ts (new), tests/onboarding-tours.spec.ts (new) — guess
- **done when:**
  - [ ] `src/lib/onboarding/tours.ts` has no React or Next imports (same pattern as `src/app/onboarding/steps.ts`) and exports `TOURS` with two tours, `"sample"` and `"first-report"`, each an ordered list of steps `{ target, tab?, title, body }` whose targets are exactly `scoreboard`, `insight`, `head-to-head`, `shots`, `film` (the Shots and Film steps carry `tab: "shots"` / `tab: "film"`); the first-report copy is worded for "your" match
  - [ ] `resolveSteps(tour, presentTargets)` returns the tour's steps minus any whose target is not in `presentTargets`, in tour order, and returns `[]` when none are present
  - [ ] `soloDestination(recordingSource)` returns `/dashboard/matches/new` for `"video"`, `/dashboard/matches/new?source=swing-vision` for `"swing-vision"`, and `/dashboard/matches/sample?tour=1` for `"none"` and `null`
  - [ ] `firstReportTourEligible({ workspaceKind, isCreator, finishedMatchCount, doneAt })` is true only when `workspaceKind === "personal"`, `isCreator`, `finishedMatchCount === 1` and `doneAt === null`; `setupSteps(facts)` returns the four `SetupLine` steps with "See the sample report" and "Read your first report" first, each done when its timestamp is set OR `finishedMatchCount > 1`, then the existing playing-profile and preferences steps
  - [ ] `tests/onboarding-tours.spec.ts` covers every branch above (all three destinations plus null, a dropped target, each eligibility condition flipping to false, the `> 1` veteran rule) and `npm run test -- onboarding-tours` passes
- **notes:** Plan step 2. Keep the `SetupProgress` facts shape compatible with `src/components/dashboard/home/setup-line.tsx` (currently `playingProfile`, preferences-row boolean) — T17 wires it; this task only adds the pure module. Export the step/target types so T8 and T9 can import the literal target ids.

## T3 · Sample-match build script, pure anonymiser and fixture guard spec

- **status:** todo
- **model:** fable
- **files:** scripts/build-sample-match.ts (new), src/lib/sample-match/anonymise.ts (new), tests/sample-match-fixture.spec.ts (new), tests/fixtures/sample-match-synthetic.ts (new); possibly src/lib/data/match-detail-server.ts, match-stats-server.ts, match-points-server.ts if the loaders need a client parameter — guess
- **done when:**
  - [ ] `src/lib/sample-match/anonymise.ts` exports a pure `anonymiseMatchDetail(data, names = { player1: "Jordan Avery", player2: "Sam Ellis" })` over the `getMatchDetailData` return shape that replaces both player names everywhere (match fields, `insights`, `keyMoments` text), rewrites every uuid to a `00000000-0000-4000-8000-` placeholder (deterministic per source id), drops `programId`/`eventId`/`uploadedBy`, sets `isUserPlayer1 = true` and `kpiHistory = []`, and replaces the vendor name with "Advantage Intelligence" in user-visible strings; plus `assertSampleClean(json)` which throws naming the first banned string found among `Rudy`, `Quan`, `Goodman`, `UCLA`, `UCLAM`, `splitstep` (case-insensitive) or any non-placeholder uuid
  - [ ] `scripts/build-sample-match.ts` reads match `bca90097-72c9-448b-b0e4-e0e83dc143d9` through `createAdminClient()` and the same loaders `getMatchDetailData` composes (not a hand-copied `select`), runs `anonymiseMatchDetail` then `assertSampleClean`, and only then writes `src/lib/sample-match/fixture.json`; its header documents `npx tsx scripts/build-sample-match.ts` and the required `.env.local` keys, following `scripts/splitstep-derive.ts`
  - [ ] `tests/fixtures/sample-match-synthetic.ts` is a small hand-written object of the loader's shape (≥ 2 points, one insight string and one key moment containing the real names, a real-looking uuid, a program id) and `tests/sample-match-fixture.spec.ts` asserts on `anonymiseMatchDetail(synthetic)`: no banned string survives, every id is a placeholder, `isUserPlayer1` is true, `kpiHistory` is `[]`, and `assertSampleClean` throws on the unanonymised input
  - [ ] The same spec has a second block that `test.skip`s with the message "src/lib/sample-match/fixture.json not committed yet — run scripts/build-sample-match.ts (H3)" when the file is absent, and when present asserts 87 points, a 6-2 6-2 score from "you"'s side, `assertSampleClean` passes, and every id is a placeholder
  - [ ] `npm run test -- sample-match-fixture`, `npm run typecheck`, `npm run lint` and `npm run format:check` pass without `fixture.json` present
- **notes:** Plan step 3, reshaped: the agent container has no service-role key, so the script is written and unit-tested here but RUN by a human (H3), who commits `fixture.json`. Do not create `src/lib/sample-match/index.ts` or a placeholder `fixture.json` here — the typed `sampleMatchData()` static import lands with T12 once the real file exists. If the stats/points loaders are cookie-client-bound, add an optional client parameter rather than duplicating queries; keep the existing call sites' behaviour byte-identical. The design's derivation note: the fixture must carry `foldUnreconciled` exactly as the loader produces it.

## T4 · TourPopover primitive with /design preview and keyboard/focus browser spec

- **status:** todo
- **model:** opus
- **files:** src/components/ui/tour.tsx (new), src/app/design/tour-preview.tsx (new), src/app/design/design-preview.tsx, tests/tour-popover.spec.ts (new), tests/fixtures/tour-popover-harness.tsx (new) — guess
- **done when:**
  - [ ] `src/components/ui/tour.tsx` exports a presentational `TourPopover` built on Radix `Popover` + `Popover.Anchor` (wrapping the existing `src/components/ui/popover.tsx` primitives where they fit) with props `{ open, anchor, index, total, title, body, onNext, onSkip }`, rendering a mono "n of m" counter, the title, the body, a quiet "Skip tour" control and an `advButton()` primary reading "Next" (or "Done" on the last step)
  - [ ] The popover is the white box: 230px wide, 12px radius, `--shadow-dropdown`, hairline border; no scrim, no caret, no custom animation, and any scroll/motion respects `prefers-reduced-motion`; `node scripts/check-design-drift.mjs` exits 0 (seed counts unchanged)
  - [ ] Escape calls `onSkip`; on open, focus moves into the popover and on close it returns to the previously focused element
  - [ ] A `TourPreview` is added to `src/app/design/design-preview.tsx` showing a three-step tour anchored to fixed elements, in the same style as `scoreboard-preview.tsx`
  - [ ] `tests/tour-popover.spec.ts` bundles a harness (the `film-playback-refresh.spec.ts` webpack pattern) and asserts in a real browser: pressing Enter on Next advances the counter, Escape closes via `onSkip`, and focus returns to the anchor after close; `npm run test -- tour-popover design-drift` passes
- **routes:** /design
- **notes:** Plan step 8. Read `.skills/advantage-analytics-design/SKILL.md` (banned list, popover box in `reference/components.md`) and `docs/ui-revamp-guardrails.md` first. Keep it presentational: no `data-tour` lookup, no router, no server action — that is T9's `TourRunner`.

## T5 · Read-only report chrome: sample and playbackEndpoint meta, hide menu/share/compare

- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/matches/match-detail/match-report-context.tsx, match-report.tsx, report-more-menu.tsx, report-compare-button.tsx, share-match-button.tsx — guess
- **done when:**
  - [ ] `MatchReportMeta` gains `sample: boolean` (provider prop `sample?: boolean`, default `false`) and `playbackEndpoint: string | null` (provider prop, default `null`), documented beside `readOnly` with the same comment style
  - [ ] `MatchReportMoreMenu`, `MatchReportCompareButton` and `ShareMatchButton` each return `null` when `useMatchReport().meta.readOnly` is true, so a page may mount them unconditionally
  - [ ] `src/app/m/[token]/page.tsx` is not in the diff and `npm run test -- match-share-format share-popover film-cut-intent` passes
  - [ ] `npm run typecheck`, `npm run lint` and `npm run format:check` pass
- **notes:** Plan step 5. Run `trace-route` for the match detail page before editing; read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. Do not change `[matchId]/page.tsx` here — it keeps mounting the three controls and they self-hide. `ShareMatchButton` is mounted as a component in the rail footer with a `share` prop; the null-return must happen inside it, not in the Server Component.

## T6 · Read-only film tab: context playback endpoint, no viewed/bookmark/ball-path writes

- **status:** todo
- **model:** fable
- **needs:** T5
- **files:** src/components/dashboard/matches/match-detail/film/film-tab.tsx, film/use-attachment-playback.ts, film/record-video-view.ts, film/use-ball-paths.ts, tests/fixtures/film-playback-refresh-harness.tsx, tests/film-playback-refresh.spec.ts — guess
- **done when:**
  - [ ] Playback renewal fetches `meta.playbackEndpoint` when set, else `/api/matches/${matchId}/video` — the hook takes the endpoint as a parameter and `FilmTab` resolves it from `useMatchReport().meta`
  - [ ] When `meta.readOnly` is true: `recordMatchVideoView` is not called, the bookmark insert/delete is not issued and the bookmark control is not rendered, `useBallPaths` does not fetch, and `FilmEntryActions` is not rendered
  - [ ] The existing `film-playback-refresh.spec.ts` cases pass unchanged in behaviour
  - [ ] A new harness case renders `FilmTab` under `MatchReportProvider readOnly playbackEndpoint="/api/sample-match/video"`, plays, and asserts the renewal hit `/api/sample-match/video` and that zero requests reached any `/api/matches/*` path
  - [ ] `npm run test -- film-playback-refresh film-attachment-playback match-film-entry`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **notes:** Plan step 6. Run `trace-route` first; read the design SKILL.md and `docs/ui-revamp-guardrails.md`. `film-tab.tsx` passes some meta as props on purpose (see its comment near line 113) — follow that convention for the endpoint rather than reading context deep in the subtree. The harness spec's own server must answer the sample endpoint with a fresh credential, the same way it answers the match endpoint today.

## T7 · Read-only Shots tab: no saved-view or band writers

- **status:** todo
- **model:** opus
- **needs:** T5
- **files:** src/components/dashboard/matches/match-detail/shots/shots-tab.tsx, shots/saved-views-band.tsx, shots/viz-bands-context.tsx, shots/viz-toolbar.tsx, tests/viz-bands-can-edit.spec.ts or a new tests/shots-read-only.spec.ts — guess
- **done when:**
  - [ ] A pure exported predicate (e.g. `shotsWriteAccess(meta)` in a `.ts` module under `shots/`) returns `{ canSaveViews: false, canEditBands: false }` whenever `meta.readOnly` is true, and otherwise the current rules (`canEditBands` from meta; saved-view writers per existing ownership logic); `VizBandsProvider` and `SavedViewsBand` take their `canEdit`/writer flags from it
  - [ ] In `readOnly` no "Create view", save, rename or delete saved-view control and no band editor entry is rendered; default tiles, filters, the court and the stats card still render
  - [ ] A spec covers the predicate: readOnly forces both false; non-readOnly leaves existing outcomes unchanged; `npm run test -- viz-bands saved-views-logic band-editor-state` passes alongside it
  - [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **routes:** /dashboard/matches/sample
- **notes:** Plan step 7. Run `trace-route` first ("serve placement" exists four times); read the design SKILL.md and `docs/ui-revamp-guardrails.md`. Filtering must keep working — only writers are gated.

## T8 · Add data-tour attributes to the five tour targets

- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/matches/match-detail/report-scoreboard.tsx, report-insight-card.tsx, head-to-head-card.tsx, report-view-switcher.tsx — guess
- **done when:**
  - [ ] `data-tour="scoreboard"` on the scoreboard's root element, `data-tour="insight"` on the insight card's root, `data-tour="head-to-head"` on the head-to-head card's root, and `data-tour="shots"` / `data-tour="film"` on the Shots and Film items of the view switcher
  - [ ] `git diff` on these files adds only `data-tour=` attribute lines — no class, markup, prop or copy change
  - [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` and `npm run test -- design-drift` pass
- **notes:** Plan step 10. Run `trace-route` first to confirm these are the components the `/dashboard/matches/[matchId]` report renders. The ids must match T2's tour targets literally.

## T9 · TourRunner component and markTourDone server action

- **status:** todo
- **model:** fable
- **needs:** T1, T2, T4, T19
- **files:** src/components/dashboard/onboarding/tour-runner.tsx (new), src/app/dashboard/onboarding-actions.ts (new), tests/tour-runner.spec.ts (new), tests/fixtures/tour-runner-harness.tsx (new) — guess
- **done when:**
  - [ ] `TourRunner({ tour, start })` is a client component that, when `start` is true, queries `[data-tour]` elements, calls `resolveSteps`, and drives `TourPopover` through the steps; a step with a `tab` calls `useMatchReport().actions.selectView(tab)` before anchoring, and each target is `scrollIntoView`'d (`behavior: "auto"` under `prefers-reduced-motion`)
  - [ ] Done and Skip both call `markTourDone(tour)` and set `sessionStorage["tour-done:" + tour]` inside try/catch; a `start` with that guard already set does not open the tour; a failing action still closes the tour
  - [ ] `markTourDone(tour)` in `src/app/dashboard/onboarding-actions.ts` is `"use server"`, accepts only `"sample" | "first-report"` (anything else returns `{ error }`), uses the cookie client to `update users set <tour>_done_at = now()` filtered `.eq("id", user.id)` for the signed-in user only, and returns `{ error: string | null, code?: string }` without throwing
  - [ ] `tests/tour-runner.spec.ts` bundles a harness (webpack pattern from `film-playback-refresh.spec.ts`, with the action aliased to a recording mock) that mounts a fake report with `data-tour` targets under `MatchReportProvider` and asserts: Next, Next, Done walks three steps and calls the mock once with the tour name; a tour whose middle target is absent shows "1 of 2" then "2 of 2"; remounting after Done does not reopen
  - [ ] `npm run test -- tour-runner`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **notes:** Plan step 9. Read the design SKILL.md and `docs/ui-revamp-guardrails.md`. Run `rls-boundary-reviewer` on the action. `src/components/dashboard/onboarding/` is a new directory. Do not store a partial step index (design: YAGNI).

## T10 · GET /api/sample-match/video: session-gated SAS for the sample clip

- **status:** todo
- **model:** fable
- **files:** src/app/api/sample-match/video/route.ts (new), src/lib/services/sample-match/video.ts (new, handler + deps), openapi/advantage-api.yaml, MAP.md (hand-written API row), tests/sample-match-video-route.spec.ts (new) — guess
- **done when:**
  - [ ] A `handleGetSampleVideo(deps)`-style handler (the `handleGetPlayback` deps pattern) answers 401 through `errorResponse()` when `supabase.auth.getUser()` has no user, and otherwise 200 via `jsonResponse()` with the same success body shape as `GET /api/matches/[matchId]/video` (playback URL and expiry)
  - [ ] The blob key is a module constant `SAMPLE_VIDEO_BLOB = "sample/match-v1.mp4"` and the handler never reads the request URL, query, headers or body to choose it; the SAS is minted with `mintPlaybackSas({ blobName: SAMPLE_VIDEO_BLOB, ttlSeconds: 30 * 60 })` via an injected `mintSas` dep; the route sets `runtime = "nodejs"` and `dynamic = "force-dynamic"` like the match video route, and `src/proxy.ts` is unchanged
  - [ ] `tests/sample-match-video-route.spec.ts` calls the handler with a fake supabase and a recording `mintSas`, asserting the 401 path, the 200 body keys, that `mintSas` received exactly the constant key and a 1800 s TTL, and that a `?key=` query is ignored
  - [ ] `openapi/advantage-api.yaml` gains `/api/sample-match/video` (GET, 401 + 200 reusing the existing playback response schema) and `npm run api:lint` passes; the MAP.md `src/app/api/` row names it
  - [ ] `npm run test -- sample-match-video-route client-bundle-boundary`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **notes:** Plan step 4. The H1 blob upload is a human step and is not needed for this code; the route must still behave when the blob is absent (FilmTab's unavailable state handles the playback failure). Run `rls-boundary-reviewer`. `@azure/storage-blob` stays server-only — confirm no `"use client"` module imports `azure-sas`.

## T11 · SampleBanner component and BetaWelcome suppression on the sample path

- **status:** todo
- **model:** sonnet
- **files:** src/components/dashboard/onboarding/sample-banner.tsx (new), src/components/dashboard/dashboard-shell.tsx — guess
- **done when:**
  - [ ] `SampleBanner` exports a sticky (`sticky top-0`) one-line strip reading "Sample match · not your data" with a link "Send your own match" to `/dashboard/matches/new`, styled with design-system tokens only — no tint background, no badge, no custom hex
  - [ ] `dashboard-shell.tsx` skips `<BetaWelcome />` when `pathname` starts with `/dashboard/matches/sample`, in addition to the existing `/dashboard/matches/new` check (both places the pathname is tested, lines ~102 and ~147)
  - [ ] `npm run test -- design-drift`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **notes:** Mechanical half of plan step 11. Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md` first. The banner is mounted by T12; nothing renders it yet.

## T12 · Sample report page at /dashboard/matches/sample with tour and harness spec

- **status:** later
- **model:** fable
- **needs:** T3, T5, T6, T7, T8, T9, T10, T11
- **files:** src/app/dashboard/matches/sample/page.tsx (new), src/lib/sample-match/index.ts (new), MAP.md (via npm run map), tests/sample-page.spec.ts (new), tests/fixtures/sample-page-harness.tsx (new) — guess
- **done when:**
  - [ ] `src/lib/sample-match/index.ts` statically imports `./fixture.json`, exports `SAMPLE_MATCH_ID` (the fixture's placeholder match id) and `sampleMatchData()` returning the `getMatchDetailData` shape with date fields re-hydrated to `Date`; `npm run typecheck` proves the fixture satisfies the type
  - [ ] `src/app/dashboard/matches/sample/page.tsx` is a Server Component with `metadata.robots = { index: false }` that reads `sample_tour_done_at` for the viewer, renders `MatchDataProvider` → `MatchReportProvider readOnly sample playbackEndpoint="/api/sample-match/video"` → the same frame/rail/pane composition as `[matchId]/page.tsx`'s full-report branch (scoreboard, switcher, title row, Statistics, Shots, Film), with `SampleBanner` at the top of the pane and `TourRunner tour="sample" start={searchParams.tour === "1" || sampleTourDoneAt === null}`
  - [ ] `tests/sample-page.spec.ts` mounts the page's client composition from the fixture in a harness and asserts: all five `data-tour` targets are present after switching tabs, the banner is visible after scrolling to the bottom, no element matching Delete, Share, Compare or Review-score controls exists, and zero requests reached `/api/matches/*`
  - [ ] `npm run map` regenerates MAP.md with the `/dashboard/matches/sample` row and `npm run test -- map sample-page sample-match-fixture` passes (the fixture guard now runs against the committed file)
  - [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **routes:** /dashboard/matches/sample
- **notes:** Plan step 11 (plus `index.ts` from step 3). Promote to todo after H3 commits `src/lib/sample-match/fixture.json`. Read the design SKILL.md and `docs/ui-revamp-guardrails.md`; run `trace-route` for the match detail page and `pipeline-guardrails-reviewer` on the diff. The static segment `sample/` beats `(detail)/[matchId]`; the page must not import `getMatchDetailData` or touch `matches`. A team workspace reaching the URL renders read-only with no tour (no entry point links there).

## T13 · Route solo onboarding by recording source

- **status:** todo
- **model:** opus
- **needs:** T2
- **files:** src/app/onboarding/actions.ts, tests/onboarding-answers.spec.ts — guess
- **done when:**
  - [ ] A pure exported `resolveDestination(choice, recordingSource)` (no Supabase or Next imports, in `src/app/onboarding/answers.ts` or beside `RESOLUTION`) returns `/claim/team` for `coach`, `/claim/program?intent=join` for `college`, and `soloDestination(recordingSource)` for `solo`; `finishOnboarding` redirects to it instead of `RESOLUTION[choice].destination`
  - [ ] The own-property allowlist check on `choice` and the role stamping are unchanged in the diff
  - [ ] `tests/onboarding-answers.spec.ts` covers solo with `video`, `swing-vision`, `none` and `null` (skipped) plus coach and college unchanged; `npm run test -- onboarding-answers onboarding-steps` passes
  - [ ] `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **routes:** /onboarding
- **notes:** Plan step 12. Guardian and invite paths are not in `RESOLUTION` and must stay untouched. `onboarding-flow-browser.spec.ts` is live-DB and is not a gate here.

## T14 · Day-zero "See a sample report" link

- **status:** todo
- **model:** sonnet
- **needs:** T12
- **files:** src/components/dashboard/home/day-zero-offer.tsx — guess
- **done when:**
  - [ ] `MatchOfferActions` renders a third `Link` after "Import instead", text "See a sample report", `href="/dashboard/matches/sample?tour=1"`, as a quiet text link (a mono/small text class from the design system, not `advButton("primary")`)
  - [ ] `MATCH_OFFER_CONDITIONS`, the two existing links and `DayZeroOffer`'s props are byte-identical; `day-zero-home.tsx` and the team day-zero components are not in the diff
  - [ ] `npm run test -- home-empty-loading upload-line-offers design-drift`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **routes:** /dashboard, /dashboard/matches
- **notes:** Plan step 13. Read `.skills/advantage-analytics-design/SKILL.md` and `docs/ui-revamp-guardrails.md`; run `trace-route` for Home. Team day zeros pass their own `actions`, so they get no link by construction. Run the `widget-states` audit on the edited widget.

## T15 · "While you wait, see a sample report" line on the analysis steps

- **status:** todo
- **model:** sonnet
- **needs:** T12
- **files:** src/components/dashboard/matches/match-detail/analysis-steps-column.tsx, src/app/dashboard/matches/(detail)/[matchId]/page.tsx (prop pass only), tests/analysis-steps-column.spec.ts — guess
- **done when:**
  - [ ] `AnalysisSteps` gains `showSampleLink?: boolean` (default false) and renders one quiet line "While you wait, see a sample report" linking to `/dashboard/matches/sample?tour=1` only when `showSampleLink && canAct`; `page.tsx` passes `showSampleLink={workspaceKind === "personal"}` inside the existing `isAwaitingAnalysis` branch and the `isAwaitingAnalysis` gate itself is unchanged
  - [ ] `tests/analysis-steps-column.spec.ts` gains cases: personal + canAct shows the line; team, or personal without canAct, does not
  - [ ] `npm run test -- analysis-steps`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **routes:** /dashboard/matches/[matchId]
- **notes:** Plan step 14 (guardrails §3.3 — the short-circuit gate stays as is). Read the design SKILL.md and `docs/ui-revamp-guardrails.md`; run `trace-route`. Run `pipeline-guardrails-reviewer` on the diff.

## T16 · First-report tour on the match page

- **status:** todo
- **model:** fable
- **needs:** T8, T9
- **files:** src/app/dashboard/matches/(detail)/[matchId]/page.tsx (full-report branch), src/lib/data/finished-match-count-server.ts (new, or an existing count helper in src/lib/data/) — guess
- **done when:**
  - [ ] A server helper `countFinishedMatchesFor(userId)` in `src/lib/data/` counts `matches` rows the viewer created that have published stats, using the cookie client (RLS-scoped) and a `head: true, count: "exact"` query
  - [ ] In the full-report branch only, `page.tsx` reads the viewer's `first_report_tour_done_at` and the count, computes `firstReportTourEligible({ workspaceKind, isCreator: match.createdBy === viewer id, finishedMatchCount, doneAt })`, and mounts `<TourRunner tour="first-report" start />` inside the `MatchReportProvider` when it is true
  - [ ] The `isAwaitingAnalysis` short-circuit branch and everything above it in `page.tsx` are unchanged in the diff
  - [ ] `npm run test -- onboarding-tours`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **routes:** /dashboard/matches/[matchId]
- **notes:** Plan step 15. Read the design SKILL.md and `docs/ui-revamp-guardrails.md`; run `trace-route`; run `pipeline-guardrails-reviewer`. The tour runs on SwingVision imports too (design default); the film step drops out through `resolveSteps` when no Film target renders. The eyes-on check on the verifier account happens in `/pr-check` Stage 3b, not here.

## T17 · Getting-started line: tour steps first, n of 4

- **status:** todo
- **model:** opus
- **needs:** T1, T2
- **files:** src/components/dashboard/home/setup-line.tsx, src/app/dashboard/(home)/page.tsx — guess
- **done when:**
  - [ ] The Home facts read selects `hand, backhand, sample_tour_done_at, first_report_tour_done_at` from `users` in the same query and reads the viewer's finished-match count alongside (reusing T16's helper if present, else a count query in the same `Promise.all`)
  - [ ] `SetupLine` renders from `setupSteps(facts)`: label "Getting set up · n of 4", tour steps first ("See the sample report" → `/dashboard/matches/sample?tour=1`, "Read your first report" → `/dashboard/matches`), profile and preferences unchanged
  - [ ] The day-zero early return still precedes `SetupLine`, and the line renders nothing when every step is done
  - [ ] `npm run test -- home-empty-loading onboarding-tours`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **routes:** /dashboard
- **notes:** Plan step 16. Read the design SKILL.md and `docs/ui-revamp-guardrails.md`; run `trace-route` for Home; run the `widget-states` audit. A veteran (> 1 finished match) sees the same two-step line as today because `setupSteps` counts both tour steps done.

## T18 · First-upload caption under "{who} at the start"

- **status:** todo
- **model:** opus
- **files:** src/components/dashboard/matches/new-match-wizard/TrimStepContent.tsx, UploadWizardSteps.tsx, UploadWizardProvider.tsx, src/app/dashboard/matches/new/page.tsx (match-count read) — guess
- **done when:**
  - [ ] `new/page.tsx` reads whether the viewer owns zero matches (a `head: true` count on `matches` for the viewer) and threads `firstUpload: boolean` through the provider's view to `TrimStepContent`
  - [ ] When `firstUpload` is true a `FieldCaption`-level caption renders directly under the `${who} at the start` `Question` reading exactly "Top of frame means the far end, away from the camera, in the first frame of your selected window."; when false nothing is added
  - [ ] The `Question`'s option labels and values, the null-typed answer state, the stale-answer reset and the submit payload are not in the diff (only the caption JSX, the prop plumbing and the count read)
  - [ ] `npm run test -- trim-step-navigation upload-wizard-pending wizard-keys-form-control match-video-trim-window`, `npm run typecheck`, `npm run lint`, `npm run format:check` pass
- **routes:** /dashboard/matches/new
- **notes:** Plan step 17 (guardrails §3.1, §4). No sketch asset (deferred). Read the design SKILL.md and `docs/ui-revamp-guardrails.md`; run `pipeline-guardrails-reviewer`. The wizard currently has no match count anywhere — that is why the read must be added at the entry page.

## T19 · Grant UPDATE on the two onboarding-tour columns to authenticated

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<YYYYMMDDHHMMSS>_users_onboarding_tours_column_grants.sql (guess)
- **done when:**
  - [ ] A new migration file `supabase/migrations/<ts>_users_onboarding_tours_column_grants.sql` contains exactly one statement, `grant update (sample_tour_done_at, first_report_tour_done_at) on public.users to authenticated;`, in lowercase SQL like `20260926201548_onboarding_intake_column_grants.sql`
  - [ ] The migration creates or alters no column, function, trigger or RLS policy and grants nothing to `anon` or `public` (the only `grant` is the one above, and it is column-scoped, not table-wide)
  - [ ] The header comment states the real reason: `20260914100000_users_block_admin_self_update.sql` replaced the table-wide UPDATE grant on `public.users` with a column list, so the two columns added by `20261007024333_users_onboarding_tours.sql` are readable but not writable by `authenticated` until named in a grant; that the own-row ALL policy still scopes the write; and that the earlier migration's "already covers own-row reads and writes" line is inaccurate for writes
  - [ ] The header records the version stamp passed to `apply_migration` and matches the filename timestamp, following the "Applied to the live database via the Supabase MCP as `<name>` (version <ts>)" line in `20260926201548_onboarding_intake_column_grants.sql`; `supabase/migrations/20261007024333_users_onboarding_tours.sql` is not in the diff
  - [ ] `npm run format:check` and `npm run lint` pass
- **notes:** Unblocks T9's cookie-client `markTourDone` server action. Without this grant, the update to `sample_tour_done_at` / `first_report_tour_done_at` for the signed-in user fails with `permission denied for table users`. Marked `next` so it runs before T9; T9 also lists it under `needs:`. Mirror `supabase/migrations/20260926201548_onboarding_intake_column_grants.sql` in style. Do not edit T1's migration: applied migrations are immutable. No policy change: the existing own-row ALL policy on `auth.uid() = id` scopes the write. Apply to the live project `pouxujkhtbvkdwbzfvka` with the Supabase MCP `apply_migration`, using the same name and version as the file. Load the tools with ToolSearch `select:mcp__Supabase__apply_migration,mcp__Supabase__execute_sql,mcp__Supabase__list_migrations`. If `list_migrations` records a different version, rename the file and fix the header to match. Then verify with `execute_sql` against `information_schema.column_privileges` that `authenticated` has UPDATE on both columns and that `anon` gains nothing. Report the MCP outcome in the final report, including a connection failure, since subagents cannot write the run log; a human applies it if the MCP cannot connect. The gate judges only the diff criteria above, not the live check. Run `rls-boundary-reviewer` on the diff before finishing.
