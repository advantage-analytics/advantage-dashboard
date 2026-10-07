# Plan: first-run onboarding (personal workspace)

Design: `../../02_design/output/design.md`, approach A (static fixture plus a shared clip).
It was left unedited, so its defaults stand:

- anonymised names "Jordan Avery" vs "Sam Ellis";
- a ~720p re-encode of the film;
- the first-report tour also runs on SwingVision imports;
- the wizard explainer is text only, with the frame sketch deferred.

Scope guard: everything below traces to a brief Scope bullet. Nothing touches team
workspaces, wizard inputs or payload, the pipeline, quotas, or the existing onboarding
questions.

Every UI step reads `.skills/advantage-analytics-design/SKILL.md` and
`docs/ui-revamp-guardrails.md` first (AGENTS.md), and runs `trace-route` before editing a
dashboard component.

## Prerequisites: human, not queue tasks

These need credentials or a decision a subagent cannot make. The steps that depend on
them say so.

- **H1. Sample video blob.**
  - Re-encode
    `videos/0df75bc6-…/bca90097-…/original.mp4` to about 720p, keeping the length and
    `+faststart`.
  - Upload it as `sample/match-v1.mp4` in the current playback account
    (`advantagedashboardca`) using the `azure-storage` skill.
  - Record the key in the step 4 task.
  - Verify with `az storage blob show`: the size is non-zero and the content type is
    `video/mp4`.
- **H2. Launch sign-off.** Written OK from both players and the UCLA program owner for
  the film to be shown to every account. This blocks **landing** (stage 07), not build.

## Steps

### 1. Migration: tour timestamps on `users`

- **Files:** `supabase/migrations/<ts>_users_onboarding_tours.sql`.
- **Change:** add nullable `timestamptz` columns `sample_tour_done_at` and
  `first_report_tour_done_at` to `public.users`.
  - No functions and no policy changes. The existing ALL policy on
    `auth.uid() = id` covers it.
  - Apply to the live project via the Supabase MCP `apply_migration`, with the same
    version stamp as the file.
- **Verify:**
  - `information_schema.columns` shows both columns.
  - `rls-boundary-reviewer` passes on the diff.

### 2. Pure onboarding logic

- **Files:** `src/lib/onboarding/tours.ts` and `tests/onboarding-tours.spec.ts`.
- **Change:** no React or Next imports, the same pattern as `src/app/onboarding/steps.ts`.
  - **Tour definitions:** `"sample"` and `"first-report"`, each as ordered steps
    `{ target, tab?, title, body }`. The targets are `scoreboard`, `insight`,
    `head-to-head`, `shots`, `film`.
  - **`resolveSteps(tour, presentTargets)`:** drops missing targets.
  - **`soloDestination(recordingSource)`:**

    | `recordingSource` | Destination |
    | --- | --- |
    | `video` | `/dashboard/matches/new` |
    | `swing-vision` | `/dashboard/matches/new?source=swing-vision` |
    | `none` / null | `/dashboard/matches/sample?tour=1` |

  - **`firstReportTourEligible({ workspaceKind, isCreator, finishedMatchCount, doneAt })`.**
  - **`setupSteps(facts)`:** the extended `SetupLine` step list. The two tour steps count
    as done when `finishedMatchCount > 1`.
- **Verify:** the spec covers every branch above. `npm run test -- onboarding-tours`.

### 3. Sample fixture

- **Files:**
  - `scripts/build-sample-match.ts`
  - `src/lib/sample-match/fixture.json` (generated, committed)
  - `src/lib/sample-match/index.ts`
  - `tests/sample-match-fixture.spec.ts`
- **Change:**
  - **Script.** It reads source match `bca90097-72c9-448b-b0e4-e0e83dc143d9` with the
    service role, reusing the loaders behind `getMatchDetailData` with an admin client,
    not a hand-copied query. It then:
    - anonymises names everywhere, including in the `insights` and `keyMoments` text;
    - swaps every uuid for a `00000000-0000-4000-8000-…` placeholder;
    - drops program, event entry and uploader;
    - sets `isUserPlayer1 = true` and `kpiHistory = []`;
    - writes the JSON.
  - **Guard.** It refuses to write if any banned string survives: "Rudy", "Quan",
    "Goodman", "UCLA", "UCLAM", "splitstep", or a real uuid.
  - **`index.ts`.** It exports a typed `sampleMatchData(): MatchDetailData` that
    re-hydrates dates, plus the constant `SAMPLE_MATCH_ID`.
  - **Who runs the script.** It runs once, by a human or a subagent that has
    `SUPABASE_SERVICE_ROLE_KEY` for the production project. The read is read-only. It
    is not a live-DB spec, so the lock rules do not apply.
- **Verify:**
  - The fixture spec asserts: 87 points, a score of 6-2 6-2 from "you"'s side, no
    banned strings, and that every id is a placeholder.
  - `npm run typecheck` (the fixture satisfies `MatchDetailData`).

### 4. Sample video route

Depends on H1.

- **Files:**
  - `src/app/api/sample-match/video/route.ts`
  - `openapi/advantage-api.yaml`
  - `MAP.md`'s API row (hand-written part)
- **Change:** `GET`.
  - It answers 401 through `errorResponse()` without a session.
  - Otherwise it returns the same playback shape `GET /api/matches/[id]/video` returns,
    signed by `mintPlaybackSas` for a server-constant key (`sample/match-v1.mp4`) with a
    30-minute TTL.
  - The key never comes from the request.
  - It is not excluded from the `src/proxy.ts` matcher; it refreshes like any dashboard
    API.
- **Verify:**
  - A route spec with mocked SAS minting checks the 401 path and the response shape.
  - `npm run api:lint`.
  - Grep that no client module imports `azure-sas`.

### 5. Read-only report chrome

- **Files:**
  - `match-detail/match-report-context.tsx`
  - `match-detail/match-report.tsx`
  - `report-more-menu.tsx`
  - `report-compare-button.tsx`
  - the share button's mount
- **Change:**
  - Add `sample?: boolean` beside `meta.readOnly`, plus an optional
    `playbackEndpoint`.
  - In `readOnly`, don't render `MatchReportMoreMenu`, `ShareMatchButton` or the compare
    button.
  - The `/m/[token]` behaviour must be unchanged, since it already passes `readOnly`.
- **Verify:**
  - Existing share-page specs still pass.
  - Typecheck.

### 6. Read-only film

Depends on 5.

- **Files:** `match-detail/film/film-tab.tsx`, `film/use-attachment-playback.ts`,
  `film/film-entry-actions.tsx` and the mount of `record-video-view.ts`.
- **Change:**
  - Playback renews against `meta.playbackEndpoint ?? /api/matches/${id}/video`.
  - In `readOnly`:
    - skip `POST …/viewed`;
    - skip the bookmark insert and delete, hiding the bookmark control;
    - skip the ball-paths fetch;
    - render no `FilmEntryActions`.
- **Verify:**
  - `tests/fixtures/film-playback-refresh-harness.tsx` specs still pass.
  - A new harness case with `readOnly` + `playbackEndpoint` asserts no request to
    `/api/matches/*`.

### 7. Read-only Shots tab

Depends on 5.

- **Files:** the `ShotsTab` mount, plus the saved-views and bands controls.
- **Change:** in `readOnly`, saved-view save/delete and band editing are not rendered.
  Viewing and filtering still work.
- **Verify:** typecheck, plus a harness assertion that no server action is invoked when
  filters change.

### 8. Tour primitive

- **Files:**
  - `src/components/ui/tour.tsx`
  - a preview in `src/app/design/` (the existing `/design` preview pattern)
- **Change:** a presentational `TourPopover` on Radix `Popover` + `Anchor`.
  - Styling: the white popover box (230px, 12px radius, `--shadow-dropdown`, hairline
    border).
  - Content: a mono "n of m" counter, title and body, a quiet "Skip tour", and an
    `advButton()` Next/Done.
  - Esc means Skip. Focus goes into the popover and returns on close.
  - No scrim, no caret, no animation beyond Popover's own, and `prefers-reduced-motion`
    is respected.
  - Nothing banned (SKILL.md list).
- **Verify:**
  - The `/design` preview renders.
  - `node scripts/check-design-drift.mjs`.
  - A browser spec covers keyboard Next, Esc and focus return.

### 9. `TourRunner` and `markTourDone`

Depends on 1, 2 and 8.

- **Files:**
  - `src/components/dashboard/onboarding/tour-runner.tsx`
  - `src/app/dashboard/onboarding-actions.ts`
- **Change:**
  - **`TourRunner`** takes `{ tour, start: boolean }`. It finds `[data-tour]` targets,
    calls `resolveSteps`, switches `?tab=` through `MatchReportProvider` when a step
    asks, scrolls the target into view, and drives `TourPopover`.
  - **On Done or Skip**, it calls `markTourDone(tour)` and sets a `sessionStorage` guard
    inside try/catch.
  - **`markTourDone`** is a server action. It uses the cookie client to update
    `users.<tour>_done_at = now()` for `auth.uid()` only, and returns
    `{ error, code? }` on failure. On failure the tour still closes.
- **Verify:**
  - A harness spec mounts a fake report with targets and walks Next, Next, Done. It also
    covers a missing target being skipped and the guard stopping a remount.
  - `rls-boundary-reviewer` on the action.

### 10. `data-tour` targets

- **Files:**
  - `report-scoreboard.tsx`
  - `report-insight-card.tsx`
  - head-to-head card
  - `report-view-switcher.tsx` (the Shots and Film items)
- **Change:** attribute-only additions. No markup or style change.
- **Verify:**
  - `git diff` shows only `data-tour=` lines.
  - Visual snapshot or browser specs are unchanged.

### 11. Sample page

Depends on 3, 5–7, 9 and 10. Step 4 is needed for the film to play.

- **Files:**
  - `src/app/dashboard/matches/sample/page.tsx` (a static segment, which beats
    `(detail)/[matchId]`)
  - `src/components/dashboard/onboarding/sample-banner.tsx`
  - `src/components/dashboard/dashboard-shell.tsx` (BetaWelcome suppression)
  - `MAP.md` via `npm run map`
- **Change:**
  - **The page:**
    - a server page that builds `sampleMatchData()`;
    - it renders `MatchDataProvider` → `MatchReportProvider readOnly sample
      playbackEndpoint="/api/sample-match/video"` → the same frame, rail and pane
      composition as `[matchId]/page.tsx`'s full-report branch;
    - the sticky `SampleBanner` ("Sample match · not your data · Send your own match");
    - `TourRunner tour="sample"`, which starts when `?tour=1` is set or
      `sample_tour_done_at` is null;
    - `noindex` metadata.
  - **`dashboard-shell.tsx`:** `BetaWelcome` is also skipped on
    `/dashboard/matches/sample`.
- **Verify:**
  - A harness or browser spec covers:
    - every `data-tour` target renders;
    - the banner stays visible after scrolling;
    - no Delete, Share or Review-score control appears;
    - no requests go to `/api/matches/*`.
  - `npm test` (map freshness).
  - `pipeline-guardrails-reviewer`.

### 12. Onboarding routing

Depends on 2.

- **Files:** `src/app/onboarding/actions.ts`, `tests/onboarding-answers.spec.ts` or
  `onboarding-steps.spec.ts`.
- **Change:** the solo branch of `RESOLUTION` redirects to
  `soloDestination(recordingSource)`. Coach, college, guardian and invite paths are
  unchanged.
- **Verify:** the spec covers the three sources plus skip. The existing onboarding specs
  pass.

### 13. Day-zero entry point

Depends on 11.

- **Files:** `src/components/dashboard/home/day-zero-offer.tsx` (`MatchOfferActions`
  only).
- **Change:** a third, quiet text link, "See a sample report" →
  `/dashboard/matches/sample?tour=1`.
  - `MATCH_OFFER_CONDITIONS` and the existing pair are unchanged.
  - The team day zeros pass their own `actions`, so they are unaffected.
- **Verify:**
  - `widget-states` audit.
  - A browser spec on Home and Matches day zero.
  - A team day zero shows no link.

### 14. While-analysing link

Depends on 11.

- **Files:** `match-detail/analysis-steps-column.tsx`.
- **Change:** one quiet line, "While you wait, see a sample report", shown when the
  workspace is personal and `canAct`. It lives inside the existing early-return branch,
  and the gate in `page.tsx` is untouched.
- **Verify:**
  - `pipeline-guardrails-reviewer` (§3.3).
  - The existing analysis-steps specs pass.

### 15. First-report tour

Depends on 9 and 10.

- **Files:** `src/app/dashboard/matches/(detail)/[matchId]/page.tsx` (full-report branch
  only), plus one count helper in `src/lib/data/` if no existing one fits.
- **Change:**
  - The server computes `firstReportTourEligible`: personal workspace, viewer is the
    creator, `first_report_tour_done_at` null, and the count of the viewer's finished
    matches.
  - If eligible, it mounts `TourRunner tour="first-report" start`.
  - Nothing changes in the short-circuit.
- **Verify:**
  - A pure-predicate spec (from step 2).
  - A browser check on the verifier account during `/pr-check` Stage 3b.
  - `pipeline-guardrails-reviewer`.

### 16. Getting-started line

Depends on 1 and 2.

- **Files:** `src/components/dashboard/home/setup-line.tsx` and
  `src/app/dashboard/(home)/page.tsx` (the facts read).
- **Change:**
  - The facts gain the two tour timestamps and the finished-match count, read alongside
    the existing `hand`/`backhand`/preferences read.
  - `SetupLine` renders from `setupSteps()`, giving "n of 4" with tour steps first.
  - It is still never on day zero, and still empty when done.
- **Verify:**
  - `widget-states`.
  - The spec from step 2.
  - A veteran account with more than one match shows the same line as today.

### 17. First-upload explainer copy

- **Files:** `src/components/dashboard/matches/new-match-wizard/TrimStepContent.tsx`,
  plus the wizard entry that knows the match count.
- **Change:**
  - A caption under the existing "{who} at the start" `Question`, shown only when the
    account owns zero matches: "Top of frame means the far end, away from the camera, in
    the first frame of your selected window."
  - Option labels, values, the null typing, the stale-answer reset and the payload are
    byte-identical. No sketch asset (deferred).
- **Verify:**
  - `pipeline-guardrails-reviewer` (§3.1, §4).
  - `git diff` touches no field logic.
  - The wizard specs pass.

## Order and dependencies

```text
1 ─┬─────────────► 9 ──┬─► 11 ─┬─► 13
2 ─┼─► 12              │       └─► 14
   ├─► 16 (also 1)     ├─► 15 (also 10)
3 ─┼───────────────────┤
5 ─┼─► 6, 7 ───────────┤
8 ─┘                   │
10 ────────────────────┘
4 (needs H1) ─► 11 film playback
17 independent
```

Suggested queue order: 1, 2, 3, 8, 5, 6, 7, 10, 9, 4, 11, 12, 13, 14, 15, 16, 17.

## Test strategy

- **Offline first.** Pure modules (step 2), the fixture guard (step 3) and the harness
  specs (steps 6, 9, 11) all run without the live DB. That is the main reason for
  approach A. No new spec joins the serialised live-DB pool.
- **Isolation by construction.** No step writes `matches`, `points`, `shots` or stats.
  `/pr-check` Stage 3b on the `EYES_ON_*` account confirms that Home KPIs, heatmap and
  match count are identical before and after visiting the sample.
- **Already shipped.** The brief's allowance-preview criterion is met by the existing
  `FooterMeter`, with no build step. Stage 3b screenshots the trim step on the verifier
  account to confirm that "Spends X h · Y of N h left after" appears for an Advantage
  Intelligence upload.
- **Reviewer agents:**
  - `pipeline-guardrails-reviewer`: steps 11, 14, 15, 17.
  - `rls-boundary-reviewer`: steps 1, 4, 9.
  - `widget-states`: steps 13, 16.
- **Repo gates on every task:** `npm run lint`, `npm run typecheck`,
  `npm run format:check`, the affected specs, and `npm run map` after step 11.
- **Launch gate.** H2 sign-off is recorded before stage 07 opens the PR.
