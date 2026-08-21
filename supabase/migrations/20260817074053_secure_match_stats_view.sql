-- Stop `match_stats_with_percentages` returning everybody's statistics.
-- Applied live 2026-08-17 as version 20260817074053.
--
-- ── The bug ─────────────────────────────────────────────────────────────────
-- The view was created without `security_invoker`, so it runs with its OWNER's
-- privileges. The owner is `postgres`, which owns the underlying tables, and
-- RLS does not apply to a table's owner. `SELECT` is granted to `authenticated`
-- AND `anon`. The view body has no `auth.uid()` filter.
--
-- Net effect, measured on production before writing this: a user with ZERO
-- matches reads 0 rows from `match_stats` and 44 rows through the view. Every
-- user's per-match statistics — aces, double faults, winners, unforced errors,
-- rally length — are readable by anyone signed in, and by anyone holding the
-- anon key.
--
-- This predates the program work entirely and is unrelated to it. It surfaced
-- while checking whether the RLS reconciliation could affect the view. It
-- cannot — a definer view bypasses the policies either way — which is exactly
-- what makes it worth fixing in the same pass.
--
-- ── The fix ─────────────────────────────────────────────────────────────────
-- `security_invoker = on` makes the view evaluate under the CALLER's policies,
-- which is what everyone reading this code already assumes it does.
--
-- Safe for every caller. All five application call sites
-- (statistics-server, performance-server, match-stats-server, recent-activity,
-- activity-feed) read stats for the signed-in user's own matches, and the
-- reconciled `match_stats` policy grants exactly that — creator or either
-- player. The `generate-insights` edge function uses the service role, which
-- bypasses RLS regardless.
--
-- Run AFTER 20260816100400, so the policy the view starts obeying is the
-- reconciled one rather than the narrower original.

alter view public.match_stats_with_percentages set (security_invoker = on);

-- `anon` has no business reading match statistics at all. With
-- security_invoker on, an anonymous caller now matches no policy and gets zero
-- rows anyway — but the grant is what made the leak reachable without a login,
-- and leaving it would mean the view is one accidental `security_invoker = off`
-- away from being wide open again.
revoke all on public.match_stats_with_percentages from anon;

comment on view public.match_stats_with_percentages is
  'Computed match statistics. security_invoker=on: obeys the caller''s RLS. Was a definer view readable by anon, exposing every user''s stats.';
