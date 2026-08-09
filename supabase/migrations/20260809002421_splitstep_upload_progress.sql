-- Upload progress, so the matches list can show a real number.
-- Applied live 2026-08-09 as version 20260809002421.
--
-- The browser uploads straight to R2 and is the only party that knows how far
-- along it is. Without somewhere to put that, progress lives in one tab's
-- console and vanishes on navigation — which is exactly what happens today:
-- the wizard finishes, the upload continues in the background, and the user
-- sees nothing but a beforeunload warning.
--
-- Written coarsely (every ~10%) rather than on every progress event. A 2 GB
-- upload fires hundreds of them and the bar cannot show more than a tenth
-- anyway.
--
-- Nullable: a job that never uploaded through the browser (a hand-run smoke
-- test, an import) has no meaningful value, and 0 would read as "stalled at
-- the start" rather than "not applicable".

alter table public.processing_jobs
  add column if not exists upload_progress_percent smallint;

alter table public.processing_jobs
  drop constraint if exists processing_jobs_upload_progress_check;

alter table public.processing_jobs
  add constraint processing_jobs_upload_progress_check
  check (upload_progress_percent is null
         or (upload_progress_percent >= 0 and upload_progress_percent <= 100));

comment on column public.processing_jobs.upload_progress_percent is
  'Browser-to-R2 upload progress, 0-100, written coarsely by the upload client. NULL when the job did not upload through the browser.';
