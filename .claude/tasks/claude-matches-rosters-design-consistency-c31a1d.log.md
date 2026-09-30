# Run log — claude/matches-rosters-design-consistency-c31a1d

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add a terminal `cancelled` job status, `vendor_started_at` and the `cancel_processing_job` RPC — done

**gate:** mechanical pass · completion pass

**changed:** Migration 20260930062236_processing_jobs_cancelled applied live via Supabase MCP and saved byte-identical: `cancelled` added to processing_jobs_status_check (idempotent), `vendor_started_at timestamptz`, `splitstep_status_rank('cancelled') = 9`, `cancel_processing_job(uuid, uuid)` (security definer, search_path '', service_role-only; flips queued/submitting/processing to cancelled and releases usage in one call), the three admin_uploads_private guards re-created from live bodies with `cancelled` terminal; trailing DO/ASSERT blocks pin constraint, rank and ACL. New PGlite test tests/database/cancel-processing-job.test.mjs (4/4). Security advisors: nothing new.

**follow-ups:**

1. `release_processing_quota` and `cancel_processing_job` now share the same release statement; change both if release semantics ever change.
2. tests/database/README.md could note that re-creating `attachment_snapshot` needs stub `matches`/`programs`/`program_event_entries` tables in PGlite (row-type variables).

## T2 · Add `POST /api/splitstep/jobs/[jobId]/cancel` — done

**gate:** mechanical pass · completion pass

**changed:** New `src/app/api/splitstep/jobs/[jobId]/cancel/{handler,route}.ts`: auth → UUID → ownership (same 404) → queued/submitting with a vendor id, then vendor `DELETE {apiUrl}/{id}` (10 s timeout, own body parser `readVendorDelete`). 2xx → `cancel_processing_job` RPC → 200; JOB_NOT_REMOVABLE → 409 already_started; JOB_NOT_FOUND → 409 not_cancellable; network/timeout/5xx/other → 503 vendor_unavailable; RPC null after a vendor 2xx → 409 not_cancellable (logged). Responses via errorResponse/jsonResponse, checkSameOrigin, runtime nodejs. `tests/cancel-job-handler.spec.ts` 21/21. MAP.md API row edited by hand (`npm run map` only collects page routes).

**follow-ups:**

1. `openapi/advantage-api.yaml` has no entry for the cancel route (copy the rederive entry).
2. handler.ts casts new codes into `MatchVideoHttpError`; a properly widened shared error-code type would be cleaner.
3. `scripts/generate-map.mjs` ignores API routes, so MAP.md's API row always needs hand edits.
