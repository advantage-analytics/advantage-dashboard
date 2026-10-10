# Run log — claude/label-let-followups

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T2 · Database check: a let is a serve's only — done

**gate:** mechanical pass · completion pass

**changed:** Live pre-check found 0 lets on non-serves; `label_shots_let_serve_only` (`result is distinct from 'let' or (stroke is not null and stroke in ('first_serve','second_serve'))`) applied live as migration 20261010064548, repo file named to match with the pre-check recorded in its header. `letResultError`'s doc comment names the constraint as the backstop.

## T3 · Guard the other label_shots result writers with the let rule — done

**gate:** mechanical pass · completion pass

**changed:** `combineRetypeError` (point-combine.ts) judges every planned combine retype with `letResultError` before any write; `planPointCombine` returns `{ error }` on a refusal. `planShotReset` refuses a seed that would leave a let on a non-serve. `labelShotResult` pinned to never yield a let. Audit comment above `letResultError` lists every `label_shots` writer and its guard. Specs in label-point-combine, label-reset, label-seed.

**follow-ups:**

1. No session-level spec shows combine leaves `label_shots` untouched on a refusal — today's retype planner can't produce one; the plan runs before the first write.

## T5 · label-apply dry run says how many lets it left out — done

**gate:** mechanical pass · completion pass

**changed:** `AppliedRows.letsLeftOut` counts live let serves on applied points (live strokes minus `playedShots`, which drops only `isLetServe`). `letsLeftOutLine` prints "lets left out: N (replayed serves, not written as shots)" in both the dry run and the write summary, always, including 0. Spec in label-apply.

**follow-ups:**

1. apply.ts calls `liveShotsInOrder(point, true)` twice per point for the count; could reuse one result.
