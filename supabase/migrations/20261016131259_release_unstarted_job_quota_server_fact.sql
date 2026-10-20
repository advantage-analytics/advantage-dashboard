-- Deleting a job refunds its hours only if it never reached the vendor.
--
-- 20261016123934 keyed the refund on `status`, but a job's owner can UPDATE
-- their own `processing_jobs.status` (the browser writes `uploading` /
-- `uploaded`), so a player could set an analysed job back to `pending` and
-- delete it to get free hours and credits back (rls-boundary-reviewer, HIGH).
-- `external_job_id` is written by the server only
-- (`processing_jobs_guard_storage_keys`) and is set the moment the vendor has
-- the job, so it is the fact the refund now rests on. Status still has to be
-- a not-started one too. A job queued at the vendor is cancelled through the
-- cancel flow, which releases its hours properly; deleting it does not.
create or replace function public.release_unstarted_job_quota()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if old.external_job_id is null
     and old.status not in ('processing', 'deriving', 'completed', 'derivation_failed') then
    perform public.release_processing_quota(old.id);
  end if;
  return old;
end;
$function$;

revoke execute on function public.release_unstarted_job_quota()
  from public, anon, authenticated;
