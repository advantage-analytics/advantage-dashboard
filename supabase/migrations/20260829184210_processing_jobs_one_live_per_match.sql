-- Enforce, not just check, that at most one non-terminal job exists per match.
--
-- resubmitJob() already guards this with a read-then-insert ("no concurrent
-- duplicates"), but that check has no lock behind it: the webhook's auto-retry
-- and a user's "Retry analysis" click can race between the read and the
-- insert, creating two children that both bill quota and both submit to the
-- vendor for the same match. A partial unique index makes the second insert
-- fail atomically instead of silently succeeding.

create unique index processing_jobs_one_live_per_match
  on public.processing_jobs (match_id)
  where status not in ('failed', 'completed', 'derivation_failed');
