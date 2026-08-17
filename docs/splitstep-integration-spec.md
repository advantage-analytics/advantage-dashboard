# SplitStep AI Integration — Implementation Spec

Repo: `advantage-analytics/advantage-dashboard`
Target: add SplitStep as a video-based analysis provider alongside the existing SwingVision xlsx importer.
Vendor docs: https://splitstep.ai/api-docs.html

> ## Status of this document
>
> **This is the original design spec, kept for the "why".** It was written before
> anything was built and is deliberately not updated as reality moves — parts of it are
> now wrong on purpose, because the reasoning is still worth reading.
>
> | Section | Status |
> |---|---|
> | §2 architecture diagram + storage table | **Superseded.** Results JSON goes to Supabase Storage, not R2, and derivation does not run inline in the webhook. See `r2-and-webhook-overview.md` §2 and §5 |
> | §3 Phase 1 | **Built.** Current state is `r2-and-webhook-overview.md` |
> | §4 Phase 2 | **Not built**, and gated differently than described |
> | §5 open questions | **Superseded** by `docs/splitstep-vendor-questions.md` on the `splitstep-derivation` branch. Question numbers are preserved there, so `TODO(splitstep-qN)` markers in the code stay valid |
> | §6 Phase 3 UI | Partly built — the wizard exists |
> | §7 environment | **Superseded** by `r2-and-webhook-overview.md` §12 |
> | §0, §1, §8 | Still accurate |
>
> **For what actually exists today, read `r2-and-webhook-overview.md` first.**

---

## 0. Read this first

This spec was written from a read of `main` and from `DATABASE_PRD.md` (dated February 2026). That document may have drifted from the live database. You have Supabase MCP access — **verify before you build**.

### Verification tasks (do these before writing any code)

Run these against the live database and report every mismatch against this spec before proceeding:

1. List all tables, columns, and types in `public`. Compare against `DATABASE_PRD.md`. Report drift.
2. Dump the definition of the `calculate_match_stats` function. Confirm which columns on `points` and `shots` it reads. This spec assumes it depends on `points.won_by_player1`, `points.result_type`, `points.is_break_point`, `points.is_set_point`, `points.server_is_player1`, `shots.shot_type` (`'First Serve'` / `'Second Serve'`), and `shots.result` (`'In'`). Confirm or correct.
3. Dump the CHECK constraint on `shots.zone`. This spec assumes `'T' | 'Body' | 'Wide'` for serves and `'Crosscourt' | 'Middle' | 'Down the Line'` for non-serves.
4. Confirm the actual column list on `match_files` — this spec assumes `video_path` and `video_file_name` exist (they are referenced in `use-video-upload.ts` but absent from `DATABASE_PRD.md`).
5. Confirm all RLS policies on `matches`, `match_files`, `points`, `shots`, `match_stats`.
6. Report the distinct values currently present in `points.result_type` and `shots.shot_type`. The derivation engine must emit values from these same sets.
7. Check whether any rows exist with `source_provider` other than `'swing-vision'`.

Also read, in the repo:

- `CLAUDE.md` — repo conventions
- `.skills/advantage-analytics-design/SKILL.md` — design system. All UI in Phase 3 must conform. Lucide icons only, Inter, light mode only, blue `#3B82F6` for action.
- `DATABASE_PRD.md`
- `src/lib/services/upload/` — existing provider strategy pattern
- `src/components/dashboard/matches/use-video-upload.ts` — existing video upload hook
- `src/lib/video/compress.ts` — existing client-side compression

### No-go zones

- **Do not modify the SwingVision path.** `swingvision-parser.ts`, `swingvision-validator.ts`, the `process-match` Edge Function, and existing rows must keep working unchanged. Every SplitStep code path is additive.
- **Do not change `calculate_match_stats`.** The derivation engine's job is to produce `points` and `shots` rows that the existing function can already consume. If you believe the function must change, stop and flag it.
- **Do not backfill or mutate existing match data.**
- **Do not invent SplitStep API behavior.** See §5.

---

## 1. Context

SplitStep is a computer-vision provider. We POST a job containing a public video URL plus match metadata; they process asynchronously and POST results to our webhook. Results are a JSON array of *strokes* — not points, not statistics.

The pilot runs free through 31 December 2026 with a cap of 75 processing-hours per collegiate program per month and 2 hours per individual user per month. Caps must be enforced in code.

Customer-facing materials must not attribute anything to SplitStep. Internally, name things `splitstep`. In any user-visible string, the provider is "Advantage Intelligence".

### The core problem this integration must solve

`calculate_match_stats` is built on point-level outcomes. SplitStep does not return them.

| Our stats layer needs | SplitStep returns |
|---|---|
| `points.won_by_player1` | nothing |
| `points.result_type` (`Ace`, `Double Fault`, `%Winner%`, `%Unforced Error%`, `Service Winner`) | nothing |
| `points.is_break_point`, `is_set_point` | nothing |
| `shots.shot_type` = `First Serve` / `Second Serve` | `stroke_type: "serve"`, no 1st/2nd distinction |
| `shots.result` = `'In'` | boolean `in` |

Everything above must be **derived** from the stroke stream. That derivation engine (Phase 2) is the substantial piece of work here. Phases 1 and 3 are plumbing and UI.

---

## 2. Architecture

```
Browser
  ├─ pick file → validate locally (resolution/fps/codec/duration)
  ├─ upload direct to Cloudflare R2 (multipart, resumable)
  └─ metadata form + trim selection run concurrently against local file

/api/splitstep/jobs (POST)
  ├─ verify caller owns match
  ├─ check + reserve monthly processing quota
  ├─ mint R2 read URL for SplitStep
  ├─ POST job to SplitStep
  └─ insert processing_jobs row (status: queued)

/api/webhooks/splitstep (POST)
  ├─ verify signature (see §5)
  ├─ status=queued  → record ack, no-op otherwise
  ├─ status=job_failed → mark failed, release quota reservation, surface to user
  └─ status=job_completed
       ├─ download sas_url JSON immediately (7-day expiry)
       ├─ persist raw JSON to Supabase Storage (audit + reprocessing)
       └─ reconcile quota, mark job complete
             │
             └─ (async) Supabase Edge Function
                  ├─ run derivation engine → points, shots
                  └─ call calculate_match_stats(match_id)
```

Storage split — keep these separate, they have different lifetimes and revocation needs:

| Asset | Location | Access |
|---|---|---|
| Original video | R2 | user playback (short-lived signed URL) |
| Vendor-facing video URL | R2 | see §3.2 |
| Raw results JSON | Supabase Storage, `match-results` (private) | internal only |

**The webhook does not derive.** It verifies, records the delivery, fetches the
results JSON, and returns. Derivation runs afterwards in a Supabase Edge
Function, mirroring the SwingVision `process-match` fire-and-forget pattern.
Two reasons, and the first is the one that matters: webhook senders retry on
timeout, so slow inline work produces duplicate deliveries against partial
state. The second is that the app runs on Vercel Hobby, where the function
ceiling is 60s — not something to bet a full match of strokes on.

**Results JSON goes to Supabase, not R2** (revised 2026-08-04; the table above
originally said R2). A full match is roughly a megabyte, so R2's zero-egress
advantage is worth pennies here, and none of the reasons R2 wins for video
apply: nobody external reads it, and there is no revocation story to tell. What
does apply is that the webhook already holds a service-role Supabase client to
write `processing_jobs`, that SwingVision already stores its raw provider files
in Supabase Storage (`match-data`), and that the Edge Function which will read
this JSON lives there too. Put the data next to whatever computes on it.

R2 keeps the video, where multi-GB vendor egress and the Worker's download log
— our only signal that processing has started, per §3.2 — actually earn it.

---

## 3. Phase 1 — Ingest pipeline

### 3.1 Schema

Write migrations under `supabase/migrations/`. Migration-first: no code that reads a column before the migration creating it exists.

**New table: `processing_jobs`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `match_id` | uuid FK → matches | |
| `created_by` | uuid FK → users | for RLS |
| `provider` | text | `'splitstep'`, default |
| `external_job_id` | text | SplitStep `job_id`, nullable until submitted |
| `status` | text | see state machine below |
| `priority` | text | default `'standard'`. Not sent to the API yet — column exists so tiers are a UI change later, not a migration. |
| `start_time_seconds` | numeric | trim start, relative to original |
| `end_time_seconds` | numeric | trim end, relative to original |
| `billable_seconds` | integer | `end - start`, computed at submit |
| `video_object_key` | text | R2 key of source video |
| `video_url_expires_at` | timestamptz | for re-signing on retry |
| `results_object_key` | text | R2 key of persisted raw JSON |
| `sas_url` | text | as received |
| `sas_expires_at` | timestamptz | received_at + 7d |
| `trimmed_video_url` | text | as received; we do not adopt it as playback asset, but record it |
| `submitted_at`, `queued_ack_at`, `completed_at` | timestamptz | |
| `attempt_count` | integer | default 0 |
| `error_message` | text | |
| `raw_webhook_payload` | jsonb | every webhook received, appended |
| `derivation_version` | text | version tag of the engine that produced the rows |
| `derivation_confidence` | text | `high` / `medium` / `low` — see §4.4 |
| `created_at`, `updated_at` | timestamptz | |

State machine — enforce with a CHECK constraint:

```
pending → uploading → uploaded → submitting → queued → processing → completed
                                     ↓            ↓          ↓
                                  failed       failed     failed
                                                             ↓
                                                        derivation_failed
```

`derivation_failed` is distinct from `failed`: the vendor succeeded, our engine did not. Those need different handling and different alerting.

**New table: `processing_usage`**

Ledger, not a counter. One row per reservation.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `account_id` | uuid | user id (individual) or program id (see note) |
| `account_type` | text | `'individual'` \| `'program'` |
| `billing_month` | date | first of month, UTC |
| `job_id` | uuid FK → processing_jobs | |
| `reserved_seconds` | integer | at submit |
| `actual_seconds` | integer | at completion, nullable |
| `released` | boolean | true if job failed and reservation was returned |
| `created_at` | timestamptz | |

There is no `programs` table today. For Phase 1, set `account_type = 'individual'` and `account_id = user_id` for everyone, and implement the cap lookup behind a single function so the program tier can be added without touching callers. Flag this — collegiate accounts are needed before September onboarding and are out of scope here.

Caps: 2 hours/month individual, 75 hours/month program. Put these in one config module, not scattered literals.

**Alterations**

- `matches`: add `fixed_camera` boolean, `initial_top_player_is_player1` boolean.
- `match_files`: extend the `status` CHECK to cover the new lifecycle, or leave `match_files` alone entirely for SplitStep and let `processing_jobs` own state. Prefer the latter — recommend and justify whichever you pick.
- `points` / `shots`: add `derived` boolean default false, so derived rows are distinguishable from imported ones.

RLS on both new tables: user can read/write rows where `created_by = auth.uid()`. Service role bypasses for the webhook handler.

### 3.2 Cloudflare R2

Two decisions the founder needs to confirm before you implement — **ask, do not pick**:

1. **Vendor URL strategy.** Either (a) an S3-style presigned GET, capped at 7 days by SigV4, or (b) a Worker on a custom domain fronting R2 with an opaque token in the path. (b) is recommended: no expiry ceiling, revocable, and it gives a download log — which is our only visibility into their queue depth and the only way to distinguish "stuck in their queue" from "failed to download our file". Implement behind an interface either way.
2. Bucket naming and whether originals and results share a bucket.

Regardless of choice:

- Uploads go **direct from browser to R2** via presigned multipart. Do not proxy through Next.js — Vercel request body limits and function duration make that a dead end for multi-GB files.
- Presign only after verifying server-side that the authenticated user owns the target match. Supabase Storage RLS was enforcing ownership via folder path; on R2 that enforcement is ours.
- Key layout: `videos/{user_id}/{match_id}/original.{ext}`, `results/{user_id}/{match_id}/{job_id}.json`.
- User playback URLs and vendor URLs must be separately minted and separately revocable.

### 3.3 Job submission — `POST /api/splitstep/jobs`

Field mapping:

| SplitStep field | Source |
|---|---|
| `MatchID` | our `matches.id` (uuid) |
| `VideoUrl` | R2 URL per §3.2 |
| `WebhookUrl` | `{APP_URL}/api/webhooks/splitstep` |
| `InitialTopPlayer` | player name at top of frame at video start |
| `InitialBottomPlayer` | player name at bottom of frame at video start |
| `StartTime` | trim start, seconds |
| `EndTime` | trim end, seconds |
| `SetGameScores` | zip of `matches.score.player1` / `.player2`, ordered **top player first** |
| `FixedCamera` | `matches.fixed_camera` |
| `Ad` | `matches.format.ad_scoring` |

Critical details:

- **Top/bottom is camera-relative, not player1/player2.** Players change ends every odd game; `Initial*` refers to the start of the video only. Store `initial_top_player_is_player1` and use it to map `pred_player_id` back to player1/player2 on the way in. Getting this backwards attributes every statistic to the wrong person and will not be obvious from the UI.
- `SetGameScores` must be from the **top player's** perspective first. If `initial_top_player_is_player1` is false, swap.
- Tiebreak sets send the **game count** (7), not the tiebreak points. `[[6,3],[7,6]]`, not `[[6,3],[7,5]]` where 5 was the tiebreak.
- Reject submission if `matches.match_type` is doubles. SplitStep is singles-only.
- Reject if resolution < 1080p or fps < 30.
- Reserve quota before submitting; release on failure.

### 3.4 Resolution / codec guard

`src/lib/video/compress.ts` currently transcodes to `scale=-2:720`, `crf 28`. **720p is below SplitStep's 1080p floor.** Do not route SplitStep uploads through the existing compression path. Either bypass it entirely, or add a mode that caps at 1080p and preserves ≥30fps. Validate the local file at pick time with `HTMLVideoElement.videoWidth/videoHeight` before any bytes move — rejecting a 720p phone video after a 20-minute upload is the worst failure in this pipeline.

### 3.5 Webhook — `POST /api/webhooks/splitstep`

- Signature verification: **unknown, see §5.** Until confirmed, implement a shared-secret header check against `SPLITSTEP_WEBHOOK_SECRET` and structure the code so a real HMAC scheme drops in without refactoring. Do not ship an unauthenticated endpoint.
- Idempotent on `(external_job_id, status)`. Duplicate deliveries must be no-ops.
- Return 200 fast. Download and derivation happen out of band — a Supabase Edge Function or a queued background job, not inline in the Next.js route handler.
- On `job_completed`, download `sas_url` **immediately** and persist to R2. It expires in 7 days and there is no documented way to re-request it.
- Append every payload to `raw_webhook_payload`. During the pilot this is the only forensic record we have.
- No polling or re-send endpoint is documented. If a job sits in `queued` past a configurable threshold (start at 72h), mark it stalled and alert — silent job loss is a known gap.

### 3.6 Timestamp normalization

**This is the detail most likely to ship broken.**

SplitStep's `time` field is seconds since the start of the *processed* (trimmed) video. Our `points.video_time` and `shots.video_time` are relative to the original, because that is what SwingVision gives us and what the player component seeks against.

At ingest, add `start_time_seconds` to every `time` value so everything is stored in original-video time. Do this once, in the derivation engine, and assert it in a test.

**Confirmed empirically, 2026-08-16.** The offset really is exactly `start_time_seconds` and nothing else. The vendor's "trimmed" output is the `StartTime`/`EndTime` window from our own job request, re-encoded — it does not additionally cut dead time, which would have made the mapping piecewise and unrecoverable from a single scalar. Measured on the Revelli/Stepanov job: submitted window 15.136 → 5196.343 = 5181.207s, returned video 5181.268s. So `original_time = splitstep_time + start_time_seconds` holds for the whole file, and the job row carries the only number needed.

This is the load-bearing assumption of that formula. If the vendor ever ships real dead-time trimming, a single offset stops working and this section is where it breaks first.

Use `time`, not `frame`, for all seeking. They re-encode the trimmed video; frame indices may not map back to the original if framerate changed. Seconds survive re-encoding.

### Phase 1 acceptance

- A job can be submitted end to end and reaches `queued` with a real `external_job_id`.
- Webhook receives, verifies, persists raw JSON to R2, marks `completed`.
- Quota is reserved on submit, reconciled on completion, released on failure.
- A user cannot submit against a match they do not own.
- A user at their monthly cap is refused with a clear error.
- Doubles and sub-1080p submissions are refused before upload.

Phase 1 ships and is testable **without** Phase 2. A completed job with no derivation should leave the match in a clean "processed, analysis pending" state, not a broken one.

---

## 4. Phase 2 — Derivation engine

### GATE: do not start this phase until a real full-match sample JSON is in the repo.

The vendor docs show one stroke object. The engine's correctness depends on behavior that document does not specify (§5). Building against the docs alone produces plausible code that is silently wrong.

Required before starting:
- A complete results JSON from a real match, committed as a test fixture.
- Answers to §5 questions 1, 2 and 3.

If asked to start Phase 2 without these, say so and stop.

### 4.1 Input shape

JSON array of stroke objects. Key fields: `pred_rally_id`, `pred_rally_stroke_number`, `pred_player_id`, `stroke_type` (`serve`/`groundstroke`/`volley`), `stroke_side` (`forehand`/`backhand`/`overhead`), `in` (bool), `net_hit` (bool), `bounce_x_m`, `bounce_y_m`, `player_x_m`, `player_y_m`, `opponent_x_m`, `opponent_y_m`, `speed_kmh`, `spin_type`, `time`, `frame`, confidence scores.

Sentinels: `-9999.0` (float), `-9999` (int), `"None"` (string). **Convert to NULL at parse time, before anything else touches the data.** A single -9999 surviving into `AVG(speed)` corrupts a match's stats invisibly.

The non-`pred_` fields (`rally_id`, `player_id`, `point_score`, …) are documented as coming "from input rally metadata, if provided" — and the job request has no rally metadata parameter. Assume they are all sentinels. Build on the `pred_*` fields, and note in code comments that these are vendor-flagged Beta.

### 4.2 Court coordinate conversion

SplitStep: meters, origin at net centre, `+y` toward top of frame / far baseline, `+x` toward right sideline. Sidelines `±4.12`, service lines `±6.4`, baselines `±11.89`.

Ours: `shots.contact_x/y`, `landing_x/y` normalized 0–1.

Write one conversion module, `metersToNormalized()`, with unit tests pinning the known landmarks. Every consumer goes through it. Also convert `speed_kmh` → `shots.speed_mph`.

`shots.zone` derives from `bounce_x_m` — check the live CHECK constraint (verification task 3) for exact allowed strings before emitting.

### 4.3 Derivation rules

Group by `pred_rally_id`, order by `pred_rally_stroke_number`.

| Output | Rule | Confidence |
|---|---|---|
| Server | `pred_player_id` of stroke 1 | high |
| First vs second serve | Two consecutive `serve` strokes by the same player in one rally → the first was a fault, the second is `'Second Serve'`. Single serve → `'First Serve'`. | **depends on §5 Q1** |
| Double fault | Two serves, both `in: false` | same dependency |
| Ace | Serve `in: true`, no subsequent stroke in rally | high |
| Point winner | Last stroke of rally: `in: false` or `net_hit: true` → hitter **lost**; `in: true` → hitter **won** | medium |
| `rally_length` | count of strokes in rally | high |
| Score progression, break/set/match point | Fold point winners forward using `matches.format` (`ad_scoring`, `best_of`) | high, given point winners |
| Winner / Unforced Error / Forced Error | Heuristic. See below. | **low** |

**Winner vs UE vs FE.** There is no ground truth in the data. SwingVision makes this call for us; SplitStep does not. Requirements:

- Implement it as a single, isolated, documented, versioned module. It will be revised.
- Do not scatter the heuristic through the ingest path.
- Starting rule to implement and then tune: rally-ending stroke with `in: true` where opponent is displaced (distance from the bounce location) beyond a threshold → Winner. Rally-ending stroke with `in: false` where opponent was *not* applying pressure (low incoming `speed_kmh`, opponent near centre) → Unforced Error. Otherwise Forced Error.
- Emit values matching the strings already present in `points.result_type` (verification task 6).
- Record which version produced each match in `processing_jobs.derivation_version`.

### 4.4 Reconciliation — build this, it is not optional

The user gives us the true final score at upload. After deriving the point sequence, fold it forward and compare the resulting set scores against `matches.score`.

- Exact match → `derivation_confidence = 'high'`.
- Set count correct, game counts off by ≤1 in any set → `'medium'`.
- Otherwise → `'low'`, and surface a warning in the UI rather than presenting the numbers as fact.

This is our only automatic correctness check on the vendor's model, and it is what stops a coach discovering the problem before we do.

### 4.5 Output

Insert `points` and `shots` rows with `derived = true`, then call `calculate_match_stats(match_id)`. Do not write `match_stats` directly.

Transactional: a partial derivation must roll back, not leave half a match.

Re-runnable: given the persisted raw JSON in R2, re-running the engine on an existing match must delete prior derived rows and rebuild. We will revise the heuristics and need to reprocess.

### Phase 2 acceptance

- Fixture match derives with `derivation_confidence = 'high'`.
- Every stat on the existing match detail page renders with plausible values.
- No `-9999` or `"None"` anywhere in `points` or `shots`.
- `video_time` values are original-video-relative; seeking to a serve in the player lands on that serve.
- Re-running derivation is idempotent.

---

## 5. Do not guess — open questions

These are unknown. Where a question blocks work, stub the code, `TODO(splitstep-qN)` the site, and flag it in your summary. Do not invent an answer.

1. **Are faulted serves emitted as strokes?** If a first serve goes out, does a `serve` stroke with `in: false` appear? The entire first/second serve split, double-fault detection, and every serve statistic depends on this. Blocks Phase 2.
2. **How are lets handled?** Emitted, skipped, or `net_hit: true`? Affects rally-boundary logic.
3. **Does `pred_rally_stroke_number` restart per rally, and do faults count in the numbering?**
4. **Webhook authentication.** Algorithm, header name, signing payload, rotation policy. Docs say nothing. Blocks a production-safe webhook.
5. **Is there a status/polling endpoint, or any way to re-request results after the 7-day SAS expiry?** Not documented. Determines whether stalled-job recovery is possible or whether re-upload is the only path.
6. **Is there a queue-priority parameter?** The documented request has nine fields and none is priority. Until confirmed, no turnaround tier UI ships.
7. **Error format.** `job_failed.message` is a free-text string containing raw underlying errors. Ask for stable error codes. Until then, do not parse the string for control flow — store it, show a generic message, log the raw.

---

## 6. Phase 3 — Upload UI

Conform to `.skills/advantage-analytics-design/SKILL.md`.

Flow — upload and metadata run **concurrently**:

```
1. Pick file
   └─ validate locally: resolution ≥1080p, fps ≥30, container, duration
      reject here, before any bytes move

2. Upload begins immediately in background (R2 multipart, resumable)

   ── concurrently ──

3. Trim
   └─ scrub the LOCAL file via URL.createObjectURL — instant, does not
      wait on upload. Set start just before the first serve of the match,
      end just after the final point.

4. Metadata
   ├─ which end each player started on (drives InitialTop/Bottom)
   ├─ which player is you
   ├─ final score by set (tiebreaks: game count, not TB points)
   ├─ ad scoring
   └─ fixed camera

5. Review — shows live upload %, submit disabled until upload completes

6. Job status: Uploading → Queued → Processing → Analyzing → Ready
```

Why concurrent: the upload is ~20 minutes, the form is ~60 seconds. The metadata is not cosmetic — `SetGameScores`, `StartTime`, `EndTime`, `Ad` are required job parameters, so the form is a hard gate on submission either way. Running it during the upload means the job fires the instant the last byte lands, instead of waiting on a user who wandered off. Trim works against the local file precisely so it does not have to wait.

Trim UI must warn that the window has to cover complete games consistent with the entered score. Trimming into the middle of a game desynchronises every derived point score after that point.

Other UI requirements:

- Add SplitStep to `src/lib/providers.ts` as an available provider. User-visible name: "Advantage Intelligence". Never "SplitStep".
- Show remaining monthly processing quota before submission.
- No turnaround-time promises anywhere in the UI. No "24 hours". Show an ETA range derived from observed p50 once we have data; until then, show queue position or nothing.
- Matches with `derivation_confidence = 'low'` display a warning on the match detail page.

### Provider abstraction

`IProviderUploadStrategy` assumes a parseable file with `validateFile()`. SplitStep is an async processing provider with a job lifecycle, not an import provider. Split the abstraction — propose the shape before implementing, and keep `swing-vision` working through the existing path unchanged.

Note that `useVideoUpload.startUpload` currently throws `"No match file record found. Upload match data first."` — video is a dependent of an xlsx upload. SplitStep inverts this: video is the source. The overhaul must allow a match to exist with video and no data file.

---

## 7. Environment

Needed (confirm names with the founder, add to `.env.example`, never commit values):

```
SPLITSTEP_API_KEY
SPLITSTEP_API_URL            # docs show a dummy endpoint; get the real one
SPLITSTEP_WEBHOOK_SECRET
R2_ACCOUNT_ID
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_VIDEOS
R2_BUCKET_RESULTS
R2_PUBLIC_WORKER_URL         # only if Worker strategy chosen
NEXT_PUBLIC_APP_URL          # for WebhookUrl construction
```

---

## 8. Working agreement

- Migrations before code that reads new columns.
- Small commits, one concern each.
- Report every mismatch between this spec and the live database rather than silently adapting.
- If the spec is wrong or a better approach exists, say so before implementing it.
- End each phase with a summary of what shipped, what is stubbed, and every `TODO(splitstep-qN)` left open.
