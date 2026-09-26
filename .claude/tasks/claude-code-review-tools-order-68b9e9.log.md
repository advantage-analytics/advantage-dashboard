# Run log — claude/code-review-tools-order-68b9e9

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Make pickServeShotBy return undefined when a point has no serve row — done

- **gate:** mechanical PASS (lint, typecheck, full suite); completion review `VERDICT: pass` (4/4 criteria met, scope exact)
- **changed:** `src/lib/data/serve-return-shots.ts` drops the `?? shots[0]` fallback in `pickServeShotBy`, so a point with no First/Second Serve row resolves to `undefined` instead of its Feed row; JSDoc on `pickServeShotBy`/`pickServeShot` updated. New `tests/serve-return-shots.spec.ts` pins the four cases (both rows → Second Serve, First only → First, `[Feed]` → undefined, `[Feed, Forehand]` → undefined). Callers verified unchanged (match-points-server, viz-model `resolvedServe`, home-serve-data, player-profile-server all already guard `undefined`).
