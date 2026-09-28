# Brief seed — video-failure-recovery

> Captured verbatim from the `/feature-new` invocation on 2026-09-27.
> Stage 01 refines this into the brief; edit freely before running
> `/feature-next video-failure-recovery`.

---

Retry only where it can help, and surface every video failure

Context (audited 2026-09-28 against the live DB and code):

Retry today
- Manual Retry (match page RetryAnalysis, match-analysis-progress.tsx:232; drawer RetryButton, match-drawer.tsx:146-200; event-line-drawer.tsx:278) POSTs /api/splitstep/jobs/{id}/resubmit. resubmitJob (src/lib/services/splitstep/resubmit-job.ts:323) only checks status === "failed" and that video_object_key exists. It never reads error_code / error_category / error_step, although they are stored on processing_jobs.
- The automatic retry already classifies: isDownloadFailure() (resubmit-job.ts:119) allows only error_step "downloading_video" or VIDEO_UNREACHABLE, once per chain.
- Azure block upload already retries only on network, 408, 429 and 5xx (azure-block-upload.ts:80).

Wrong today
1. Permanent vendor rejections still offer Retry. Example: Emon van Loben Sels vs Roger Pascual Ferra, job 45ff4bd7…, VIDEO_FRAME_RATE_TOO_LOW at trimming_video. Retry re-sends the same file, reserves allowance again and uses up one of three attempts.
2. Upload-stage failures (network drop, tab closed, reaped after 15 min, Azure 403) have no video_object_key, so Retry always returns 409 "This job has no completed video upload to retry from." The copy still says "Retrying uses the video you already uploaded" (match-analysis-progress.tsx:222).
3. Retry is missing where it would help: transient derivation_failed (a calculate_match_stats RPC or Postgres error) and a results download that fails after the vendor completes (stuck at "Stats pending" forever; reconcile.ts:37 only polls submitting/queued/processing).
4. Hidden failures: the stored reason on a stalled `uploaded` row (allowance used up, 422, not eligible) is never rendered; vendor submit reasons are overwritten with "Could not submit this match for analysis." (submit-match-video.ts:423-457); webhook signature 401s (route.ts:282) leave jobs at "Processing"; SwingVision process-match errors are swallowed (src/app/api/upload/route.ts:246, invoke returns {error} and never rejects); unreconciled score folds publish as "Analyzed" with a console.warn only (derive-and-publish.ts:163).
5. Raw internals reach users as the failure note: Azure XML, "Failed to fetch", "Edge Function returned a non-2xx status code", Postgres errors.

Goal
Sort every failure into one recovery class: retry (transient), upload again (bytes never landed), fix the recording (vendor video-quality codes such as frame rate, camera or length), wait or ask (allowance or permission), or re-derive (derivation). Show each class its own action and plain copy. Classify on the server so the button and the route agree, and have resubmitJob refuse a permanent class with a clear reason. Consider an early fps check in the wizard before upload, so no allowance is spent on a video the vendor will reject.

Constraints
- Read docs/ui-revamp-guardrails.md and AGENTS.md first. "Advantage Intelligence" is the only user-visible provider name.
- Verify schema against the live DB (processing_jobs has error_code, error_category, error_step, attempt_count, resubmitted_from_job_id, auto_resubmitted), not supabase/migrations.
- Branch off splitstep-integration; the PR targets splitstep-integration.
