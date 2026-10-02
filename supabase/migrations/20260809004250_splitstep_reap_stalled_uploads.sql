-- Fail uploads that stopped moving, so a dead job stops looking like a live one.
-- Applied live 2026-08-09 as version 20260809004250.
--
-- The browser uploads straight to R2 and is the only party that knows how it is
-- going. When the tab closes mid-upload the XHR dies with the page and no catch
-- block ever runs, so the row sits at `uploading` forever — indistinguishable
-- from an upload still in flight. Observed exactly that: a job wrote 0% and was
-- never touched again, showing "Uploading 0%" indefinitely with no error.
--
-- Staleness, not age. `upload_progress_percent` is written every ~10%, so a
-- live upload keeps touching `updated_at` no matter how large the file or how
-- slow the connection. Absolute age would false-fail a legitimately long
-- upload; silence will not.
--
-- `pending` is reaped too: a job row created whose upload never started at all
-- is the same phantom by another route.
--
-- NOT security definer. RLS applies, so a caller reaps only their own rows —
-- which is all the matches page needs, and means this cannot be used to disturb
-- anyone else's jobs.

create or replace function public.reap_stalled_uploads(
  p_stale_after interval default interval '15 minutes'
)
returns integer
language sql
set search_path = ''
as $$
  with reaped as (
    update public.processing_jobs
       set status = 'failed',
           error_message = coalesce(
             error_message,
             'Upload stopped before it finished — the page was probably closed. Upload the video again.'
           ),
           updated_at = now()
     where status in ('pending', 'uploading')
       and updated_at < now() - p_stale_after
    returning 1
  )
  select count(*)::integer from reaped;
$$;

comment on function public.reap_stalled_uploads(interval) is
  'Marks uploads that have stopped progressing as failed. Keyed on updated_at staleness, not age, because upload progress keeps a live job''s updated_at fresh. Runs under RLS, so a caller only ever reaps its own rows.';

revoke all on function public.reap_stalled_uploads(interval) from public, anon;
grant execute on function public.reap_stalled_uploads(interval) to authenticated, service_role;
