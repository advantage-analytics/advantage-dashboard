# Run log — claude/match-analysis-failure-retry-8769f3

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Refuse to resubmit an `invalid_input` failure — done

- **gate:** mechanical GATE PASS (the first run failed on `@electric-sql/pglite` and `pg` missing from this worktree's stale `node_modules` — both already declared in `package.json`; `npm ci` repaired the install and the re-run passed); completion review `VERDICT: pass`, all five criteria met, no scope creep.
- **changed:** `resubmitJob()` selects `error_category` and, right after the not-failed refusal and before the video check, refuses an `invalid_input` parent with reason `input_rejected` and the message "This video didn't meet one of the recording requirements, so retrying it would stop the same way. Upload a new recording instead." The resubmit route maps `input_rejected` to 409. Because the check is inside `resubmitJob()`, the webhook, reconcile, jobs route and recursive auto paths inherit it unchanged. `tests/resubmit-authorization.spec.ts`: `parentJob()` defaults `error_category: null`, a new test proves the refusal on both the manual and `auto: true` paths, and the accepted-path test now runs with `error_category: "internal"` (20 specs pass).
- **follow-ups:** 1. `video_quality` is still retryable by decision; the webhook's own comment says those can never succeed on retry — revisit if one shows up. 2. The `"invalid_input"` literal will also exist in `match-analysis.ts` once T10 lands on `claude/advantage-intelligence-ui-e6e2f7`; consolidate after both merge. 3. `check.sh preflight` only installs when `node_modules` is missing, so a worktree whose install predates a dependency bump fails the gate on the database specs — worth a lockfile-hash check.
