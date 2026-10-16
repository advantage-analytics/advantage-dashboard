# Run log — claude/serene-khorana-674802

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Review-flag model: one `reviewFlag` per point with ordered items — done

**gate:** mechanical pass · completion pass

**changed:** `marks-state.ts` adds `REVIEW_ITEMS`, `ReviewFlag` / `ReviewItem` / `ReviewMember` and `reviewFlag(point, marks, points)` (members via `pointRowMarkList` + `markStates` and `openHintMarks`; per-item tone; `mostOpen` roll-ups; `demoted` for the three grey last-ball signatures). `marks-copy.ts` adds `REVIEW_ITEM_QUESTION`. New `tests/label-review-flag.spec.ts` (19 tests). No caller rewired.

**follow-ups:**

1. Item 4 tone reads any count member, open or not; T3's chip may want tone over open members only, as `rollupMarks` does.
2. `same_player_consecutive` members carry no `dismissKey` (dismissal lives on its slots); T4's per-item Dismiss should fall back to the slot's own Dismiss for item 1.

## T2 · Header, flag list and jumps count points, grouped by item — done

**gate:** mechanical pass (first run failed on `claim-eyebrow-width` live-DB read, unrelated and passing alone; full re-run GATE PASS) · completion pass

**changed:** `openFlags` returns one flag per open, non-demoted point with its open items; `flagGroups` groups by the six review items (no "Other"); `flagStopLabel` names the first open item's question. Header copy is "N points to review" / "N data points"; `onPointsDetail` removed. Flag summary menu reads "Point N · <question>"; dashboard lists count distinct points. Specs updated: flag-nav, marks-copy, session-fields, score-marks, serve-order.

**follow-ups:**

1. Labels list "Open flags" column: sessions now record points, but jobs without a session fall back to `classifyFlags` (job-groups.ts), which still counts marks — make it count points, then rename the column. Stored `open_counts` stay mark-based until each console is reopened.
2. Item 4's question is static; a shared item-words helper could let the header and menu say "Was the last ball out?" via `lastCallQuestion`.
3. `data` follows the whole flag's tone, so a point whose only amber item is settled still counts amber while a grey item is open.

## T3 · Point-row chip reads the review flag — done

**gate:** mechanical pass · completion pass

**changed:** `pointRowMarks` draws the chip from `reviewFlag` + new `reviewChip` alone; `dataChip`, `rollupMarks` and `MarkRollupChip` removed. One open item reads its question (item 4 asks `lastCallQuestion` via new `reviewItemQuestion`), several read "Review · N", a demoted flag draws none, and the quiet outline is kept only for flags with a counted member (a hint-only flag leaves no chip once nothing is open — narrowed at the runner's request so checked points don't gain chips). Tooltip lists "N · question" lines. Specs: black-marks, marks-copy, score-marks.

**follow-ups:**

1. `flag-nav.ts` (`flagStopLabel`, `flagGroups`) still reads `item.question`; using `reviewItemQuestion` would make the header say "Was the last ball out?" as the row does.
2. Move the "Review · N" copy from `reviewChip` into marks-copy.ts.
3. `marks.ts` `DATA_MARK_CODES` doc still describes the old grey closed-row chip; reword.
