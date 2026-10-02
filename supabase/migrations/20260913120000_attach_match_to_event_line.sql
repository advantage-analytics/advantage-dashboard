-- Attach a one-off team match to a scheduled line, from the Edit Match dialog.
--
-- Until now `matches_block_client_regraft` refused every UPDATE that moved
-- `event_entry_id`: where a match is filed was decided when it was created.
-- A coach who typed a dual result in as a one-off had no way to count it
-- toward the dual except deleting and re-entering it, which loses the video
-- analysis. This opens exactly one transition — no line → a line in the same
-- program, by someone who can run that program's schedule — and routes it
-- through one checked function that also writes the audit trail.
--
-- What does NOT change:
--   * program_id stays immutable, and a match already on a line cannot move
--     to another or leave it (taking a result off a line is Schedule's job).
--   * score, format, player1_id, match_stats, points and shots are never
--     written here. `guard_schedule_result` still runs on the update, so a
--     line with a saved outcome or legacy forfeit still refuses the match.
--
-- Based on the LIVE bodies read with pg_get_functiondef on 2026-09-13; the
-- migrations folder lags the database.

-- 1. The regraft guard: allow null → a line in the same program, for
--    schedule managers. Everything else in the function is unchanged.
create or replace function public.matches_block_client_regraft()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_is_client boolean := coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'role', ''
  ) in ('authenticated', 'anon');
  v_refusal text;
begin
  if not v_is_client then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.program_id is not null
       and new.program_id not in (select public.user_program_ids()) then
      raise exception 'a match can only be filed under a program you belong to'
        using errcode = '42501';
    end if;

    if new.event_entry_id is not null then
      if not public.can_manage_program_schedule(new.program_id) then
        raise exception 'only a program''s staff can attach a match to a scheduled line'
          using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.program_event_entries e
         where e.id = new.event_entry_id
           and e.program_id is not distinct from new.program_id
      ) then
        raise exception 'that line belongs to a different program'
          using errcode = '42501';
      end if;
    end if;

    if new.program_id is not null
       and new.player1_id is not null
       and not exists (
         select 1 from public.program_players pp
          where pp.id = new.player1_id
            and pp.program_id = new.program_id
       )
       and not exists (
         select 1 from public.program_members pm
          where pm.user_id = new.player1_id
            and pm.program_id = new.program_id
       ) then
      raise exception
        'that player is not on this program''s roster, so the match cannot be filed under it'
        using errcode = '42501';
    end if;

    -- T14: an upload-shaped row answers the upload contract as well. A
    -- hand-recorded score does not — see the file header.
    if public.match_is_upload_shaped(new.source_provider, new.analysis_method) then
      v_refusal := public.upload_eligibility_refusal(
        new.program_id, new.player1_id, new.created_by, (select auth.uid()));
      if v_refusal is not null then
        raise exception '%', v_refusal using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  -- UPDATE: the program never moves.
  if new.program_id is distinct from old.program_id then
    raise exception
      'which program and line a match belongs to is set when it is created'
      using errcode = '42501';
  end if;

  -- UPDATE: a line may be set exactly once — from none to a line in the same
  -- program, by someone who runs that program's schedule, and ONLY from inside
  -- `attach_match_to_event_line`. That function holds the checks this trigger
  -- cannot cheaply repeat (singles line, not forfeited, no other match on the
  -- line or round) and writes the audit row; a bare client UPDATE would skip
  -- both. It marks its own transaction with the match id before writing;
  -- PostgREST exposes no way for a client to set that. Moving between lines,
  -- or leaving one, stays refused.
  if new.event_entry_id is distinct from old.event_entry_id then
    if coalesce(current_setting('advantage.attach_match_id', true), '') <> old.id::text
       or old.event_entry_id is not null
       or new.event_entry_id is null
       or old.program_id is null
       or not public.can_manage_program_schedule(old.program_id)
       or not exists (
         select 1 from public.program_event_entries e
          where e.id = new.event_entry_id
            and e.program_id = old.program_id
       ) then
      raise exception
        'which program and line a match belongs to is set when it is created'
        using errcode = '42501';
    end if;
  end if;

  -- UPDATE: attribution may move, but only within the same roster. Guarded on
  -- an actual change so a write that restates the current value never fails.
  if new.player1_id is distinct from old.player1_id
     and new.program_id is not null
     and new.player1_id is not null
     and not exists (
       select 1 from public.program_players pp
        where pp.id = new.player1_id
          and pp.program_id = new.program_id
     )
     and not exists (
       select 1 from public.program_members pm
        where pm.user_id = new.player1_id
          and pm.program_id = new.program_id
     ) then
    raise exception
      'a match can only be re-attributed to someone on the same program''s roster'
      using errcode = '42501';
  end if;

  -- T14: turning a hand-recorded row into an upload is an upload. Guarded on
  -- the transition only, so a score correction or any other update to a row
  -- that is already an upload — or already manual — never meets this rule.
  if public.match_is_upload_shaped(new.source_provider, new.analysis_method)
     and not public.match_is_upload_shaped(old.source_provider, old.analysis_method) then
    v_refusal := public.upload_eligibility_refusal(
      new.program_id, new.player1_id, new.created_by, (select auth.uid()));
    if v_refusal is not null then
      raise exception '%', v_refusal using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;

-- 2. The audit verb. The live allowlist, plus 'match.attached'.
alter table public.program_audit_log
  drop constraint program_audit_log_action_check;
alter table public.program_audit_log
  add constraint program_audit_log_action_check check (action = any (array[
    'player.added', 'player.updated', 'player.archived', 'player.claimed',
    'player.merged', 'invite.created', 'invite.revoked', 'invite.accepted',
    'member.removed', 'member.role_changed', 'seats.changed',
    'member.account_deleted', 'lineup.set', 'ownership.transferred',
    'event.deleted', 'player.restored', 'match.attached'
  ]));

-- 3. The one way in — the regraft guard refuses the transition from anywhere
--    else. Checks everything the dialog shows as a disabled reason, so a stale
--    menu cannot attach what the database would now refuse.
create or replace function public.attach_match_to_event_line(
  p_match_id uuid,
  p_entry_id uuid
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_match record;
  v_entry record;
  v_event record;
  v_round text;
  v_date timestamptz;
begin
  if v_uid is null then
    raise exception 'Sign in to add a match to an event.' using errcode = '42501';
  end if;

  select id, program_id, event_entry_id, created_by, round, date, court_type
    into v_match
    from public.matches
   where id = p_match_id
   for update;
  if not found or v_match.created_by is distinct from v_uid then
    raise exception 'Only the person who added this match can add it to an event.'
      using errcode = '42501';
  end if;
  if v_match.program_id is null then
    raise exception 'Only a team match can be added to an event.' using errcode = '23514';
  end if;
  if v_match.event_entry_id is not null then
    raise exception 'This match is already on an event.' using errcode = '23514';
  end if;
  if not public.can_manage_program_schedule(v_match.program_id) then
    raise exception 'Only people who run the schedule can add a match to an event.'
      using errcode = '42501';
  end if;

  select id, event_id, program_id, discipline, slot, forfeit
    into v_entry
    from public.program_event_entries
   where id = p_entry_id
   for update;
  if not found or v_entry.program_id is distinct from v_match.program_id then
    raise exception 'That line is not on this team''s schedule.' using errcode = '42501';
  end if;
  if v_entry.discipline <> 'singles' then
    raise exception 'A singles match can only go on a singles line.' using errcode = '23514';
  end if;
  if v_entry.forfeit is not null then
    raise exception 'That line was forfeited.' using errcode = '23514';
  end if;

  select id, kind, name, starts_on, ends_on, surface
    into v_event
    from public.program_events
   where id = v_entry.event_id;

  if v_event.kind = 'dual' then
    if exists (select 1 from public.matches m where m.event_entry_id = v_entry.id) then
      raise exception 'That line already has a result.' using errcode = '23514';
    end if;
    v_round := v_entry.slot;
    v_date := (v_event.starts_on + time '12:00') at time zone 'UTC';
  else
    v_round := nullif(btrim(coalesce(v_match.round, '')), '');
    if v_round is null then
      raise exception 'Set the round before adding this match to a tournament.'
        using errcode = '23514';
    end if;
    if exists (
      select 1 from public.matches m
       where m.event_entry_id = v_entry.id and m.round is not distinct from v_round
    ) then
      raise exception 'That round already has a result.' using errcode = '23514';
    end if;
    v_date := case
      when (v_match.date at time zone 'UTC')::date between v_event.starts_on and v_event.ends_on
        then v_match.date
      else (v_event.starts_on + time '12:00') at time zone 'UTC'
    end;
  end if;

  -- The triggers run here: the regraft guard re-checks the transition (and
  -- requires this marker, so this function is the only way in) and
  -- guard_schedule_result refuses a line with a saved outcome.
  perform set_config('advantage.attach_match_id', v_match.id::text, true);
  update public.matches
     set event_entry_id = v_entry.id,
         tournament_name = v_event.name,
         round = v_round,
         date = v_date,
         match_type = case when v_event.kind = 'dual' then 'Dual Match' else 'Tournament' end,
         court_type = coalesce(v_event.surface, v_match.court_type)
   where id = v_match.id;
  perform set_config('advantage.attach_match_id', '', true);

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    v_match.program_id, v_uid, 'match.attached', v_match.id,
    jsonb_build_object(
      'match_id', v_match.id,
      'entry_id', v_entry.id,
      'event_id', v_event.id,
      'slot', v_entry.slot,
      'round', v_round
    )
  );

  return jsonb_build_object(
    'match_id', v_match.id,
    'entry_id', v_entry.id,
    'event_id', v_event.id,
    'event_name', v_event.name,
    'event_kind', v_event.kind,
    'slot', v_entry.slot,
    'round', v_round
  );
end;
$function$;

revoke all on function public.attach_match_to_event_line(uuid, uuid) from public;
revoke execute on function public.attach_match_to_event_line(uuid, uuid) from anon;
grant execute on function public.attach_match_to_event_line(uuid, uuid) to authenticated;
