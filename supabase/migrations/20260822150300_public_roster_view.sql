-- Names and lineup spots, for every program in the shared pool.
--
-- ── Why a definer view and not a policy ─────────────────────────────────────
-- A second SELECT policy on `program_players` would be the obvious move and it
-- is the wrong one, for the reason 20260822090700 gives about writes: a policy
-- cannot restrict COLUMNS. "Other programs may read pooled rosters" would also
-- be "other programs may read `email` and `claimed_by_user_id`" — and that
-- second column is the binding between an athlete and their login. A view is
-- the only construct that can expose a subset.
--
-- ── This is the shape 20260817074053 caught, on purpose ─────────────────────
-- That migration found `match_stats_with_percentages` running as its owner with
-- a grant to `anon`, handing every user's statistics to anybody holding the
-- publishable key. The shape is identical here and the difference is the
-- payload: this view carries a name, a class year and a lineup spot — the
-- contents of a printed team sheet — and it carries them BY DESIGN, where that
-- one carried serve and return statistics by accident.
--
-- Three things keep the distinction real, and all three are load-bearing:
--
--   1. The column list below is a whitelist, not a `select *`. `email`,
--      `claimed_by_user_id`, `claimed_at` and `created_by` are absent and must
--      stay absent. Adding a column here is a disclosure decision.
--   2. NO GRANT TO ANON, ever. 20260817074053's closing note is the reason: a
--      grant to anon leaves the view one accidental setting away from being
--      wide open. Pooling means "visible to programs on this platform", which
--      is `authenticated`, not "visible to the internet".
--   3. `security_invoker = off` is DELIBERATE here. Do not "fix" it to `on` —
--      that would make the view return only the caller's own program and
--      silently empty the Opponents page, which fails as a plausible "no data
--      yet" rather than as an error.

create or replace view public.public_roster as
select
  pp.id,
  pp.program_id,
  pp.first_name,
  pp.last_name,
  pp.class_year,
  pp.lineup_spot
from public.program_players pp
join public.programs p on p.id = pp.program_id
where p.roster_public
  -- A merged row is a duplicate that lost; the survivor is in this view and
  -- carries the same athlete. Filtered rather than exposed, so a consumer
  -- never has to know the merge rules to read a roster correctly.
  and pp.merged_into_id is null
  -- Graduated or left. Their matches keep the id — nothing is orphaned — but a
  -- lineup sheet showing last season's seniors is a wrong answer, not a fuller
  -- one.
  and pp.archived_at is null;

alter view public.public_roster set (security_invoker = off);

revoke all on public.public_roster from anon;
revoke all on public.public_roster from public;
grant select on public.public_roster to authenticated;

comment on view public.public_roster is
  'TIER 1 (public record). Names and lineup spots for programs with roster_public. Definer BY DESIGN — a policy cannot hide email/claimed_by_user_id. Never grant to anon; never add a column without treating it as a disclosure decision.';
