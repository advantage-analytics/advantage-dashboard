-- Reconcile vendor jobs on a schedule.
--
-- The vendor has no retry policy: a completion webhook that misses its window
-- is gone. The status poll and results sweep in
-- src/lib/services/splitstep/reconcile.ts recover it, but ran only when the
-- uploader loaded the matches list or a match page, so a lost delivery — and
-- the ready/failed email that hangs off it — waited for their next visit.
--
-- Every ten minutes, a GET to /api/cron/reconcile-vendor-jobs runs both sweeps
-- unscoped. It carries the same bearer the Vercel crons send, read from the
-- Vault secret 'cron_secret' that schedule_stalled_upload_sweep already
-- requires; rotate CRON_SECRET in Vercel and that row must change with it.
--
-- The URL is production's. Applied to any other project, this would call
-- production with that project's secret and be refused.
--
-- Not on vercel.json because the deploying plan schedules a cron once a day.

select cron.schedule(
  'reconcile-vendor-jobs',
  '*/10 * * * *',
  $job$
    select net.http_get(
      url := 'https://app.advantage-analytics.com/api/cron/reconcile-vendor-jobs',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || secret.decrypted_secret
      ),
      timeout_milliseconds := 30000
    )
    from vault.decrypted_secrets as secret
    where secret.name = 'cron_secret';
  $job$
);
