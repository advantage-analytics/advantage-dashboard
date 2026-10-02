-- Null the match_stats columns that cannot be trusted for a video-derived
-- (Advantage Intelligence) match, so the UI has nothing to render rather than a
-- confident zero. Applied live 2026-08-19.
--
-- Scoped to source_provider = 'splitstep'. Imported SwingVision matches are
-- never touched.
--
-- Two rules govern the list, both from measurement:
--
--   1. UNKNOWABLE. `aces` cannot be separated from a service winner — nothing in
--      the payload records an attempted-and-missed swing, so a missed return is
--      not a stroke at all.
--
--   2. CONTAMINATED BY UNRETURNED-SERVE UNDERDETECTION. The vendor records
--      roughly ten points per hundred that ended on the serve as multi-stroke
--      rallies (measured unreturned-serve rate 1.9% / 3.5% / 6.0% against a
--      real-tennis floor near 15%). That deflates double faults and service
--      winners, inflates rally length and second-serve-in — this match reported
--      one player at 17/17, a perfect second-serve record nobody has — and
--      injects phantom strokes at shot_number 2 that the return family is
--      computed from.
--
-- NOT suppressed, deliberately: the break-point and set-point families. Those
-- were fabricated zeroes until derivation/pressure.ts started computing them and
-- are now arithmetic on the score stream. They reconcile independently on the
-- one match with ground truth: holds plus breaks equal the folded 12-8 game
-- count, and set points converted equals sets won.
--
-- ATOMICITY. The three placement triples must be nulled all-or-nothing.
-- match_stats_with_percentages computes each member's percentage over
-- COALESCE(a,0)+COALESCE(b,0)+COALESCE(c,0), so nulling one member silently
-- drops it from its siblings' denominator and INFLATES them, with nothing on
-- screen indicating why.

create or replace function public.suppress_derived_match_stats(p_match_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.match_stats ms
  set
    aces                     = null,
    double_faults            = null,
    service_winners          = null,
    avg_rally_length         = null,
    second_serves_in         = null,
    first_returns_in         = null,
    second_returns_in        = null,
    return_cross_court       = null,
    return_down_the_line     = null,
    return_middle            = null,
    return_contact_inside    = null,
    return_contact_middle    = null,
    return_contact_deep      = null,
    updated_at               = now()
  where ms.match_id = p_match_id
    and exists (
      select 1 from public.matches m
      where m.id = ms.match_id and m.source_provider = 'splitstep'
    );
$$;

revoke all on function public.suppress_derived_match_stats(uuid) from public, anon, authenticated;
grant execute on function public.suppress_derived_match_stats(uuid) to service_role;

comment on function public.suppress_derived_match_stats(uuid) is
  'Nulls the match_stats columns that cannot be trusted for a source_provider=''splitstep'' match: aces (unknowable) and the families contaminated by unreturned-serve underdetection. Idempotent. Must be re-run after backfill_returns_in_and_net_points, which rewrites first_returns_in / second_returns_in with no provider guard and would otherwise un-suppress two of these columns.';
