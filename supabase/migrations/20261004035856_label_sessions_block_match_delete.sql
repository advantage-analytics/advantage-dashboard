-- Hand labels are ground truth and must not vanish with the match they
-- describe. label_sessions cascaded from both matches and processing_jobs, so
-- deleting a match (or its job) silently deleted every label session on it,
-- completed ones included.
--
-- Two layers:
--   1. The purge claim, which every app delete path asks BEFORE it removes a
--      match's stored files, now answers false for a match that has a label
--      session. That refuses the delete while the raw results file still
--      exists; a bare foreign-key refusal would come only after the files
--      were gone.
--   2. The two foreign keys become ON DELETE RESTRICT, so a delete that
--      bypasses the app (SQL, a script) is refused by the database too.
--
-- To delete such a match on purpose, delete its label sessions first.

create or replace function public.admin_claim_match_storage_purge(p_match_ids uuid[])
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
begin
  perform 1 from public.matches where id = any(p_match_ids) order by id for update;
  if exists(select 1 from public.admin_upload_submission_items where match_id = any(p_match_ids))
    or exists(select 1 from public.admin_analysis_reservations where match_id = any(p_match_ids))
    or exists(select 1 from public.admin_file_attempts where match_id = any(p_match_ids))
    or exists(select 1 from public.admin_video_attempts where match_id = any(p_match_ids))
    or exists(select 1 from public.label_sessions where match_id = any(p_match_ids)) then
    return false;
  end if;
  insert into public.match_storage_purge_claims(match_id)
    select id from public.matches where id = any(p_match_ids)
    on conflict (match_id) do nothing;
  return true;
end;
$function$;

alter table public.label_sessions
  drop constraint label_sessions_match_id_fkey,
  add constraint label_sessions_match_id_fkey
    foreign key (match_id) references public.matches(id) on delete restrict;

alter table public.label_sessions
  drop constraint label_sessions_job_id_fkey,
  add constraint label_sessions_job_id_fkey
    foreign key (job_id) references public.processing_jobs(id) on delete restrict;

-- label_sessions.job_id had only the partial one-open-session index; the
-- restrict check on a processing_jobs delete needs a full one.
create index if not exists label_sessions_job on public.label_sessions (job_id);
