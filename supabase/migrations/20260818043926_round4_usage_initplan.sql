-- Evaluate `is_program_staff` once per statement, not once per row.
-- Applied live 2026-08-18 as version 20260818043926.
--
-- `program_roster` and `program_usage_by_member` each gate on
--
--   public.is_program_staff(p_program_id) or <something referencing a row>
--
-- and that OR is the problem: because the other branch carries a Var
-- (`pm.user_id`, `pu.created_by`), the planner cannot hoist the first branch
-- out, so it calls `is_program_staff` for every candidate row. That function is
-- SECURITY DEFINER — not inlinable — and itself calls `user_program_role`, so a
-- 25-player roster meant 25 nested function calls plus 25 index lookups where
-- one would do. A busy program-month makes it hundreds.
--
-- Wrapping it as `(select public.is_program_staff(p_program_id))` turns it into
-- an InitPlan: uncorrelated, evaluated once, cached for the statement. It is
-- the same trick the two functions already use on `auth.uid()`, and the reason
-- Supabase's own RLS guidance writes `(select auth.uid())` rather than
-- `auth.uid()`.
--
-- Behaviour is identical. Only the plan changes.
--
-- The `exists (…)` branch in `program_roster` is genuinely uncorrelated already
-- and collapses on its own, so it is left as written.

create or replace function public.program_roster(p_program_id uuid)
returns table (
  user_id        uuid,
  display_name   text,
  email          text,
  role           text,
  upload_enabled boolean,
  joined_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select pm.user_id,
         nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
         u.email,
         pm.role,
         pm.upload_enabled,
         pm.joined_at
    from public.program_members pm
    join public.users u on u.id = pm.user_id
   where pm.program_id = p_program_id
     and (
       (select public.is_program_staff(p_program_id))
       or pm.user_id = (select auth.uid())
       or exists (
         select 1
           from public.programs p
          where p.id = p_program_id
            and p.roster_visible
            and p_program_id in (select public.user_program_ids())
       )
     )
   order by
     case pm.role when 'owner' then 0 when 'coach' then 1 when 'staff' then 2 else 3 end,
     pm.joined_at;
$$;

revoke all on function public.program_roster(uuid) from public;
revoke execute on function public.program_roster(uuid) from anon;
grant execute on function public.program_roster(uuid) to authenticated;

create or replace function public.program_usage_by_member(
  p_program_id    uuid,
  p_billing_month date
)
returns table (
  user_id      uuid,
  display_name text,
  used_seconds bigint,
  match_count  bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select pu.created_by,
         nullif(trim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, '')), ''),
         coalesce(sum(coalesce(pu.actual_seconds, pu.reserved_seconds)), 0),
         count(distinct pj.match_id)
    from public.processing_usage pu
    join public.users u on u.id = pu.created_by
    left join public.processing_jobs pj on pj.id = pu.job_id
   where pu.account_id = p_program_id
     and pu.account_type = 'program'
     and pu.billing_month = p_billing_month
     and not pu.released
     and (
       (select public.is_program_staff(p_program_id))
       or pu.created_by = (select auth.uid())
     )
   group by pu.created_by, u.first_name, u.last_name
   order by 3 desc;
$$;

revoke all on function public.program_usage_by_member(uuid, date) from public;
revoke execute on function public.program_usage_by_member(uuid, date) from anon;
grant execute on function public.program_usage_by_member(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Drop the setter nothing calls
-- ---------------------------------------------------------------------------

-- `set_member_upload_enabled` was written alongside the other three roster
-- writes, but the Team page has no per-member upload toggle and no server
-- action wraps it — nothing in `src/` references it. A SECURITY DEFINER
-- function granted to every signed-in user, exercised by nothing, is surface
-- area with no test. It comes back with the control that needs it.
drop function if exists public.set_member_upload_enabled(uuid, uuid, boolean);
