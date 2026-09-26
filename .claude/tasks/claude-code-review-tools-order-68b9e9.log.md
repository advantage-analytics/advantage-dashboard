# Run log — claude/code-review-tools-order-68b9e9

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Make pickServeShotBy return undefined when a point has no serve row — done

- **gate:** mechanical PASS (lint, typecheck, full suite); completion review `VERDICT: pass` (4/4 criteria met, scope exact)
- **changed:** `src/lib/data/serve-return-shots.ts` drops the `?? shots[0]` fallback in `pickServeShotBy`, so a point with no First/Second Serve row resolves to `undefined` instead of its Feed row; JSDoc on `pickServeShotBy`/`pickServeShot` updated. New `tests/serve-return-shots.spec.ts` pins the four cases (both rows → Second Serve, First only → First, `[Feed]` → undefined, `[Feed, Forehand]` → undefined). Callers verified unchanged (match-points-server, viz-model `resolvedServe`, home-serve-data, player-profile-server all already guard `undefined`).

## T2 · Add a fail-closed paged-read helper and use it for match shots — done

- **gate:** mechanical PASS (lint, typecheck, full suite); completion review `VERDICT: pass` (4/4 criteria met, scope exact)
- **changed:** New `src/lib/data/paged-query.ts` — `fetchAllPages<T>(page, pageSize = 1000)` loops `.range()` pages until a short page, returns rows in order, returns `null` on the first page error (never a partial list); dependency-free. `getMatchPointsFromSupabase` (`match-points-server.ts`) now reads shots through it with the `(point_id, shot_number, id)` order kept; a page error logs once and the function returns `[]` instead of points with half their shots. New `tests/paged-query.spec.ts` (6 tests): 2,500 rows as 1000/1000/500 in order, page-2 error → `null` with no third request, exact-multiple and null-data edges, plus the loader itself via `tests/fixtures/vm-modules.ts` with `@/lib/supabase/server` stubbed (all shots attached in order; page-2 error → `[]` with exactly one `console.error`).
- **follow-ups:** 1. The `points` read in `getMatchPointsFromSupabase` is still one unpaged request (safe under the cap for a realistic match; would need an `id` tiebreak after `point_number` to page). 2. `supabaseAttachmentSourceRows` in `match-video-attachment-server.ts` has two hand-written paged loops that could move to `fetchAllPages`. 3. The shots read's `.in("point_id", pointIds)` puts every point id in each page's URL; the `points!inner(match_id)` embedded filter used elsewhere would bound it.
