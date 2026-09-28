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
