-- Settings › Teams: ownership becomes a thing the product can move, and the
-- program's directory identity becomes the owner's alone.
--
-- Until now every write to `programs` went through one gate, `is_program_staff`,
-- so a coach — or a staff account — could rename the program, flip its squad or
-- change its conference. Those three are not preferences: `programs` is a
-- claimed directory row, carrying `program_key`, `athletics_domains` and the
-- claim evidence beside the name, and other schools match against it. This
-- migration splits the form's fields into logistics (venue, surface, season —
-- any staff) and identity (name, squad, conference — the owner), and gives the
-- owner a primitive to be checked against, which did not exist.
--
-- It also makes the invariant the invite check has always assumed real. The
-- comment on `program_invites_role_check` says "ownership moves by transfer,
-- not by invitation" — but there was no transfer function, and nothing stopped
-- a second owner row. Every claimed program carries exactly one owner today;
-- the one duplicate was an UNCLAIMED directory row (UCLA) holding two owner
-- memberships from claim testing, and the later of the two was removed by
-- hand before this ran — so the partial unique index below has nothing to
-- disagree with.
--
-- One column: `crest_path`, a storage object key for the program's crest. A
-- key, never a URL — the bucket is public, and the URL is derived where it is
-- rendered so a bucket move is one constant, not a data fix.

-- ---------------------------------------------------------------------------
-- programs.crest_path
-- ---------------------------------------------------------------------------

alter table public.programs
  add column if not exists crest_path text;

comment on column public.programs.crest_path is
  'Object key in the program-crests bucket (<program_id>/crest-<stamp>.<ext>), '
  'or null for the initials mark. A key, never a URL.';

-- ---------------------------------------------------------------------------
-- One owner per program
-- ---------------------------------------------------------------------------

-- Partial, so the index only ever holds one row per program and costs nothing
-- on the player rows that make up the bulk of the table. `programs.owner_user_id`
-- is a single column and every reader of it assumes one answer; this is what
-- keeps `program_members` agreeing with it.
create unique index if not exists programs_one_owner
  on public.program_members (program_id)
  where role = 'owner';

-- ---------------------------------------------------------------------------
-- is_program_owner
-- ---------------------------------------------------------------------------

-- Mirrors `is_program_staff`. Only ever called from inside SECURITY DEFINER
-- functions below, which is why anon may lose EXECUTE: if this is ever
-- referenced from an RLS policy, anon needs the grant back — see
-- 20260821144843 for the receipt of learning that the hard way.
create or replace function public.is_program_owner(p_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(public.user_program_role(p_program_id) = 'owner', false);
$function$;

revoke all on function public.is_program_owner(uuid) from public;
revoke execute on function public.is_program_owner(uuid) from anon;
grant execute on function public.is_program_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- update_program_settings — identity is the owner's
-- ---------------------------------------------------------------------------

-- Same signature, so the two callers (Settings › Teams and the roster invite
-- dialog's upload-policy switch) keep working. The gate compares the *normalised*
-- input against the current row rather than refusing non-owners outright: the
-- roster's switch re-sends every field unchanged, and it is used by coaches.
-- The normalisation must match the UPDATE's own `coalesce(nullif(trim(...)))`
-- exactly, or a coach on a program with a null conference gets refused for
-- sending ''. `is distinct from`, not `<>` — conference is nullable.
create or replace function public.update_program_settings(
  p_program_id uuid,
  p_school_name text,
  p_team text,
  p_conference text,
  p_home_venue text,
  p_default_surface text,
  p_season text,
  p_players_can_upload boolean
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_cur record;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  if p_team is not null and p_team not in ('mens', 'womens') then
    raise exception 'unknown squad %', p_team using errcode = '22023';
  end if;

  select school_name, team, conference
    into v_cur
    from public.programs
   where id = p_program_id
     for update;

  if not found then
    raise exception 'program not found' using errcode = 'P0002';
  end if;

  if not public.is_program_owner(p_program_id) and (
       coalesce(nullif(trim(p_school_name), ''), v_cur.school_name) is distinct from v_cur.school_name
    or coalesce(p_team, v_cur.team)                                   is distinct from v_cur.team
    or coalesce(nullif(trim(p_conference), ''), v_cur.conference)     is distinct from v_cur.conference
  ) then
    raise exception 'Only the owner can change the program''s name, squad or conference.'
      using errcode = '42501';
  end if;

  update public.programs
     set school_name        = coalesce(nullif(trim(p_school_name), ''), school_name),
         team               = coalesce(p_team, team),
         conference         = coalesce(nullif(trim(p_conference), ''), conference),
         home_venue         = coalesce(nullif(trim(p_home_venue), ''), home_venue),
         default_surface    = coalesce(p_default_surface, default_surface),
         season             = coalesce(nullif(trim(p_season), ''), season),
         players_can_upload = p_players_can_upload,
         updated_at         = now()
   where id = p_program_id;
end;
$function$;

revoke all on function public.update_program_settings(uuid, text, text, text, text, text, text, boolean) from public;
revoke execute on function public.update_program_settings(uuid, text, text, text, text, text, text, boolean) from anon;
grant execute on function public.update_program_settings(uuid, text, text, text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- set_program_crest
-- ---------------------------------------------------------------------------

-- Logistics, not identity: any staff. Null clears it. The object itself is the
-- caller's to write — the bucket policy checks the same membership.
create or replace function public.set_program_crest(p_program_id uuid, p_crest_path text)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if not public.is_program_staff(p_program_id) then
    raise exception 'not authorized to change this program'
      using errcode = '42501';
  end if;

  if p_crest_path is not null and p_crest_path not like p_program_id::text || '/%' then
    raise exception 'crest path must live under the program''s own prefix'
      using errcode = '22023';
  end if;

  update public.programs
     set crest_path = nullif(trim(p_crest_path), ''),
         updated_at = now()
   where id = p_program_id;
end;
$function$;

revoke all on function public.set_program_crest(uuid, text) from public;
revoke execute on function public.set_program_crest(uuid, text) from anon;
grant execute on function public.set_program_crest(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- program_audit_log: the verb the transfer writes
-- ---------------------------------------------------------------------------

alter table public.program_audit_log
  drop constraint program_audit_log_action_check;

alter table public.program_audit_log
  add constraint program_audit_log_action_check check (
    action = any (array[
      'player.added',
      'player.updated',
      'player.archived',
      'player.claimed',
      'player.merged',
      'invite.created',
      'invite.revoked',
      'invite.accepted',
      'member.removed',
      'seats.changed',
      'member.account_deleted',
      'lineup.set',
      'ownership.transferred'
    ])
  );

-- ---------------------------------------------------------------------------
-- transfer_program_ownership
-- ---------------------------------------------------------------------------

-- Only the owner may give it away — that is what makes this a transfer and
-- not a takeover. The recipient must already hold a coach or staff seat:
-- handing a program to a player is a promotion in disguise, and the roster is
-- where promotions happen. The caller stays on as a coach; nothing about
-- their matches changes.
--
-- Demote before promote: `programs_one_owner` would refuse a second owner row
-- for the instant both existed. The program row is locked first so two
-- transfers racing each other serialise instead of both reading "I am the
-- owner". `programs.owner_user_id` moves in the same statement set, because
-- the programs SELECT policy and the custom-org ownership cap read it.
create or replace function public.transfer_program_ownership(
  p_program_id uuid,
  p_new_owner uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_target_role text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  perform 1 from public.programs where id = p_program_id for update;

  if not public.is_program_owner(p_program_id) then
    raise exception 'Only the owner can transfer this program.'
      using errcode = '42501';
  end if;

  if p_new_owner = v_uid then
    raise exception 'You already own this program.' using errcode = '22023';
  end if;

  select pm.role into v_target_role
    from public.program_members pm
   where pm.program_id = p_program_id and pm.user_id = p_new_owner;

  if v_target_role is null then
    raise exception 'That person is not on this program.' using errcode = '22023';
  end if;

  if v_target_role not in ('coach', 'staff') then
    raise exception 'Only a coach or staff member can take ownership. Promote them first.'
      using errcode = '22023';
  end if;

  update public.program_members
     set role = 'coach'
   where program_id = p_program_id and user_id = v_uid;

  update public.program_members
     set role = 'owner'
   where program_id = p_program_id and user_id = p_new_owner;

  update public.programs
     set owner_user_id = p_new_owner,
         updated_at    = now()
   where id = p_program_id;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (p_program_id, v_uid, 'ownership.transferred', p_new_owner,
          jsonb_build_object('from', v_uid, 'to', p_new_owner));
end;
$function$;

revoke all on function public.transfer_program_ownership(uuid, uuid) from public;
revoke execute on function public.transfer_program_ownership(uuid, uuid) from anon;
grant execute on function public.transfer_program_ownership(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- program_usage_pending
-- ---------------------------------------------------------------------------

-- The part of `program_usage_total` that is a reservation rather than a
-- finished job. A SUBSET of the total — the total already counts a reserved
-- job at its reserved figure — so a reader shows it as "includes X reserved",
-- never adds it. Same membership gate as the total: a non-member gets zero.
create or replace function public.program_usage_pending(
  p_program_id uuid,
  p_billing_month date
)
returns bigint
language sql
stable
security definer
set search_path to ''
as $function$
  select case
           when p_program_id in (select public.user_program_ids())
           then coalesce((
             select sum(pu.reserved_seconds)
               from public.processing_usage pu
              where pu.account_id = p_program_id
                and pu.account_type = 'program'
                and pu.billing_month = p_billing_month
                and pu.actual_seconds is null
                and not pu.released
           ), 0)
           else 0
         end;
$function$;

revoke all on function public.program_usage_pending(uuid, date) from public;
revoke execute on function public.program_usage_pending(uuid, date) from anon;
grant execute on function public.program_usage_pending(uuid, date) to authenticated;
