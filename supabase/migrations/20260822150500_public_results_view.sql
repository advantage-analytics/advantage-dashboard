-- Dual and tournament scores, joined by entry rather than by match.
--
-- ── The column that is deliberately missing ─────────────────────────────────
-- `matches.id`. Its absence is the whole design of this view.
--
-- `match_stats`, `points` and `shots` each gate SELECT on
-- `visible_match_ids()` / `visible_point_ids()`, and both read `matches`. So
-- the private tier is reachable from exactly one key — a match id — and this
-- view does not hand one out. A caller holding every row here still has no
-- handle to a serve percentage, a rally, or a shot coordinate.
--
-- That is belt AND braces: the policies on those three tables would refuse the
-- read anyway. It is written this way because the boundary should be legible to
-- somebody reading one file, rather than something they have to reconstruct by
-- composing four policies and two set-returning functions. If a later change
-- makes it convenient to expose `m.id` here, that change is not convenient —
-- it is a decision to make the private tier addressable, and it needs the same
-- scrutiny 20260817074053 applied to the last definer view that leaked.
--
-- The join path for consumers is entry → entry: `public_lineups.entry_id`
-- against `public_results.event_entry_id`. Both are Tier 1 the whole way.
--
-- ── What is excluded, and why ───────────────────────────────────────────────
--   event_entry_id is null   a personal match. Never pooled at any setting —
--                            an individual's uploads are not a public record.
--   private = true           the per-match visibility flag, honoured here as
--                            everywhere else.
--   roster_public = false    the program's opt-out.

create or replace view public.public_results as
select
  m.event_entry_id,
  m.date,
  m.round,
  m.score,
  -- Which pipeline produced it. A coach reading a pooled result should be able
  -- to tell a typed-in score from a processed one; it carries no statistics.
  m.source_provider
from public.matches m
join public.program_event_entries en on en.id = m.event_entry_id
join public.programs p on p.id = en.program_id
where m.event_entry_id is not null
  and coalesce(m.private, false) = false
  and p.roster_public;

alter view public.public_results set (security_invoker = off);

revoke all on public.public_results from anon;
revoke all on public.public_results from public;
grant select on public.public_results to authenticated;

comment on view public.public_results is
  'TIER 1 (public record). Scores for pooled team matches. Deliberately omits matches.id: that is the only key into match_stats/points/shots, and this view must not hand it out. Definer BY DESIGN; never grant to anon.';
