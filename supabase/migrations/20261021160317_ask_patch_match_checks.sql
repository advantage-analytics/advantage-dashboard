-- ask_patch_match (20261021143857) trusted its caller to have run
-- normalizeMatchPatch(): the connector's update_match tool does, but the
-- function is on the write guard's allowlist, so a connector token can POST
-- /rpc/ask_patch_match directly with any p_update. The row reach was always
-- the caller's own (created_by = auth.uid()), so nothing crossed an account;
-- what a direct call could do was overwrite the five event-owned fields on a
-- match filed under a scheduled line, write free text into the two style
-- columns, or exceed the dialog's lengths; and a school written beside a
-- directory program tripped matches_opponent_program_or_school_check. The
-- same rules now hold in the function body, so the tool and a direct call
-- are held to one contract.

create or replace function public.ask_patch_match(p_match_id uuid, p_update jsonb)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  updated uuid;
  linked boolean;
  v_text text;
begin
  if p_update is null or jsonb_typeof(p_update) <> 'object' then
    raise exception 'ask_patch_match: p_update must be an object' using errcode = '22023';
  end if;
  if not (p_update ?| array['tournament_name', 'round', 'date', 'match_type', 'court_type', 'player2_name', 'opponent_school', 'opponent_hand', 'opponent_backhand']) then
    raise exception 'ask_patch_match: nothing to change' using errcode = '22023';
  end if;

  -- The caller's own row, or nothing — before any rule is judged, so a
  -- refusal never tells a stranger whether the match exists.
  select m.event_entry_id is not null into linked
    from public.matches m
   where m.id = p_match_id
     and m.created_by = (select auth.uid());
  if linked is null then
    raise exception 'ask_patch_match: match not found' using errcode = 'P0002';
  end if;

  -- A match on a scheduled line takes these from its event
  -- (normalizeMatchPatch's EVENT_OWNED_FIELDS).
  if linked and (p_update ?| array['tournament_name', 'round', 'date', 'match_type', 'court_type']) then
    raise exception 'ask_patch_match: field locked by the event' using errcode = '22023', hint = 'field_locked';
  end if;

  -- The dialog's value rules (patch-match.ts): the two style columns are
  -- enums, the opponent's name is never blank, and text keeps its lengths.
  if p_update ? 'opponent_hand' and (p_update ->> 'opponent_hand') is not null
     and (p_update ->> 'opponent_hand') not in ('right', 'left') then
    raise exception 'ask_patch_match: opponent_hand must be right or left' using errcode = '22023';
  end if;
  if p_update ? 'opponent_backhand' and (p_update ->> 'opponent_backhand') is not null
     and (p_update ->> 'opponent_backhand') not in ('one-handed', 'two-handed') then
    raise exception 'ask_patch_match: opponent_backhand must be one-handed or two-handed' using errcode = '22023';
  end if;
  if p_update ? 'player2_name' then
    v_text := btrim(coalesce(p_update ->> 'player2_name', ''));
    if v_text = '' or length(v_text) > 120 then
      raise exception 'ask_patch_match: player2_name must be 1 to 120 characters' using errcode = '22023';
    end if;
  end if;
  if length(coalesce(p_update ->> 'tournament_name', '')) > 120
     or length(coalesce(p_update ->> 'opponent_school', '')) > 120
     or length(coalesce(p_update ->> 'match_type', '')) > 60
     or length(coalesce(p_update ->> 'court_type', '')) > 60
     or length(coalesce(p_update ->> 'round', '')) > 40 then
    raise exception 'ask_patch_match: a value is too long' using errcode = '22023';
  end if;

  update public.matches m
     set tournament_name   = case when p_update ? 'tournament_name'   then nullif(btrim(p_update ->> 'tournament_name'), '')   else m.tournament_name end,
         round             = case when p_update ? 'round'             then nullif(btrim(p_update ->> 'round'), '')             else m.round end,
         date              = case when p_update ? 'date'              then (p_update ->> 'date')::timestamptz                  else m.date end,
         match_type        = case when p_update ? 'match_type'        then nullif(btrim(p_update ->> 'match_type'), '')        else m.match_type end,
         court_type        = case when p_update ? 'court_type'        then nullif(btrim(p_update ->> 'court_type'), '')        else m.court_type end,
         player2_name      = case when p_update ? 'player2_name'      then btrim(p_update ->> 'player2_name')                  else m.player2_name end,
         opponent_school   = case when p_update ? 'opponent_school'   then nullif(btrim(p_update ->> 'opponent_school'), '')   else m.opponent_school end,
         -- Either a directory program or a typed school, never both
         -- (matches_opponent_program_or_school_check): naming a school from
         -- the connector replaces a program the row held, as the dialog's
         -- "their team" field does when a school is typed over a pick.
         opponent_program_id = case when p_update ? 'opponent_school' and nullif(btrim(p_update ->> 'opponent_school'), '') is not null then null else m.opponent_program_id end,
         opponent_hand     = case when p_update ? 'opponent_hand'     then p_update ->> 'opponent_hand'                        else m.opponent_hand end,
         opponent_backhand = case when p_update ? 'opponent_backhand' then p_update ->> 'opponent_backhand'                    else m.opponent_backhand end,
         -- The beta gate every PATCH applies (BETA_FORCE_PRIVATE); share
         -- links are token-based and unaffected.
         private           = true
   where m.id = p_match_id
     and m.created_by = (select auth.uid())
  returning m.id into updated;

  if updated is null then
    raise exception 'ask_patch_match: match not found' using errcode = 'P0002';
  end if;
  return updated;
end;
$$;

-- create or replace keeps the grants from 20261021143857; restated so a
-- drop + create elsewhere cannot silently widen them.
revoke all on function public.ask_patch_match(uuid, jsonb) from public, anon;
grant execute on function public.ask_patch_match(uuid, jsonb) to authenticated, service_role;
