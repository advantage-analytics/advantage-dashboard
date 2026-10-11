-- Run the stalled-upload sweep on a schedule.
--
-- A match video uploads from the browser tab. When the tab closes or the
-- computer sleeps nothing server-side notices: the job read "Uploading 27%"
-- until its owner next loaded a page, and nobody was told.
--
-- Every five minutes, two steps:
--
--   1. reap_stalled_uploads('6 hours') directly. pg_cron runs as the database
--      owner, so this ends every upload that has been quiet for six hours with
--      no dependency on the app being up or on the secret below. Six hours is
--      the life of the upload credential: until then a tab that wakes up can
--      still finish, and the surfaces show the job as "Upload paused"
--      (UPLOAD_ABANDONED_AFTER in src/lib/data/match-analysis.ts). The
--      function's own default is fifteen minutes; nothing calls it bare any
--      more.
--   2. A GET to /api/cron/reap-stalled-uploads, which emails the uploader of
--      each upload that has been quiet for twenty minutes, once
--      (services/notifications/upload-paused-mail.ts). It carries the same
--      bearer the Vercel crons send, read from Vault.
--
-- BEFORE this does anything useful, store that bearer once (SQL editor, not a
-- migration — a secret must never land in this folder):
--
--   select vault.create_secret('<the value of CRON_SECRET in Vercel>', 'cron_secret');
--
-- Until it exists step 2 is skipped and step 1 still runs.
--
-- The URL is production's. Applied to any other project, step 2 would call
-- production with that project's secret and be refused.
--
-- Not on vercel.json because the deploying plan schedules a cron once a day.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

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
    where secret.name = 'cron_secret';
  $job$
);
