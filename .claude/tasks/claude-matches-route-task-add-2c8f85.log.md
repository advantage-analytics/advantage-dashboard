# Run log — claude/matches-route-task-add-2c8f85

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Hide and reap drafts whose match already has a video job — done

**gate:** mechanical — first run FAIL (2 offline cases in `tests/upload-draft-resume.spec.ts`: the `draftsDatabase()` mock had no `in()` and no per-table rows, so the new `processing_jobs` lookup broke it); the subagent was sent back once to repair the fixture (no assertions changed), second run PASS. completion — `VERDICT: pass`.
**changed:** `draft-target.ts` — `foldDrafts` takes optional `staleMatchIds` and drops those drafts before folding; new pure `matchIdsWithJob(matches)` returns ids whose `analysis.jobId` is set. `matches-page-content.tsx` — fold now runs on the Realtime-merged `matches` with `matchIdsWithJob(matches)`, so `hasDraft` / `continueHref` / stepping / `?draft=` all skip stale drafts; `rememberMatchesShape` effect moved below the fold. `actions.ts` — `listMatchDrafts` looks up `processing_jobs` `.in("match_id", targetIds)` with the session client, filters those drafts out and fire-and-forget deletes the `match_drafts` rows (scoped to `user_id`, `console.warn` on error; a failed lookup keeps every draft). Harness gains `?job=1` / `?manual=1`; spec gains two cases (8/8). `upload-draft-resume.spec.ts` mock builder: per-table rows, `in()`, chainable `delete()`.
**follow-ups:**

1. The wizard should refuse or redirect when a resumed `?draft=` targets a match that already has a job, so a deep link cannot start a second job (adjacent to T2).
2. A coach's stale draft on a player's match is hidden client-side but never reaped, because per-creator RLS hides the job from the server lookup; a SECURITY DEFINER RPC or `visible_match_ids()` would let the server reap those too.
3. The reap delete runs during render rather than in `after()` (the session client needs cookies, which `after()` in a Server Component may not have); a service-role client inside `after()` would make deletion reliable on Vercel.

## T2 · Wizard submit deletes every draft targeting the match — done

**gate:** mechanical — PASS (lint, typecheck, full suite). completion — `VERDICT: pass`.
**changed:** `actions.ts` — new `deleteMatchDraftsForMatch(matchId)` deletes the signed-in user's `match_drafts` rows where `payload->preset->>matchId` or `payload->attachedLine->>matchId` equals the id (`.eq("user_id", …).or(…)`). `useUploadMatchWizard.ts` — one fire-and-forget call after the shared match write path (covers both `reusingMatch` and insert), beside the kept `deleteMatchDraft(draftId)`. Mocks: `matches-page-actions-browser-mock.ts` gains a no-op export; `upload-wizard-hook.ts` gains a handler plus a `draftDeletesForMatch` tracking array.
**follow-ups:**

1. No spec asserts the new call end-to-end: add a case to `tests/upload-draft-resume.spec.ts` where a wizard opened via `?entry=&match=` (draftId null) submits and `draftDeletesForMatch` records the match id.
