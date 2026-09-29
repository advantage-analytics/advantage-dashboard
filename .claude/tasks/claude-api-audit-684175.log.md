# Run log — claude/api-audit-684175

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Webhook fails closed when the secret is set — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** `verifyWebhookAuth` + `SIGNATURE_HEADERS` moved to new pure module `src/lib/services/splitstep/webhook-auth.ts`; with a secret set, a delivery with no signature header is now refused (401) unless `SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED=true`; `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE` is no longer read. `.env.example` rewritten; new offline spec `tests/splitstep-webhook-auth.spec.ts` (6 cases, incl. the inert-flag case). Raw-secret-in-header tolerance untouched.
**follow-ups:**

1. `docs/video-pipeline-overview.md:287,675` and `docs/ui-revamp-guardrails.md:27` still say to set `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE=true` — now inert; update to the fail-closed default + `ALLOW_UNSIGNED` hatch.
2. `SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED=true` left on in Vercel only surfaces as a per-delivery warn — consider `pipelineLog.error` or a health assertion.
3. The route's 401 branch is covered by reading only; a route-level spec (T3's harness) could assert the HTTP response.

## T2 · Redact SAS query strings from the webhook's console log — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** `pipeline-log.ts` exports pure `redactSignedUrls()` (query of every `http(s)://…?…` → `?[redacted]`, scheme/host/path kept, stops at quotes so JSON still parses); the webhook's `received` log now logs `redactSignedUrls(rawBody).slice(0, 4000)`. `p_raw_body` stays raw. New offline spec `tests/pipeline-log-redaction.spec.ts` (3 cases). Reviewer's `&`-escape concern checked live: vendor bodies use a literal `&` before `sig=`, so real SAS URLs are fully redacted.
**follow-ups:**

1. Other `pipelineLog` calls that log vendor response bodies or error text could also carry SAS URLs to the console — audit them and apply `redactSignedUrls`.
2. The regex stops a query at a backslash; if the vendor ever JSON-escapes `&` as `&`, the tail (incl. `sig=`) would survive — add a spec case if that shape appears.

## T3 · Gate the webhook's failed branch on the job row — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** The webhook's failed branch now gates on `record.job_status === "failed" && record.matched_job_id` (the row status `record_splitstep_webhook` returns after its rank-guarded update — live ranks confirmed: completed = failed = 6, deriving 7, derivation_failed 8), so a late `job_failed` for a completed/derived job releases no quota, sends no mail, triggers no resubmit. New offline route spec `tests/splitstep-webhook-route.spec.ts` (4 cases incl. derivation_failed; mutation-checked against the old gate).
**follow-ups:**

1. **Wrong-mail edge (new with this gate):** any delivery landing on a row already `failed` now enters the branch — e.g. a late `job_processing` for a parent job that was auto-resubmitted after a download failure (no mail was sent then). It carries no error fields, so `retryable` is false and the user gets an "analysis failed" email while the retry runs. Tighten to `payload.nextStatus === "failed" && record.job_status === "failed"` (strict subset of old and new gates). Quota/resubmit side effects stay idempotent either way.
2. The completed branch still keys on `payload.nextStatus === "completed"`; its downloads are guarded by `already_stored` and per-file keys. Could take the same row gate (completed/deriving/derivation_failed).

## T4 · Host allowlist and no-redirect on vendor result fetches — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** New pure `src/lib/services/splitstep/result-url-policy.ts` (`isAllowedResultUrl`, `defaultResultHosts`, helper `resultUrlHostname`): https + exact hostname match against the vendor host, `${AZURE_STORAGE_ACCOUNT}.blob.core.windows.net` and `SPLITSTEP_RESULT_HOSTS`. Both `storeVendorJson` copies (secure-results.ts, webhook route) refuse a disallowed host before fetching (hostname-only error log) and fetch with `redirect: "error"`. `.env.example` documents `SPLITSTEP_RESULT_HOSTS`. New specs `tests/result-url-policy.spec.ts`, `tests/secure-results-host-guard.spec.ts`; `tests/secure-results.spec.ts` fixture moved onto the vendor host and given `URL` in its vm globals (required by the allowlist).
**follow-ups:**

1. Grep `docs/` for webhook descriptions that still say result files follow redirects.
2. `route.ts` and `secure-results.ts` still each carry their own `storeVendorJson` — fold into one.
3. `.env.example` says a refusal "lands in processing_error"; true for the strokes file only — per-frame refusals land in the log line.

## T5 · Compare-and-set claim on `/api/splitstep/jobs` submit — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** Non-admin submits now claim the job with a compare-and-set (`update … set status='submitting', <answers> where id=… and status='uploaded'`) before reserving quota; a lost claim answers 409 "This match is already being submitted." with nothing reserved, minted or sent; a claim write error answers 503 with no blind revert. A refused reservation reverts the row to `uploaded` for every caller. Admin path unchanged in shape: live `admin_video_access('claim')` already sets `submitting` itself (verified read-only), so it keeps `claimAdminVideo` + a plain answers write. Spec gains the claim fake, updated patch orders, and cases for double submit, refused-after-claim, claim error, and admin-no-CAS (47 pass).
**follow-ups:**

1. Non-admin `queued` write error is still unchecked at the end of the try (pre-existing): 200 with the row left at `submitting`; the admin branch answers 503 there.
2. `docs/ui-revamp-guardrails.md`'s submit-route refusal contract could note the claim and the revert-on-refused-reservation for every caller.
3. A refused reservation after a won claim leaves the answers + bumped `attempt_count` on the reverted `uploaded` row (harmless today — no reader gates on `attempt_count`).

## T6 · Unique partial index on `processing_usage(job_id)` — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) + `npm run test:database` 25/25 · completion VERDICT: pass
**changed:** Unique index `processing_usage_job_id_key on public.processing_usage (job_id) where job_id is not null` **applied live** (prod `pouxujkhtbvkdwbzfvka`, migration version **20260929220437**, `processing_usage_job_id_unique`) after read-only checks: 0 duplicate job_ids (6 rows), and all three inserting RPCs (`reserve_processing_quota`, `reserve_individual_quota`, `reserve_individual_pool_quota`) insert at most one row per job — every retry reserves under a child job id; `admin_reserve_video_quota` already refuses any existing row. Migration file named to the live version; new PGlite spec `tests/database/processing-usage-job-id-unique.test.mjs`.
**follow-ups:**

1. `processing_usage.job_id` is `not null` live, so the `where job_id is not null` predicate is vacuous (kept for shape consistency); `admin-team-server.ts:683` comments that the column "is nullable" — stale.
2. The migration header (~58 lines) could be trimmed at `/pr-check`'s simplify pass.

## T17 · Fix stale route references in three docs — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** Implemented in parallel in an isolated worktree (commit 7fabd2c5), brought over here. `docs/splitstep-derivation.md` §8 points at the live `cron/cleanup-match-videos/route.ts`; `docs/video-pipeline-overview.md:367` marks `/api/cron/reclaim-videos` "route deleted"; `docs/ux-overhaul-brief.md` annotates `/api/chat` as "not implemented — proposed" at 112/147/210/299. Runner reworded one stale comment in `src/lib/llm/stream-response.ts` ("`/api/chat`" → "the since-deleted chat route") so the `grep -rn "/api/chat" docs/ src/` criterion holds.
**follow-ups:**

1. `docs/ui-revamp-guardrails.md:27` and `docs/video-pipeline-overview.md:287,675` still tell readers to set `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE=true` — inert since T1; describe fail-closed-once-secret-is-set + the `SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED` pilot hatch.

## T7 · Resubmit refuses when the match read fails — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** Implemented in parallel in an isolated worktree (commit 5ccb2268), brought over here. `resubmit/route.ts` now answers 503 "Could not load the match. Try again." (logged via `pipelineLog.error`) when the `matches` read errors, and 404 "Job not found" when the match row is gone — before `billingWorkspaceFor`, so a team match's retry can no longer fall through to the personal allowance. New offline spec `tests/resubmit-route-billing.spec.ts` (3 cases).
**follow-ups:**

1. Check whether `/api/splitstep/jobs` and `/api/splitstep/upload-url` resolve `program_id` from a match read whose error is ignored in the same way.

## T8 · `/api/upload` invokes process-match inside `after()` — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** Implemented in parallel in an isolated worktree (commit 8522bc96), brought over here. `/api/upload` now runs the `source_provider` read and the `process-match` invoke inside `after()` (awaited, error logged), so Vercel can't freeze the function before the call goes out; the `match_files` listing that decides whether to invoke stays before the response. The unsupported-provider refusal no longer echoes `err.message` (400 "Unsupported provider"). `tests/upload-route-guards.spec.ts` stubs `next/server`'s `after` (runs and awaits the callback) and adds the unsupported-provider case (17 pass).
**follow-ups:**

1. Audit other routes for un-awaited `functions.invoke` calls outside `after()`.

## T9 · Harden `/api/matches/[matchId]` ids, bodies, and error mapping — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** Implemented in parallel in an isolated worktree (commit 5a6fab26), brought over here. GET/PATCH/DELETE answer 404 for a non-UUID id before any Supabase call; PATCH answers 400 "Invalid JSON body" for a non-object body; a failed `processing_jobs` read (`analysisFor`) is now a 500 on GET and PATCH instead of "not analysed"; a roster RPC error is a 500 "Could not load the roster". New exported `PurgeRefusedError` (`protected` | `unavailable`): DELETE maps `protected` → 409, everything else → 503 "Match deletion is unavailable. Try again.", never forwarding `error.message`. New `tests/match-route-guards.spec.ts`; `match-delete-claim-release.spec.ts` covers both mappings. `tests/account-deletion-retention.spec.ts` is live-DB and was not run (offline `admin-account-delete-protection.spec.ts` covers the caller and passes).
**follow-ups:**

1. Behaviour change: a claim RPC answering a non-boolean with no error now maps to `unavailable` (account deletion shows "We could not verify…") instead of `protected`.
2. `eventContextFor` in the same route still discards its read error — a failed read looks like "no event" and unlocks event-owned fields in the dialog.
3. Account deletion and the console abandon flow still show `error.message`; they could switch on `PurgeRefusedError.kind`. `tests/admin-match-delete-protection.spec.ts` could assert `kind`.

## T16 · Offline 401 specs for home-insight, team-insight and hours-left — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** Implemented in parallel in an isolated worktree (commit e070dcbd), brought over here. New `tests/insight-routes-auth.spec.ts` (4 cases): home-insight 401, team-insight 401 (no workspace) and 404 "Not a program" (personal), hours-left 401 `{ error: "Not signed in" }`; every case asserts the LLM adapter, quota peek, admin client and data loaders were never reached. No route code changed.
**follow-ups:**

1. Signed-in cases: team workspace with no matches → 204; LLM adapter error → 500; hours-left `peekQuota` throws → 503.
2. Tighten the insight 401 assertions to the body shape once T12's error convention lands.

## T10 · Quota RPC throws are handled inside the try blocks — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** Implemented in parallel in an isolated worktree (commit bfc674b4), brought over here. `quota.ts` exports `QuotaReserveError` (carries the SQLSTATE `code`) thrown by `reserveQuota()`/`reservePooled()`. `handleSubmitJob` catches a throwing reservation after the claim: 23505 (T6's index) → 409 "This match has already been submitted for analysis.", anything else → 503 "Could not reserve analysis time. Try again."; both hand the claim back (`uploaded`) and never mint, send, release or mark failed. `resubmitJob` wraps `reserveForChild` in a try: a throw deletes the child row and returns `quota_unavailable` (503 in `REFUSAL_STATUS`). Specs cover 08006/23505/no-code throws and the resubmit orphan cleanup.
**follow-ups:**

1. No spec pins `reserveQuota`/`reservePooled` throwing `QuotaReserveError` with the right `code` directly (only typecheck) — a small stubbed-rpc spec would.
2. Webhook/reconciler auto-retry callers treat `quota_unavailable` as a plain decline (logged only), same as `submit_failed`.

## T12 · House error shape: no `detail` in production, admin 401/403 — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** Implemented in parallel in an isolated worktree (commit 641b386b), brought over here (merged cleanly onto T10). `errorResponse()` drops `detail` in production except the one public value `finalizing` (`PUBLIC_DETAILS`) — `attachment-upload.ts` waits on a 409 `pending_attempt_conflict` with `detail === "finalizing"`, so a blanket drop would fail a second tab's upload; reviewer confirmed the dependency. The jobs 502 answers `{ error: "Could not submit this match for analysis.", code: "vendor_rejected" }` (vendor text only in the log); admin video reservation failure answers "Could not reserve this video." New `checkAdmin()` (401 no session / 403 not admin); `requireAdmin()` keeps its actor-or-null contract as a wrapper (~100 callers). Admin upload routes answer `result.status` (body still `{ ok, message }`). AGENTS.md Conventions bullet added. New `tests/error-response-shape.spec.ts`; admin specs updated. `tests/admin-routes.spec.ts`'s two new 401/403 cases are live-DB/env-gated and were not run.
**follow-ups:**

1. The admin video wizard no longer shows _why_ a reservation failed (it used to append the RPC slug) — map the slugs to sentences like `admin-file-submission.ts`'s `refusals` table.
2. Vendor text is still stored in `processing_jobs.error_message` by the same catch — check whether any UI shows that column.
3. A thrown video-URL mint also answers `code: "vendor_rejected"` (same catch).
4. Admin video reservation RPC failure answers 400; arguably a 5xx.

## T13 · OpenAPI 3.1 spec, part 1: match, video, upload, programs routes + lint script — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) + `npm run api:lint` "No issues found" + format:check · completion VERDICT: pass
**changed:** Implemented in parallel in an isolated worktree (commit cbf8bf40), brought over here. New `openapi/advantage-api.yaml` (OpenAPI 3.1.0): `cookieAuth`, `ErrorResponse` (+ `VideoErrorResponse`, `FieldErrorResponse`, `LegacyErrorResponse`), 13 routes / 16 operations with every status read from the handlers (reviewer spot-checked 8 operations: no missing or extra codes), 202 + `Retry-After` on complete, shared 403 `cross_origin` / 413 `request_too_large` responses, 169 examples (ajv-validated against their schemas). `package.json` gains `api:lint` (Postman CLI local mode — lints without login; exits 1 on a broken spec). MAP.md Source layout gains an `openapi/` row.
**follow-ups:**

1. `postman spec lint` prints an "Authentication required" notice on every run (still lints, exit 0) — governance rulesets only run when logged in; CI doesn't run `api:lint` and the `postman` binary isn't a devDependency.
2. The spec names the production Supabase project ref in the `cookieAuth` cookie name.
3. `/api/validate-file` answers 500 (not 400) on a non-JSON body; the uploads POST 201 carries no `Location` header. Documented as-is.

## T11 · UUID guard on jobs, resubmit, rederive and upload-url — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) · completion VERDICT: pass
**changed:** `/api/splitstep/jobs`, `/jobs/[jobId]/rederive` and `/jobs/[jobId]/resubmit` answer 404 "Job not found" for a non-UUID job id, and `/api/splitstep/upload-url` answers its existing 404 "No such match" for a non-UUID match id — each after sign-in and before the first read (no more 500 from a Postgres 22P02). Fixture ids in the three named specs (and `tests/resubmit-route-billing.spec.ts`, which would otherwise hit the guard) became UUIDs; each gained a 404 case asserting the load was never reached.

## T14 · OpenAPI 3.1 spec, part 2: splitstep, webhooks, cron, insight, admin, checkout — done

**gate:** mechanical GATE PASS (lint, typecheck, full suite) + `npm run api:lint` "No issues found" + Prettier · completion VERDICT: pass
**changed:** `openapi/advantage-api.yaml` gains the remaining 13 routes (all 26 now documented) with statuses re-read from the current handlers (post T1/T5/T7/T10/T11/T12), security schemes `cronBearer`, `splitstepHmac` (`x-hmac-signature`, base64 HMAC-SHA256 of the raw body; fail-closed + `ALLOW_UNSIGNED` hatch described), `stripeSignature`; insight routes as `text/plain` streams (204/401/500); checkout as deprecated 410. Six tags + two `info.description` paragraphs added; runner reworded "only public route" → "only public browser route". 309 examples ajv-validated. `hours-left` documents the code's real body `{ workspaceId, remainingSeconds, capSeconds, bandFull }` (the criterion's `usedSeconds` example did not match the code).
**follow-ups:**

1. `resubmit` answers 429 with no figures for a quota permission refusal, where `/api/splitstep/jobs` answers 403 with `usedSeconds`/`capSeconds` — drift between the two routes.
2. `/api/admin/uploads/video` has no try/catch — a throw is an unshaped Next 500 (the file route catches).
3. `/api/webhooks/stripe` throws at module load when `STRIPE_WEBHOOK_SECRET` is unset, so every request 500s before the handler.
4. `hours-left` sends `Cache-Control: no-store` (not `private, no-store` like the video routes).

## T15 · Generate and commit the v3 Postman collection — done

**gate:** mechanical first run GATE FAIL (full-suite test flake — 4343 passed, exit 1); re-run: `npx playwright test` exit 0, 4346 passed; lint ok; typecheck ok; `npm run api:collection:lint` "No issues found. Scanned: 31" · completion VERDICT: pass
**changed:** `package.json` gains `api:collection` (`postman spec generate collection openapi/advantage-api.yaml -n "Advantage API" --force`, local mode) and `api:collection:lint`. The CLI (1.67.0) has no output-path/format flag in local mode and always writes a v3 collection as a YAML directory, so the committed artifact is `postman/collections/Advantage API/` (31 requests = 31 spec operations, `Paths` folders, 179 examples) rather than the single `advantage-api.postman_collection.json` the criterion named — reviewer judged the intent met. `.prettierignore` excludes `postman/collections/`. No cloud id, workspace or API key in any file; no `--workspace`/`--api-key` in the scripts.
**follow-ups:**

1. Regeneration also writes `.postman/workflows.yaml` (spec→collection sync link, relative paths) — deleted here; add `.postman/` to `.gitignore` or commit it if `postman collection sync` is wanted.
2. The collection's auth block `id` is a random UUID that changes on every regeneration (one-line diff noise).
3. The collection models the Supabase auth cookie as an `apikey` header named `sb-pouxujkhtbvkdwbzfvka-auth-token` (from the spec's `cookieAuth`).
