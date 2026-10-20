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

## T4 · Open point: review block replaces the hint line — done

**gate:** mechanical pass · completion pass

**changed:** `PointHintLine` replaced by `ReviewBlock` (label-black-mark.tsx): "Review · in this order", one row per item with question, evidence and `BlackTextAction` answers; item 4 asks the vendor's call with "Yes, make it …" · "It was in" · "Place the bounce" and carries `ending_stale` as its "Then:" line; stroke-level items show a "N · question — at shot K" pointer beside their unchanged inline rows; per-item Dismiss stores every member key; "Looks right" is the check tick's handler. New pure `review-block.ts` (`reviewBlockRows` for ✓ answered / "Cleared by N"). label-black-shot-row.tsx touched only in the well composition (+9/−24). New copy in marks-copy.ts. Specs: black-marks, review-flag.

**follow-ups:**

1. `BlackShotsWell` docstring in label-black-shot-row.tsx still names `PointHintLine`; fix once the other session's edits to that file land.
2. Item 3 `first_serve_fault_alone` could offer "Place the bounce" too.
3. `ReviewBlock` recomputes `reviewFlag` each render; memoise if the rail feels slow.
4. Item "no" is labelled "Dismiss" (mockup said "No"); answers are 11px, not the mockup's 11.5px.

## T5 · `]` / `[` land on a point with its first open item focused — done

**gate:** mechanical pass · completion pass

**changed:** `findGap(pointId, { focusItem })` unfolds the point and, after the existing scroll, focuses `reviewFocusTarget(well)` — the first `[data-review-item-state="open"]` item's first action, or the inline suggestion row's for a stroke-level pointer. Only `stepToFlag` and the summary's new `goToFlag` ask for focus; row clicks and score/slot stops do not. Review rows carry `data-review-item-state`; pointers carry `data-review-shot` / `data-review-code`. label-flag-summary.tsx cancels Radix's return-focus when a jump closed the menu. Spec: label-console (4 tests, incl. a real-page run of `reviewFocusTarget`).

**follow-ups:**

1. Focus uses `preventScroll`; in a long rally the block can sit below the rail — scroll the focused element `block: "nearest"` once the smooth scroll settles.
2. The overview's open-on-point jump (`jumpAfterOpen`) never focuses; pass `focusItem` through `openOnPointId` if it should.
3. `reviewFocusTarget` depends on the inline rows' `data-row` / `data-point-hint` / `data-shot-suggestion` attributes in label-black-shot-row.tsx.

## T6 · Scorecard: per-item table beside the per-code one — done

**gate:** mechanical pass · completion pass

**changed:** `Scorecard.items` (`ScorecardItemRow`) tallies each point once per review item and tone against `pointChange`, plus a `demoted` row; `renderScorecard` adds "## Items, against what the labeller changed" after the per-code table. `reviewFlag`'s item-folding loop is extracted as exported `foldReviewItems` (marks-state.ts) so tone and demotion rules live in one place. Spec: label-scorecard ("the per-item table").

**follow-ups:**

1. Item 4's tone reads `pointWinnerContradicted` on the point as it stands now, not as seeded, so a winner the labeller flipped against the strokes can read amber in the scorecard though the opening marks were grey.
