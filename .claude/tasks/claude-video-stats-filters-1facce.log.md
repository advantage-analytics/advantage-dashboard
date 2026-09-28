# Run log — claude/video-stats-filters-1facce

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Add court-half, shot-direction and spin helpers for match filters — done

**gate:** mechanical pass (after `npm ci` refreshed a stale node_modules missing `pg` and `@electric-sql/pglite`); completion pass
**changed:** New `match-filters/shot-geometry.ts` (`hitterHalf`, `shotDirection`, `inferHand`, plus `backhandHalf`/`isForehand`) and `match-filters/spin.ts` (`normalizeServeSpin`, `normalizeReturnSpin`), with `tests/match-filters-geometry.spec.ts` (21 tests). Deuce = x > 0 at the low-y end and x < 0 at the high-y end, anchored in the spec to `serveCourtSide()` in `derivation/court.ts`. Nothing under `supabase/` and no `shots.zone` derivation touched.
**follow-ups:**

1. `shotDirection` counts any `shotType` containing "forehand", so a forehand volley from the backhand half can read Inside Out/In; consider limiting it to groundstrokes.
2. Once `courtSideOf` moves into `match-filters/model.ts` (T3), add a spec asserting that a 0-0 serve gets the same answer from `courtSideOf` and `hitterHalf`.
3. `viz-model.ts` `getPointSide` and `film/filters/types.ts` `courtSideOf` both derive deuce/ad from score parity; merge them into one helper during the cleanup.

## T2 · Expose the raw point score and both players' hands to the match page — done

**gate:** mechanical pass; completion pass
**changed:** `MatchPoint.pointScoreRaw?: string | null` is now filled from `points.point_score` with no fallback; `pointScore` keeps its `?? "0-0"`. It is optional so the full-literal `MatchPoint` fixtures stay valid, and the loader always sets it. New `src/components/dashboard/matches/player-hands.ts` adds `normalizePlayerHand` and `playerHands(match, youIsPlayer1)`. `match.player1/2.hand` are already assigned to the right seat server-side (`match-detail-server.ts:183-186`), so the helper only normalises each seat and does NOT swap on `youIsPlayer1`. Specs: `tests/player-hands.spec.ts` and `tests/point-score-raw.spec.ts`, the second driven through `getMatchPointsFromSupabase` with a fake client.
**follow-ups:**

1. T3 should build `ctx.hands` as `playerHands(match).playerN`, falling back to `inferHand(points, isPlayer1)` when that is null; that composition does not exist yet.

## T3 · Build the shared MatchFilters model and predicates — done

**gate:** mechanical pass; completion pass
**changed:** New pure `match-filters/model.ts`: `MatchFilters`, `EMPTY_MATCH_FILTERS`, `applyMatchFilters`/`matchesPoint`, `buildFilterContext` (`playerHands`, falling back to `inferHand`), `optionAvailability`, `serializeMatchFilters`/`parseMatchFilters` (compact `_`/`.` form), `activeFilterCount`, `filtersEqual`, `toggleMatchFilter`, `MATCH_FILTER_OPTIONS`/`SECTIONS`/`KEYS`. New `match-filters/score.ts` holds `courtSideOf`, `isDeucePoint`/`isGamePoint` and the score parsing moved out of `film/filters/types.ts` (which now imports and re-exports them; no behaviour change), plus `courtSidesOf` and `normalizePointScore`. `tests/match-filters-model.spec.ts` has 25 tests.
Implementer's own calls:

- Service Winner and double fault are credited to the SERVER. On the live data the last shot row is usually the returner's (377/421 service winners, 81 double faults).
- Every point of a 6-6 game is treated as a tiebreak, so it never matches the Points grid. This could misfire in advantage sets.
- A winner with no shot rows goes to the point winner; an error goes to the point loser.
- A return contact exactly 1.0 m behind the baseline is Middle.
- A Result player picked alone narrows nothing; it only sets the point of view.
  **follow-ups:**

1. `point-endings-card.tsx` and head-to-head's derived path credit Service Winners to `p.player` (usually the returner), so their winner counts will disagree with the new filter's Winner count. This matters when T7 maps the "Winners" cut.
2. `applyFilmFilters` could use `courtSidesOf` instead of its own game walk (moot once T8 deletes it).
3. T5 decides whether a group with at most one available option is hidden (the plan says a one-set match shows no Sets group).
