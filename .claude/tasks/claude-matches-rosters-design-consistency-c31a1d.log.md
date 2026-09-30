# Run log — claude/matches-rosters-design-consistency-c31a1d

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add a terminal `cancelled` job status, `vendor_started_at` and the `cancel_processing_job` RPC — done

**gate:** mechanical pass · completion pass

**changed:** Migration 20260930062236_processing_jobs_cancelled applied live via Supabase MCP and saved byte-identical: `cancelled` added to processing_jobs_status_check (idempotent), `vendor_started_at timestamptz`, `splitstep_status_rank('cancelled') = 9`, `cancel_processing_job(uuid, uuid)` (security definer, search_path '', service_role-only; flips queued/submitting/processing to cancelled and releases usage in one call), the three admin_uploads_private guards re-created from live bodies with `cancelled` terminal; trailing DO/ASSERT blocks pin constraint, rank and ACL. New PGlite test tests/database/cancel-processing-job.test.mjs (4/4). Security advisors: nothing new.

**follow-ups:**

1. `release_processing_quota` and `cancel_processing_job` now share the same release statement; change both if release semantics ever change.
2. tests/database/README.md could note that re-creating `attachment_snapshot` needs stub `matches`/`programs`/`program_event_entries` tables in PGlite (row-type variables).
