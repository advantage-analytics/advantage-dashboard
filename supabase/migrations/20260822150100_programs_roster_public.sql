-- A program's switch for the shared pool.
--
-- ── Why the pool exists ─────────────────────────────────────────────────────
-- A program plays a conference opponent's #3 singles once a season. A scouting
-- profile built only from your own matches is a profile over n=1, which is a
-- match report wearing a different title, and it is empty on the day a program
-- signs up. Pooling the things schools already publish — who is on the roster,
-- who played which line, what the score was — turns that into "what are they
-- fielding this season", which is the question a coach actually asks.
--
-- ── What this switch does NOT govern ────────────────────────────────────────
-- Nothing derived. `match_stats`, `points` and `shots` stay behind
-- `visible_match_ids()` exactly as they are, for every program, always. Those
-- exist because somebody aimed a camera and spent quota, and they are the
-- product. This switch governs only the three public-record views, and none of
-- them carries a contact field or a claim binding at any setting.
--
-- ── The default ─────────────────────────────────────────────────────────────
-- `true`. A pool most programs sit out of has no value to the ones who join, so
-- an opt-out default is the only one that produces a working feature. It is
-- still a posture change for athletes already in the system, which is why the
-- exposed set is names and lineup spots and stops there.

alter table public.programs
  add column if not exists roster_public boolean not null default true;

comment on column public.programs.roster_public is
  'Whether this program appears in the shared public-record views (public_roster, public_lineups, public_results). Never governs match_stats, points or shots — those are private at every setting.';
