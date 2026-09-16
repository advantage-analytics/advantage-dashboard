# Run log — claude/match-report-film-room-a05b7e

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Pure report rules and their specs — blocked

- **gate:** mechanical — FAIL (twice); completion — not run (stops at first failure).
- **stage failed:** mechanical, `npm test` only — lint and typecheck passed. Run 1: 3 live-DB specs failed (`account-deletion-retention`, `claim-eyebrow-width`, `leave-program`), all inside `tests/fixtures/live-db.ts` `createLogin` → `admin.auth.admin.createUser`. Those three files re-run alone: 20/20 pass. Run 2 (full gate, once): ~10 live-DB specs failed the same way (`join-requests-staff-read`, `pending-invites`, `personal-home-scope`, `program-member-avatars`, `program-owner-name-live`, `rls-workspace-isolation`, `teams-management`, …); 1132 passed, no non-live-DB failure in either run.
- **reason:** environmental, not the diff. Supabase auth logs for 2026-09-16T07:32–07:33Z show `POST /admin/users` returning 500 `unable to find identity by email for duplicates: unable to fetch records: timeout` and 504 `context deadline exceeded` under the suite's `fullyParallel` user creation. No failing spec imports a file T1 touched. Blocked anyway, per the rule that a failed gate never commits.
- **subagent report:** all five `done when:` lines met — typecheck clean; `report-view`, `insight-text`, `report-scoreboard`, `match-kpi-history`, `client-bundle-boundary` specs 33/33. Baseline before edits: `npm run lint` 0 errors / 37 warnings (unchanged after), `npm run build` passed.
- **stash:** `31b8722aa3f7955def919fa30a5b96c04e906ea2` (tag `blocked: T1 (claude/match-report-film-room-a05b7e)`) — `match-stats-server.ts`, `match-kpi-history.spec.ts`, and six new files: `report-view.ts`, `insight-text.ts`, `report-scoreboard.ts` and their three specs.
- **to resume:** once the live auth API is healthy, `git stash apply 31b8722aa3f7955def919fa30a5b96c04e906ea2`, reset T1's `status:` to `todo`, and re-run `/task-next` — the runner re-gates; or re-gate by hand and commit.

## T1 · Pure report rules and their specs — done

- **gate:** mechanical — PASS (lint, typecheck, full suite incl. live-DB specs); completion — `VERDICT: pass`, all five criteria met, scope limited to `files:`. Re-run of the work restored from stash `31b8722a` after the Supabase Auth timeouts (07:30Z) cleared; the verifying subagent needed no changes.
- **changed:** new pure modules `report-view.ts` (`REPORT_VIEWS`, `parseReportView`, `reportViewQuery`), `insight-text.ts` (`splitInsight`), `report-scoreboard.ts` (`setOutcome`) under `match-detail/`, each with a spec; `hasComparisonBaseline` added to `match-stats-server.ts` with three cases in `match-kpi-history.spec.ts`. Lint 0 errors / 37 warnings, unchanged from the pre-edit baseline; pre-edit `npm run build` passed.
- **follow-ups:** 1. When the rail switcher ships, check that no other surface (search palette, breadcrumbs) still names the old tab labels "Shots & placement" / "Film room" — only the `?tab=` values stay stable.

## T2 · MatchReport context, frame parts and `use()` providers — done

- **gate:** mechanical — PASS; completion — `VERDICT: pass`, all five criteria met, scope limited to `files:`.
- **changed:** new `match-report-context.tsx` (`MatchReportProvider`, `useMatchReport` via `use()`, `{state, actions, meta}`; view from `?tab=` through `parseReportView`, `selectView` pushes history like `match-tabs.tsx`; insight dismissed/collapsed/expanded) and `match-report.tsx` (`MatchReport` namespace — `Provider`, `Frame`, `Rail`, `Spacer`, `RailFooter`, `Pane` with the grey-pane DS-principle-6 comment, `When` — plus the same parts as named exports); `match-data-provider.tsx` moved to `<Context value>` + `use()` with no other change. Nothing imports the new files yet. Lint 0 errors / 37 warnings. `widget-states`: not widgets (provider and layout plumbing); receipt re-recorded after staging because the gate's diff hash omits untracked files.
- **follow-ups:** 1. T6: `page.tsx` is a Server Component and must import the named exports (`MatchReportFrame`, …) — dotting into a client module's object export throws "You cannot dot into a client module from a server component". 2. T6/T10: `When`'s required `flex-1 min-h-0` may swallow the pane's 24px bottom padding under a long Statistics view — check at the visual pass. 3. T3: give the view-switcher tabs `aria-controls` and each `When` tabpanel an `id`/`aria-labelledby`. 4. `.claude/hooks/widget-states-gate.sh` hashes `git diff <base>`, which omits untracked files, so a receipt recorded before `git add` never matches a commit that adds new files.
