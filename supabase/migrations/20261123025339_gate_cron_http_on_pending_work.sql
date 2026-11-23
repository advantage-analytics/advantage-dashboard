-- Call the app from pg_cron only when there is work for it.
--
-- reap-stalled-uploads (every 5 min) and reconcile-vendor-jobs (every 10 min)
-- used to GET their route on every tick: 432 Vercel function invocations a day,
-- almost all of which found nothing. On the Hobby plan that alone ate a large
-- share of the monthly Fluid Active CPU allowance (2026-11-22: 90% used,
-- projects pause at 100%).
--
-- Each job now asks the database first, with the same conditions its route
-- selects on (or looser — a superset only costs an idle call), and skips the
-- HTTP call when nothing matches. Schedules, URLs and the Vault secret are
-- unchanged; cron.schedule with an existing name replaces that job's command.
--
--   reap-stalled-uploads → sweepStalledUploads
--     (src/lib/services/notifications/upload-paused-mail.ts): an `uploading`
--     job with a progress value, quiet for 20 minutes (UPLOAD_PAUSED_AFTER_MS),
--     not yet mailed (notification_sends 'upload_paused:<job id>'). The
--     6-hour reap still runs in SQL every tick, as before.
--
--   reconcile-vendor-jobs → reconcileVendorJobs / refreshQueuedJobs /
--     recoverUndeliveredResults (src/lib/services/splitstep/reconcile.ts):
--     any queued job with a vendor id, a submitting/processing job quiet for
--     30 minutes (STALE_AFTER_MS), or a completed job whose results never
--     landed.
--
-- Change a threshold or a status list in those files and change it here too,
-- or the sweep stops being called for the rows it would now pick up.

select cron.schedule(
  'reap-stalled-uploads',
  '*/5 * * * *',
  $job$
    select public.reap_stalled_uploads(interval '6 hours');

    select net.http_get(
      url := 'https://app.advantage-analytics.com/api/cron/reap-stalled-uploads',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || secret.decrypted_secret
      ),
      timeout_milliseconds := 30000
    )
    from vault.decrypted_secrets as secret
    where secret.name = 'cron_secret'
      and exists (
        select 1
          from public.processing_jobs as job
         where job.status = 'uploading'
           and job.upload_progress_percent is not null
           and job.match_id is not null
           and job.created_by is not null
           and job.updated_at < now() - interval '20 minutes'
           and not exists (
             select 1
               from public.notification_sends as sent
              where sent.dedupe_key = 'upload_paused:' || job.id::text
           )
      );
  $job$
);

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
    where secret.name = 'cron_secret'
      and exists (
        select 1
          from public.processing_jobs as job
         where (
                 job.external_job_id is not null
             and (
                   job.status = 'queued'
                or (
                     job.status in ('submitting', 'processing')
                 and job.updated_at < now() - interval '30 minutes'
                   )
                 )
               )
            or (
                 job.status = 'completed'
             and job.results_object_key is null
             and job.derivation_version is null
               )
      );
  $job$
);
