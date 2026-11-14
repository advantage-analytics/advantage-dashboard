-- The vendor's trimmed video copy was retired on 2026-11-12 (PR #729,
-- docs/r2-video-storage-plan.md): the webhook and the archive cron no longer
-- copy it, so nothing calls the RPC that recorded its key. Drop it rather than
-- leave a SECURITY DEFINER writer on processing_jobs with no caller.
-- processing_jobs.trimmed_object_key stays: six jobs still name a kept copy,
-- and purge-match-storage reads it.
drop function if exists public.record_splitstep_trimmed_copy(uuid, text);
