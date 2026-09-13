-- Merge two roster rows that are the same athlete.
--
-- The repair tool, and deliberately nothing more. The research brief surveyed
-- five roster products and found merge is always guarded, lossy and often
-- support-mediated — SportsEngine requires name and date of birth to match,
-- warns that data is lost, and routes household merges to support; one of its
-- own products forbids merging outright. So this is an escape hatch, not a
-- flow, and everything above it exists to stop a coach ever needing it: the
-- invitation targets a profile, and the email tripwire refuses the duplicate
-- before it exists.
--
-- ── This is the ONE place existing match data is written ────────────────────
-- `docs/ui-revamp-guardrails.md` §2 says "Existing match data. No backfills, no
-- mutations." That rule is aimed at silent bulk rewrites during a UI revamp,
-- and this is the opposite of one: a single explicit staff action, name
-- confirmed by typing, scoped to one program's rows carrying one id, touching
-- ONLY the attribution columns — never `score`, never `format`, never
-- `program_id` or `event_entry_id`, and nothing under `match_stats`, `points`
-- or `shots`. The audit row records every match id it moved, so a mistake can
-- be undone by hand even though there is no undo button.
--
-- The exception was reviewed and accepted before this shipped. The guardrail
-- document records it.
--
-- ── "Stats recompute once" needs no job ─────────────────────────────────────
-- Every player-level aggregate in this app is computed at READ time in
-- TypeScript, and `match_stats` is keyed on `match_id` + `is_player1`, never on
-- a player id. So `calculate_match_stats` — which the guardrails say to stop
-- and ask about — is untouched and does not re-run. The next page load is the
-- whole of it.

-- ---------------------------------------------------------------------------
-- The name comparison, in one place
-- ---------------------------------------------------------------------------

-- Shared by the preview, the guard and the typed confirmation, so all three
-- agree about what "the same name" means. Case and internal whitespace are
-- noise; everything else is signal.
create or replace function public.normalized_person_name(p_first text, p_last text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p_first,'') || ' ' || coalesce(p_last,'')), '\s+', ' ', 'g'));
$$;

-- ---------------------------------------------------------------------------
-- Preview
-- ---------------------------------------------------------------------------

-- The dialog's numbers come from here rather than from the client counting
-- rows it can see. A coach approving "3 matches move" should be approving what
-- will actually happen, not what the browser managed to read.
create or replace function public.preview_program_player_merge(
  p_surviving_id uuid,
  p_absorbed_id  uuid
)
returns table (
  matches_moving  integer,
  entries_moving  integer,
  invites_moving  integer,
  surviving_name  text,
  absorbed_name   text,
  surviving_claimed boolean,
  absorbed_claimed  boolean,
  names_match     boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_program uuid;
  v_s public.program_players;
  v_a public.program_players;
begin
  if (select auth.uid()) is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  select * into v_s from public.program_players where id = p_surviving_id;
  if not found then
    raise exception 'that profile is not on this roster' using errcode = '22023';
  end if;

  select * into v_a from public.program_players where id = p_absorbed_id;
  if not found or v_a.program_id <> v_s.program_id then
    raise exception 'those two profiles are not on the same roster'
      using errcode = '22023';
  end if;

  v_program := v_s.program_id;
  if not public.is_program_staff(v_program) then
    raise exception 'not authorized to merge profiles on this program'
      using errcode = '42501';
  end if;

  return query
  select
    (select count(*)::int from public.matches m
      where m.program_id = v_program
        and (m.player1_id = p_absorbed_id or m.player2_id = p_absorbed_id)),
    (select count(*)::int from public.program_event_entries e
      where e.program_id = v_program and p_absorbed_id = any(e.player_user_ids)),
    (select count(*)::int from public.program_invites i
      where i.player_id = p_absorbed_id and i.accepted_at is null),
    btrim(v_s.first_name || ' ' || v_s.last_name),
    btrim(v_a.first_name || ' ' || v_a.last_name),
    v_s.claimed_by_user_id is not null,
    v_a.claimed_by_user_id is not null,
    public.normalized_person_name(v_s.first_name, v_s.last_name)
      = public.normalized_person_name(v_a.first_name, v_a.last_name);
end;
$$;

-- ---------------------------------------------------------------------------
-- Merge
-- ---------------------------------------------------------------------------

create or replace function public.merge_program_players(
  p_surviving_id uuid,
  p_absorbed_id  uuid,
  -- Typed by the operator. Not a checkbox: the point is that merging requires
  -- reading both rows and agreeing they name one person.
  p_confirm_name text
)
returns table (matches_moved integer, entries_moved integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_program uuid;
  v_s public.program_players;
  v_a public.program_players;
  v_match_ids uuid[];
  v_matches integer := 0;
  v_entries integer := 0;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  if p_surviving_id = p_absorbed_id then
    raise exception 'those are the same profile' using errcode = '22023';
  end if;

  select * into v_s from public.program_players where id = p_surviving_id;
  if not found or v_s.merged_into_id is not null then
    raise exception 'the profile you are keeping is not on this roster'
      using errcode = '22023';
  end if;

  select * into v_a from public.program_players where id = p_absorbed_id;
  if not found or v_a.merged_into_id is not null then
    raise exception 'the profile you are merging is not on this roster'
      using errcode = '22023';
  end if;

  if v_a.program_id <> v_s.program_id then
    raise exception 'those two profiles are not on the same roster'
      using errcode = '22023';
  end if;

  v_program := v_s.program_id;

  if not public.is_program_staff(v_program) then
    raise exception 'not authorized to merge profiles on this program'
      using errcode = '42501';
  end if;

  -- The guard that makes this un-abusable. Without it, a coach could fold a
  -- teammate's season into somebody else's row; with it, both rows have to
  -- carry the same name and the operator has to type it.
  if public.normalized_person_name(v_s.first_name, v_s.last_name)
     is distinct from public.normalized_person_name(v_a.first_name, v_a.last_name)
  then
    raise exception
      'these two profiles have different names — merge is for duplicates, not for combining two people'
      using errcode = '22023';
  end if;

  if public.normalized_person_name(p_confirm_name, '')
     is distinct from public.normalized_person_name(v_s.first_name, v_s.last_name)
  then
    raise exception 'type the player''s name exactly to confirm the merge'
      using errcode = '22023';
  end if;

  -- Two accounts is a membership problem, not a duplicate. Collapsing them
  -- would silently take somebody's login away.
  if v_s.claimed_by_user_id is not null and v_a.claimed_by_user_id is not null then
    raise exception
      'both of these have an account — removing one is a roster change, not a merge'
      using errcode = '22023';
  end if;

  -- Recorded BEFORE the update, so the audit row names the rows that moved
  -- rather than the rows that already had the surviving id.
  select coalesce(array_agg(m.id), '{}') into v_match_ids
    from public.matches m
   where m.program_id = v_program
     and (m.player1_id = p_absorbed_id or m.player2_id = p_absorbed_id);

  update public.matches set player1_id = p_surviving_id
   where program_id = v_program and player1_id = p_absorbed_id;

  update public.matches set player2_id = p_surviving_id
   where program_id = v_program and player2_id = p_absorbed_id;

  -- Counted from the id set gathered above, not from `row_count`: a row_count
  -- after the first update is only the matches this athlete played as player
  -- one, and reporting that as "matches moved" would understate the change the
  -- coach just approved.
  v_matches := coalesce(array_length(v_match_ids, 1), 0);

  -- Lineups carry ids in a parallel array beside their labels. The labels are
  -- snapshots and stay exactly as they were: a historical lineup has to read
  -- correctly after a roster change, which is why they were never a join.
  update public.program_event_entries
     set player_user_ids = array_replace(player_user_ids, p_absorbed_id, p_surviving_id)
   where program_id = v_program
     and p_absorbed_id = any(player_user_ids);
  get diagnostics v_entries = row_count;

  update public.program_invites
     set player_id = p_surviving_id
   where player_id = p_absorbed_id and accepted_at is null;

  -- The survivor takes whatever it was missing, including the claim when only
  -- the absorbed row had one — the "coach added a duplicate AFTER the player
  -- signed up" case. The person keeps their login either way.
  update public.program_players s
     set email              = coalesce(s.email, a.email),
         class_year         = coalesce(s.class_year, a.class_year),
         lineup_spot        = coalesce(s.lineup_spot, a.lineup_spot),
         claimed_by_user_id = coalesce(s.claimed_by_user_id, a.claimed_by_user_id),
         claimed_at         = coalesce(s.claimed_at, a.claimed_at),
         updated_at         = now()
    from public.program_players a
   where s.id = p_surviving_id and a.id = p_absorbed_id;

  -- Retained, never deleted: the audit row points at it, and `matches` has no
  -- foreign key to catch a dangling id. Its email and lineup spot are released
  -- so the partial unique indexes stop counting it.
  update public.program_players
     set merged_into_id     = p_surviving_id,
         merged_at          = now(),
         claimed_by_user_id = null,
         claimed_at         = null,
         email              = null,
         lineup_spot        = null,
         updated_at         = now()
   where id = p_absorbed_id;

  insert into public.program_audit_log
    (program_id, actor_user_id, action, subject_id, details)
  values
    (v_program, v_uid, 'player.merged', p_surviving_id,
     jsonb_build_object(
       'absorbed', p_absorbed_id,
       'name', btrim(v_s.first_name || ' ' || v_s.last_name),
       'matches_moved', v_matches,
       'entries_moved', v_entries,
       -- The ids are what makes a manual reversal possible.
       'match_ids', to_jsonb(v_match_ids)
     ));

  return query select v_matches, v_entries;
end;
$$;

revoke all on function public.preview_program_player_merge(uuid, uuid) from public;
revoke execute on function public.preview_program_player_merge(uuid, uuid) from anon;
grant execute on function public.preview_program_player_merge(uuid, uuid) to authenticated;

revoke all on function public.merge_program_players(uuid, uuid, text) from public;
revoke execute on function public.merge_program_players(uuid, uuid, text) from anon;
grant execute on function public.merge_program_players(uuid, uuid, text) to authenticated;

revoke all on function public.normalized_person_name(text, text) from public;
grant execute on function public.normalized_person_name(text, text) to authenticated;

comment on function public.merge_program_players(uuid, uuid, text) is
  'Fold a duplicate roster row into the one that survives. Staff only, both names must match and be typed to confirm, refuses when both are claimed, audited with the moved match ids. No undo.';
