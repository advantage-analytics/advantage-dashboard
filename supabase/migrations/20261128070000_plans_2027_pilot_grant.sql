-- 2027 pricing · pilot grant: Admin › Teams can put a college on a pilot, and a grant's pilot runs to May 31, 2027
--
-- NOT YET APPLIED TO THE LIVE DATABASE. It replaces one function and depends
-- on nothing earlier in this folder that live lacks; apply it any time before
-- January 1, 2027.
--
-- PROVENANCE. `admin_set_pilot_eligible(uuid, boolean)` was read from the LIVE
-- database on 2026-11-27 (`pg_get_functiondef`, `has_function_privilege`),
-- not from this folder. Live's body is the one in
-- 20261007142230_program_pilot_eligible: security definer, `search_path = ''`,
-- gated on `is_admin()`, the program row taken `for no key update`, executable
-- by `authenticated` and `service_role` and not by `anon` (proacl
-- `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`).
-- `admin_set_pilot_end` already refuses any date after 2027-05-31 and
-- `admin_end_pilot` only ever shortens; neither changes here.
--
-- WHY. Live's body stops working on January 1, 2027, in two ways:
--   1. It refuses every college ('Collegiate programs already draw the
--      program pool.'). True in the beta, where a college drew 75 h a month
--      for being one. From 2027-01-01 a college draws hours only from a
--      season plan or a RUNNING pilot (`allowanceFor()` / `pilotIsRunning()`
--      in src/lib/services/splitstep/allowance.ts), so an admin must be able
--      to grant one.
--   2. When it stamps dates it writes `pilot_ends_on = 2026-12-31`, which has
--      passed from January 1: the grant would create a pilot that is already
--      over.
--
-- What it does: `create or replace` with the SAME signature, live's body
-- copied, and only these changes:
--   - the college refusal is gone (and with it the `org_type` read that only
--     the refusal used);
--   - the stamped end date is `2027-05-31` (`PILOT_LATEST_END` in
--     src/lib/billing/plans.ts, the latest a pilot may run) instead of
--     `2026-12-31`. Dates are stamped by live's own rule, unchanged: on a
--     grant, when the program has no end date, its pilot was ended by hand, or
--     its end date has passed. A future end date is kept;
--   - the `pilot.eligibility_changed` audit row also records the stamped end
--     date as `details.ends_on` when one was stamped, beside live's `from`,
--     `to`, `by_admin` and `stamped`.
-- Revoking (`p_eligible = false`) is untouched: it clears the flag and leaves
-- the dates as history. The admin shortens a pilot with "Change end date"
-- (`admin_set_pilot_end`) and stops it with "End pilot" (`admin_end_pilot`).
--
-- BEFORE 2027-01-01 granting a college changes nothing a team sees: in the
-- beta a college already draws the 75-hour program figure from its
-- `org_type` (`quotaTierFor()`, `admin_reserve_video_quota`), so the flag
-- only matters once plans begin. A non-college granted before then now gets a
-- pilot through May 31, 2027 rather than one that lapses on December 31.
--
-- RE-RUNNABLE. One `create or replace`, idempotent grants, and an assertion
-- block. No DROP: grants survive the replace and are restated anyway.

create or replace function public.admin_set_pilot_eligible(
  p_program_id uuid,
  p_eligible   boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_eligible    boolean;
  v_ends_on     date;
  v_approved_at timestamptz;
  v_ended_at    timestamptz;
  v_stamp_dates boolean := false;
  v_stamp_appr  boolean := false;
  v_new_end     constant date := date '2027-05-31';
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_program_id is null then
    raise exception 'Program id is required.' using errcode = '22023';
  end if;

  if p_eligible is null then
    raise exception 'Eligibility is required.' using errcode = '22023';
  end if;

  select p.pilot_eligible, p.pilot_ends_on, p.pilot_approved_at, p.pilot_ended_at
    into v_eligible, v_ends_on, v_approved_at, v_ended_at
    from public.programs p
   where p.id = p_program_id
     for no key update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  if v_eligible = p_eligible then
    return;
  end if;

  if p_eligible then
    v_stamp_appr  := v_approved_at is null;
    v_stamp_dates := v_ends_on is null
                  or v_ended_at is not null
                  or v_ends_on < current_date;
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    p_program_id,
    (select auth.uid()),
    'pilot.eligibility_changed',
    null,
    jsonb_build_object(
      'from',     v_eligible,
      'to',       p_eligible,
      'by_admin', true,
      'stamped',  (v_stamp_appr or v_stamp_dates)
    )
    || case when v_stamp_dates
            then jsonb_build_object('ends_on', v_new_end)
            else '{}'::jsonb
       end
  );

  update public.programs
     set pilot_eligible    = p_eligible,
         pilot_approved_by = case when v_stamp_appr then (select auth.uid()) else pilot_approved_by end,
         pilot_approved_at = case when v_stamp_appr then now() else pilot_approved_at end,
         pilot_ends_on     = case when v_stamp_dates then v_new_end else pilot_ends_on end,
         pilot_ended_at    = case when v_stamp_dates then null else pilot_ended_at end,
         updated_at        = now()
   where id = p_program_id;
end;
$function$;

revoke execute on function public.admin_set_pilot_eligible(uuid, boolean) from public;
revoke execute on function public.admin_set_pilot_eligible(uuid, boolean) from anon;
grant  execute on function public.admin_set_pilot_eligible(uuid, boolean) to authenticated;
grant  execute on function public.admin_set_pilot_eligible(uuid, boolean) to service_role;

-- ── Assertions: fail the migration rather than leave it half true ──────────

do $$
declare
  v_fn  text := 'public.admin_set_pilot_eligible(uuid, boolean)';
  v_src text;
  v_def boolean;
  v_cfg text[];
begin
  select p.prosrc, p.prosecdef, p.proconfig
    into v_src, v_def, v_cfg
    from pg_proc p where p.oid = v_fn::regprocedure;

  if strpos(v_src, 'Collegiate programs') > 0
     or strpos(v_src, 'org_type') > 0 then
    raise exception 'plans_2027_pilot_grant: admin_set_pilot_eligible still refuses a college';
  end if;

  if strpos(v_src, '2026-12-31') > 0
     or strpos(v_src, 'v_new_end     constant date := date ''2027-05-31''') = 0
     or strpos(v_src, 'jsonb_build_object(''ends_on'', v_new_end)') = 0 then
    raise exception 'plans_2027_pilot_grant: admin_set_pilot_eligible does not stamp 2027-05-31';
  end if;

  if not v_def
     or v_cfg is distinct from array['search_path=""']
     or strpos(v_src, 'if not public.is_admin() then') = 0
     or strpos(v_src, 'for no key update') = 0 then
    raise exception 'plans_2027_pilot_grant: admin_set_pilot_eligible lost its security model';
  end if;

  if has_function_privilege('anon', v_fn, 'EXECUTE') then
    raise exception '% is executable signed out', v_fn;
  end if;
  if not has_function_privilege('authenticated', v_fn, 'EXECUTE')
     or not has_function_privilege('service_role', v_fn, 'EXECUTE') then
    raise exception '% is not executable by a signed-in admin', v_fn;
  end if;
end;
$$;
