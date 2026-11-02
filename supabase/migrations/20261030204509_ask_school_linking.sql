-- The connector links an opponent's school to the program directory, as the
-- app's school dropdown does (src/components/dashboard/matches/opponent-team-field.tsx).
--
-- Three changes, all additive for what runs today:
--
-- 1. search_programs gains a four-argument overload with a division filter and
--    the id and abbreviation the connector returns. The division is a
--    predicate inside every tier, for the reason 20261026061531 gives for the
--    squad: filtering after a page leaves a short page. The three-argument
--    function keeps its signature, grants and row cap of 20 and becomes a call
--    into this one, so there is one matching rule and the dropdown and the
--    connector rank the same. New function, so no anon grant: the connector
--    calls it signed in, and the two public functions reach it as definer.
-- 2. ask.matches appends the opponent's school, program id and conference.
-- 3. ask_patch_match accepts opponent_program_id, under the rules
--    normalizeMatchPatch() and PATCH /api/matches/[id] apply. An id must be a
--    program this caller can read: the foreign key alone would accept another
--    organisation's private program. A team mismatch stays the tool's to
--    refuse, because the caller may override it.

create or replace function public.search_programs(
  p_term text,
  p_team text,
  p_division text,
  p_limit integer
)
returns table(
  id uuid,
  program_key text,
  school_name text,
  school_abbrev text,
  team text,
  division text,
  conference text,
  state text,
  status text,
  owner_display text
)
language sql
stable
security definer
set search_path to ''
as $function$
  with q as (
    -- Trimmed and folded, but NOT yet escaped: the floor below has to see
    -- what the coach typed, not what escaping made of it.
    select lower(btrim(p_term)) as raw
  ),
  qe as (
    select
      q.raw                                          as raw,
      -- Half-open upper bound for the text_pattern_ops range scan.
      q.raw || chr(1114111)                          as raw_hi,
      replace(replace(q.raw, '%', '\%'), '_', '\_')  as term,
      least(coalesce(p_limit, 8), 25)                as n,
      -- The one squad to keep, or null for every squad.
      case when p_team in ('mens', 'womens') then p_team end as squad,
      -- The one division to keep, or null for every division. '' means none:
      -- a GET sends every argument as text, and a null would arrive as 'null'.
      nullif(btrim(p_division), '')                  as division
    from q
    where length(q.raw) >= 2
  ),
  -- Tier 0. The btree half is a range, not a LIKE, so it stays indexable with
  -- a runtime bound; the abbreviation half is a prefix LIKE on the trigram
  -- index. Together they are a BitmapOr over both indexes.
  school_pre as (
    select p.id, p.program_key, p.school_name, p.school_abbrev, p.team, p.division,
           p.conference, p.state, p.status, p.owner_user_id
    from public.programs p
    cross join qe
    where p.org_type = 'college'
      and (qe.squad is null or p.team = qe.squad)
      and (qe.division is null or p.division = qe.division)
      and ((lower(p.school_name) operator(pg_catalog.~>=~) qe.raw
            and lower(p.school_name) operator(pg_catalog.~<~) qe.raw_hi)
        or lower(coalesce(p.school_abbrev, '')) like qe.term || '%')
    order by p.school_name, p.team
    limit (select ql.n from qe ql)
  ),
  -- Tier 1. Both sub-selects are uncorrelated, which is what makes the gate a
  -- One-Time Filter over the whole scan rather than a per-row test — a full
  -- page of prefix hits means this node is never executed at all.
  school_rest as (
    select p.id, p.program_key, p.school_name, p.school_abbrev, p.team, p.division,
           p.conference, p.state, p.status, p.owner_user_id
    from public.programs p
    cross join qe
    where (select count(*) from school_pre) < (select qc.n from qe qc)
      and p.org_type = 'college'
      and (qe.squad is null or p.team = qe.squad)
      and (qe.division is null or p.division = qe.division)
      and (lower(p.school_name) like '%' || qe.term || '%'
        or lower(coalesce(p.school_abbrev, '')) like '%' || qe.term || '%')
      and not ((lower(p.school_name) operator(pg_catalog.~>=~) qe.raw
                and lower(p.school_name) operator(pg_catalog.~<~) qe.raw_hi)
            or lower(coalesce(p.school_abbrev, '')) like qe.term || '%')
    order by p.school_name, p.team
    limit (select ql.n from qe ql)
  ),
  -- Tier 2. Conference prefix — "Big Ten" against 'Big Ten Conference (B1G)'.
  -- A range rather than a prefix LIKE, for the same reason tier 0 is: the
  -- pattern here is built from a parameter, and the planner only rewrites a
  -- LIKE into an index range when the pattern is constant at plan time.
  -- Excluding the school-contains predicate also excludes the school-prefix
  -- one, since a prefix hit is always also a contains hit.
  conf_pre as (
    select p.id, p.program_key, p.school_name, p.school_abbrev, p.team, p.division,
           p.conference, p.state, p.status, p.owner_user_id
    from public.programs p
    cross join qe
    where (select count(*) from school_pre) + (select count(*) from school_rest)
          < (select qc.n from qe qc)
      and p.org_type = 'college'
      and (qe.squad is null or p.team = qe.squad)
      and (qe.division is null or p.division = qe.division)
      and lower(coalesce(p.conference, '')) operator(pg_catalog.~>=~) qe.raw
      and lower(coalesce(p.conference, '')) operator(pg_catalog.~<~) qe.raw_hi
      and not (lower(p.school_name) like '%' || qe.term || '%'
            or lower(coalesce(p.school_abbrev, '')) like '%' || qe.term || '%')
    order by p.school_name, p.team
    limit (select ql.n from qe ql)
  ),
  -- Tier 3. Conference contains — this is what catches "B1G" inside
  -- 'Big Ten Conference (B1G)'.
  conf_rest as (
    select p.id, p.program_key, p.school_name, p.school_abbrev, p.team, p.division,
           p.conference, p.state, p.status, p.owner_user_id
    from public.programs p
    cross join qe
    where (select count(*) from school_pre) + (select count(*) from school_rest)
          + (select count(*) from conf_pre) < (select qc.n from qe qc)
      and p.org_type = 'college'
      and (qe.squad is null or p.team = qe.squad)
      and (qe.division is null or p.division = qe.division)
      and lower(coalesce(p.conference, '')) like '%' || qe.term || '%'
      -- Must be the same range test tier 2 matched on, or a row lands twice.
      and not (lower(coalesce(p.conference, '')) operator(pg_catalog.~>=~) qe.raw
           and lower(coalesce(p.conference, '')) operator(pg_catalog.~<~) qe.raw_hi)
      and not (lower(p.school_name) like '%' || qe.term || '%'
            or lower(coalesce(p.school_abbrev, '')) like '%' || qe.term || '%')
    order by p.school_name, p.team
    limit (select ql.n from qe ql)
  ),
  hits as (
    select 0 as tier, school_pre.*  from school_pre
    union all
    select 1 as tier, school_rest.* from school_rest
    union all
    select 2 as tier, conf_pre.*    from conf_pre
    union all
    select 3 as tier, conf_rest.*   from conf_rest
  )
  select
    h.id, h.program_key, h.school_name, h.school_abbrev, h.team, h.division, h.conference, h.state, h.status,
    case
      when u.id is null then null
      else btrim(coalesce(u.first_name, '') || ' ' || coalesce(u.last_name, ''))
    end
  from hits h
  left join public.users u on u.id = h.owner_user_id
  -- School hits first, then the school, then men's before women's so a pair
  -- reads as a pair.
  order by h.tier, h.school_name, h.team
  limit (select ql.n from qe ql);
$function$;

revoke all on function public.search_programs(text, text, text, integer) from public, anon;
grant execute on function public.search_programs(text, text, text, integer)
  to authenticated, service_role;

comment on function public.search_programs(text, text, text, integer) is
  'Program typeahead with the id and abbreviation, narrowed by squad and division (empty or unknown means all). '
  'The one matching rule: the three-argument search_programs is this with no division and a cap of 20.';

create or replace function public.search_programs(
  p_term text,
  p_team text,
  p_limit integer default 8
)
returns table(
  program_key text,
  school_name text,
  team text,
  division text,
  conference text,
  state text,
  status text,
  owner_display text
)
language sql
stable
security definer
set search_path to ''
as $function$
  select r.program_key, r.school_name, r.team, r.division, r.conference, r.state, r.status, r.owner_display
    from public.search_programs(p_term, p_team, null::text, least(coalesce(p_limit, 8), 20)) r;
$function$;

create or replace view ask.matches as
with mine as (
  select mm.match_id,
         mm.me_is_player1,
         case
           when mm.me_is_player1 then 'player1'
           when not mm.me_is_player1 then 'player2'
         end as side
    from ask.my_matches() mm
)
select m.id as match_id,
       (m.date at time zone 'utc')::date as played_on,
       case mine.side
         when 'player1' then m.player2_name
         when 'player2' then m.player1_name
         else null
       end as opponent_name,
       m.opponent_hand,
       m.opponent_backhand,
       m.tournament_name as tournament,
       m.round,
       m.court_type,
       m.match_type,
       ask.i_won(m.score, mine.side) as i_won,
       case
         when jsonb_typeof(m.score -> 'player1') = 'array'
          and jsonb_typeof(m.score -> 'player2') = 'array'
          and jsonb_array_length(m.score -> 'player1') > 0
          and jsonb_array_length(m.score -> 'player2') > 0 then (
           select string_agg(
                    case mine.side
                      when 'player2' then
                        coalesce((m.score -> 'player2' -> (s.i::integer - 1)) #>> '{}', '0')
                        || '-' || (s.v #>> '{}')
                      else
                        (s.v #>> '{}') || '-'
                        || coalesce((m.score -> 'player2' -> (s.i::integer - 1)) #>> '{}', '0')
                    end,
                    ', ' order by s.i)
             from jsonb_array_elements(m.score -> 'player1') with ordinality s(v, i)
         )
         else null
       end as score_text,
       case m.source_provider
         when 'splitstep' then 'video'
         when 'swing-vision' then 'swingvision'
         else m.source_provider
       end as source,
       case
         when m.duration is null then null
         else round(m.duration::numeric / 1000.0)::integer
       end as duration_seconds,
       exists (select 1 from public.match_stats s where s.match_id = m.id) as has_stats,
       -- ask.side_player_name(): in a program scope the roster player's name
       -- (one spelling per player), else the name stored on the match. The
       -- membership and program checks it repeats are already true of every
       -- my_matches() row in a program scope.
       coalesce(
         (
           select nullif(btrim(coalesce(pp.first_name, '') || ' ' || coalesce(pp.last_name, '')), '')
             from public.program_players pp
            where m.program_id is not null
              and m.program_id = ask.scope_program_id()
              and pp.program_id = m.program_id
              and pp.merged_into_id is null
              and pp.archived_at is null
              and (pp.id = seat.id or pp.claimed_by_user_id = seat.id)
            order by (pp.id = seat.id) desc
            limit 1
         ),
         seat.stored_name
       ) as player_name,
       -- A scalar subquery with limit 1, never exists(): the planner may run
       -- an exists() as a hashed subplan, one scan of every shot in the
       -- database (643 ms warm for an 18-match player on 2026-10-27); this
       -- form probes the match's own points and shots by index and stops at
       -- the first positioned shot (17 ms for the same matches).
       coalesce((
         select true
           from public.points p
           join public.shots s on s.point_id = p.id
          where p.match_id = m.id
            and ((s.contact_x is not null and s.contact_y is not null
                  and s.contact_x <> 0::double precision
                  and s.contact_y <> 11.885::double precision)
              or (s.landing_x is not null and s.landing_y is not null
                  and s.landing_x <> 0::double precision
                  and s.landing_y <> 11.885::double precision))
          limit 1
       ), false) as has_coords,
       -- The linked program's name, or the school as typed: the two columns
       -- are either/or (matches_opponent_program_or_school_check).
       coalesce(op.school_name, m.opponent_school) as opponent_school,
       m.opponent_program_id,
       op.conference as opponent_conference
  from public.matches m
  join mine on mine.match_id = m.id
  left join public.programs op on op.id = m.opponent_program_id
  cross join lateral (
    select case mine.side
             when 'player1' then m.player1_id
             when 'player2' then m.player2_id
           end as id,
           case mine.side
             when 'player1' then m.player1_name
             when 'player2' then m.player2_name
           end as stored_name
  ) as seat;

comment on column ask.matches.match_id is
  'The match''s id; the only match id in this schema.';
comment on column ask.matches.opponent_school is
  'The school the opponent plays for: the linked program''s name, or the school as typed when it is not in the directory; null when not recorded.';
comment on column ask.matches.opponent_program_id is
  'The opponent''s program in the directory; null when the school was typed or not recorded.';
comment on column ask.matches.opponent_conference is
  'The conference of the opponent''s linked program; null when the school is not linked to the directory.';

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
  v_program uuid;
  v_school text;
begin
  if p_update is null or jsonb_typeof(p_update) <> 'object' then
    raise exception 'ask_patch_match: p_update must be an object' using errcode = '22023';
  end if;
  if not (p_update ?| array['tournament_name', 'round', 'date', 'match_type', 'court_type', 'player2_name', 'opponent_program_id', 'opponent_school', 'opponent_hand', 'opponent_backhand']) then
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

  -- A directory program or a typed school, never both, and only a program
  -- this caller can read (programs RLS, as the dialog's route asks).
  v_program := (p_update ->> 'opponent_program_id')::uuid;
  v_school := nullif(btrim(p_update ->> 'opponent_school'), '');
  if v_program is not null and v_school is not null then
    raise exception 'ask_patch_match: a program or a school, not both' using errcode = '22023', hint = 'opponent_team_exclusive';
  end if;
  if v_program is not null and not exists (select 1 from public.programs p where p.id = v_program) then
    raise exception 'ask_patch_match: no such program' using errcode = '23503', hint = 'opponent_program_not_found';
  end if;

  update public.matches m
     set tournament_name   = case when p_update ? 'tournament_name'   then nullif(btrim(p_update ->> 'tournament_name'), '')   else m.tournament_name end,
         round             = case when p_update ? 'round'             then nullif(btrim(p_update ->> 'round'), '')             else m.round end,
         date              = case when p_update ? 'date'              then (p_update ->> 'date')::timestamptz                  else m.date end,
         match_type        = case when p_update ? 'match_type'        then nullif(btrim(p_update ->> 'match_type'), '')        else m.match_type end,
         court_type        = case when p_update ? 'court_type'        then nullif(btrim(p_update ->> 'court_type'), '')        else m.court_type end,
         player2_name      = case when p_update ? 'player2_name'      then btrim(p_update ->> 'player2_name')                  else m.player2_name end,
         -- Setting one side of the either/or clears the other
         -- (matches_opponent_program_or_school_check), as the dropdown does.
         opponent_school   = case when p_update ? 'opponent_school'   then v_school
                                  when v_program is not null          then null
                                  else m.opponent_school end,
         opponent_program_id = case when p_update ? 'opponent_program_id' then v_program
                                    when v_school is not null              then null
                                    else m.opponent_program_id end,
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

-- create or replace keeps the grants; restated so a drop + create elsewhere
-- cannot silently widen them.
revoke all on function public.ask_patch_match(uuid, jsonb) from public, anon;
grant execute on function public.ask_patch_match(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
