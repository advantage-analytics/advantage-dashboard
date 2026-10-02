-- Narrow `cancel_processing_job` to the statuses the cancel route cancels.
--
-- `20260930062236_processing_jobs_cancelled` let the RPC flip a job in
-- `submitting`, `queued` or `processing`, on the reasoning that the vendor
-- DELETE is the authority on whether work stopped. The route never asks for
-- that: `CANCELLABLE_STATUSES` in
-- `src/app/api/splitstep/jobs/[jobId]/cancel/handler.ts` is
-- `submitting | queued`, and a job the vendor has started has already cost
-- vendor compute, so releasing its quota reservation would hand back a video
-- the month really spent. The database now enforces the same line as the
-- route instead of trusting every future caller to: a `processing` job
-- matches nothing, returns null, and keeps its reservation.
--
-- Body is otherwise the live one from `pg_get_functiondef` (read via the
-- Supabase MCP on 2026-09-30) — same guarded update, same inlined release,
-- same security definer with an empty search_path. The grants are re-asserted
-- because `create or replace` keeps them but this file should not depend on
-- that.
--
-- Also documents `processing_jobs.vendor_started_at` with what actually
-- stamps it: the queue sweep in `reconcile.ts`, from the vendor's status API.
--
-- Applied to the live database via the Supabase MCP as
-- `cancel_processing_job_queued_only`; this file carries the version the live
-- project recorded on apply.

create or replace function public.cancel_processing_job(p_job_id uuid, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_status text;
begin
  update public.processing_jobs
     set status = 'cancelled',
         completed_at = now(),
         error_code = 'CANCELLED'
   where id = p_job_id
     and created_by = p_user_id
     and status in ('submitting', 'queued')
  returning status into v_status;

  if v_status is null then
    return null;
  end if;

  update public.processing_usage
     set released = true
   where job_id = p_job_id
     and released = false;

  return v_status;
end;
$function$;

revoke execute on function public.cancel_processing_job(uuid, uuid) from public, anon, authenticated;
grant execute on function public.cancel_processing_job(uuid, uuid) to service_role;

comment on function public.cancel_processing_job(uuid, uuid) is
  'Cancels a submitting/queued Advantage Intelligence job owned by p_user_id and releases its quota reservation in the same transaction; returns ''cancelled'' or null when nothing matched. Trusts p_user_id as the caller: it is only safe behind the cancel route''s own auth check on the service-role client. Must never be granted to anon or authenticated — a client could cancel and release quota for any user id.';

comment on column public.processing_jobs.vendor_started_at is
  'When the vendor''s status API first reported job_processing for this job (the vendor''s updated_at for that status), stamped by the queue sweep in reconcile.ts. Null while the job is still queued with the vendor; a job cancelled before this is set never cost vendor compute.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Assertions
-- ─────────────────────────────────────────────────────────────────────────────

do $$
declare
  v_def text := pg_get_functiondef('public.cancel_processing_job(uuid, uuid)'::regprocedure);
begin
  assert v_def like '%status in (''submitting'', ''queued'')%',
    'cancel_processing_job: does not accept exactly submitting/queued';
  assert v_def not like '%''processing''%',
    'cancel_processing_job: still accepts processing';
  assert v_def ilike '%security definer%',
    'cancel_processing_job: is not security definer';
  assert v_def like '%search_path TO ''''%',
    'cancel_processing_job: search_path is not empty';
end
$$;

do $$
declare
  v_oid oid := 'public.cancel_processing_job(uuid, uuid)'::regprocedure;
begin
  assert has_function_privilege('service_role', v_oid, 'EXECUTE'),
    'cancel_processing_job: service_role cannot execute';
  assert not has_function_privilege('anon', v_oid, 'EXECUTE'),
    'cancel_processing_job: anon can execute';
  assert not has_function_privilege('authenticated', v_oid, 'EXECUTE'),
    'cancel_processing_job: authenticated can execute';
  assert (select proacl is not null from pg_proc where oid = v_oid),
    'cancel_processing_job: proacl is null, so PUBLIC can execute';
  -- Every execute grant names the owner or service_role; grantee 0 is PUBLIC.
  assert not exists (
    select 1
      from pg_proc p, aclexplode(p.proacl) a
     where p.oid = v_oid
       and a.privilege_type = 'EXECUTE'
       and a.grantee <> p.proowner
       and (a.grantee = 0 or a.grantee <> 'service_role'::regrole)),
    'cancel_processing_job: execute granted beyond the owner and service_role';
end
$$;
