# Review: first-run-onboarding

Sign-off: pending

Range reviewed: `96ddf88...1949ffd` (merge base with `splitstep-integration` … review
fixes). pr-check verdict: **not-ready**. The only gate behind that is eyes-on, which
could not run (credentials unset). Every review finding is fixed.

## Success criteria

| Criterion | Status |
| --- | --- |
| A new personal account opens the sample from day-zero Home and from the end of onboarding, and finishes or dismisses the tour | Met in code (T12, T13, T14, T9). Specs: sample-page, tour-runner. Not seen in a browser. |
| Every section the tour points at renders with real values | Met by the fixture (87 points, 532 shots) and the fixture guard spec. Not seen in a browser. |
| The film plays | **Unverified.** The route mints a SAS for `sample/match-v1.mp4` (H1 copied). No Azure credentials in the agent container. |
| The "sample" label is visible at every scroll position | Met in code (sticky `SampleBanner`, T11). Not seen in a browser. |
| Opening the sample changes none of the player's counts, KPIs, heatmap, insight or opponents | Met by construction: the fixture is static, with no DB writes. Read-only chrome, film and shots specs pin no `/api/matches/*` writes (T5–T7). The fresh-account before/after check has not been done. |
| The recording-source answer leads to the matching next screen | Met (T13, `resolveDestination` / `soloDestination` specs). |
| First-upload wizard: helper copy and allowance preview; inputs and payload unchanged | Met. The caption is T18. The allowance preview was already shipped (`FooterMeter`, plan §note). pipeline-guardrails-reviewer passes after fixes. |
| The analysis-in-progress screen links to the sample | Met (T15, personal workspaces only). |
| The first finished match shows the tour once, never again after finish or dismiss | Met. `first_report_tour_done_at` plus `firstReportTourEligible`, decided below the §3.3 short-circuit. |
| Tour and checklist progress carries across browsers | Met. Done-at lives on `users` (T1, T19 grant, verified live); the session guard is only a same-tab cache. |
| Team workspaces show none of this | Met. The eligibility facts take the workspace kind. The sample link is gated `workspaceKind === "personal"`. |
| Existing gates pass, including `/pr-check` headless UI review | **Partially met.** Lint, typecheck and tests are clean apart from environmental failures. Eyes-on is unverifiable. |

## pr-check findings and resolutions

**Stage 1, mechanical.**

- `lint`: pass.
- `typecheck`: pass.
- `test`, after fixes: 4392 passed. 338 failures are environmental (the container
  has `chromium_headless_shell-1194`; Playwright wants 1200, so "Executable doesn't
  exist"). One failure is the known flake `upload-line-swap.spec.ts:402`, which is
  pre-existing.
- Failures were classified from the JSON reporter, not the truncated summary.

**Stage 2, simplify.** No changes. Coverage was partial over a large range.

**Stage 3, code review (medium).** 9 findings, all fixed in `1949ffd`:

1. The first-report tour ignored workspace kind, creator, program scope and
   stats-published. It is now `firstReportTourEligible` with the real facts
   (`Match.createdBy` / `programId` added).
2. The done-at read added a serial round trip. It now joins the existing
   post-short-circuit `Promise.all`, and the count runs only when the tour has
   never been finished.
3. Statistics-view tour steps had no tab. `TourTab` now has `statistics`, and the
   step is resolved after switching view.
4. The runner could keep a detached anchor across a view switch. It never holds one
   now.
5. The session guard was not keyed by viewer, so a shared browser leaked state. It
   is now keyed `tour-done:<tour>:<viewerId>`.
6. An explicit `?tour=1` replay was swallowed by the guard. `requested` now bypasses
   it.
7. `SetupLine` vanished when the finished-match count read failed. It now renders
   the profile and preferences steps.
8. `markTourDone` reported success on a zero-row update. It now returns `no_row`.
9. The done-at read was duplicated on two pages. It is now one `getTourDoneAt` and a
   shared `TOUR_COLUMN`.

**Stage 3, pipeline-guardrails-reviewer.** 2 low findings, both fixed:

- The Film tour copy implied a condensed cut. It now reads "with a point list".
- The first-report tour decision is placed below the short-circuit.

The wizard's attribution inputs and payload are untouched.

**Stage 3, rls-boundary-reviewer.** Clean.

- The column grants (`20261007061209`) were verified live.
- The sample video route is session-gated, and the SAS is for one fixed blob for
  30 minutes.
- The service role is not reachable from a client.

**Fix verification.** An independent pass found all 11 items resolved.

**Stage 3b, eyes-on.** `ui-verifier`: **unverifiable**. The harness exited 2 because
`EYES_ON_EMAIL` / `EYES_ON_PASSWORD` are unset, so there are no screenshots. This
alone makes the verdict not-ready.

**Skipped.**

- `vercel-react-best-practices`: the skill is not installed.
- `supabase:supabase-postgres-best-practices`: the skill is not installed.

## Consciously left

**Low notes from fix verification:**

- Focus timing when a view-switching step unmounts and remounts the popover. Focus
  lands correctly after the remount.
- A viewer with no `users` row no longer auto-starts the sample tour (`undefined`
  means unknown, so the tour does not start). This is intended.
- The first-report eligibility uses `statsPublished` only.

**Build follow-ups (not blocking):**

- Band preset rows stay disabled rather than hidden in read-only.
- `?draft=1` on a read-only report.
- A team viewer reaching the sample sees the same banner link.
- Duplicated `QuietAction` classes (T15).
- No spec pins the T18 caption or the T17 copy.
- `durationSeconds: 0` for the sample attachment means the duration is unknown.

## Open before landing (stage 07)

1. **H2 consent.** Written OK from both players and the UCLA program owner.
2. **Eyes-on.** Set the `EYES_ON_*` credentials in `.env.local` and re-run
   `/pr-check`. That also covers "the film plays", via
   `/dashboard/matches/sample?tab=film` with production Azure settings.
3. **Unreconciled note.** The fixture has `foldUnreconciled: true`. Either reconcile
   and regenerate, or suppress the note for the sample.
4. **Veterans' setup line.** It reads "2 of 4". This is an author decision.
5. **Base drift.** `splitstep-integration` is 152 commits ahead of `96ddf88`. Merge
   it in before landing.
6. **Live migration.** The live DB has migration `20261005072656`, which has no file
   on this branch. It is expected to arrive with that merge; confirm.

## Also consulted

- `work/first-run-onboarding/03_plan/output/plan.md`, for the allowance-preview note.
- `tests/home-streaming.spec.ts`.
- The `ui-verifier` report.
