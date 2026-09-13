-- The public-record reads, as functions rather than views.
--
-- ── Why this replaces 150300–150500 ─────────────────────────────────────────
-- Those three shipped as SECURITY DEFINER views. They were correct — the column
-- whitelists held, nothing was granted to anon, and `public_results` never
-- exposed `matches.id` — but they were the wrong CONSTRUCT, and the database
-- linter said so immediately: three `security_definer_view` findings at ERROR,
-- the only three in the project.
--
-- That matters more than the label. 20260817074053 exists because a definer
-- view quietly handed every user's statistics to anon, and the lint is what
-- would catch the next one. Three standing ERRORs that are all fine by design
-- is how the fourth, which is not, gets read as more of the same.
--
-- Functions are the house pattern for exactly this — exposing a column subset
-- across a security boundary. `program_roster`, `program_roster_full`,
-- `search_programs` and `program_seat_usage` are all SECURITY DEFINER functions
-- with a hand-written column list, and all of them lint at WARN alongside the
-- twenty already accepted. Same guarantee, same whitelist, no new error class.
--
-- The tier rule is unchanged and still structural: nothing below returns
-- `matches.id`, so no caller of a pooled read holds the one key that
-- `visible_match_ids()` gates `match_stats`, `points` and `shots` on.

drop view if exists public.public_roster;
drop view if exists public.public_lineups;
drop view if exists public.public_results;

-- ---------------------------------------------------------------------------
-- One program's pooled roster
-- ---------------------------------------------------------------------------

create or replace function public.pooled_roster(p_program_id uuid)
returns table (
  id          uuid,
  program_id  uuid,
  first_name  text,
  last_name   text,
  class_year  text,
  lineup_spot integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id, pp.program_id, pp.first_name, pp.last_name, pp.class_year, pp.lineup_spot
    from public.program_players pp
    join public.programs p on p.id = pp.program_id
   where pp.program_id = p_program_id
     and p.roster_public
     -- A merged row is a duplicate that lost; the survivor carries the same
     -- athlete. A archived one graduated. Filtered rather than returned, so no
     -- consumer needs the merge rules to read a roster correctly.
     and pp.merged_into_id is null
     and pp.archived_at is null;
$$;

-- ---------------------------------------------------------------------------
-- One pooled player, by id
-- ---------------------------------------------------------------------------

create or replace function public.pooled_player(p_player_id uuid)
returns table (
  id          uuid,
  program_id  uuid,
  first_name  text,
  last_name   text,
  class_year  text,
  lineup_spot integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select pp.id, pp.program_id, pp.first_name, pp.last_name, pp.class_year, pp.lineup_spot
    from public.program_players pp
    join public.programs p on p.id = pp.program_id
   where pp.id = p_player_id
     and p.roster_public
     and pp.merged_into_id is null
     and pp.archived_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Every line anyone recorded against one program
-- ---------------------------------------------------------------------------

create or replace function public.pooled_lineups(p_opponent_program_id uuid)
returns table (
  program_id          uuid,
  event_id            uuid,
  kind                text,
  event_name          text,
  starts_on           date,
  entry_id            uuid,
  discipline          text,
  slot                text,
  "position"          integer,
  player_labels       text[],
  opponent_labels     text[],
  opponent_school     text,
  opponent_program_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ev.program_id, ev.id, ev.kind, ev.name, ev.starts_on,
    en.id, en.discipline, en.slot, en.position,
    -- Labels, not ids. `player_labels` is written at create and never
    -- re-derived, which is what makes a historical lineup still read correctly
    -- after a roster edit — and the right column to publish.
    en.player_labels, en.opponent_labels, en.opponent_school, en.opponent_program_id
  from public.program_event_entries en
  join public.program_events ev on ev.id = en.event_id
  join public.programs p on p.id = en.program_id
  where en.opponent_program_id = p_opponent_program_id
    and p.roster_public;
$$;

-- ---------------------------------------------------------------------------
-- Scores for those lines
-- ---------------------------------------------------------------------------

-- `matches.id` is deliberately NOT in this return list, and its absence is the
-- design. `match_stats`, `points` and `shots` gate on `visible_match_ids()` /
-- `visible_point_ids()`, both of which key off a match id — so a caller holding
-- every row this returns still has no handle on a serve percentage or a shot
-- coordinate. The policies on those tables would refuse the read anyway; this
-- makes the boundary legible in one file rather than reconstructible from four
-- policies and two set-returning functions.
--
-- If exposing the match id ever looks convenient, it is not convenient — it is
-- a decision to make the private tier addressable.
create or replace function public.pooled_results(p_entry_ids uuid[])
returns table (
  event_entry_id  uuid,
  match_date      timestamptz,
  round           text,
  score           jsonb,
  source_provider text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.event_entry_id, m.date, m.round, m.score, m.source_provider
    from public.matches m
    join public.program_event_entries en on en.id = m.event_entry_id
    join public.programs p on p.id = en.program_id
   where m.event_entry_id = any(p_entry_ids)
     -- A personal match is never pooled at any setting: an individual's
     -- uploads are not a public record.
     and m.event_entry_id is not null
     and coalesce(m.private, false) = false
     and p.roster_public;
$$;

-- Signed-in callers only. Pooling means "visible to programs on this platform",
-- which is `authenticated` — not "visible to the internet". 20260817074053's
-- closing note is the reason anon is revoked rather than merely unused.
revoke all on function public.pooled_roster(uuid) from public, anon;
revoke all on function public.pooled_player(uuid) from public, anon;
revoke all on function public.pooled_lineups(uuid) from public, anon;
revoke all on function public.pooled_results(uuid[]) from public, anon;

grant execute on function public.pooled_roster(uuid) to authenticated;
grant execute on function public.pooled_player(uuid) to authenticated;
grant execute on function public.pooled_lineups(uuid) to authenticated;
grant execute on function public.pooled_results(uuid[]) to authenticated;

comment on function public.pooled_roster(uuid) is
  'TIER 1 (public record). Names and lineup spots for one program, when roster_public. Never email or claimed_by_user_id.';
comment on function public.pooled_player(uuid) is
  'TIER 1 (public record). One pooled roster row by id.';
comment on function public.pooled_lineups(uuid) is
  'TIER 1 (public record). Every line any program recorded against the given program.';
comment on function public.pooled_results(uuid[]) is
  'TIER 1 (public record). Scores for pooled team matches. Deliberately omits matches.id — the only key into match_stats/points/shots.';
