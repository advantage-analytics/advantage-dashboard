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
