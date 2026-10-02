-- Quota reservation for the pilot caps (spec §3.3, Phase 1 acceptance).
-- Applied live 2026-08-07 as version 20260807070337.
--
-- The ledger table has existed since 20260802083544; nothing ever wrote it, so
-- the 75h/program and 2h/user caps were documented and unenforced.
--
-- These are functions rather than app-side reads because the check and the
-- insert have to be one atomic step. Two submissions racing would both read the
-- same "used" total and both pass, which is exactly how a cap gets exceeded.
-- Same reasoning as record_splitstep_webhook().
--
-- The cap is passed in rather than hardcoded here: getMonthlyCapSeconds() in
-- src/lib/services/splitstep/config.ts stays the single definition, and this
-- function is only reachable with the service role.

create or replace function public.reserve_processing_quota(
  p_job_id        uuid,
  p_account_id    uuid,
  p_account_type  text,
  p_created_by    uuid,
  p_billing_month date,
  p_seconds       integer,
  p_cap_seconds   integer
)
returns table(ok boolean, used_seconds integer, cap_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer;
begin
  if p_seconds is null or p_seconds <= 0 then
    raise exception 'reserve_processing_quota: p_seconds must be positive, got %', p_seconds;
  end if;

  -- Serialize every reservation for this account+month. Transaction-scoped, so
  -- it releases on commit or rollback without any cleanup path.
  perform pg_advisory_xact_lock(
    hashtext(p_account_id::text || ':' || p_billing_month::text)
  );

  -- A released row is a refund and must not count. Where a job has finished,
  -- actual_seconds is the truth; until then the reservation stands in for it.
  select coalesce(sum(coalesce(u.actual_seconds, u.reserved_seconds)), 0)
    into v_used
    from public.processing_usage u
   where u.account_id = p_account_id
     and u.billing_month = p_billing_month
     and u.released = false;

  if v_used + p_seconds > p_cap_seconds then
    return query select false, v_used, p_cap_seconds;
    return;
  end if;

  insert into public.processing_usage
    (account_id, account_type, billing_month, job_id, created_by, reserved_seconds)
  values
    (p_account_id, p_account_type, p_billing_month, p_job_id, p_created_by, p_seconds);

  return query select true, v_used + p_seconds, p_cap_seconds;
end;
$$;

-- Refund a reservation. Idempotent: releasing twice is a no-op, which matters
-- because the failure paths that call it can themselves be retried.
create or replace function public.release_processing_quota(p_job_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.processing_usage
     set released = true
   where job_id = p_job_id
     and released = false;
$$;

-- Replace the estimate with what the vendor actually billed. Leaves `released`
-- alone: a completed job still consumes its allowance.
create or replace function public.reconcile_processing_quota(
  p_job_id uuid,
  p_actual_seconds integer
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.processing_usage
     set actual_seconds = p_actual_seconds
   where job_id = p_job_id
     and released = false;
$$;

revoke all on function public.reserve_processing_quota(uuid, uuid, text, uuid, date, integer, integer) from public, anon, authenticated;
revoke all on function public.release_processing_quota(uuid) from public, anon, authenticated;
revoke all on function public.reconcile_processing_quota(uuid, integer) from public, anon, authenticated;
