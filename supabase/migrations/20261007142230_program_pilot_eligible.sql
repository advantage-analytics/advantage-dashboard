-- Admin-granted pilot eligibility for non-college team workspaces
--
-- PROVENANCE. Every function body and the constraint rewritten here was read
-- from the LIVE database on 2026-10-07 with `pg_get_functiondef` /
-- `pg_get_constraintdef`, not from this folder — `supabase/migrations/` runs
-- roughly 100 migrations behind the live ledger. Reconstructing from repo
-- copies would silently roll back what landed since.
--
-- ── Why ────────────────────────────────────────────────────────────────────
--
-- The pilot's 75 processing-hours/month program pool was handed out by one
-- rule, written in four places: `quotaTierFor()` in
-- `src/lib/services/splitstep/quota.ts` and the three SQL functions below all
-- asked `programs.org_type = 'college'`. A self-serve custom org (club /
-- high_school / academy / other) was permanently on the 2-hour individual
-- figure, and the admin console had no way to change that.
--
-- `pilot_eligible` is that way. It is an explicit, admin-set flag — never
-- derived from org_type or from the pilot date columns — so a custom org's
-- tier is a decision somebody made and the audit log names. Colleges are
-- unchanged: `org_type = 'college'` still draws the program pool on its own,
-- and `admin_set_pilot_eligible` refuses to touch one.
--
-- Granting also STAMPS the pilot record (owner decision, 2026-10-07): a custom
-- org going on the pool gets `pilot_approved_by/at` = the admin pressing the
-- button when none is recorded, and `pilot_ends_on` = 2026-12-31 — the same
-- one-time default `20260926075216_admin_program_pilot.sql` gave colleges —
-- when none is set, when it has passed, or when the pilot was ended by hand.
-- Revoking only clears the flag; the dates stay as history.
--
-- No backfill. Live had one custom org carrying a hand-set pilot record that
-- nothing read for quota; it was nulled back by hand the day it was stamped
-- (see the 2026-09-26 migration's header). Eligibility is granted explicitly.
--
-- ── The three SQL readers ──────────────────────────────────────────────────
--
-- `admin_reserve_video_quota` (admin console uploads) picks the cap by
-- org_type; `individual_tier_usage` and the legacy `individual_pool_usage`
-- count a custom org's program-ledger spend against the shared pilot pool and
-- the open-beta ceiling. Left alone, an eligible org would show 75 h and be
-- refused at 2 h by an admin upload, and its spend would eat the 20 h
-- open-beta ceiling. All three now read `(org_type = 'college' or
-- pilot_eligible)` — the one predicate `quotaTierFor()` spells in TypeScript.
--
-- Grant shape on every admin_* RPC live (pg_proc.proacl):
--   {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- i.e. revoked from public + anon, execute to authenticated. Mirrored below.

-- ── Column ─────────────────────────────────────────────────────────────────

alter table public.programs
  add column if not exists pilot_eligible boolean not null default false;

comment on column public.programs.pilot_eligible is
  'Admin-granted: a non-college program that draws the pilot''s program processing pool. Set only by admin_set_pilot_eligible; colleges draw the pool from org_type alone and never carry this.';

-- ── Audit vocabulary ───────────────────────────────────────────────────────

alter table public.program_audit_log
  drop constraint program_audit_log_action_check;

alter table public.program_audit_log
  add constraint program_audit_log_action_check check (action = any (array[
    'player.added', 'player.updated', 'player.archived', 'player.claimed',
    'player.merged', 'invite.created', 'invite.revoked', 'invite.accepted',
    'member.removed', 'member.role_changed', 'seats.changed',
    'member.account_deleted', 'lineup.set', 'ownership.transferred',
    'event.deleted', 'player.restored', 'match.attached', 'member.left',
    'program.conference_changed', 'console.result_added',
    'console.analysis_attached', 'join_request.approved',
    'join_request.declined', 'pilot.end_changed', 'pilot.ended',
    'program.details_changed', 'member.upload_changed',
    'program.crest_changed', 'console.submission_reconciled',
    'match.detached', 'match.round_changed',
    'pilot.eligibility_changed'
  ]));

-- ── admin_set_pilot_eligible ───────────────────────────────────────────────

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
  v_org_type    text;
  v_eligible    boolean;
  v_ends_on     date;
  v_approved_at timestamptz;
  v_ended_at    timestamptz;
  v_stamp_dates boolean := false;
  v_stamp_appr  boolean := false;
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

  -- Not a key column, so the weaker lock suffices and does not block FKs into
  -- programs (which take KEY SHARE on this row).
  select p.org_type, p.pilot_eligible, p.pilot_ends_on, p.pilot_approved_at, p.pilot_ended_at
    into v_org_type, v_eligible, v_ends_on, v_approved_at, v_ended_at
    from public.programs p
   where p.id = p_program_id
     for no key update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  if v_org_type = 'college' then
    raise exception 'Collegiate programs already draw the program pool.'
      using errcode = '22023';
  end if;

  -- Same answer already: nothing to change, nothing to log.
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
  );

  update public.programs
     set pilot_eligible    = p_eligible,
         pilot_approved_by = case when v_stamp_appr then (select auth.uid()) else pilot_approved_by end,
         pilot_approved_at = case when v_stamp_appr then now() else pilot_approved_at end,
         pilot_ends_on     = case when v_stamp_dates then date '2026-12-31' else pilot_ends_on end,
         pilot_ended_at    = case when v_stamp_dates then null else pilot_ended_at end,
         updated_at        = now()
   where id = p_program_id;
end;
$function$;

revoke execute on function public.admin_set_pilot_eligible(uuid, boolean) from public;
revoke execute on function public.admin_set_pilot_eligible(uuid, boolean) from anon;
grant  execute on function public.admin_set_pilot_eligible(uuid, boolean) to authenticated;

-- ── admin_reserve_video_quota — cap by the widened predicate ───────────────
-- Live body (20260919044829_submit_admin_match_videos.sql) with only the
-- `case` changed.

CREATE OR REPLACE FUNCTION public.admin_reserve_video_quota(p_actor_id uuid, p_job_id uuid, p_seconds integer, p_billing_month date, p_program_cap integer, p_individual_cap integer)
 RETURNS TABLE(ok boolean, used_seconds integer, cap_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare access jsonb; j public.processing_jobs; p public.programs;
begin
  access := public.admin_video_access(p_actor_id,null,p_job_id,'read');
  if access is null then raise exception 'video-operation-required' using errcode='42501'; end if;
  select * into j from public.processing_jobs where id=p_job_id for update;
  select * into p from public.programs where id=(access->>'programId')::uuid for share;
  if j.status is distinct from 'submitting' or j.external_job_id is not null
    or p_seconds is distinct from ceil(j.end_time_seconds-j.start_time_seconds)::integer
    or p_seconds is null or p_seconds<=0 then raise exception 'invalid-video-reservation' using errcode='22023'; end if;
  if exists(select 1 from public.processing_usage where job_id=p_job_id) then raise exception 'video-quota-already-reserved' using errcode='22023'; end if;
  return query select * from public.reserve_processing_quota(p_job_id,p.id,'program',p_actor_id,p_billing_month,p_seconds,
    case when p.org_type='college' or p.pilot_eligible then p_program_cap else p_individual_cap end);
end;
$function$;

-- ── individual_tier_usage — eligible orgs leave the shared pool ────────────
-- Live body (20260925053330_individual_open_tier.sql) with only the program
-- predicate changed.

CREATE OR REPLACE FUNCTION public.individual_tier_usage(p_billing_month date, p_created_by uuid)
 RETURNS TABLE(pilot_used_seconds integer, open_used_seconds integer, is_player boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with rows as (
    select coalesce(u.actual_seconds, u.reserved_seconds) as secs,
           coalesce(usr.individual_pilot, false) as pilot
      from public.processing_usage u
      left join public.users usr on usr.id = u.created_by
     where u.billing_month = p_billing_month
       and u.released = false
       and (u.account_type = 'individual'
            or (u.account_type = 'program'
                and exists (select 1
                              from public.programs p
                             where p.id = u.account_id
                               and not (p.org_type = 'college' or p.pilot_eligible))))
  )
  select
    coalesce((select sum(secs) from rows where pilot), 0)::integer,
    coalesce((select sum(secs) from rows where not pilot), 0)::integer,
    coalesce((select usr.individual_pilot
                from public.users usr
               where usr.id = p_created_by), false);
$function$;

-- ── individual_pool_usage — legacy twin, kept in step ──────────────────────
-- Live body (20260925024406_individual_pool_quota.sql) with only the program
-- predicate changed.

CREATE OR REPLACE FUNCTION public.individual_pool_usage(p_billing_month date, p_created_by uuid)
 RETURNS TABLE(pool_used_seconds integer, is_player boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    coalesce((select sum(coalesce(u.actual_seconds, u.reserved_seconds))
                from public.processing_usage u
               where u.billing_month = p_billing_month
                 and u.released = false
                 and (u.account_type = 'individual'
                      or (u.account_type = 'program'
                          and exists (select 1
                                        from public.programs p
                                       where p.id = u.account_id
                                         and not (p.org_type = 'college' or p.pilot_eligible))))), 0)::integer,
    coalesce((select usr.individual_pilot
                from public.users usr
               where usr.id = p_created_by), false);
$function$;

-- ── pending_program_invites — carry pilot_eligible to the join footer ──────
-- `quotaHours()` (src/lib/services/programs/join-quota.ts) quotes an invitee
-- the allowance `reserveQuota()` will enforce, and that now depends on both
-- columns. A RETURNS TABLE change needs drop + create; grants re-applied as
-- `20260902032248_pending_invites.sql` set them. Body otherwise the live one.

drop function if exists public.pending_program_invites();

CREATE OR REPLACE FUNCTION public.pending_program_invites()
 RETURNS TABLE(invite_id uuid, program_id uuid, school_name text, team text, org_type text, role text, invited_by uuid, inviter_first_name text, inviter_last_name text, expires_at timestamp with time zone, pilot_eligible boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
begin
  -- No session, no rows. Not an exception: this is a list, and an empty list
  -- is the honest answer for a caller who is nobody.
  if v_uid is null then
    return;
  end if;

  -- The address is only an address once it has been confirmed. Filtering on
  -- `email_confirmed_at` here, rather than after the fact, means an unconfirmed
  -- session never reaches the join at all.
  select lower(u.email) into v_email
    from auth.users u
   where u.id = v_uid
     and u.email_confirmed_at is not null;

  if v_email is null then
    return;
  end if;

  -- Pending means: addressed to me, not yet accepted, not yet expired, and I
  -- am not already on that roster. The last clause keeps a member who arrived
  -- by another door (a claim, an older link) from being nagged to accept an
  -- invitation that would be a no-op.
  return query
    select i.id,
           i.program_id,
           p.school_name,
           p.team,
           p.org_type,
           i.role,
           i.invited_by,
           u.first_name,
           u.last_name,
           i.expires_at,
           p.pilot_eligible
      from public.program_invites i
      join public.programs p on p.id = i.program_id
      left join public.users u on u.id = i.invited_by
     where lower(i.email) = v_email
       and i.accepted_at is null
       and i.expires_at > now()
       and not exists (
         select 1
           from public.program_members m
          where m.program_id = i.program_id
            and m.user_id = v_uid
       )
     order by i.created_at desc;
end;
$function$;

revoke all on function public.pending_program_invites() from public, anon;
grant execute on function public.pending_program_invites() to authenticated;
