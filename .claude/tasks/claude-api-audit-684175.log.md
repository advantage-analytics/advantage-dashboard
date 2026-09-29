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
