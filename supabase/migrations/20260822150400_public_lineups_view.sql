-- Who a program put where, for every line anyone has recorded.
--
-- This is the view that makes scouting worth building. Privately, a program
-- sees one sighting of a conference opponent per season and cannot tell a
-- lineup change from a one-off. Pooled, it sees every line that opponent has
-- played this year, because the six other programs who played them each wrote
-- one down.
--
-- Lineups are already public: they are posted at the match, printed on a team
-- sheet and published by the conference the same afternoon. Nothing here is
-- disclosed that a browser tab could not already reach — what is new is that it
-- aggregates.
--
-- Definer, `authenticated` only, no anon — same three rules as
-- 20260822150300, for the same reasons, and that migration's header is the
-- long-form version of why.

create or replace view public.public_lineups as
select
  ev.program_id,
  ev.id            as event_id,
  ev.kind,
  ev.name          as event_name,
  ev.starts_on,
  en.id            as entry_id,
  en.discipline,
  en.slot,
  en.position,
  -- Labels, not ids. `player_labels` was written at create and never
  -- re-derived precisely so a historical lineup reads correctly after a roster
  -- edit; that property is what makes it the right column to publish.
  en.player_labels,
  en.opponent_labels,
  en.opponent_school,
  en.opponent_program_id
from public.program_event_entries en
join public.program_events ev on ev.id = en.event_id
join public.programs p on p.id = en.program_id
where p.roster_public;

alter view public.public_lineups set (security_invoker = off);

revoke all on public.public_lineups from anon;
revoke all on public.public_lineups from public;
grant select on public.public_lineups to authenticated;

comment on view public.public_lineups is
  'TIER 1 (public record). Recorded lineups for programs with roster_public. Definer BY DESIGN; never grant to anon.';
