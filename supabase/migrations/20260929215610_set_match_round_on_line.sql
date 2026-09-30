-- Change the round of a match that is already on a tournament line, from the
-- Edit Match dialog.
--
-- `attach_match_to_event_line` (20260913120000) sets `round` on the way onto
-- a line and the two detaches (20260929210705, 20260929210741, then
-- 20260929213016) clear it on the way off. In between there was no path at
-- all: `patch-match.ts` refuses `round` on a linked match (E1 — the event
-- owns it), so a match filed under the wrong round could only be fixed by
-- detaching and re-attaching, which writes two audit rows for one correction
-- and re-derives `date`, `match_type` and `court_type` from the event on the
-- way back. This adds the one-column edit on the attach exception's terms:
-- one explicit action by the match's own uploader, who must also run that
-- program's schedule, routed through one checked function that writes the
-- audit row.
--
-- What changes on the match: `round` only. The line, `tournament_name`,
-- `date`, `match_type`, `court_type`, `score`, `format`, `player1_id`,
-- `program_id`, `match_stats`, `points` and `shots` are never written here.
-- Tournament lines only — a dual line's round *is* its slot, set by
-- `attach_match_to_event_line` from `program_event_entries.slot`, and the
-- line decides it.
--
-- `guard_schedule_result` (trigger `guard_schedule_match`, BEFORE UPDATE OF
-- `round`) still refuses a round that already holds a saved outcome, and
-- `guard_reserved_schedule_result` still refuses one the admin console has
-- reserved — both fire on this UPDATE and neither is bypassed.
--
-- The round's spelling is the caller's: like `attach_match_to_event_line`,
-- this trims and compares verbatim (`is not distinct from`), and the app
-- settles a code (`SF`, `R16`, …) in `src/lib/matches/round-options.ts`
-- before calling. Normalising here would make the two functions disagree on
-- what "taken" means.
--
-- `matches_block_client_regraft` below is the live body, read with
-- pg_get_functiondef on 2026-09-29, plus the `round` branch; the trigger is
-- re-created with `round` added to its column list, which is what makes the
-- branch fire at all. `attach_match_to_event_line` and
-- `program_audit_log_action_check` were read live the same day and mirrored.
-- The migrations folder lags the database. Reviewed exception recorded in
-- docs/ui-revamp-guardrails.md.

-- 1. The audit verb. The live allowlist as of 2026-09-29, plus
--    'match.round_changed'.
alter table public.program_audit_log
  drop constraint if exists program_audit_log_action_check;
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
    'match.detached', 'match.round_changed'
  ]));

-- 2. The regraft guard: a client UPDATE that changes `round` while the match
--    stays on a line is now refused unless `advantage.round_match_id` names
--    this match and the caller runs the program's schedule. The branch is
--    keyed on the match staying on a line — `old` and `new` both hold an
--    entry — so the attach (no line → a line, sets `round`) and both
--    detaches (a line → no line, clear `round`) pass exactly as before, and a
--    round change on an unlinked match is not the trigger's business. Every
--    other branch is unchanged from the live body.
create or replace function public.matches_block_client_regraft()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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

    if public.match_is_upload_shaped(new.source_provider, new.analysis_method) then
      v_refusal := public.upload_eligibility_refusal(
        new.program_id, new.player1_id, new.created_by, (select auth.uid()));
      if v_refusal is not null then
        raise exception '%', v_refusal using errcode = '42501';
      end if;
    end if;

    return new;
  end if;

  if new.program_id is distinct from old.program_id then
    raise exception
      'which program and line a match belongs to is set when it is created'
      using errcode = '42501';
  end if;

  if new.event_entry_id is distinct from old.event_entry_id then
    if old.event_entry_id is not null and new.event_entry_id is null then
      if not (
        (
          coalesce(current_setting('advantage.detach_event_id', true), '') <> ''
          and exists (
            select 1 from public.program_event_entries e
             where e.id = old.event_entry_id
               and e.event_id::text = current_setting('advantage.detach_event_id', true)
          )
        )
        or (
          coalesce(current_setting('advantage.detach_match_id', true), '') = old.id::text
          and old.program_id is not null
          and public.can_manage_program_schedule(old.program_id)
        )
      ) then
        raise exception
          'which program and line a match belongs to is set when it is created'
          using errcode = '42501';
      end if;
    elsif coalesce(current_setting('advantage.attach_match_id', true), '') <> old.id::text
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

  if new.round is distinct from old.round
     and old.event_entry_id is not null
     and new.event_entry_id is not null then
    -- The round of a match on a line, on exactly one path, marked
    -- transaction-locally by match id: `public.set_match_round_on_line`,
    -- which holds the ownership check, refuses dual lines and taken rounds,
    -- and writes the audit row. A bare client UPDATE would skip all of it.
    -- Reaching here means the match stays on its line (a line → line move
    -- was refused above); the attach sets `round` from no line and the
    -- detaches clear it to no line, and neither enters this branch.
    if coalesce(current_setting('advantage.round_match_id', true), '') <> old.id::text
       or old.program_id is null
       or not public.can_manage_program_schedule(old.program_id) then
      raise exception
        'the round of a match on a scheduled line is changed from the Edit Match dialog'
        using errcode = '42501';
    end if;
  end if;

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
$$;

-- 3. The trigger, with `round` in its column list. Same name, timing and
--    level as live; the function above cannot see a round change without it.
drop trigger if exists matches_block_client_regraft on public.matches;
create trigger matches_block_client_regraft
  before insert or update of program_id, event_entry_id, player1_id,
    source_provider, analysis_method, round
  on public.matches
  for each row execute function public.matches_block_client_regraft();

-- 4. The one way to change the round of a match on a line — the regraft
--    guard refuses it from anywhere else. Mirrors `attach_match_to_event_line`:
--    same auth checks and error codes, same lock order (match, then line),
--    same marker set/clear pattern, same audit row shape.
create or replace function public.set_match_round_on_line(
  p_match_id uuid,
  p_round text
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
begin
  if v_uid is null then
    raise exception 'Sign in to change a match''s round.' using errcode = '42501';
  end if;

  select id, program_id, event_entry_id, created_by, round
    into v_match
    from public.matches
   where id = p_match_id
   for update;
  if not found or v_match.created_by is distinct from v_uid then
    raise exception 'Only the person who added this match can change its round.'
      using errcode = '42501';
  end if;
  if v_match.event_entry_id is null then
    raise exception 'This match is not on an event.' using errcode = '23514';
  end if;
  if not public.can_manage_program_schedule(v_match.program_id) then
    raise exception 'Only people who run the schedule can change a match''s round.'
      using errcode = '42501';
  end if;

  -- Lock the line so a concurrent outcome or attach serializes behind this.
  select id, event_id, program_id, slot
    into v_entry
    from public.program_event_entries
   where id = v_match.event_entry_id
   for update;
  if not found then
    raise exception 'That line is no longer on the schedule.' using errcode = '23514';
  end if;

  select id, kind, name
    into v_event
    from public.program_events
   where id = v_entry.event_id;

  if v_event.kind = 'dual' then
    raise exception 'A dual line''s round is its slot.' using errcode = '23514';
  end if;

  v_round := nullif(btrim(coalesce(p_round, '')), '');
  if v_round is null then
    raise exception 'Set the round.' using errcode = '23514';
  end if;
  if v_round is not distinct from v_match.round then
    -- Nothing to change: no write, no audit row.
    return jsonb_build_object(
      'match_id', v_match.id,
      'entry_id', v_entry.id,
      'event_id', v_event.id,
      'event_name', v_event.name,
      'event_kind', v_event.kind,
      'from', v_match.round,
      'round', v_round
    );
  end if;
  if exists (
    select 1 from public.matches m
     where m.event_entry_id = v_entry.id
       and m.id <> v_match.id
       and m.round is not distinct from v_round
  ) then
    raise exception 'That round already has a result.' using errcode = '23514';
  end if;
  -- A saved outcome on the new round is refused by `guard_schedule_result`
  -- on the UPDATE below (23514), as it is for the attach.

  -- The regraft guard re-checks the transition and requires this marker, so
  -- this function is the only way to change the round of a match on a line.
  -- Clearing the marker right after keeps anything else in the transaction
  -- from riding on it.
  perform set_config('advantage.round_match_id', v_match.id::text, true);
  update public.matches
     set round = v_round
   where id = v_match.id;
  perform set_config('advantage.round_match_id', '', true);

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    v_match.program_id, v_uid, 'match.round_changed', v_match.id,
    jsonb_build_object(
      'match_id', v_match.id,
      'entry_id', v_entry.id,
      'event_id', v_event.id,
      'from', v_match.round,
      'to', v_round
    )
  );

  return jsonb_build_object(
    'match_id', v_match.id,
    'entry_id', v_entry.id,
    'event_id', v_event.id,
    'event_name', v_event.name,
    'event_kind', v_event.kind,
    'from', v_match.round,
    'round', v_round
  );
end;
$function$;

revoke all on function public.set_match_round_on_line(uuid, text) from public;
revoke execute on function public.set_match_round_on_line(uuid, text) from anon;
grant execute on function public.set_match_round_on_line(uuid, text) to authenticated;
