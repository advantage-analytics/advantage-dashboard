-- Self review, step 2 (docs/plans/advantage-review.md): a player fixes who won
-- a point and how it ended on their own match, a team's owner and coaches on
-- their players' matches (D4), and a Verified match locks (D1).
--
-- Storage is the label console's own tables. A session gains a `kind`:
-- 'analyst' (every existing row, the console's) or 'self', one per match,
-- shared by everyone allowed to fix it. A self session's label_points are
-- seeded from the PUBLISHED points (not the vendor file, so SwingVision
-- matches work too), each joined back to its point by `point_id`, with the
-- reading as it stood in `seed`. Status is measured against the seed, so
-- Reset is "write the seed back" and an analyst review later can start from
-- the player's rows.
--
-- Saving patches points in place: `won_by_player1` and `result_type` only,
-- then the same two stats functions Mark complete runs. Point ids never
-- change, so bookmarks stay. Scores, game structure, shots, stroke and spin
-- are never written, and nothing here touches `verified`.
--
-- Every write and read goes through three SECURITY DEFINER functions
-- (`self_review_state`, `self_review_save`, `can_fix_match_points`); the
-- label tables keep their admin-only policies and SELECT-only grant.
--
-- The lock: `matches_guard_verification` now also refuses a client change to
-- a Verified match's score, result and player names, and two new triggers
-- refuse any client write to its points and shots (bar the `saved` flag).
-- The service role (the console's publish, Reopen) passes, as it does
-- through step 0's guard. Because the definer functions run under the
-- caller's JWT, the guards bind them too.
--
-- Deletion: a label session blocks deleting its match and the account
-- (`admin_claim_match_storage_purge`, `prepare_my_account_deletion`,
-- `label_sessions.match_id ON DELETE RESTRICT`). That protection is for
-- hand-labelled work, so both functions now count analyst sessions only, and
-- a match's self session is deleted with the match.

-- ── Columns ──────────────────────────────────────────────────────────────────

alter table public.label_sessions
  add column kind text not null default 'analyst'
    check (kind in ('analyst', 'self'));

-- A self session has no vendor file and no derivation behind it.
alter table public.label_sessions
  alter column results_object_key drop not null,
  alter column derivation_version drop not null,
  add constraint label_sessions_analyst_source check (
    kind = 'self'
    or (results_object_key is not null and derivation_version is not null)
  );

create unique index label_sessions_one_self_per_match
  on public.label_sessions (match_id) where kind = 'self';

alter table public.label_points
  -- The published point a self row fixes. Set null when the point is
  -- replaced (an analyst publish or a rebuild): the row and its seed stay.
  add column point_id uuid references public.points (id) on delete set null,
  -- Forced or unforced, when `ending` is 'error'. The console writes every
  -- error as unforced and leaves this null.
  add column error_kind text check (error_kind in ('forced', 'unforced')),
  -- The stroke the ending names ("Backhand winner"); null for a serve ending
  -- or when the reading named none.
  add column last_stroke text
    check (last_stroke in ('forehand', 'backhand', 'volley', 'overhead')),
  add column edited_by uuid references public.users (id) on delete set null,
  add column edited_at timestamptz;

create unique index label_points_one_row_per_point
  on public.label_points (session_id, point_id) where point_id is not null;
create index label_points_point_id on public.label_points (point_id)
  where point_id is not null;

-- ── Who may fix ──────────────────────────────────────────────────────────────

-- A personal match: the person who recorded it. A team match: the team's
-- owner and coaches (D4) — staff and players read only. Nobody, on a
-- Verified match (D1).
create or replace function public.can_fix_match_points(p_match_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select not m.verified
       and case
             when m.program_id is null then m.created_by = (select auth.uid())
             else coalesce(
               public.user_program_role(m.program_id) in ('owner', 'coach'),
               false)
           end
      from public.matches m
     where m.id = p_match_id
  ), false);
$$;

revoke execute on function public.can_fix_match_points(uuid) from public, anon;
grant execute on function public.can_fix_match_points(uuid) to authenticated;

-- ── Reading a point back to the label vocabulary ─────────────────────────────

-- points.result_type → (ending, error_kind, last_stroke). Mirrors
-- `labelEnding` (seed.ts) plus the forced/unforced split it collapses.
create or replace function public.self_review_reading(p_result_type text)
returns table (ending text, error_kind text, last_stroke text)
language sql
immutable
set search_path = ''
as $$
  select
    case
      when p_result_type = 'Ace' then 'ace'
      when p_result_type = 'Double Fault' then 'double_fault'
      when p_result_type = 'Service Winner' then 'service_winner'
      when p_result_type ~* 'winner$' then 'winner'
      when p_result_type ~* 'error$' then 'error'
    end,
    case
      when p_result_type ~* 'unforced error$' then 'unforced'
      when p_result_type ~* 'forced error$' then 'forced'
    end,
    case
      when p_result_type in ('Ace', 'Double Fault', 'Service Winner') then null
      when p_result_type ~* '^forehand ' then 'forehand'
      when p_result_type ~* '^backhand ' then 'backhand'
      when p_result_type ~* '^volley ' then 'volley'
      when p_result_type ~* '^overhead ' then 'overhead'
    end;
$$;

-- The way back: (ending, error_kind, last_stroke) → points.result_type, in
-- the spelling `calculate_match_stats` counts ("Forehand Unforced Error").
create or replace function public.self_review_result_type(
  p_ending text, p_error_kind text, p_last_stroke text
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case p_ending
    when 'ace' then 'Ace'
    when 'double_fault' then 'Double Fault'
    when 'service_winner' then 'Service Winner'
    when 'winner' then
      coalesce(initcap(p_last_stroke) || ' ', '') || 'Winner'
    when 'error' then
      coalesce(initcap(p_last_stroke) || ' ', '')
        || case p_error_kind when 'forced' then 'Forced Error'
                             else 'Unforced Error' end
  end;
$$;

revoke execute on function public.self_review_reading(text) from public, anon;
revoke execute on function public.self_review_result_type(text, text, text)
  from public, anon;

-- ── State ────────────────────────────────────────────────────────────────────

-- What the report needs: whether the viewer may fix, and every point a self
-- review changed, with its original reading and who changed it. Anyone who can
-- see the match reads it (staff and team players see "Edited by Coach …").
-- Unchanged rows are left out; the client draws the point's own reading.
create or replace function public.self_review_state(p_match_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program uuid;
begin
  if not exists (
    select 1 from public.visible_match_ids() v where v = p_match_id
  ) then
    raise exception 'Match not found' using errcode = 'P0002';
  end if;
  select m.program_id into v_program from public.matches m
   where m.id = p_match_id;

  return jsonb_build_object(
    'can_fix', public.can_fix_match_points(p_match_id),
    'edits', coalesce((
      select jsonb_agg(jsonb_build_object(
               'point_id', lp.point_id,
               'winner', lp.winner,
               'ending', lp.ending,
               'error_kind', lp.error_kind,
               'last_stroke', lp.last_stroke,
               'seed', lp.seed,
               'edited_by', lp.edited_by,
               'edited_at', lp.edited_at
             ) order by lp.point_index)
        from public.label_sessions s
        join public.label_points lp on lp.session_id = s.id
       where s.match_id = p_match_id
         and s.kind = 'self'
         and lp.status = 'edited'
         and lp.point_id is not null
    ), '[]'::jsonb),
    'editors', coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', u.id,
               'first_name', u.first_name,
               'last_name', u.last_name,
               'role', case when v_program is null then null
                            else (select pm.role from public.program_members pm
                                   where pm.program_id = v_program
                                     and pm.user_id = u.id) end
             ))
        from public.users u
       where u.id in (
         select lp.edited_by
           from public.label_sessions s
           join public.label_points lp on lp.session_id = s.id
          where s.match_id = p_match_id and s.kind = 'self'
            and lp.status = 'edited' and lp.point_id is not null
       )
    ), '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.self_review_state(uuid) from public, anon;
grant execute on function public.self_review_state(uuid) to authenticated;

-- ── Save ─────────────────────────────────────────────────────────────────────

-- p_fixes: a JSON array, one object per point the editor touched:
--   { "point_id": uuid, "reset": true }
--   { "point_id": uuid, "winner": "p1"|"p2",
--     "ending": "winner"|"error"|"ace"|"double_fault"|"service_winner",
--     "error_kind": "forced"|"unforced"|null,
--     "last_stroke": "forehand"|"backhand"|"volley"|"overhead"|null }
-- A fix equal to the seed is the same as a reset. Returns
-- { "edited": <points now edited on the match>, "changed": <points this save
-- rewrote> }.
create or replace function public.self_review_save(
  p_match_id uuid, p_fixes jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session uuid;
  v_fix jsonb;
  v_row public.label_points;
  v_server text;
  v_winner text;
  v_ending text;
  v_kind text;
  v_stroke text;
  v_status text;
  v_changed int := 0;
  v_edited int;
begin
  if not public.can_fix_match_points(p_match_id) then
    raise exception 'You can''t fix the points on this match'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_fixes) is distinct from 'array' then
    raise exception 'Fixes must be a list' using errcode = '22023';
  end if;
  -- The server action's cap, held here too: the function is callable directly.
  if jsonb_array_length(p_fixes) > 600 then
    raise exception 'That''s too many fixes for one save' using errcode = '22023';
  end if;

  -- One self session per match, seeded once from the published points.
  insert into public.label_sessions (match_id, kind, labeller, status)
  values (p_match_id, 'self', (select auth.uid()), 'labelling')
  on conflict (match_id) where kind = 'self' do nothing;

  select s.id into v_session
    from public.label_sessions s
   where s.match_id = p_match_id and s.kind = 'self'
   for update;

  insert into public.label_points (
    session_id, point_id, point_index, vendor_rally_ids, set_number,
    game_number, server, winner, ending, ended_by, error_kind, last_stroke,
    status, seed, game_type
  )
  select v_session, p.id, p.point_number, '{}', p.set_number, p.game_number,
         case when p.server_is_player1 then 'p1' else 'p2' end,
         case when p.won_by_player1 then 'p1' else 'p2' end,
         r.ending,
         case
           when r.ending in ('error', 'double_fault')
             then case when p.won_by_player1 then 'p2' else 'p1' end
           when r.ending is not null
             then case when p.won_by_player1 then 'p1' else 'p2' end
         end,
         r.error_kind, r.last_stroke, 'unchanged',
         jsonb_build_object(
           'winner', case when p.won_by_player1 then 'p1' else 'p2' end,
           'ending', r.ending,
           'error_kind', r.error_kind,
           'last_stroke', r.last_stroke,
           'result_type', p.result_type
         ),
         'game'
    from public.points p
    cross join lateral public.self_review_reading(p.result_type) r
   where p.match_id = p_match_id
     and not exists (
       select 1 from public.label_points lp
        where lp.session_id = v_session and lp.point_id = p.id
     );

  for v_fix in select * from jsonb_array_elements(p_fixes) loop
    select lp.* into v_row
      from public.label_points lp
      join public.points p on p.id = lp.point_id and p.match_id = p_match_id
     where lp.session_id = v_session
       and lp.point_id = (v_fix ->> 'point_id')::uuid;
    if v_row.id is null then
      raise exception 'Point % is not on this match', v_fix ->> 'point_id'
        using errcode = '22023';
    end if;
    v_server := v_row.server;

    if coalesce((v_fix ->> 'reset')::boolean, false) then
      v_winner := v_row.seed ->> 'winner';
      v_ending := v_row.seed ->> 'ending';
      v_kind := v_row.seed ->> 'error_kind';
      v_stroke := v_row.seed ->> 'last_stroke';
    else
      v_winner := v_fix ->> 'winner';
      v_ending := v_fix ->> 'ending';
      v_kind := case when v_ending = 'error' then v_fix ->> 'error_kind' end;
      v_stroke := case when v_ending in ('winner', 'error')
                       then v_fix ->> 'last_stroke' end;
      if v_winner is null or v_winner not in ('p1', 'p2') then
        raise exception 'Who won the point?' using errcode = '22023';
      end if;
      if v_ending is null or v_ending not in
           ('winner', 'error', 'ace', 'double_fault', 'service_winner') then
        raise exception 'How did the point end?' using errcode = '22023';
      end if;
      if v_ending = 'error' and (v_kind is null
           or v_kind not in ('forced', 'unforced')) then
        raise exception 'Forced or unforced?' using errcode = '22023';
      end if;
      if v_stroke is not null and v_stroke not in
           ('forehand', 'backhand', 'volley', 'overhead') then
        raise exception 'Unknown stroke' using errcode = '22023';
      end if;
      if v_ending in ('ace', 'service_winner') and v_winner <> v_server then
        raise exception 'An ace is won by the server' using errcode = '22023';
      end if;
      if v_ending = 'double_fault' and v_winner = v_server then
        raise exception 'A double fault is lost by the server'
          using errcode = '22023';
      end if;
    end if;

    v_status := case
      when v_winner is not distinct from v_row.seed ->> 'winner'
       and v_ending is not distinct from v_row.seed ->> 'ending'
       and v_kind is not distinct from v_row.seed ->> 'error_kind'
       and v_stroke is not distinct from v_row.seed ->> 'last_stroke'
      then 'unchanged' else 'edited' end;

    update public.label_points lp
       set winner = v_winner,
           ending = v_ending,
           ended_by = case
             when v_ending in ('error', 'double_fault')
               then case v_winner when 'p1' then 'p2' else 'p1' end
             when v_ending is not null then v_winner
           end,
           error_kind = v_kind,
           last_stroke = v_stroke,
           status = v_status,
           edited_by = case when v_status = 'edited'
                            then (select auth.uid()) end,
           edited_at = case when v_status = 'edited' then now() end
     where lp.id = v_row.id;

    update public.points p
       set won_by_player1 = (v_winner = 'p1'),
           result_type = case
             when v_status = 'unchanged' then v_row.seed ->> 'result_type'
             else public.self_review_result_type(v_ending, v_kind, v_stroke)
           end
     where p.id = v_row.point_id
       and (p.won_by_player1 is distinct from (v_winner = 'p1')
            or p.result_type is distinct from case
                 when v_status = 'unchanged' then v_row.seed ->> 'result_type'
                 else public.self_review_result_type(v_ending, v_kind, v_stroke)
               end);
    if found then
      v_changed := v_changed + 1;
    end if;
  end loop;

  if v_changed > 0 then
    perform public.calculate_match_stats(p_match_id);
    perform public.backfill_returns_in_and_net_points(p_match_id);
  end if;

  select count(*) into v_edited
    from public.label_points lp
   where lp.session_id = v_session
     and lp.status = 'edited'
     and lp.point_id is not null;

  return jsonb_build_object('edited', v_edited, 'changed', v_changed);
end;
$$;

revoke execute on function public.self_review_save(uuid, jsonb)
  from public, anon;
grant execute on function public.self_review_save(uuid, jsonb)
  to authenticated;

-- ── The lock (D1) ────────────────────────────────────────────────────────────

-- Step 0's guard, plus: on a Verified match a client may not change the
-- score, the result or the players' names. Date, tournament, round, court and
-- the rest stay editable.
--
-- The player ID columns are deliberately NOT locked here. Account deletion,
-- leaving a team and the staff merge (`release_my_account_from_programs`,
-- `merge_program_players`) re-point `player1_id` / `player2_id` from a login
-- to its roster profile under the caller's JWT. That is the same person, and
-- locking it would refuse those flows on every Verified team match. Who
-- played is locked where a person would change it: the Edit match route
-- refuses `player1_id` on a Verified match, and the names are locked here.
create or replace function public.matches_guard_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) not in ('authenticated', 'anon')
     and current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.verified
       or new.verified_at is not null
       or new.verified_by is not null
       or new.verified_review_id is not null then
      raise exception 'Only Advantage can verify a match'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.verified is distinct from old.verified
     or new.verified_at is distinct from old.verified_at
     or new.verified_by is distinct from old.verified_by
     or new.verified_review_id is distinct from old.verified_review_id then
    raise exception 'Only Advantage can verify a match'
      using errcode = '42501';
  end if;

  if old.verified and (
       new.score is distinct from old.score
       or new.result is distinct from old.result
       or new.stop_reason is distinct from old.stop_reason
       or new.format is distinct from old.format
       or new.player1_name is distinct from old.player1_name
       or new.player2_name is distinct from old.player2_name
       or new.initial_top_player_is_player1
            is distinct from old.initial_top_player_is_player1
     ) then
    raise exception 'This match is Verified by Advantage, so its score and players are locked'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Points and shots of a Verified match: no client insert, update or delete.
-- One exception: an update to a point that changes only `saved` (the old
-- bookmark flag, `set_point_saved`), which is not part of the reading.
-- SECURITY DEFINER so the lookup of the match sees it whatever the caller's
-- RLS; it decides only whether to raise.
create or replace function public.points_guard_verified_match()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match uuid;
begin
  if coalesce(
       nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
       ''
     ) not in ('authenticated', 'anon') then
    return coalesce(new, old);
  end if;

  if tg_table_name = 'points' then
    if tg_op = 'UPDATE'
       and (to_jsonb(new) - 'saved') = (to_jsonb(old) - 'saved') then
      return new;
    end if;
    v_match := coalesce(new.match_id, old.match_id);
    if tg_op = 'UPDATE' and new.match_id is distinct from old.match_id then
      if exists (select 1 from public.matches m
                  where m.id = old.match_id and m.verified) then
        raise exception 'This match is Verified by Advantage, so its points are locked'
          using errcode = '42501';
      end if;
    end if;
  else
    select p.match_id into v_match from public.points p
     where p.id = coalesce(new.point_id, old.point_id);
    if tg_op = 'UPDATE' and new.point_id is distinct from old.point_id then
      if exists (select 1 from public.points p
                   join public.matches m on m.id = p.match_id
                  where p.id = old.point_id and m.verified) then
        raise exception 'This match is Verified by Advantage, so its points are locked'
          using errcode = '42501';
      end if;
    end if;
  end if;

  if exists (select 1 from public.matches m
              where m.id = v_match and m.verified) then
    raise exception 'This match is Verified by Advantage, so its points are locked'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.points_guard_verified_match()
  from public, anon, authenticated;

create trigger zz_points_guard_verified_match
  before insert or update or delete on public.points
  for each row execute function public.points_guard_verified_match();

create trigger zz_shots_guard_verified_match
  before insert or update or delete on public.shots
  for each row execute function public.points_guard_verified_match();

-- ── Deletion ─────────────────────────────────────────────────────────────────

-- A match's self session goes with it, ahead of the RESTRICT foreign key.
create or replace function public.matches_drop_self_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.label_sessions s
   where s.match_id = old.id and s.kind = 'self';
  return old;
end;
$$;

revoke execute on function public.matches_drop_self_review()
  from public, anon, authenticated;

create trigger matches_drop_self_review
  before delete on public.matches
  for each row execute function public.matches_drop_self_review();

-- Only hand-labelled work protects a match from deletion.
create or replace function public.admin_claim_match_storage_purge(
  p_match_ids uuid[]
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.matches where id = any(p_match_ids) order by id for update;
  if exists(select 1 from public.admin_upload_submission_items where match_id = any(p_match_ids))
     or exists(select 1 from public.admin_analysis_reservations where match_id = any(p_match_ids))
     or exists(select 1 from public.admin_file_attempts where match_id = any(p_match_ids))
     or exists(select 1 from public.admin_video_attempts where match_id = any(p_match_ids))
     or exists(select 1 from public.label_sessions
                where match_id = any(p_match_ids) and kind = 'analyst') then
    return false;
  end if;
  insert into public.match_storage_purge_claims(match_id)
  select id from public.matches where id = any(p_match_ids)
  on conflict (match_id) do nothing;
  return true;
end;
$$;

create or replace function public.prepare_my_account_deletion()
returns table(program_id uuid, profile_id uuid, retained integer, repointed integer)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if exists (
    select 1 from public.label_sessions ls
      join public.matches m on m.id = ls.match_id
     where m.created_by = auth.uid()
       and m.program_id is null
       and ls.kind = 'analyst'
  ) then
    raise exception 'label-session-protected' using errcode = '22023';
  end if;
  if not public.admin_claim_actor_deletion(auth.uid()) then
    raise exception 'console-history-protected' using errcode = '22023';
  end if;
  return query select * from public.release_my_account_from_programs();
end;
$$;
