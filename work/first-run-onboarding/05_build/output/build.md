# Build report: first-run-onboarding

Queue: `.claude/tasks/first-run-onboarding.md`. Per-task gate detail is in
`.claude/tasks/first-run-onboarding.log.md`.

## Task status

19 of 19 tasks are done, with none blocked at the end. T1–T18 came from stage 04;
T19 was added mid-build.

| Task | Title | Status | Commit |
| --- | --- | --- | --- |
| T1 | `users.sample_tour_done_at` / `first_report_tour_done_at` migration (applied live, version 20261007024333) | done | `43367e4` |
| T19 | Column-scoped `grant update` on the two columns to `authenticated` (applied live, version 20261007061209). Added after T1's review found the column-list UPDATE grant. | done | `b0ffa18` |
| T2 | Pure tour logic: `TOURS`, `resolveSteps`, `soloDestination`, `firstReportTourEligible`, `setupSteps` | done | `fe4963f` |
| T3 | Sample-match build script, anonymiser, fixture guard spec. Cookie-free `loadMatchDetail` extracted. | done | `b3701a3` |
| T4 | `TourPopover` primitive with a `/design` preview | done | `8550d49` |
| T5 | Read-only report chrome: `sample` / `playbackEndpoint` meta; More, Share and Compare hidden | done | `1f63b91` |
| T6 | Read-only film tab | done (blocked once) | `f86528a` |
| T7 | Read-only Shots tab: no saved-view or band writers | done | `8319618` |
| T8 | `data-tour` targets on the report | done | `5803906` |
| T9 | `TourRunner` + `markTourDone` server action | done | `14e5da2` |
| T10 | `GET /api/sample-match/video`: session-gated SAS for one fixed blob | done | `aaaf803` |
| T11 | `SampleBanner`; BetaWelcome suppressed on the sample path | done | `af821cf` |
| T12 | Sample report page at `/dashboard/matches/sample` with tour | done | `f480645` |
| T13 | Solo onboarding routed by recording source | done | `3e8f591` |
| T14 | Day-zero "See a sample report" link | done | `c713948` |
| T15 | "While you wait, see a sample report" on the analysis steps | done | `260ead1` |
| T16 | First-report tour on the match page | done | `b109da3` |
| T17 | Getting-started line, "n of 4" | done (blocked once) | `c14f4ea` |
| T18 | First-upload caption under the top-player question | done | `82a1b5b` |

Human prerequisites:

- **H3: fixture generated.** Committed in `e28e06e`; T12 promoted in `5ba406b`.
- **H1: sample blob.** Copied to `sample/match-v1.mp4` as a straight copy, not
  re-encoded. Playback is not verified from the agent container, which has no Azure
  credentials.
- **H2: consent.** Still open. It gates stage 07.

## Commit range

`80701f1` (scaffold) … `260ead1` (T15), 29 commits on `first-run-onboarding`, all
pushed:

```text
260ead1 T15: While you wait, see a sample report line on the analysis steps
c713948 T14: Day-zero See a sample report link
f480645 T12: Sample report page at /dashboard/matches/sample with tour
5ba406b task: promote T12 to todo (fixture.json committed)
e28e06e Add anonymised sample match fixture
f86528a T6: Read-only film tab: context playback endpoint, no writes
c14f4ea T17: Getting-started line: tour steps first, n of 4
82a1b5b T18: First-upload caption under the top-player question
aab6e00 T17: blocked
b109da3 T16: First-report tour on the match page
3e8f591 T13: Route solo onboarding by recording source
af821cf T11: SampleBanner component and BetaWelcome suppression on the sample path
aaaf803 T10: GET /api/sample-match/video: session-gated SAS for the sample clip
14e5da2 T9: TourRunner component and markTourDone server action
5803906 T8: Add data-tour attributes to the five tour targets
8319618 T7: Read-only Shots tab: no saved-view or band writers
7847d2b T6: blocked
1f63b91 T5: Read-only report chrome: sample and playbackEndpoint meta
8550d49 T4: TourPopover primitive with /design preview and browser spec
b3701a3 T3: Sample-match build script, anonymiser and fixture guard spec
fe4963f T2: Pure onboarding tour logic: definitions, resolveSteps, soloDestination, eligibility, setupSteps
b0ffa18 T19: Grant UPDATE on the two onboarding-tour columns to authenticated
69106cb task: add T19 grant UPDATE on onboarding-tour columns; T9 needs T19
43367e4 T1: Add sample_tour_done_at and first_report_tour_done_at to users
025ed76 pipeline(first-run-onboarding): stage 04 tasks
ebfa151 pipeline(first-run-onboarding): stage 03 plan
846064a pipeline(first-run-onboarding): stage 02 design
c5bbcf9 pipeline(first-run-onboarding): stage 01 brief
80701f1 pipeline(first-run-onboarding): scaffold workspace
```

## Blocked items

None remain. Two tasks were blocked once and resolved on retry. Both stashes have
been dropped.

- **T6: blocked once.** The completion review found `FilmEntryActions` still
  rendered through `film-unavailable-state.tsx` on FilmTab's no-video path under
  `readOnly`. The new spec's `/__api-hits` was also narrower than "any
  `/api/matches/*`".
  - **Retry fix:** the no-video branch passes `readOnly` to the empty, expired and
    unavailable states. The empty state had also offered "Add video" to every
    non-SwingVision match.
  - **Assertion:** it now covers every `/api/matches/` hit.
  - **New coverage:** offline spec `film-read-only-states.spec.ts`.
- **T17: blocked once.** Its gate surfaced a real regression.
  - **Cause:** `home-streaming.spec.ts` renders Home in a VM with stubbed data
    modules. The unstubbed `finished-match-count-server` import fell through to a
    null placeholder.
  - **Retry fix:** a stub for that module in the spec.
  - **How it was found:** the gate's summary only prints the last 40 failures, so
    the regression was hidden among environmental ones. The gate was rerun with a
    JSON reporter that classifies every failure. T17 retry, T6 retry, T12, T14 and
    T15 were all gated that way.

## Gate notes that apply to every task

- **Environmental browser failures.** Playwright expects
  `chromium_headless_shell-1200`, but the container has only 1194. The author ruled
  "Executable doesn't exist" failures environmental; that is about 335 browser
  cases at the end.
  - New browser specs were verified under a temporary, removed 1194 shim:
    tour-popover, tour-runner, film read-only, sample-page.
  - The 1194 build has no H.264 decoder, so video cases need a VP9 fixture there.
- **Known flake.** `upload-line-swap.spec.ts:402` fails under full-suite load and
  passes in isolation. It is pre-existing and unrelated to this branch.
- **`npm run api:lint`.** It needs the Postman CLI. That was installed outside the
  repo for T10, where the lint passed.
- **Reviewers run by hand.** The guardrails and RLS reviewers were applied by hand
  from their agent definitions, because task subagents had no Agent tool. They run
  for real at `/pr-check`.

## Open items carried to review

1. **H2 consent.** Written OK from both players and the UCLA program owner. This
   blocks landing.
2. **Sample playback unverified.** It hasn't been checked end to end with production
   Azure settings. Check `/dashboard/matches/sample?tab=film` on a preview.
3. **Unreconciled note.** The fixture carries `foldUnreconciled: true`, so the
   sample's Statistics view shows the "unreconciled" note. Either reconcile the
   source match and regenerate, or suppress the note for the sample.
4. **Veterans' setup line.** It reads "2 of 4" (criterion) where the task note
   expected today's two-step count. This is an author decision.
5. **Branch-level follow-ups.** These are logged per task and are not blocking:
   - the band preset rows stay visible but disabled in read-only;
   - `?draft=1` on a read-only report;
   - a team viewer reaching the sample sees the same banner link;
   - `QuietAction` classes are duplicated in T15;
   - no spec pins the T18 caption or the T17 rendered copy.
