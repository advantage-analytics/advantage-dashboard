-- The way back from `archive_program_player`.
--
-- Archiving keeps every match attributable (`matches.player1_id` has no
-- foreign key, and the profile id is what those rows carry), but until now
-- nothing could clear `archived_at`. Re-adding the same person through
-- `add_program_player` minted a fresh profile id with an empty history, and
-- the old matches — still there — became invisible to the roster and Team
-- Home, which both read through `program_roster_full` and its archived filter.
--
-- Same shape as the three writes in 20260822090700_program_player_writes.sql:
-- SECURITY DEFINER with an empty search_path, revoked from public and anon,
-- granted to authenticated. `program_players` carries one policy, a SELECT,
-- on purpose — an UPDATE policy could not keep `claimed_by_user_id` out of
-- reach, and that column is read access to every match carrying the id.

-- ---------------------------------------------------------------------------
-- Restore a player
-- ---------------------------------------------------------------------------

create or replace function public.restore_program_player(p_player_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_program uuid;
  v_claimed uuid;
  v_email   text;
  v_clash   text;
  v_seats   integer;
  v_used    integer;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select program_id, claimed_by_user_id, email
    into v_program, v_claimed, v_email
    from public.program_players
   where id = p_player_id
     and archived_at is not null
     and merged_into_id is null;

  -- Silent on a live row, a merged row or an unknown id, matching
  -- `update_program_player` and `archive_program_player`: clicking twice is
  -- ordinary, and a merged profile's history already lives on the survivor.
  if v_program is null then
    return;
  end if;

  if not public.is_program_staff(v_program) then
    raise exception 'not authorized to edit this roster' using errcode = '42501';
  end if;

  -- Archiving freed the address for the partial unique index
  -- (`program_players_email_key`), so a replacement may hold it by now. The
  -- index would refuse the update anyway; this turns a constraint-violation
  -- string into the same sentence `add_program_player` uses, naming who.
  if v_email is not null then
    select btrim(pp.first_name || ' ' || pp.last_name) into v_clash
      from public.program_players pp
     where pp.program_id = v_program
       and lower(pp.email) = lower(v_email)
       and pp.id <> p_player_id
       and pp.merged_into_id is null
       and pp.archived_at is null;

    if v_clash is not null then
      raise exception '% is already on this roster with that email', v_clash
        using errcode = '23505';
    end if;
  end if;

  -- A claimed profile gets its seat back, and the seat check runs BEFORE the
  -- row is touched so a full program leaves nothing half-restored. Why re-seat
  -- at all: `accept_program_invite` requires `claimed_by_user_id is null`, so
  -- a claimed profile can never be claimed again — restored but seatless it
  -- would be a dead state — and the person already consented to this program
  -- once. The check mirrors `accept_program_invite`, lock included, because
  -- two restores racing into the last seat would both read `used < seats`.
  -- It is an exception rather than a status: this is a staff action with a
  -- DialogProblem to land in, not a screen of its own.
  if v_claimed is not null then
    perform 1 from public.programs where id = v_program for update;

    if not exists (
      select 1 from public.program_members
       where program_id = v_program and user_id = v_claimed
    ) then
      select p.seats into v_seats
        from public.programs p where p.id = v_program;
      select count(*) into v_used
        from public.program_members pm where pm.program_id = v_program;

      if v_used >= coalesce(v_seats, 0) then
        raise exception 'no seats left — free one in Settings › Teams first'
          using errcode = '22023';
      end if;
    end if;
  end if;

  update public.program_players
     set archived_at = null, updated_at = now()
   where id = p_player_id;

  if v_claimed is not null then
    insert into public.program_members
      (program_id, user_id, role, upload_enabled, invited_by)
    values
      (v_program, v_claimed, 'player', false, v_uid)
    on conflict (program_id, user_id) do nothing;
  end if;

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (v_program, v_uid, 'player.restored', p_player_id,
          jsonb_build_object('had_account', v_claimed is not null));
end;
$$;

revoke all on function public.restore_program_player(uuid) from public;
revoke execute on function public.restore_program_player(uuid) from anon;
grant execute on function public.restore_program_player(uuid) to authenticated;

comment on function public.restore_program_player(uuid) is
  'Put an archived player back on the roster with their matches. Re-seats the profile if it was claimed; refuses when the program is full or the email is now held by a live profile.';

-- ---------------------------------------------------------------------------
-- The players who were removed
-- ---------------------------------------------------------------------------

-- What the Add player dialog checks the typed name and email against. An RPC
-- rather than a server-client select for the reason 20260822150700 gives: the
-- roster page reads pooled data through SECURITY DEFINER functions, and staff
-- visibility of an archived player's matches under `visible_match_ids()` is
-- not something the dialog should depend on. Gated the way
-- `program_roster_full` is: a caller who is not a member gets no rows.
create or replace function public.program_former_players(p_program_id uuid)
returns table (
  profile_id   uuid,
  display_name text,
  email        text,
  archived_at  timestamptz,
  match_count  bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pp.id,
    btrim(pp.first_name || ' ' || pp.last_name),
    pp.email,
    pp.archived_at,
    (
      select count(*)
        from public.matches m
       where m.program_id = pp.program_id
         and (m.player1_id = pp.id or m.player2_id = pp.id)
    )
  from public.program_players pp
  where pp.program_id = p_program_id
    and pp.archived_at is not null
    and pp.merged_into_id is null
    and p_program_id in (select public.user_program_ids())
  order by pp.archived_at desc;
$$;

revoke all on function public.program_former_players(uuid) from public;
revoke execute on function public.program_former_players(uuid) from anon;
grant execute on function public.program_former_players(uuid) to authenticated;

comment on function public.program_former_players(uuid) is
  'Archived, unmerged player profiles in a program with how many of its matches each still carries. Empty for a caller who is not a member.';

-- ---------------------------------------------------------------------------
-- The verb the restore writes
-- ---------------------------------------------------------------------------

-- The list is an allowlist on purpose. Copied from the live constraint, which
-- is ahead of this folder (it already carries 'event.deleted').
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
      'member.role_changed',
      'seats.changed',
      'member.account_deleted',
      'lineup.set',
      'ownership.transferred',
      'event.deleted',
      'player.restored'
    ])
  );
