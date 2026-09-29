# Tasks — claude/api-audit-684175

> Scope: API audit fixes: webhook/submit security, route correctness, OpenAPI contract

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

## T1 · Webhook fails closed when the secret is set

- **status:** done
- **model:** fable
- **files:** src/app/api/webhooks/splitstep/route.ts, src/lib/services/splitstep/webhook-auth.ts (new), .env.example, tests/splitstep-webhook-auth.spec.ts (new), tests/fixtures/with-env.ts (guess)
- **done when:**
  - [ ] `verifyWebhookAuth(request, rawBody)` and `SIGNATURE_HEADERS` move out of `route.ts:119-244` into a new pure module `src/lib/services/splitstep/webhook-auth.ts` (exported, no Supabase or logger imports beyond `pipelineLog`); the route imports both and `safeHeaders()` still redacts every name in `SIGNATURE_HEADERS`.
  - [ ] With `SPLITSTEP_WEBHOOK_SECRET` set and no signature header present, the outcome is `{ ok: false, verified: false }` and the route answers 401 `{ error: "Unauthorized" }` — regardless of whether `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE` is set. The only way to accept an unsigned delivery while a secret is set is the new explicit escape hatch `SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED=true`, which accepts with `verified: false` and keeps the existing "no signature header found" warn line. With no secret at all the behaviour at `:165-171` is unchanged.
  - [ ] `.env.example:77-91` documents the new default ("fails closed once the secret is set"), the `ALLOW_UNSIGNED` hatch as pilot-only, and marks `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE` as no longer read (line kept so an existing Vercel value is harmless); the doc comment at `route.ts:148-161` ("Why a missing signature is accepted") is rewritten to match.
  - [ ] New offline spec `tests/splitstep-webhook-auth.spec.ts` builds `NextRequest`s by hand and uses `withEnv(["SPLITSTEP_WEBHOOK_SECRET","SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED","SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE"], …)` to assert: secret + no header → `ok:false`; secret + wrong `x-hmac-signature` → `ok:false`; secret + correct `base64(HMAC-SHA256(secret, rawBody))` → `ok:true, verified:true`; secret + no header + `ALLOW_UNSIGNED=true` → `ok:true, verified:false`; no secret → `ok:true, verified:false`.
  - [ ] `npm run typecheck`, `npm run lint` and `npm test -- tests/splitstep-webhook-auth.spec.ts` pass.
- **notes:** Live: all 14 rows in `splitstep_webhook_deliveries` (2026-08-09 → 09-28) have `signature_verified = true`, so the vendor signs via `x-hmac-signature` and the code's own condition for flipping closed is met. A1 (the user setting `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE=true` in Vercel) is not this task; after this task that variable is inert. Do not touch the "raw secret in header" tolerance at `:202-213`. Group A ships alone as one PR reviewed by `rls-boundary-reviewer`.

## T2 · Redact SAS query strings from the webhook's console log

- **status:** done
- **model:** sonnet
- **files:** src/lib/services/splitstep/pipeline-log.ts, src/app/api/webhooks/splitstep/route.ts, tests/pipeline-log-redaction.spec.ts (new) (guess)
- **done when:**
  - [ ] `pipeline-log.ts` exports a pure `redactSignedUrls(text: string): string` that replaces the query string of every `http(s)://…?…` occurrence with `?[redacted]`, leaving scheme, host and path intact (so the log still names which vendor blob was delivered).
  - [ ] `route.ts:279-283` logs `body: redactSignedUrls(rawBody).slice(0, 4000)`; `grep -n "rawBody" src/app/api/webhooks/splitstep/route.ts` shows no other log call receiving the raw body.
  - [ ] New offline spec `tests/pipeline-log-redaction.spec.ts`: a body containing `https://splitstepclientvideos.blob.core.windows.net/results/x.json?sv=2024&se=…&sig=abc` comes back with host and path intact and no `sig=` or `se=` value; a body with two URLs redacts both; a body with no URL is returned byte-for-byte.
  - [ ] `npm run typecheck`, `npm run lint` and `npm test -- tests/pipeline-log-redaction.spec.ts` pass.
- **notes:** The PostHog copy is already safe — `DROPPED_KEYS` drops `body` and `SENSITIVE` redacts URL strings (`pipeline-log.ts:27-33`). The leak is the console line: `write()` at `:78` prints `detail` verbatim to Vercel's logs, and completion payloads carry four 7-day SAS URLs. This contradicts the "Never the URL" rule at `upload-url/handler.ts:431`. Do not redact the stored delivery row (`p_raw_body`) — recovery by hand depends on it.

## T3 · Gate the webhook's failed branch on the job row

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/app/api/webhooks/splitstep/route.ts, tests/splitstep-webhook-route.spec.ts (new), tests/fixtures/vm-modules.ts (guess)
- **done when:**
  - [ ] The condition at `route.ts:581` becomes `record.job_status === "failed" && record.matched_job_id` — the status `record_splitstep_webhook` returns AFTER its rank-guarded update — so a `job_failed` delivery for a job the row already holds as `completed` (or `derivation_failed`) releases no quota, sends no mail and triggers no resubmit. The `retryable` read at `:587` and the `after()` body are otherwise unchanged.
  - [ ] New offline spec `tests/splitstep-webhook-route.spec.ts` drives the route's `POST` through `createLoader` (pattern: `tests/upload-route-guards.spec.ts`) with stubs for `@/lib/supabase/admin` (an `rpc("record_splitstep_webhook")` fake answering a fixture record), `@/lib/services/splitstep/quota`, `@/lib/services/splitstep/resubmit-job`, `@/lib/services/notifications/analysis-mail`, `@/lib/services/splitstep/webhook-auth` (T1's module, answering `ok:true`) and `next/server` (real `NextRequest`/`NextResponse`, `after` invoking its callback immediately). Nothing opens a database or a network socket.
  - [ ] Cases: (a) payload `{ event: "job_failed", job_id }` while the record says `job_status: "completed"` → 200, `releaseQuota`, `notifyAnalysisOutcome` and `resubmitJob` all unreached; (b) record says `failed` with a non-retryable error code → `releaseQuota` called once with `matched_job_id` and `notifyAnalysisOutcome` called once with `outcome: "failed"`, `resubmitJob` unreached; (c) record says `failed` with `error.step: "downloading_video"` → `resubmitJob` called once with `auto: true` and no mail.
  - [ ] `npm run typecheck`, `npm run lint` and `npm test -- tests/splitstep-webhook-route.spec.ts` pass.
- **notes:** `record.job_status` is `v_job.status` after the update in `20260902200000_splitstep_players_trajectories.sql:137-190`; the rank guard ("never backwards, never off a terminal state") is what makes it the right gate. The completed branch at `:398` also keys on `payload.nextStatus` — leave it (its downloads are guarded by `already_stored` and the per-file keys), but say so in the follow-ups. Read the live function with `execute_sql` on `pg_get_functiondef('public.record_splitstep_webhook'::regproc)` before trusting the migration file's return shape: the live `splitstep_webhook_deliveries` table has no `sas_url` column, so the folder is behind here too.

## T4 · Host allowlist and no-redirect on vendor result fetches

- **status:** done
- **model:** fable
- **files:** src/lib/services/splitstep/result-url-policy.ts (new), src/lib/services/splitstep/secure-results.ts, src/app/api/webhooks/splitstep/route.ts, .env.example, tests/result-url-policy.spec.ts (new), tests/secure-results-host-guard.spec.ts (new) (guess)
- **done when:**
  - [ ] New `src/lib/services/splitstep/result-url-policy.ts` exports `isAllowedResultUrl(url: string, hosts?: readonly string[]): boolean` — true only for an `https:` URL whose `hostname` is exactly one of the allowed hosts — and `defaultResultHosts()`: `splitstepclientvideos.blob.core.windows.net` plus `${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net` when that env is set, plus any comma-separated `SPLITSTEP_RESULT_HOSTS` entries; `.env.example` documents `SPLITSTEP_RESULT_HOSTS` beside the other `SPLITSTEP_*` vars.
  - [ ] `secureResults()` (`secure-results.ts:139-143`) and the route's `storeVendorJson()` (`route.ts:697-701`) refuse a disallowed URL before any fetch with `{ ok: false, error: "result url host not allowed: <hostname>" }` and a `pipelineLog.error` naming the hostname only; both fetches pass `redirect: "error"` instead of `redirect: "follow"`.
  - [ ] `tests/result-url-policy.spec.ts` (pure): the vendor host passes; `http:` scheme, `splitstepclientvideos.blob.core.windows.net.evil.example`, `evil.example/?x=splitstepclientvideos.blob.core.windows.net`, `169.254.169.254`, `localhost` and `[::1]` all fail; `withEnv(["SPLITSTEP_RESULT_HOSTS","AZURE_STORAGE_ACCOUNT"], …)` shows both env sources extend the set.
  - [ ] `tests/secure-results-host-guard.spec.ts` uses `secureResults`' injected `fetchImpl`: a disallowed URL never invokes it and the outcome is `resultsSecured: false`; an allowed URL invokes it once with `redirect: "error"`.
  - [ ] `npm run typecheck`, `npm run lint` and both specs pass.
- **notes:** Live (read-only SELECT on `processing_jobs`): every non-null `sas_url`, `players_url`, `trajectories_url` and `trimmed_video_url` is on `splitstepclientvideos.blob.core.windows.net` — the vendor's own Azure account, not ours. Leave `parseWebhookPayload`'s `asHttpUrl` alone: recording a disallowed URL on the row is harmless and keeps hand recovery possible; the policy belongs at the fetch. `reconcile.ts:153` fetches the vendor API (`SPLITSTEP_API_URL`), not a result URL — out of scope. Nothing here changes `trimmed_video_url` handling (never downloaded).

## T5 · Compare-and-set claim on `/api/splitstep/jobs` submit

- **status:** done
- **model:** fable
- **files:** src/app/api/splitstep/jobs/handler.ts, src/app/api/splitstep/jobs/route.ts, tests/job-submission-authorization.spec.ts (guess)
- **done when:**
  - [ ] `SubmitJobDeps` gains `claimSubmitting(jobId: string, patch: SubmitJobPatch): Promise<{ claimed: boolean; error: string | null }>`; `route.ts` implements it as `.update({ status: "submitting", ...patch }).eq("id", jobId).eq("status", "uploaded").select("id")` with `claimed = (data?.length ?? 0) > 0` — the same shape as the rederive route's `claimJob` at `rederive/route.ts:64-75`.
  - [ ] In `handleSubmitJob` the claim runs BEFORE `deps.reserveQuota` (`:525`), where the admin claim already sits (`:516`), carrying the `billable_seconds`/`attempt_count`/orientation patch that `:561-569` writes today; a lost claim answers 409 `{ error: "This match is already being submitted." }` with `reserveQuota`, `mintVendorUrl` and `submitToVendor` unreached. A refused reservation (`!reservation.ok`, `:532`) reverts the row to `uploaded` for every caller, not only `adminVideo`.
  - [ ] For an `adminVideo` submission the existing `claimAdminVideo` remains the claim and the plain `updateJob` write is kept for it, unless the subagent verifies (live `pg_get_functiondef('public.admin_video_access'::regproc)`) that the admin claim leaves `status = 'uploaded'`, in which case both paths use the new CAS. The catch block at `:685-712` still releases quota, retires the URL and marks `failed` for any failure after a won claim.
  - [ ] `tests/job-submission-authorization.spec.ts`: the fake gains `claimSubmitting` recording its calls; the patch-order expectations at `:442-449` and `:689-701` are updated; new cases — (a) two `handleSubmitJob` calls against one harness whose fake claim succeeds only once → exactly one `reserveQuota` and one `submitToVendor` call, the other answers 409; (b) a refused reservation after a won claim ends with a final `{ status: "uploaded" }` patch.
  - [ ] `npm run typecheck`, `npm run lint` and `npm test -- tests/job-submission-authorization.spec.ts` pass.
- **notes:** Today the status check at `handler.ts:279` is a plain read and `updateJob` at `route.ts:165-171` is keyed on `id` only, so two concurrent POSTs both reserve quota and both reach the vendor. Live `processing_usage` has no unique index on `job_id` and zero duplicate rows today — T6 adds the database backstop; this task closes the race in the app. `useUploadMatchWizard.ts` calls this route automatically on transfer completion (`route.ts:10-11`); the wizard's error surface reads `error` (`submit-match-video.ts`), so the 409 sentence is user-visible.

## T6 · Unique partial index on `processing_usage(job_id)`

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<live-version>_processing_usage_job_id_unique.sql (new), tests/database/processing-usage-job-id-unique.test.mjs (new) (guess)
- **done when:**
  - [ ] A new hand-written migration file (never run through Prettier — `.prettierignore` excludes the folder on purpose) containing `create unique index if not exists processing_usage_job_id_key on public.processing_usage (job_id) where job_id is not null;` under a header comment naming the race it closes (`/api/splitstep/jobs` double submit, T5) — the same one-line style as `20260927034516_match_files_one_per_match.sql:41`.
  - [ ] The file's timestamp prefix is the version the Supabase MCP `list_migrations` reports for the applied entry, so the filename and the live migration history agree.
  - [ ] New `tests/database/processing-usage-job-id-unique.test.mjs` (PGlite, pattern `tests/database/admin-upload-submissions.test.mjs`): creates a minimal `public.processing_usage (id uuid primary key, job_id uuid)` table, executes the migration file byte-for-byte, inserts two rows sharing a `job_id` and asserts the second fails with SQLSTATE `23505`; inserts two rows with `job_id` null and asserts both succeed.
  - [ ] `npm run test:database` passes.
- **notes:** Per AGENTS.md the live database is the schema source of truth and `supabase/migrations/` runs ~100 behind: the DDL must ALSO be applied live through the Supabase MCP `apply_migration` (name `processing_usage_job_id_unique`) on project `pouxujkhtbvkdwbzfvka`, and the run-log entry must record the version it came back with. Before applying, re-run `select job_id, count(*) from processing_usage where job_id is not null group by 1 having count(*) > 1` — it returned zero rows on 2026-09-29; a non-empty result blocks the apply. After this index `reserve_processing_quota` raises 23505 on a duplicate, which `reserveQuota()` (`quota.ts:219`) turns into a thrown Error — T10 maps that to a 409.

## T7 · Resubmit refuses when the match read fails

- **status:** done
- **model:** sonnet
- **files:** src/app/api/splitstep/jobs/[jobId]/resubmit/route.ts, tests/resubmit-route-billing.spec.ts (new) (guess)
- **done when:**
  - [ ] `resubmit/route.ts:103-114` destructures `error: matchError` from the `matches` read; when set, the route logs `[splitstep-resubmit-route] match lookup failed` with `{ jobId, error: matchError.message }` and answers 503 `{ error: "Could not load the match. Try again." }` before `billingWorkspaceFor` runs.
  - [ ] When the read succeeds but returns no row, the route answers 404 `{ error: "Job not found" }` — a job whose match is gone is never billed to the personal workspace.
  - [ ] New offline spec `tests/resubmit-route-billing.spec.ts` drives `POST` through `createLoader` (pattern: `tests/upload-route-guards.spec.ts`) with `@/lib/supabase/server`, `@/lib/supabase/admin`, `@/lib/workspace/active-workspace-server` and `@/lib/services/splitstep/resubmit-job` stubbed: (a) matches read error → 503 and `resubmitJob` unreached; (b) null row → 404, unreached; (c) `program_id` set and a matching team workspace available → `resubmitJob` called once with `workspace.id === program_id`.
  - [ ] `npm run typecheck`, `npm run lint` and `npm test -- tests/resubmit-route-billing.spec.ts` pass.
- **notes:** Today a failed `matches` read yields `program_id: null`, and `billingWorkspaceFor` then picks the personal workspace, so a team match's retry is billed to the player's own allowance. `tests/resubmit-authorization.spec.ts` covers `resubmitJob()` itself, not this route's billing resolution.

## T8 · `/api/upload` invokes process-match inside `after()`

- **status:** done
- **model:** sonnet
- **files:** src/app/api/upload/route.ts, tests/upload-route-guards.spec.ts (guess)
- **done when:**
  - [ ] `upload/route.ts` imports `after` from `next/server` and moves the `source_provider` read plus the `functions.invoke("process-match", …)` call (`:238-257`) into `after(async () => { … })`, keeping the `.catch` log; the 200 body `{ success, fileId, storagePath }` is unchanged.
  - [ ] The `getImportProviderStrategy` catch at `:99-106` no longer echoes `err.message`; it answers `{ success: false, error: "Unsupported provider" }`.
  - [ ] `tests/upload-route-guards.spec.ts`: the loader's stub set gains a `next/server` entry that re-exports the real module with `after: (cb) => { void cb(); }` (the real `after()` throws outside a request scope), and the accepted-upload case still asserts `functions.invoke` ran once with the same `matchId`/`fileNames` body.
  - [ ] `npm run typecheck`, `npm run lint` and `npm test -- tests/upload-route-guards.spec.ts` pass.
- **notes:** On Vercel an un-awaited promise can be frozen with the function once the response is sent; the sibling routes (`splitstep/jobs/route.ts:162,218`, the webhook) already use `after()`. The 50 MB limit note in the audit is cosmetic — leave it.

## T9 · Harden `/api/matches/[matchId]` ids, bodies, and error mapping

- **status:** done
- **model:** opus
- **files:** src/app/api/matches/[matchId]/route.ts, src/lib/services/matches/purge-match-storage.ts, tests/match-delete-claim-release.spec.ts, tests/match-route-guards.spec.ts (new) (guess)
- **done when:**
  - [ ] GET, PATCH and DELETE answer 404 `{ error: "Not found" }` when `matchId` fails `isUuid` (import from `@/lib/services/match-video/access`, defined at `:60`) before any Supabase call.
  - [ ] PATCH answers 400 `{ error: "Invalid JSON body" }` when the parsed body is not a plain object (`null`, `42`, `"x"`, `[]`) — `isPlainObject` from `@/lib/services/match-video/http` (`:262`) — instead of the 500 that `key in body` throws today at `normalizeMatchPatch`.
  - [ ] `analysisFor` (`:87-99`) returns its read error: a failed `processing_jobs` read answers 500 `{ error: "Could not load the match" }` through `serverError` on both GET and PATCH rather than being treated as "not analysed" (which unlocks format and player edits); the roster RPC error at `:252` answers 500 `{ error: "Could not load the roster" }` rather than the 400 "Choose a player…".
  - [ ] `purgeMatchStorage` throws a new exported `PurgeRefusedError` (`kind: "protected" | "unavailable"`) at `purge-match-storage.ts:185`; DELETE's catch (`:338-350`) maps `protected` → 409 with the existing console-protection sentence and everything else → 503 `{ error: "Match deletion is unavailable. Try again." }`, never forwarding `error.message`. The account-deletion caller of `purgeMatchStorage` still compiles and its spec (`tests/account-deletion-retention.spec.ts`) still passes.
  - [ ] `tests/match-delete-claim-release.spec.ts` covers both mappings; new `tests/match-route-guards.spec.ts` (same transpile harness) covers a malformed id on all three methods, `null` and `42` PATCH bodies, and a failing `analysisFor` read on PATCH; `npm run typecheck`, `npm run lint` and both specs pass.
- **notes:** `normalizeMatchPatch` in `src/lib/matches/patch-match.ts` is the rules owner — do not move validation there. The Edit Match dialog reads `{ error, field }` on 400; keep that shape.

## T10 · Quota RPC throws are handled inside the try blocks

- **status:** done
- **model:** opus
- **needs:** T5, T6
- **files:** src/lib/services/splitstep/quota.ts, src/app/api/splitstep/jobs/handler.ts, src/lib/services/splitstep/resubmit-job.ts, src/app/api/splitstep/jobs/[jobId]/resubmit/route.ts, tests/job-submission-authorization.spec.ts, tests/resubmit-authorization.spec.ts (guess)
- **done when:**
  - [ ] `reserveQuota()` and `reservePooled()` throw a new exported `QuotaReserveError extends Error` carrying the RPC's `code` (SQLSTATE) instead of a bare `Error` (`quota.ts:219-223` and the pooled equivalent).
  - [ ] In `handleSubmitJob`, a `reserveQuota` that throws is caught: `code === "23505"` (T6's index) answers 409 `{ error: "This match has already been submitted for analysis." }`, anything else answers 503 `{ error: "Could not reserve analysis time. Try again." }`; both revert the row to `uploaded` and reach neither `mintVendorUrl` nor `submitToVendor`.
  - [ ] In `resubmitJob`, `reserveForChild` (`:676`) runs inside a try: a throw deletes the child row (the same cleanup as the refused branch at `:692-696`), releases nothing, and returns `{ ok: false, reason: "quota_unavailable", message: "Could not reserve analysis time. Try again." }`; `ResubmitRefusalReason` gains `quota_unavailable` and `REFUSAL_STATUS` in `resubmit/route.ts` maps it to 503 (the record type is exhaustive, so typecheck enforces it).
  - [ ] `tests/job-submission-authorization.spec.ts`: a rejecting `reserveQuota` → 503, final patch `uploaded`, vendor unreached; a rejection with `code: "23505"` → 409. `tests/resubmit-authorization.spec.ts`: a rejecting `reserveQuota` → `quota_unavailable`, no child row left in the in-memory table, vendor unreached.
  - [ ] `npm run typecheck`, `npm run lint` and both specs pass.
- **notes:** Today `handler.ts:525` sits outside the try that starts at `:556`, so a throw is a bare 500 with the row already claimed (after T5) and nothing reverted; `resubmit-job.ts:922` is reached after the child insert at `:636` with no try around it, leaving a live `uploaded` orphan that `processing_jobs_one_live_per_match` then blocks every later retry on. `byClass` in `analysis-failure-copy.ts` may key on refusal reasons — check before adding the member.

## T11 · UUID guard on jobs, resubmit, rederive and upload-url

- **status:** done
- **model:** sonnet
- **needs:** T10
- **files:** src/app/api/splitstep/jobs/handler.ts, src/app/api/splitstep/jobs/[jobId]/rederive/handler.ts, src/app/api/splitstep/jobs/[jobId]/resubmit/route.ts, src/app/api/splitstep/upload-url/handler.ts, tests/job-submission-authorization.spec.ts, tests/rederive-handler.spec.ts, tests/upload-url-authorization.spec.ts (guess)
- **done when:**
  - [ ] `handleSubmitJob` answers 404 `{ error: "Job not found" }` when `body.jobId` fails `isUuid` (from `@/lib/services/match-video/access:60`) before `deps.loadJob`; `handleRederive` and `resubmit/route.ts` do the same for the path `jobId` before their first read; `handleUploadUrl` answers 404 `{ error: "Match not found" }` (or its existing not-found sentence) for a non-UUID `matchId` before `loadMatch`.
  - [ ] Fixture ids in `tests/job-submission-authorization.spec.ts`, `tests/rederive-handler.spec.ts` and `tests/upload-url-authorization.spec.ts` (`"job-1"`, `"m-1"`, …) become UUIDs so every existing case still reaches its ladder, and each spec gains one case asserting the 404 with `loadJob`/`loadMatch` unreached.
  - [ ] `npm run typecheck`, `npm run lint` and the three specs pass.
- **notes:** 404 rather than 400, matching the "never confirm another user's job" rule the handlers already follow. `/api/matches/[matchId]` is covered by T9; the video and admin routes already check.

## T12 · House error shape: no `detail` in production, admin 401/403

- **status:** done
- **model:** opus
- **files:** src/lib/services/match-video/http.ts, src/app/api/splitstep/jobs/handler.ts, src/lib/services/programs/admin-video-submission.ts, src/lib/services/programs/admin-guard.ts, src/app/api/admin/uploads/file/route.ts, src/app/api/admin/uploads/video/route.ts, AGENTS.md, tests/error-response-shape.spec.ts (new) (guess)
- **done when:**
  - [ ] `errorResponse()` (`http.ts:335-342`) omits `detail` when `process.env.NODE_ENV === "production"` and keeps it otherwise; new `tests/error-response-shape.spec.ts` proves both via `withEnv(["NODE_ENV"], …)`.
  - [ ] `jobs/handler.ts:709-712` answers `{ error: "Could not submit this match for analysis.", code: "vendor_rejected" }` with the vendor text only in the `pipelineLog` line; `admin-video-submission.ts:205-206` answers `message: "Could not reserve this video."` with `error.message` logged, not returned.
  - [ ] `requireAdmin()` (`admin-guard.ts`) distinguishes "no session" from "signed-in, not an admin"; the refusal objects from `submitAdminMatchVideo`/`submitAdminMatchFile`/`getAdminMatchFileStatus` carry `status: 401 | 403 | 400`, and both admin routes use `result.status` instead of the flat `400` at `file/route.ts:14,30` and `video/route.ts:9`. Existing admin specs (`tests/admin-routes.spec.ts`, `tests/admin-video-submission.spec.ts`) updated for the new codes.
  - [ ] AGENTS.md "Conventions" gains one bullet: API routes answer refusals as `{ error, code?, detail? }` through `errorResponse()`/`jsonResponse()` in `match-video/http.ts`; a route is converted when next touched, never in bulk.
  - [ ] `npm run typecheck`, `npm run lint` and the touched specs pass.
- **notes:** Explicitly NOT a rewrite of the 17 hand-rolled routes. `rpc-errors.ts:57` builds `detail` from the SQLSTATE detail — it flows only through `errorResponse`, so the production gate covers it. The two edge functions that echo vendor text are out of scope.

## T13 · OpenAPI 3.1 spec, part 1: match, video, upload, programs routes + lint script

- **status:** done
- **model:** opus
- **files:** openapi/advantage-api.yaml (new), package.json, MAP.md (hand-written section only), src/app/api/matches/[matchId]/**, src/app/api/upload/route.ts, src/app/api/validate-file/route.ts, src/app/api/programs/**, src/lib/services/match-video/http.ts (guess)
- **done when:**
  - [ ] `openapi/advantage-api.yaml` (OpenAPI 3.1) exists with `info`, `servers`, `components.securitySchemes` for the Supabase cookie session (`cookieAuth`), `components.schemas.ErrorResponse` = `{ error: string, code?: string, detail?: string }`, and one path item per route in this group: `/api/matches/{matchId}` (GET/PATCH/DELETE), `/api/matches/{matchId}/ball-paths`, `/api/matches/{matchId}/video` (GET/DELETE), `…/video/alignment` (PATCH), `…/video/uploads` (POST), `…/video/uploads/{attachmentId}` (DELETE), `…/renew`, `…/complete`, `…/video/viewed`, `/api/upload`, `/api/validate-file`, `/api/programs/search`, `/api/programs/custom-search` — 13 routes.
  - [ ] Every operation lists each status code its handler (or the module it delegates to, e.g. `MatchVideoErrorCode`'s table in `lib/match-video/types.ts`) can return as a literal, with a request schema, a `200` response schema and at least one example; the `complete` route documents the 202 lease with its `Retry-After` header and the mutation routes document the 403 `cross_origin` and 413 `request_too_large` transport refusals.
  - [ ] `package.json` gains `"api:lint": "postman spec lint openapi/advantage-api.yaml --fail-severity warning --no-report-events"` (the CLI is installed at 1.67.0) and `npm run api:lint` exits 0 on the committed file; if local-mode lint turns out to require a Postman login, the script instead uses `@redocly/cli lint` added as a devDependency — either way the script is in the diff.
  - [ ] `npm run format:check` passes on the new YAML and MAP.md's hand-written "Source layout" table gains an `openapi/` row.
- **notes:** Split by surface so one subagent is not reading all 26 routes; T14 appends the other 13 to the same file. Auth for all of these is the Supabase cookie session via `createClient()`; the video routes also require same-origin (`checkSameOrigin`). Do not touch the generated route table between the `ROUTES:START/END` markers; API routes are not in it.

## T14 · OpenAPI 3.1 spec, part 2: splitstep, webhooks, cron, insight, admin, checkout

- **status:** done
- **model:** opus
- **needs:** T13
- **files:** openapi/advantage-api.yaml, src/app/api/splitstep/**, src/app/api/webhooks/**, src/app/api/cron/cleanup-match-videos/route.ts, src/app/api/home-insight/route.ts, src/app/api/team-insight/route.ts, src/app/api/admin/uploads/**, src/app/api/create-checkout-session/route.ts (guess)
- **done when:**
  - [ ] `openapi/advantage-api.yaml` gains path items for the remaining 13 routes: `/api/splitstep/jobs`, `/api/splitstep/jobs/{jobId}/resubmit`, `/api/splitstep/jobs/{jobId}/rederive`, `/api/splitstep/upload-url`, `/api/splitstep/hours-left`, `/api/webhooks/splitstep` (GET liveness + POST), `/api/webhooks/stripe`, `/api/cron/cleanup-match-videos`, `/api/home-insight`, `/api/team-insight`, `/api/admin/uploads/file` (GET/POST), `/api/admin/uploads/video`, `/api/create-checkout-session` (documented as 410 retired).
  - [ ] `components.securitySchemes` gains `cronBearer` (`CRON_SECRET`), `splitstepHmac` (header `x-hmac-signature`, `base64(HMAC-SHA256(secret, raw_body))`) and `stripeSignature`; each webhook/cron operation references the right one, and `/api/splitstep/jobs`, `resubmit` and `rederive` document their full refusal ladders (401/404/409/403/429/503/502 with the sentences from `REFUSAL_STATUS` and the handlers) as literals traceable to the code.
  - [ ] The two insight routes are documented as `text/plain` streams with `204` (no data) and `401`; `hours-left` documents its `{ usedSeconds, capSeconds, … }` body.
  - [ ] `npm run api:lint` and `npm run format:check` exit 0 on the completed file.
- **notes:** Keep the existing part-1 content untouched except for the shared `components`. Every status this task documents must be re-read from the handler, not from the audit — T5, T7, T9, T10, T11 and T12 change several of them, so run this after those land (queue order already does that).

## T15 · Generate and commit the v3 Postman collection

- **status:** todo
- **model:** sonnet
- **needs:** T14
- **files:** postman/collections/advantage-api.postman_collection.json (new), package.json, .prettierignore (guess)
- **done when:**
  - [ ] `postman/collections/advantage-api.postman_collection.json` exists, generated by `postman spec generate collection openapi/advantage-api.yaml -n "Advantage API" --force` (local mode; move the CLI's output file to this path) — a v3 collection whose request count equals the number of operations in the spec (26 routes, ~35 operations) and whose folders follow the `Paths` strategy.
  - [ ] `package.json` gains `"api:collection": "postman spec generate collection openapi/advantage-api.yaml -n \"Advantage API\" --force"` and `"api:collection:lint": "postman collection lint postman/collections"`, and the lint script exits 0 on the committed file.
  - [ ] `.prettierignore` gains `postman/collections/` under the GENERATED FILES section with a one-line reason (regenerated from the spec; a reformat fights the generator), following the MAP.md entry's pattern.
  - [ ] The collection is local only: no `--workspace`/`--api-key` in any script and no cloud id in the file.
- **notes:** Pushing to the Postman cloud needs the user's go-ahead and a `/mcp` sign-in (`plugin:postman:postman` is unauthorised in this session) — not part of this task. Vendor/product strings in the collection name stay "Advantage"; never "splitstep" in a user-facing name.

## T16 · Offline 401 specs for home-insight, team-insight and hours-left

- **status:** done
- **model:** sonnet
- **files:** tests/insight-routes-auth.spec.ts (new), src/app/api/home-insight/route.ts, src/app/api/team-insight/route.ts, src/app/api/splitstep/hours-left/route.ts (guess)
- **done when:**
  - [ ] New `tests/insight-routes-auth.spec.ts` drives each route's handler through `createLoader` with `@/lib/supabase/server` (no user), `@/lib/workspace/active-workspace-server` (null), `@/lib/llm/adapter`, `@/lib/data/performance-server` and `@/lib/services/splitstep/quota` stubbed: `POST /api/home-insight` → 401; `POST /api/team-insight` → 401 with no workspace and 404 `Not a program` for a personal workspace; `GET /api/splitstep/hours-left` → 401 `{ error: "Not signed in" }`.
  - [ ] Each 401 case asserts the LLM adapter (`getLLMStream`) and the quota peek were never invoked.
  - [ ] `npm run typecheck`, `npm run lint` and `npm test -- tests/insight-routes-auth.spec.ts` pass.
- **notes:** No route code changes expected; the insight routes answer plain-text `Unauthorized` today (`home-insight/route.ts:29`, `team-insight/route.ts:101`) — assert the status, not the body shape, so T12's convention can convert them later without breaking this spec. Production `LLM_PROVIDER=openai` drives Gemini `gemini-3.5-flash-lite`; nothing here calls it.

## T17 · Fix stale route references in three docs

- **status:** done
- **model:** sonnet
- **files:** docs/splitstep-derivation.md, docs/video-pipeline-overview.md, docs/ux-overhaul-brief.md (guess)
- **done when:**
  - [ ] `docs/splitstep-derivation.md:317` no longer says to follow `src/app/api/cron/reclaim-videos` (removed); it points at the live `src/app/api/cron/cleanup-match-videos/route.ts` as the cron pattern to copy.
  - [ ] `docs/video-pipeline-overview.md:367-369` keeps its historical statement but marks `/api/cron/reclaim-videos` explicitly as removed (it already reads as past tense — add "(route deleted)" so a reader does not go looking), and no other line in `docs/` outside `upload-draft-behavior.md:156` (which correctly says none exists) names `reclaim-videos` as live: `grep -rn "reclaim-videos" docs/` shows only those annotated lines.
  - [ ] `docs/ux-overhaul-brief.md:112,147,210,299` mark `/api/chat` as "not implemented — proposed" wherever it is listed as an existing asset (the doc is a point-in-time brief per `docs/README.md`, so annotate, do not rewrite), and `grep -rn "/api/chat" docs/ src/` matches only annotated lines in that brief.
  - [ ] `npm run format:check` passes.
- **notes:** Neither `/api/chat` nor `/api/cron/reclaim-videos` exists under `src/app/api/` (26 routes listed in MAP.md's `src/app/api/` row). "Advantage Intelligence" is the user-visible provider name; keep `splitstep` internal in any sentence you touch.
