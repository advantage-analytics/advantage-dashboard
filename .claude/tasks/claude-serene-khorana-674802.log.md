# Run log — claude/serene-khorana-674802

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Review-flag model: one `reviewFlag` per point with ordered items — done

**gate:** mechanical pass · completion pass

**changed:** `marks-state.ts` adds `REVIEW_ITEMS`, `ReviewFlag` / `ReviewItem` / `ReviewMember` and `reviewFlag(point, marks, points)` (members via `pointRowMarkList` + `markStates` and `openHintMarks`; per-item tone; `mostOpen` roll-ups; `demoted` for the three grey last-ball signatures). `marks-copy.ts` adds `REVIEW_ITEM_QUESTION`. New `tests/label-review-flag.spec.ts` (19 tests). No caller rewired.

**follow-ups:**

1. Item 4 tone reads any count member, open or not; T3's chip may want tone over open members only, as `rollupMarks` does.
2. `same_player_consecutive` members carry no `dismissKey` (dismissal lives on its slots); T4's per-item Dismiss should fall back to the slot's own Dismiss for item 1.
