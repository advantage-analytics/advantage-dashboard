-- Teach splitstep_status_rank() about `deriving`.
--
-- Two changes landed independently on 2026-08-04:
--
--   20260805005321  added `deriving` to processing_jobs_status_check, closing
--                   the §5 gap where our own derivation work had no in-progress
--                   state.
--   20260805005801  added splitstep_status_rank(), which stops a retried or
--                   out-of-order webhook delivery from dragging a job backwards.
--
-- Neither knew about the other, and the combination is worse than either alone.
-- `deriving` was not in the rank function's CASE, so it fell to the `else -1`
-- branch — BELOW every real status. Any webhook delivery then outranked it:
--
--   job is `deriving` → a late `job_queued` retry arrives → rank 4 > rank -1
--   → the job is dragged back to `queued`, mid-derivation, and stays there.
--
-- Verified against the live database before this fix: a job set to `deriving`
-- came back `queued` after one late delivery.
--
-- Ordering: `deriving` sits after `completed` (the vendor is done; we are not)
-- and before `derivation_failed`, matching the lifecycle comment in
-- 20260802083544. Both are above every status a webhook can set — 6 — so the
-- vendor can no longer move a job once our engine has taken it.

create or replace function public.splitstep_status_rank(p_status text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'pending'    then 0
    when 'uploading'  then 1
    when 'uploaded'   then 2
    when 'submitting' then 3
    when 'queued'     then 4
    when 'processing' then 5
    -- Terminal for the VENDOR. The highest rank any webhook delivery can carry.
    when 'completed'  then 6
    when 'failed'     then 6
    -- Ours, not theirs. Above 6 so no delivery can overwrite them.
    when 'deriving'          then 7
    when 'derivation_failed' then 8
    else -1
  end;
$$;

revoke all on function public.splitstep_status_rank(text) from public;
revoke all on function public.splitstep_status_rank(text) from anon;
revoke all on function public.splitstep_status_rank(text) from authenticated;
