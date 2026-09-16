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
