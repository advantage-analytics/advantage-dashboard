-- Take a match off a scheduled line, from the Edit Match dialog.
--
-- `attach_match_to_event_line` (20260913120000) opened the one transition
-- no line → a line; the reverse had no path at all. A match filed on the
-- wrong dual line, or on a tournament it did not belong to, could only be
-- fixed by deleting it — which loses the video analysis — or by deleting the
-- whole event, which detaches every match on it (20260929210705). This adds
-- the single-match inverse on the attach exception's terms: one explicit
-- action by the match's own uploader, who must also run that program's
-- schedule, routed through one checked function that writes the audit row.
--
-- What changes on the match: `event_entry_id` and `tournament_name` only —
-- the same two columns the event-delete detach clears. `round`, `date`,
-- `match_type` and `court_type` stay: they describe the match, not the line.
-- `score`, `format`, `player1_id`, `program_id`, `match_stats`, `points` and
-- `shots` are never written here.
--
-- `guard_schedule_result` and `guard_reserved_schedule_result` both fire on
-- this UPDATE and both return early when the new `event_entry_id` is NULL, so
-- a saved outcome on the line — which they refuse a match *onto* — does not
-- block taking the match *off*, and the outcome row itself is untouched.
--
-- `matches_block_client_regraft` below is T1's body from
-- 20260929210705_event_delete_detaches_under_client.sql, plus the
-- `advantage.detach_match_id` branch; `attach_match_to_event_line` was read
-- live with pg_get_functiondef on 2026-09-29 and mirrored. The migrations
-- folder lags the database. Reviewed exception recorded in
-- docs/ui-revamp-guardrails.md.

-- 1. The audit verb. The live allowlist as of 2026-09-29, plus
--    'match.detached'.
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
    'match.detached'
  ]));

-- 2. The regraft guard: an entry → NULL move is now also accepted while
--    `advantage.detach_match_id` names this match and the caller runs the
--    program's schedule. The event-delete branch and every other refusal are
--    unchanged from T1.
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
      -- Off a line, on exactly two paths, each marked transaction-locally:
      --   * `schedule_private.guard_event_delete` detaching the matches of
      --     the event being deleted, marked by event id. The entry still
      --     exists at that point, so its event can be looked up.
      --   * `public.detach_match_from_event_line` taking one match off its
      --     line, marked by match id, for someone who runs the program's
      --     schedule. That function holds the ownership check and writes
      --     the audit row; a bare client UPDATE would skip both.
      -- A bare client UPDATE, or one naming another event or match, is
      -- refused exactly as before.
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

-- 3. The one way off a line for a single match — the regraft guard refuses
--    the transition from anywhere else. Mirrors `attach_match_to_event_line`:
--    same auth checks and error codes, same marker set/clear pattern, same
--    audit row shape.
create or replace function public.detach_match_from_event_line(
  p_match_id uuid
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
begin
  if v_uid is null then
    raise exception 'Sign in to remove a match from an event.' using errcode = '42501';
  end if;

  select id, program_id, event_entry_id, created_by
    into v_match
    from public.matches
   where id = p_match_id
   for update;
  if not found or v_match.created_by is distinct from v_uid then
    raise exception 'Only the person who added this match can remove it from an event.'
      using errcode = '42501';
  end if;
  if v_match.event_entry_id is null then
    raise exception 'This match is not on an event.' using errcode = '23514';
  end if;
  if not public.can_manage_program_schedule(v_match.program_id) then
    raise exception 'Only people who run the schedule can remove a match from an event.'
      using errcode = '42501';
  end if;

  -- Lock the line so a concurrent outcome or attach serializes behind this.
  select id, event_id, program_id
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

  -- The regraft guard re-checks the transition and requires this marker, so
  -- this function is the only way off a line for one match. Clearing the
  -- marker right after keeps anything else in the transaction from riding
  -- on it.
  perform set_config('advantage.detach_match_id', v_match.id::text, true);
  update public.matches
     set event_entry_id = null,
         tournament_name = null
   where id = v_match.id;
  perform set_config('advantage.detach_match_id', '', true);

  insert into public.program_audit_log (program_id, actor_user_id, action, subject_id, details)
  values (
    v_match.program_id, v_uid, 'match.detached', v_match.id,
    jsonb_build_object(
      'match_id', v_match.id,
      'entry_id', v_entry.id,
      'event_id', v_event.id
    )
  );

  return jsonb_build_object(
    'match_id', v_match.id,
    'entry_id', v_entry.id,
    'event_id', v_event.id,
    'event_name', v_event.name,
    'event_kind', v_event.kind
  );
end;
$function$;

revoke all on function public.detach_match_from_event_line(uuid) from public;
revoke execute on function public.detach_match_from_event_line(uuid) from anon;
grant execute on function public.detach_match_from_event_line(uuid) to authenticated;
