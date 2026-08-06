# SplitStep Integration — Handoff

**Branch:** `splitstep-integration` (HEAD `a155934`, clean, pushed)
**Date:** 2026-08-04
**Spec:** `docs/splitstep-integration-spec.md` — still authoritative **except** for the two corrections in §2 below.

> ⚠️ **The spec on disk is out of date in two places.** Read §2 of this document before implementing anything from spec §2. Nobody has updated the spec file yet.

---

## 0. Orientation

SplitStep is a computer-vision vendor. We POST a job with a video URL + match metadata; they process asynchronously and POST results to our webhook. Results are a JSON array of **strokes** — not points, not statistics.

In all user-visible copy the provider is **"Advantage Intelligence."** `splitstep` is internal naming only. Never attribute anything to SplitStep in customer-facing material.

Pilot: free through **31 Dec 2026**, capped at **75 processing-hours/month per collegiate program** and **2 hours/month per individual user**. Caps must be enforced in code.

**The core problem:** `calculate_match_stats` is built on point-level outcomes and SplitStep returns none of them — no `won_by_player1`, no `result_type`, no break/set-point flags, no first-vs-second-serve split. All of it must be **derived**. That engine (Phase 2) is the real work; Phases 1 and 3 are plumbing and UI.

---

## 1. What already exists

**Phase 3a — upload UI (done).** Video pick, local probe/validate, local trim, metadata fields, pending `processing_jobs` draft. Lives in `src/components/dashboard/matches/new-match-wizard/`.

**Schema (done, applied live).** Four migrations:

| Migration | Contents |
|---|---|
| `20260802083544_splitstep_ingest.sql` | `processing_jobs`, `processing_usage` |
| `20260802205902_splitstep_video_access.sql` | opaque video-access token, `vendor_first_downloaded_at` |
| `20260802210852_splitstep_schema_hardening.sql` | post-review hardening |
| `20260805005321_splitstep_derived_flags_and_deriving_status.sql` | `points.derived` / `shots.derived`, `deriving` status — closes both §5 schema gaps |
| `20260805005801_splitstep_webhook_ingest.sql` | `match-results` bucket, `splitstep_webhook_deliveries`, `record_splitstep_webhook()`, `finalize_splitstep_results()` |
| `20260805010934_splitstep_status_rank_deriving.sql` | teaches the rank function about `deriving` — see below |

> ⚠️ **Two of these landed independently on 2026-08-04 and interacted badly.**
> `20260805005321` added the `deriving` status; `20260805005801` (applied from the
> `20260805005801` file) added `splitstep_status_rank()` to stop retried webhooks
> dragging a job backwards. Neither knew about the other, so `deriving` fell to
> the rank function's `else -1` branch — *below every real status*. A late
> `job_queued` retry then outranked it and pulled a mid-derivation job back to
> `queued`. Reproduced against the live database, then fixed in
> `20260805010934`: `deriving`=7 and `derivation_failed`=8 now sit above the
> highest rank any webhook can carry (6).
>
> The lesson generalises: **anything added to `processing_jobs_status_check` must
> also be added to `splitstep_status_rank()`.** The constraint and the rank
> function are two halves of one state machine and nothing enforces that they
> agree.
>
> **Filenames now match applied versions exactly.** They did not originally: the
> Supabase MCP stamps its own version when it applies a migration, so files named
> `20260802000000` / `20260802010000` / `20260802020000` were live as
> `20260802083544` / `20260802205902` / `20260802210852`, and the two webhook
> migrations had the same problem. `supabase db push` compares by version, so it
> would have tried to replay all five against a database that already had them.
> Every file has been renamed to its applied version and local order now equals
> applied order. **Anything applied through the MCP from here needs the same
> treatment** — read the version back out of `supabase_migrations.schema_migrations`
> and name the file to match.

`processing_jobs` is already richer than most plans assume — it has `raw_webhook_payload jsonb` (an **append array**, not a single value), `vendor_first_downloaded_at`, `sas_url` / `sas_expires_at`, `video_object_key`, `results_object_key`, `start_time_seconds` / `end_time_seconds` / `billable_seconds`, `attempt_count`, `derivation_version` / `derivation_confidence`.

`processing_usage` is the quota ledger: `reserved_seconds`, `actual_seconds`, `released`, scoped by `account_type` (`individual` | `program`) and `billing_month`.

**Code (done).**
- `src/lib/services/splitstep/` — `config.ts`, `job-request.ts`, `object-keys.ts`, `webhook-payload.ts`, `video-url/{index,types,worker-token}.ts`
- `src/lib/services/upload/validators/splitstep-validator.ts`
- `src/app/api/webhooks/splitstep/route.ts` — the results webhook (§3 task 1)
- `scripts/splitstep-submit.ts` — the smoke-test submit script (§3 task 4)
- `workers/video-access/` — the Cloudflare Worker (see §2)

**§3.2 resolved (commit `d6ab1e0`).** Vendor URL strategy is a **Cloudflare Worker fronting R2 with an opaque token**, two separate buckets (`advantage-match-videos` / `advantage-match-results`).

The driver was the pilot call. The vendor fetches the video **lazily**, when a worker picks up the job — not at submit — and said **no** to all three asks: no download-at-submit, no "processing started" webhook, no stated max queue time. Because they fetch lazily, the Worker's download log (`vendor_first_downloaded_at`) **is** the processing-started signal they declined to build. A presigned URL cannot do this: 7-day SigV4 ceiling, no revocation, no visibility.

---

## 2. Architecture corrections — read before implementing

These two decisions were made on 2026-08-04 and **supersede** the spec's §2 diagram and storage table. The spec file has not been updated.

### 2.1 Raw results JSON goes to Supabase Storage, not R2

The spec says R2. It should be **Supabase Storage**.

Reasoning: the video is 1–5 GB; a full match of strokes is roughly **0.5–2 MB**. Three orders of magnitude apart, so the logic that makes R2 obviously right for video does not carry over. R2's advantage is zero egress, and the JSON has almost none — it's read back on reprocessing, rarely, internally.

The stronger argument: **we already do this for SwingVision.** `src/lib/services/upload/storage.service.ts:12` puts raw uploaded match files in the Supabase `match-data` bucket. Raw provider artifact → Supabase Storage is an established pattern here. Diverging means two audit stories, two reprocessing paths, two backup stories, for no gain.

The underlying principle: **put the data next to whatever computes on it.** The vendor computes on the video → R2. Our derivation engine computes on the JSON → Supabase. (If derivation ever moves into a Cloudflare Worker, flip this — Workers get R2 bindings with no network hop.)

Final split:

| Artifact | Where | Why |
|---|---|---|
| Video (1–5 GB) | **R2** `advantage-match-videos` | vendor egress is free; Worker logs the fetch |
| Stroke JSON (~1 MB) | **Supabase Storage**, new `match-results` bucket | beside `match-data`; same client the webhook already holds |
| Webhook envelope (~1 KB) | **`processing_jobs.raw_webhook_payload`** | already an append-array jsonb column |

`results_object_key` still works unchanged — it just points at a Supabase Storage path. `R2_BUCKET_RESULTS` in `.env.example` becomes unused.

**R2 is still required.** This is not "drop Cloudflare." Supabase Storage meters egress and multi-GB vendor pulls are exactly the expensive shape, plus we'd lose `vendor_first_downloaded_at`.

### 2.2 Derivation must not run inline in the webhook

The spec's §2 diagram has the webhook doing: download JSON → persist → **run derivation engine** → **call `calculate_match_stats`** → reconcile quota. That is wrong.

Webhooks must acknowledge fast and process asynchronously. The sender retries on timeout or non-2xx, so slow inline work produces duplicate deliveries against partial state. And we don't control how long derivation takes.

For us it's a hard limit, not a style point: the app is on **Vercel Hobby**, and no `maxDuration` is set anywhere in the repo, so the platform ceiling (60s) applies. A full match of strokes → points/shots → `calculate_match_stats` should not be bet on fitting.

Correct shape:

- **Webhook route (thin, bounded):** verify → fetch `sas_url` → write JSON to Supabase Storage → upsert job row → return 200. Keep the download inline — that's the piece with the 7-day expiry and no documented re-request (Q5). A JSON fetch is fast; derivation is not.
- **Derivation (async):** a Supabase Edge Function, mirroring the existing SwingVision `process-match` fire-and-forget pattern. No Vercel timeout applies there.

---

## 3. Next up — smoke test before Phase 1 proper

Goal: submit one job, get real results JSON back. That JSON plus the vendor's sample files are what close Q1–Q3 and unblock the derivation engine.

**Do not build `/api/splitstep/jobs` for this.** A node script is enough.

### Order matters — deploy the webhook first

The webhook is the only piece that must be real infrastructure, because they POST to it. Shipping it first unblocks Josh while R2 is still being wired.

| # | Task | Owner | Status |
|---|---|---|---|
| 1 | `POST /api/webhooks/splitstep` — deployed to Vercel, not localhost. Return 200 immediately, log the raw body, on `job_completed` fetch `sas_url` and persist to Supabase Storage. Send Josh the URL. | Claude | **Written + tested locally. Not yet pushed, so not yet deployed.** |
| 2 | Create the R2 bucket + upload one test video by hand (dashboard or rclone) | **You** | Not started |
| 3 | Deploy the Worker (`workers/video-access/`), set `R2_PUBLIC_WORKER_URL` | You + Claude | Not started — blocked on `wrangler login` |
| 4 | Submit script — a node script POSTing the nine job fields, metadata hardcoded, API key from env | Claude | **Written.** Cannot run until Josh supplies the API URL + key |

### What the webhook does now

Thin by design (§2.2): verify → record → fetch results JSON → 200. No derivation.

- **Records before it does anything else.** Every delivery lands in
  `splitstep_webhook_deliveries` — raw body as text, so a payload that is not
  JSON is still kept verbatim. Vercel Hobby logs are short-retention and not
  queryable; this table is the durable version of "log the raw body".
- **Returns 500 when it fails to record or download**, not 200. A retry is the
  only path back to a payload we lost, and every write is idempotent so being
  retried costs nothing. The envelope (with `sas_url` inside it) is persisted
  *before* the download is attempted, so even a delivery that is never retried
  leaves the URL on disk to fetch by hand inside the 7-day window.
- **Orphans are kept, not dropped.** A delivery whose `external_job_id` matches
  no job is still recorded and still returns 200. During the pilot this most
  likely means their job-id field is not named what the docs say.
- **Falls back to `MatchID`.** We set that field ourselves, so it is the one
  identifier in the payload whose name we control. If the vendor's job-id field
  is named unexpectedly, the delivery still attaches — and the route then claims
  the vendor id onto the job so later deliveries take the fast path.
- **Never moves a job backwards.** A late `job_queued` retry arriving after
  `job_completed` leaves the job completed.
- **Auth is a shared secret, accepted on `X-Webhook-Secret`, `X-Api-Key`, or
  `Authorization: Bearer`** — TODO(splitstep-q4). With `SPLITSTEP_WEBHOOK_SECRET`
  unset it accepts unsigned deliveries and logs each one as unsigned, so Josh is
  not blocked on us for a signing scheme.

`GET /api/webhooks/splitstep` returns `{"status":"ready"}` — hand that to Josh to
confirm reachability before either side wires anything up.

**Use the Worker, not the `r2.dev` public URL.** It's already built, and this smoke test is the single best chance to observe *when* the vendor actually fetches — the queue latency they refused to disclose. `r2.dev` throws that away and makes the video world-readable to anyone with the link. Only fall back to it if the Worker fights you on deploy.

### Payload details that are easy to get wrong

- `InitialTopPlayer` / `InitialBottomPlayer` are **camera-relative at the start of the video**, and `SetGameScores` must be ordered **top-player-first**. Getting this backwards attributes every stat to the wrong person, and it is invisible in the UI.
- `StartTime` / `EndTime` must bracket **complete games** consistent with the score — start just before the first serve, end just after the last point.
- Video must be **≥1080p, ≥30fps, singles**, camera behind the baseline and elevated. You also need the true set scores.

### Webhook must-haves from day one

- **Idempotency.** Expect two deliveries per job (`job_queued`, then `job_completed`), plus retries. Key on `external_job_id` + status; no-op on anything already recorded.
- **Log the raw body before parsing.** If the payload differs from the docs at all, that log is the only thing that will tell you.
- **Set `maxDuration` explicitly** and keep the route thin.
- Unsigned is acceptable **for the test only**. Write down now that verification lands before any real athlete video goes through — otherwise the endpoint is an open write path against `processing_jobs` for anyone who finds the URL.

---

## 4. Blocked on you

**From Josh (blocking the smoke test):**
1. Real API base URL — the docs show `api.example.com` as a placeholder.
2. An API key.
3. Explicit confirmation that an unsigned webhook is fine for the test. Tell him you don't need the signing scheme yet, so he isn't waiting on you.

**Deploying the webhook (blocks sending Josh anything):**
- Push `splitstep-integration`. The repo auto-deploys on Vercel, but Hobby only auto-deploys the **production branch** — confirm this branch actually publishes, or merge to `main` first. A URL handed over that 404s costs a round trip with the vendor.
- Then confirm reachability yourself: `GET https://<origin>/api/webhooks/splitstep` must return `{"status":"ready"}`.
- `NEXT_PUBLIC_APP_URL` must be set in Vercel — the submit script refuses to run against a localhost webhook URL, but nothing else catches an unset one.
- Decide on `SPLITSTEP_WEBHOOK_SECRET`. Leave it unset for the throwaway-video test; set it in Vercel before any real athlete video.

**Cloudflare provisioning (cannot be automated):**
- Create the Cloudflare account and both buckets.
- `wrangler login` — browser-interactive. After this, Claude can drive bucket creation and deploys via CLI.
- `wrangler secret put SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — interactive by design. **Never pass secrets on the command line.** This stays yours regardless.
- `npm run deploy` in `workers/video-access/`, then set `R2_PUBLIC_WORKER_URL`.
- Wrangler is **not installed** and you are **not logged in**. `npm install` in `workers/video-access/` gets the pinned `^4.118.0`.

Nothing in the pipeline works until `R2_PUBLIC_WORKER_URL` is set.

---

## 5. Phase 1 remaining (after smoke test)

- Presigned browser→R2 multipart upload
- `POST /api/splitstep/jobs` — verify ownership → reserve quota → mint vendor URL → submit → insert job row
- `POST /api/webhooks/splitstep` hardened with signature verification (needs Q4)
- ~~**Schema gap:** `points.derived` / `shots.derived` booleans (spec §3.1)~~ — closed by `20260805005321`
- ~~**Schema gap:** `deriving` status~~ — closed by `20260805005321`; see the rank-function interaction warning in §1

**Phase 1 acceptance:** job reaches `queued` with a real `external_job_id`; webhook verifies, persists, marks `completed`; quota reserved on submit / reconciled on completion / released on failure; a user cannot submit against a match they don't own; a user at cap is refused clearly; doubles and sub-1080p refused before upload.

Phase 1 ships and is testable **without** Phase 2. A completed job with no derivation should leave the match in a clean "processed, analysis pending" state.

---

## 6. Phase 2 — HARD GATED

**Do not start until a real full-match results JSON is committed as a test fixture AND Q1–Q3 are answered.** If asked to start without these, say so and stop.

The gate is deliberate, not oversight. Building the engine against vendor docs alone produces plausible code that is silently wrong, and the top/bottom player mapping error attributes every stat to the wrong person without being visible anywhere in the UI.

**Sentinel handling is non-negotiable:** `-9999.0` (float), `-9999` (int), `"None"` (string) must be converted to NULL **at parse time, before anything else touches the data**. A single `-9999` surviving into `AVG(speed)` corrupts a match's stats invisibly.

---

## 7. Open questions — do not guess

Stub the code, mark the site `TODO(splitstep-qN)`, flag it in your summary. Markers currently in the repo:

| Marker | Site |
|---|---|
| `TODO(splitstep-q4)` | `src/app/api/webhooks/splitstep/route.ts:52` — shared secret standing in for a real signing scheme |
| `TODO(splitstep-q6)` | `supabase/migrations/20260802083544_splitstep_ingest.sql:46` — queue priority |
| `TODO(splitstep-phase2)` | `src/app/api/webhooks/splitstep/route.ts:253` — where the derivation Edge Function gets triggered |

Q1–Q3, Q5 and Q7 still have no code site because the derivation engine does not exist yet.

| # | Question | Blocks |
|---|---|---|
| 1 | Are faulted serves emitted as strokes (a `serve` with `in: false`)? | **Phase 2** — the entire first/second-serve split and double-fault detection |
| 2 | How are lets handled — emitted, skipped, or `net_hit: true`? | rally-boundary logic |
| 3 | Does `pred_rally_stroke_number` restart per rally, and do faults count? | Phase 2 |
| 4 | Webhook auth — algorithm, header name, signing payload, rotation | production-safe webhook |
| 5 | Any status/polling endpoint, or way to re-request results after the 7-day SAS expiry? | stalled-job recovery vs. re-upload |
| 6 | Is there a queue-priority parameter? | no turnaround-tier UI ships until confirmed |
| 7 | Error format — `job_failed.message` is free text with raw underlying errors | **don't parse it for control flow**; store it, show generic, log raw |

---

## 8. Gotchas that will each cost you an hour

**No root `middleware.ts` exists.** `updateSession` lives at `src/lib/supabase/middleware.ts` but isn't wired up, so the webhook route is reachable today. If anyone ever adds root middleware, note that `publicPaths` (`src/lib/supabase/middleware.ts:43`) does **not** include `/api/webhooks` — an unauthenticated vendor POST would 307 to `/login`. Their side sees a redirect, you see nothing.

**Don't route the test video through `compress.ts`.** It transcodes to 720p (`src/lib/video/compress.ts:102`, `-vf scale=-2:720`), which is under the vendor's 1080p floor.

**The repo is public.** It was made public to enable Vercel git auto-deploy on Hobby. Every commit is world-readable — keys in env only, never commit the test video or its URL.

**Vercel Hobby + webhook secret.** A mismatched `STRIPE_WEBHOOK_SECRET` once caused payments to succeed silently without upgrading the role. Same failure shape looms here; log aggressively.

**`splitstep-integration` is 1 commit behind `main`** (`f24975e`, a CLAUDE.md fix). Harmless now, will surface when merging back.

---

## 9. Verification status — be honest about this

The video flow has **never been exercised in a browser**. Nothing has round-tripped against the real vendor — no real payload has ever hit the webhook, and every shape it handles is inferred from the vendor's docs.

**What has been verified (2026-08-04):**

- `tsc`, `npm run lint` (0 errors), `npm run build` — all clean; the route builds as dynamic.
- `record_splitstep_webhook()` / `finalize_splitstep_results()` — 10 assertions against the live database in a rolled-back transaction: orphan handling, fingerprint dedupe, status advance, no-duplicate payload append, no backwards transition, `MatchID` fallback + vendor-id claim, finalize write-through.
- `splitstep_status_rank()` after the `deriving` fix — a job in `deriving` survives both a late `job_queued` and a late `job_completed`, while `processing → completed` still advances normally.
- The route end-to-end against a local dev server and the live database, 15 deliveries: queued/completed/retry/orphan/non-JSON bodies, results downloaded from a stub vendor and written to `match-results` at the exact `resultsObjectKey()` path, download failure returning 500, and recovery on a subsequent retry. Auth: 401 on missing and on wrong secret, 200 via both header forms.
- All test rows and storage objects removed afterwards; `processing_jobs` is back to its single pre-existing row and `match-data` is untouched.

**Still unverified:** the vendor's actual payload shape, their retry behaviour, whether they send the secret at all, and the R2/Worker path (nothing has been deployed).

The spec doc itself exists **only on this branch**, not on `main`.
