-- T1 · Per-team pilot columns + admin pilot RPCs
--
-- PROVENANCE. Everything this migration rewrites was read from the LIVE
-- database on 2026-09-26 with `pg_get_constraintdef` / `pg_get_functiondef`,
-- not from this folder — `supabase/migrations/` runs roughly 100 migrations
-- behind the live ledger, and eight admin-console migrations landed live on
-- 2026-09-18 from a branch that never merged. Reconstructing from repo copies
-- would silently roll those back.
--
-- ── What a "pilot" is here ─────────────────────────────────────────────────
--
-- Until now the pilot was one constant, `PILOT_ENDS_AT = "2026-12-31"` in
-- `src/lib/services/splitstep/config.ts`, read only by UI copy ("Free through
-- Dec 31"). No server-side seam reads it: `reserve_processing_quota` (live
-- body read 2026-09-26) checks only the per-month cap, and the `programs`
-- table had no pilot fields at all. `admin-teams-server.ts` defines
-- `plan: 'pilot'` as "status = 'active'".
--
-- These four columns make the pilot a per-program fact an admin can edit:
--
--   pilot_ends_on      date         last free day, inclusive (calendar date,
--                                   no zone — same reasoning as PILOT_ENDS_AT)
--   pilot_approved_by  uuid → users who approved the pilot (null when the
--                                   claim auto-approved without a reviewer)
--   pilot_approved_at  timestamptz  when
--   pilot_ended_at     timestamptz  set only by `admin_end_pilot`: the pilot
--                                   was stopped early by hand. Null when it
--                                   simply runs out on `pilot_ends_on`.
--
-- BACKFILL. Every COLLEGIATE program (org_type = 'college') with status =
-- 'active' gets pilot_ends_on = '2026-12-31' — the constant, used here as the
-- one-time default and nowhere else — plus approved_by/at copied from its
-- latest `program_claims` row with status = 'approved' (`reviewed_by`,
-- `updated_at`). A program whose claim is still in `objection_window` (also
-- 'active', see `canSubmitVideo`) or that was activated without an approved
-- claim keeps null approved_by/at: a stamp we cannot source is worse than an
-- empty one.
--
-- The org_type guard is the pilot's own definition: `quotaTierFor()` in
-- `src/lib/services/splitstep/quota.ts` hands the collegiate pilot's 75 h only
-- to org_type 'college'; a self-serve custom org (club / high_school / academy
-- / other) is 'active' from `create_custom_program` without any claim and
-- files under the individual tier, so stamping it with the collegiate end
-- date would label a pilot it was never in. (rls-boundary-reviewer finding,
-- 2026-09-26: the first cut lacked the guard; live's one active program is a
-- high_school custom org and was stamped, then nulled back by hand the same
-- day. Live had zero approved claims — 4 objected, 6 rejected — and 1956
-- unclaimed programs.) An admin can still put a custom org on a pilot
-- explicitly with `admin_set_pilot_end`.
--
-- VISIBILITY (rls-boundary-reviewer, accepted as follow-up). `programs` has
-- `grant select ... to anon, authenticated` and a SELECT policy that is
-- unconditionally true for org_type = 'college', so these four columns are
-- readable through PostgREST by anyone, like every other column on the row
-- (`owner_user_id`, `claimed_at`, `seats`, `upload_policy` ...). They carry
-- nothing more sensitive than `owner_user_id` already does, and column-level
-- REVOKE cannot narrow a table-level GRANT, so hiding them means moving the
-- public projection of `programs` behind a view — a change to the whole
-- table's exposure, not this migration's. Follow-up.
--
-- ── What `admin_end_pilot` does, exactly ───────────────────────────────────
--
-- It writes two columns on the program row and nothing else:
--
--   pilot_ended_at = now()
--   pilot_ends_on  = least(pilot_ends_on, current_date)   -- never extends
--
-- It does NOT change `programs.status`. `programs_status_check` (read live)
-- allows only 'unclaimed' | 'claim_pending' | 'active' | 'suspended', and none
-- of them means "pilot over":
--
--   * 'suspended' is "unavailable for every source" in
--     `src/lib/workspace/upload-eligibility.ts` — it blocks SwingVision imports
--     and roster work too, which is a punishment, not a billing state. A team
--     whose free window closed should keep browsing and importing.
--   * 'unclaimed' would hand the program back to the claim queue and orphan
--     its owner and members.
--   * `programStatusFor()` in `src/lib/services/programs/claim-state.ts`
--     derives status from the live claim ("two columns that must agree is two
--     columns that eventually will not"); storing a status the claim machine
--     never produces would fight the next claim event.
--
-- Inventing a fifth value was explicitly ruled out by the task. Pilot state
-- therefore lives entirely in the four columns above, and readers ask
-- `pilot_ended_at is not null or pilot_ends_on < current_date`.
--
-- VIDEO GATING DECISION. Ending a pilot MUST eventually stop video submission
-- — that is the one capability that spends vendor budget and cannot be taken
-- back (`canSubmitVideo`'s own rationale). But nothing server-side gates on the
-- pilot today (see above), so this migration does not change that: it records
-- the fact and leaves the gate to the TypeScript seams that already own video
-- refusals — `reserveQuota()` / `explainVideoRefusal()` in
-- `src/lib/services/splitstep/quota.ts` and `/api/splitstep/upload-url` —
-- which must read the two columns and refuse `recordsVideo` submissions for an
-- ended pilot, in the same order they already ask `canSubmitVideo`. Putting the
-- check inside `reserve_processing_quota` was considered and rejected: that
-- function is keyed by `account_id`, is shared with individual accounts and has
-- no program row to read. Follow-up, not this task.
--
-- IDEMPOTENCE. Both RPCs return without writing — and without an audit row —
-- when the call would change nothing (`admin_set_pilot_end` to the current
-- date, `admin_end_pilot` on an already-ended pilot), mirroring
-- `admin_set_program_conference`. `admin_set_pilot_end` clears
-- `pilot_ended_at`: an admin setting a new end date is deliberately reopening
-- or re-dating the pilot, and a stale "ended early" stamp would contradict it.
--
-- ── Audit vocabulary ───────────────────────────────────────────────────────
--
-- `program_audit_log_action_check`, read live 2026-09-26 with
-- `pg_get_constraintdef` — every value is preserved below, including the two
-- the unmerged admin-console branch added:
--
--   'player.added', 'player.updated', 'player.archived', 'player.claimed',
--   'player.merged', 'invite.created', 'invite.revoked', 'invite.accepted',
--   'member.removed', 'member.role_changed', 'seats.changed',
--   'member.account_deleted', 'lineup.set', 'ownership.transferred',
--   'event.deleted', 'player.restored', 'match.attached', 'member.left',
--   'program.conference_changed', 'console.result_added',
--   'console.analysis_attached', 'join_request.approved',
--   'join_request.declined'
--
-- Added: 'pilot.end_changed', 'pilot.ended'.
--
-- Gate helper confirmed live:
--   public.is_admin() returns boolean, stable, security definer, search_path ''
--     -> select coalesce((select u.is_admin from public.users u
--                          where u.id = (select auth.uid())), false)
--
-- Grant shape on every admin_* RPC live (pg_proc.proacl):
--   {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}
-- i.e. revoked from public + anon, execute to authenticated. Mirrored below.

-- ── Columns ────────────────────────────────────────────────────────────────

alter table public.programs
  add column if not exists pilot_ends_on     date,
  add column if not exists pilot_approved_by uuid references public.users (id) on delete set null,
  add column if not exists pilot_approved_at timestamptz,
  add column if not exists pilot_ended_at    timestamptz;

comment on column public.programs.pilot_ends_on is
  'Last free day of the pilot, inclusive. Null = no pilot recorded. Set by admin_set_pilot_end; clamped by admin_end_pilot.';
comment on column public.programs.pilot_approved_by is
  'Admin who approved the pilot. Null when the claim auto-approved without a reviewer.';
comment on column public.programs.pilot_approved_at is
  'When the pilot was approved.';
comment on column public.programs.pilot_ended_at is
  'Set only by admin_end_pilot: the pilot was stopped early by hand. Null when it runs out on pilot_ends_on.';

-- ── Backfill ───────────────────────────────────────────────────────────────

update public.programs p
   set pilot_ends_on     = date '2026-12-31',
       pilot_approved_by = c.reviewed_by,
       pilot_approved_at = c.updated_at
  from public.programs p2
  left join lateral (
    select pc.reviewed_by, pc.updated_at
      from public.program_claims pc
     where pc.program_id = p2.id
       and pc.status = 'approved'
     order by pc.updated_at desc nulls last, pc.created_at desc
     limit 1
  ) c on true
 where p.id = p2.id
   and p.org_type = 'college'
   and p.status = 'active'
   and p.pilot_ends_on is null;

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
    'join_request.declined',
    'pilot.end_changed', 'pilot.ended'
  ]));

-- ── admin_set_pilot_end ────────────────────────────────────────────────────

create or replace function public.admin_set_pilot_end(
  p_program_id uuid,
  p_ends_on    date
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ends_on  date;
  v_ended_at timestamptz;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_program_id is null then
    raise exception 'Program id is required.' using errcode = '22023';
  end if;

  if p_ends_on is null then
    raise exception 'Pilot end date is required.' using errcode = '22023';
  end if;

  -- Not a key column, so the weaker lock suffices and does not block FKs into
  -- programs (which take KEY SHARE on this row).
  select p.pilot_ends_on, p.pilot_ended_at
    into v_ends_on, v_ended_at
    from public.programs p
   where p.id = p_program_id
     for no key update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  -- Same date and not ended early: nothing to change, nothing to log.
  if v_ends_on is not distinct from p_ends_on and v_ended_at is null then
    return;
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    p_program_id,
    (select auth.uid()),
    'pilot.end_changed',
    null,
    jsonb_build_object(
      'from',              v_ends_on,
      'to',                p_ends_on,
      'cleared_ended_at',  v_ended_at,
      'by_admin',          true
    )
  );

  update public.programs
     set pilot_ends_on  = p_ends_on,
         pilot_ended_at = null,
         updated_at     = now()
   where id = p_program_id;
end;
$function$;

revoke execute on function public.admin_set_pilot_end(uuid, date) from public;
revoke execute on function public.admin_set_pilot_end(uuid, date) from anon;
grant  execute on function public.admin_set_pilot_end(uuid, date) to authenticated;

-- ── admin_end_pilot ────────────────────────────────────────────────────────

create or replace function public.admin_end_pilot(
  p_program_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ends_on  date;
  v_ended_at timestamptz;
  v_new_end  date;
begin
  if not public.is_admin() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_program_id is null then
    raise exception 'Program id is required.' using errcode = '22023';
  end if;

  select p.pilot_ends_on, p.pilot_ended_at
    into v_ends_on, v_ended_at
    from public.programs p
   where p.id = p_program_id
     for no key update;

  if not found then
    raise exception 'Program % not found', p_program_id using errcode = 'P0002';
  end if;

  -- Already ended by hand: nothing to change, nothing to log.
  if v_ended_at is not null then
    return;
  end if;

  -- Never extends: a pilot that already ran out keeps its original last day.
  v_new_end := least(coalesce(v_ends_on, current_date), current_date);

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    p_program_id,
    (select auth.uid()),
    'pilot.ended',
    null,
    jsonb_build_object(
      'from',     v_ends_on,
      'to',       v_new_end,
      'by_admin', true
    )
  );

  -- status is deliberately untouched — see the header.
  update public.programs
     set pilot_ended_at = now(),
         pilot_ends_on  = v_new_end,
         updated_at     = now()
   where id = p_program_id;
end;
$function$;

revoke execute on function public.admin_end_pilot(uuid) from public;
revoke execute on function public.admin_end_pilot(uuid) from anon;
grant  execute on function public.admin_end_pilot(uuid) to authenticated;
