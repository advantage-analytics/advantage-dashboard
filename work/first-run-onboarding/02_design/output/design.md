# Design: first-run onboarding (personal workspace)

Brief: `../../01_brief/output/brief.md`. These decisions were taken in chat during this
stage:

- **Sample size.** The sample is the **full** Rudy Quan vs Matt Goodman match: 6-2 6-2,
  87 points, 532 shots, 86 minutes of film. A single game is only 4–7 points, so its
  statistics read as broken (for example 100% first serves and a serve map with four
  dots), and the AI summary stored for the match describes the whole match.
- **Point of view.** The sample is seen from player 1's side, Rudy Quan's. He won, so
  the tour walks through a winning performance.
- **Names are anonymised.** Both players get fictional names; see open question 1.

## Approaches considered

### A. Static fixture plus a shared clip (recommended)

- A one-off script reads the source match once with the service role. It anonymises the
  data and writes `MatchDetailData`-shaped JSON into the repo.
- `/dashboard/matches/sample` renders the real report components from that JSON through
  `MatchDataProvider` and `MatchReportProvider readOnly`. This is the pattern the public
  share page `/m/[token]` already uses.
- Film comes from a copy of the video blob under a `sample/` prefix in Azure. A
  session-gated route signs a URL for that copy.

| Pros | Cons |
| --- | --- |
| No database rows, no RLS changes, no system account. | The fixture is a snapshot. A later derivation fix will not reach it unless someone re-runs the script. |
| Nothing can leak into a player's counts, KPIs, heatmap or opponents, because no query can find it. | The fixture must keep up with changes to `MatchDetailData`'s shape. Typecheck catches shape drift. |
| Specs can run offline, without the serialised live-DB lock. | |

### B. A live sample row owned by a system account

- Clone the match into a dedicated "Advantage sample" account.
- Load it with a service-role reader keyed on `SAMPLE_MATCH_ID`, modelled on
  `getSharedMatchData`.
- Film goes through the existing `resolveMatchVideo` path once visibility is widened.

| Pros | Cons |
| --- | --- |
| It always reflects current derivation. | It needs a real `matches` row plus `points`/`shots`/`match_stats`. |
| Film reuses the production code path. | Every visibility check (`authorizeMatchVisibility`, the `matches` SELECT policy, `can_share_match`) needs a sample exception, which touches exactly the code the RLS reviewer guards. |
| | Specs need the live DB. |

### C. A share link to the source match

- Mint a `match_share_links` token on the original UCLA match and point the tour at
  `/m/[token]`.
- This needs no new loader. However, `/m/[token]` drops Film and Shots, cannot anonymise,
  and orients the match from the sharer's ids.
- It also ties the sample to a private team's row, which UCLA can delete. Rejected.

**Recommendation: A.** The brief's hardest constraint is "never written to the user's
tables, never counted", and A meets it by construction rather than by exception. The
staleness cost is one script re-run, which a human performs deliberately.

## Chosen design

### Architecture

```text
scripts/build-sample-match.ts  (run by hand with the service role, output committed)
  source match bca90097-…  ──►  getMatchDetailData-equivalent read
                           ──►  anonymise (names, ids, program, uploader, insight text)
                           ──►  src/lib/sample-match/fixture.json

/dashboard/matches/sample  (inside dashboard layout: signed in + onboarded)
  page.tsx (server) ── import fixture ──► MatchDataProvider
                                          └─ MatchReportProvider readOnly sample
                                               ├─ SampleBanner (sticky)
                                               ├─ Scoreboard / Title / Facts / ViewSwitcher
                                               ├─ StatisticsView · ShotsTab · FilmTab
                                               └─ TourRunner (tour = "sample")

GET /api/sample-match/video ── session required ──► mint 30-min read SAS for sample/… blob

users.sample_tour_done_at, users.first_report_tour_done_at  (own-row RLS, already ALL on id)
```

### Components and changes

**1. The sample fixture.** New: `scripts/build-sample-match.ts`,
`src/lib/sample-match/fixture.json`, and `src/lib/sample-match/index.ts`, which gives
typed access and re-hydrates dates.

- **Contents:** `match`, `statsResult`, `points` (with shots), `keyMoments`, `insights`.
  `kpiHistory` is set to `[]`, because there is no history to trend.
- **Anonymisation:**
  - Player names are replaced everywhere they occur, including inside the
    `insights`/`keyMoments` text. A check-and-fail pass looks for "Rudy", "Quan",
    "Goodman", "UCLA" and the program name.
  - Every uuid becomes a fixed placeholder (`00000000-0000-4000-8000-…`, the `/design`
    convention).
  - `program_id`, `event_entry_id` and the uploader are dropped.
  - `isUserPlayer1 = true`.
  - Any string that would show the vendor's internal name is replaced with "Advantage
    Intelligence".
- **Derivation.** The source has `derivation_version 0.6.0-unreconciled`. The script
  copies `foldUnreconciled` exactly as the loader produces it, so the sample shows
  exactly what a real player would see for this match.

**2. The sample video.**

- **Blob copy.** A one-off server-side copy (the `azure-storage` skill or `az`) of
  `videos/0df75bc6…/bca90097…/original.mp4` to `sample/match-v1.mp4`.
- **Why a copy.** Match deletion clears `video_object_key` (guardrails §3.4), so a sample
  that pointed at UCLA's own blob would die with their row. No table references the copy,
  so no cleanup sweep can find it.
- **New route.** `src/app/api/sample-match/video/route.ts`:
  - It requires a session, then calls `mintPlaybackSas` for the fixed key and answers
    through `jsonResponse()`/`errorResponse()`.
  - The key is a server constant, never a request parameter, so the route cannot sign
    any other blob.
  - `@azure/storage-blob` stays server-only, as it is today.

**3. Read-only seams in the report.** `MatchReportProvider` already carries
`meta.readOnly`; this adds `meta.sample` alongside it.

- **`FilmTab` / `useAttachmentPlayback`:**
  - It takes the playback-URL endpoint from context rather than building
    `/api/matches/${id}/video`.
  - When `readOnly` is set, it skips `POST …/viewed`, bookmark writes and the ball-paths
    fetch. The fullscreen room hides the ball-path toggle when there are no paths, which
    is already the case for this match: its `results_object_key` is null.
- **Hidden in `readOnly`:** `MatchReportMoreMenu`, `ShareMatchButton`,
  `FilmEntryActions`, and the saved-view/band writers on the Shots tab.
- **Already hidden by `readOnly`:** the "Why this" link.
- This keeps the sample on the same components that `/m/[token]` already exercises.

**4. `SampleBanner`.**

- A sticky one-line `Notice`-style strip at the top of the report pane: "Sample match ·
  not your data", with a "Send your own match" link to `/dashboard/matches/new`.
- It uses design-system tokens, no tint and no badge.
- It stays visible at every scroll position (brief success criterion).

**5. Tour primitive.** New: `src/components/ui/tour.tsx` and the pure module
`src/lib/onboarding/tours.ts`.

- **Build.** It wraps Radix `Popover`, using `Anchor` on the target. The hard part is
  positioning and focus, so the design system's build rule says wrap Radix.
- **Look.** It is styled as the white popover box, the one the design system reserves for
  a popover that carries controls: 230px wide, 12px radius, `--shadow-dropdown`.
- **Content.** Step counter ("2 of 5", mono 11px), one sentence, a quiet "Skip tour", and
  an `advButton()` Next / Done.
- **Not included:** no scrim, no spotlight cut-out and no animation beyond the Popover's
  existing fade. The design system's banned list rules out glassmorphism and
  hover-peeks, and nothing here needs more.
- **Targets.** Steps target `data-tour="<id>"` attributes. Adding these attributes is the
  only change to existing report components.
- **Missing targets.** A step whose target is absent (no film, no points) is skipped by
  `resolveSteps()`.
- **Keyboard and focus.** Esc and Skip end the tour. Focus moves to the popover and
  returns to the target. With `prefers-reduced-motion`, the scroll-into-view jumps
  instead of animating.
- **Sample tour steps** (tour `"sample"`). A step may switch `?tab=` through
  `MatchReportProvider`.
  1. Scoreboard
  2. Insight card, the AI summary
  3. Head-to-head
  4. Shots tab, serve placement
  5. Film tab
- **First-report tour** (tour `"first-report"`). The same steps, worded for "your"
  match, with Done.

**6. Persisted progress.** A migration adds two nullable timestamps to `users`:

- `sample_tour_done_at`
- `first_report_tour_done_at`

Either is set on Done **or** Skip.

- **Why on `users`.** That table already holds onboarding state (`onboarded_at`,
  `recording_source`), and its single policy is ALL on `auth.uid() = id`, verified live.
  A new table would add a policy for no gain.
- **Writes.** A server action, `markTourDone(tour)`, writes with the cookie client. The
  migration creates no new functions, so the anon-grant default does not come into play.
- **Resuming.** Re-entering from any entry point restarts the tour at step 1. A partial
  step index is deliberately not stored (YAGNI).

**7. Entry points.** These appear in personal workspaces only; team workspaces return
early on Home today.

- **Onboarding routing** (`src/app/onboarding/actions.ts`, `RESOLUTION` for solo):

  | Recording source | Destination |
  | --- | --- |
  | `video` | `/dashboard/matches/new` (the wizard already defaults to Advantage Intelligence) |
  | `swing-vision` | `/dashboard/matches/new?source=swing-vision` |
  | `none` or skipped | `/dashboard/matches/sample?tour=1` |

  Coach, college and guardian routing are unchanged.
- **Day-zero Home.** `MatchOfferActions` gains a third, quiet text link, "See a sample
  report" → `/dashboard/matches/sample?tour=1`, on Home and Matches day zero alike. Its
  conditions line is unchanged. The team day zeros pass their own `actions`, so they do
  not get it.
- **Analysing.** `AnalysisSteps` shows one quiet line, "While you wait, see a sample
  report", when the workspace is personal and `canAct`. It sits inside the
  early-return branch and does not change the gate (guardrails §3.3).
- **Beta welcome.** `BetaWelcome` is suppressed on `/dashboard/matches/sample`, as it
  already is on `/new`, so a new player never meets two overlays. It opens on the
  player's next dashboard page instead.

**8. First real report.**

- The match page mounts `TourRunner tour="first-report"` when all of these hold:
  - the workspace is personal;
  - the viewer is the match's creator;
  - the page is the full report (past the short-circuit);
  - `first_report_tour_done_at` is null;
  - the account owns exactly one finished match.
- The last condition is what keeps existing players with many matches from ever seeing
  it.
- It applies to SwingVision imports as well (see open question 3). The film step drops
  out automatically when there is no video.

**9. Getting-started line.** `SetupLine` keeps its shape ("Getting set up · n of k") and
its database-derived facts.

- It gains two steps ahead of profile and preferences:
  - "See the sample report" (`sample_tour_done_at`)
  - "Read your first report" (`first_report_tour_done_at`)
- It still never renders on day zero (unchanged decision), and disappears when all are
  done.
- For an account with more than one finished match, the two tour steps count as done, so
  a veteran's line is unchanged.

**10. Upload wizard.** Copy only (guardrails §3.1 and §4).

- **Allowance preview: already shipped.** `FooterMeter` already prints "Spends X h · Y of
  N h left after" from the selected window, the same seconds `quotaRefusal()` and the
  charged `billable_seconds` use. No new build. The brief's criterion is met by existing
  code, and the plan should verify it on the verifier account rather than rebuild it.
- **New copy.** A `FieldCaption`-level explainer under the existing "{who} at the start"
  question in `TrimStepContent.tsx`, plus an example frame sketch: "Top of frame means
  the far end, away from the camera, in the first frame of your selected window."
  - It is shown on the account's first upload only, keyed on "owns zero matches".
  - Option labels, values, the null-typed state and the payload are untouched.

### Data flow

- **Sample.** The request reaches the server page, which imports the JSON, which goes
  into the providers. On the client:
  - the components render from context;
  - `FilmTab` calls `/api/sample-match/video` and gets back a 30-minute SAS URL;
  - `TourRunner` reads `?tour=1` or the absence of `sample_tour_done_at` (passed from
    the server) and starts;
  - Done or Skip calls `markTourDone("sample")`, which updates `users`.
- **First report.** The page server works out eligibility (one extra `count` on
  `matches` where `created_by = me` and the match is analysed). `TourRunner` then runs,
  and `markTourDone("first-report")`.
- **Onboarding.** `finishOnboarding` already reads `recording_source`, and the `RESOLUTION`
  lookup becomes `(resolution, recordingSource)`.

### Error handling

| Failure | Behaviour |
| --- | --- |
| Fixture missing or malformed | The import fails at build time and typecheck fails, so it never fails at runtime. |
| Video route refuses (signed out, Azure error) | `FilmTab`'s existing unavailable state. The tour's film step still points at the tab. |
| Video blob absent | Same unavailable state. The route logs it once with `detail` (dropped in production). |
| `markTourDone` fails | The tour closes anyway. A `sessionStorage` guard stops it re-opening this session, and the next session offers it again. That is a harmless repeat, never a loop. |
| Tour target not rendered (narrow viewport, empty section) | The step is skipped. If every step is skipped, the tour never opens. |
| Team workspace reaches `/dashboard/matches/sample` by URL | The page renders, which is harmless and read-only, but no tour starts and no entry point links to it. |

### Testing

- **Pure modules** (`tests/*.spec.ts`, offline):
  - `tours.ts`: step resolution, skipping, eligibility.
  - The recording-source → destination table.
  - The first-report eligibility predicate.
- **Fixture guard spec.** It loads `fixture.json` and fails on any of:
  - the source names, "UCLA", the program key or a non-placeholder uuid;
  - `splitstep` in any user-visible string;
  - a point count other than 87.
- **Harness spec.** It mounts the sample report from the fixture, in the style of
  `film-playback-refresh-harness`, and asserts:
  - every `data-tour` target renders;
  - the banner is present;
  - no Delete, Share or Review-score control appears;
  - no request goes to `/api/matches/*`.
- **Isolation check.** A fresh account's Home counts, KPIs and heatmap are identical
  before and after visiting the sample. This holds by construction under approach A;
  the check runs as part of `/pr-check` Stage 3b on the `EYES_ON_*` account.
- **Reviewers:**
  - `pipeline-guardrails-reviewer` on the wizard and `AnalysisSteps` changes;
  - `rls-boundary-reviewer` on the migration and the video route;
  - `widget-states` on `SetupLine`;
  - `npm run map` for the new route.

## Open questions

1. **Consent covers the film, not just the names (blocks launch, not build).**
   Anonymising names does not anonymise 86 minutes of two identifiable UCLA players.
   Before this ships to every account, written OK is needed from both players and the
   program owner. The build can proceed on the fixture and the blob copy, with launch
   behind that sign-off. The fictional names also need picking; the default in the
   script is "Jordan Avery" vs "Sam Ellis", so change them if you prefer others.
2. **Egress.** Every new account may stream up to a 1.5 GB original, the untrimmed file
   (the job shows `trimmed: false`). Decide between serving the original, cutting a
   shorter copy of the same match (for example set 1; the fixture stays full-match and
   the film seeks only within the copy's range), or a lower-bitrate re-encode. The
   default if unanswered is a re-encode at about 720p, same length.
3. **First-report tour on SwingVision imports.** The design says yes. Say if it should
   be Advantage Intelligence uploads only.
4. **Wizard explainer sketch.** The text-only caption is in scope. The frame sketch is
   an image asset that needs a design pass; drop it if a sentence is enough.

Resolved here: brief Q2 (point of view: Rudy, player 1), Q3 (the full match, not one
game), Q6 (existing accounts are excluded by the "exactly one finished match" and
"more than one match" rules), Q7 (the checklist disappears when done, like `SetupLine`
today), Q8 (the beta welcome is suppressed on the sample page).

## Also consulted

- `MAP.md`
- `docs/ui-revamp-guardrails.md` §1, §3, §4
- `.skills/advantage-analytics-design/SKILL.md`, `reference/chrome.md` (Dark Tooltip),
  `reference/components.md` (Data Tooltip / popover box)
- `src/app/onboarding/steps.ts`, `src/app/onboarding/page.tsx`
- `src/components/dashboard/beta-welcome-dialog.tsx`
- `src/components/dashboard/home/day-zero-home.tsx`, `day-zero-offer.tsx`,
  `focus-empty.tsx`
- `src/components/dashboard/matches/new-match-wizard/FooterMeter.tsx`
- `docs/onboarding-and-workspaces.md` §3, `docs/video-pipeline-overview.md`
  (allowance and turnaround figures)
- Two read-only code surveys, by delegated agents, of:
  - the onboarding answers and actions, `dashboard/layout.tsx`, `SetupLine`, the wizard
    steps, `AnalysisSteps`, the analysis emails and the `ui/` primitives;
  - `match-detail-server.ts`, the `[matchId]` layout and page, `MatchDataProvider`,
    `FilmTab` and `useAttachmentPlayback`, `match-video-server.ts`,
    `services/match-video/access.ts`, `azure-sas.ts`, `/m/[token]` and
    `match-share-server.ts`, and `report-more-menu.tsx`.
- Live database (read-only SQL):
  - the `users` and `matches` columns and the `users` RLS policy;
  - source match `bca90097-…`: points by game, stats, insights, its program, and the
    processing job's video key.
