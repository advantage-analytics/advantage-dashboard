-- Server-only writes for processing_jobs.prior_external_job_ids
-- (20261023180458). The owner's insert/update policies carry no column list
-- and processing_jobs_guard_storage_keys predates the column, so a signed-in
-- user could rewrite their own job's vendor-id history and reopen the
-- walk-back that history exists to stop. The trigger that maintains it runs
-- under the writer's role but only on server writes of external_job_id, which
-- clients cannot make, so it never trips this guard.
--
-- Applied to the live database via the Supabase MCP as
-- `processing_jobs_guard_vendor_id_history`; this file carries the version the
-- live project recorded on apply.

create or replace function public.processing_jobs_guard_vendor_id_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if (tg_op = 'INSERT' and cardinality(new.prior_external_job_ids) > 0)
     or (tg_op = 'UPDATE'
         and new.prior_external_job_ids is distinct from old.prior_external_job_ids) then
    raise exception 'A processing job''s vendor id history is written by the server only.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke execute on function public.processing_jobs_guard_vendor_id_history()
  from public, anon, authenticated;

create trigger processing_jobs_guard_vendor_id_history
  before insert or update on public.processing_jobs
  for each row execute function public.processing_jobs_guard_vendor_id_history();
