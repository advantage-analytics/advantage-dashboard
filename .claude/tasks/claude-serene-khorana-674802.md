# Tasks — claude/serene-khorana-674802

> Scope: /admin/labels consolidated review flags — one flag per point with ordered action items.

Run one with `/task-next`. To drain the file, loop a plain-text instruction —
**not** `/loop /task-next`, which a scheduled fire cannot invoke:

> `/loop Read .claude/skills/task-next/SKILL.md and follow it exactly — run one task from this branch's queue; do not add, edit, or reorder tasks; then stop.`

Append freely while it runs: the queue is re-read at the start of every
iteration, and the runner only ever rewrites a task's `status:` line.
Mark a task `next` to jump the queue.

Status values: `todo` (eligible to run), `next` (jump the queue), `doing` /
`done` / `blocked` (written by the runner around a dispatch), and `later`
(deferred — `/task-next`'s picker never selects it, so a loop drain skips
straight past it; promote a task to `todo` by hand once it's actually
ready).

## T1 · Review-flag model: one `reviewFlag` per point with ordered items

- **status:** done
- **model:** fable
- **files:** src/lib/services/labels/marks-state.ts, src/lib/services/labels/marks-copy.ts (item questions), tests/label-review-flag.spec.ts (new), tests/label-marks-copy.spec.ts ("the row roll-up" block)
- **done when:**
  - [ ] `marks-state.ts` exports an ordered `REVIEW_ITEMS` table (ids 1–6, each with its question and the codes it absorbs, exactly as in notes) and `reviewFlag(point, marks, points) → ReviewFlag | null`, where `ReviewFlag = { tone: MarkTone; state: MarkState; items: ReviewItem[]; demoted: boolean }` and `ReviewItem = { id: 1|2|3|4|5|6; question: string; tone: MarkTone; state: MarkState; members: { mark: LabelMark; state: MarkState; dismissKey?: string }[] }`; items with no members are absent; items come in id order; a deleted point returns null; a point with no members returns null.
  - [ ] Tone follows the per-item rules in notes (item 1 via `markTone`; item 2 amber only with `reserve_after_in`; item 3 amber only for `second_serve_called_out` / `first_serve_fault_alone`; item 4 amber when any `count` member is present or `pointWinnerContradicted` holds, else grey; items 5 and 6 amber); flag tone is amber if any item is amber; item state is `mostOpen` of its members' states and flag state is `mostOpen` of its items; a new spec `tests/label-review-flag.spec.ts` covers each item's tone both ways and the roll-up of states.
  - [ ] Members are gathered exactly as today's row reads them: `count` marks via `pointRowMarkList` + `markStates`, hint marks and the live row-read marks via `openHintMarks` (so a dismissed hint is not a member and `net_hit_contradicts_height` is dropped while `lastCallAnswer` is non-null); on a checked point every hint member reads `checked-as-is` unless it is `ending_stale` with the winner contradicted (then `open`), matching today's `openFlags`; the spec asserts a checked point's flag is not open unless contradicted.
  - [ ] `demoted` is true exactly for a grey flag whose only open item is item 4 and whose open item-4 members match one of three code signatures — {`net_hit_contradicts_height`}, {`ending_suspect_line`}, {`ending_suspect_line`, `winner_to_error_by_bounce`} — and false otherwise (an amber flag, any other item open, or any other member such as `ending_stale` / `last_landing_missing` keeps it); the spec covers all three demoted signatures and at least two kept neighbours (`winner_to_error_by_bounce` alone stays grey and kept; `net_hit` + `last_landing_missing` kept).
  - [ ] `rollupMarks`, `markTone`, `mostOpen`, `openHintMarks`, `pointRowMarkList` and `markSummary` keep their signatures and `npm run typecheck` and the existing specs `tests/label-marks-copy.spec.ts`, `tests/label-marks.spec.ts`, `tests/label-flag-nav.spec.ts` still pass unchanged (this task adds, it does not yet rewire callers).
- **notes:** Item table (id · question · codes): 1 "Missing shot?" · `same_player_consecutive`; 2 "Extra shots / two points in one?" · `shot_after_point_end`, `serve_after_serve_in`, `reserve_after_in`; 3 "Serves" · `second_serve_as_first`, `first_serve_fault_alone`, `second_serve_called_out`, `serve_in_landing_out`; 4 "How did the last ball end?" · `last_call_overruled`, `winner_disputed`, `net_hit_contradicts_height`, `ending_suspect_line`, `winner_to_error_by_bounce`, `ending_stale`, `last_landing_missing`, `last_shot_unresolved`, `result_type_unknown`; 5 "Who won?" · `pick_winner`, `winner_guessed`; 6 "Game & serve order" · `score_side_mismatch`, `service_court_repeat`, `tiebreak_score_off_six_all`, `segment_proposal_differs`. Order is strokes → last ball → ending → winner → game because each item reads what the ones above decide (a stroke change moves the last ball; the last ball's call derives the ending; the winner drives the labelled score, and `score_side_mismatch` / `service_court_repeat` are live off it). Item 4 is asked as the vendor called it (`lastCallQuestion`) when `last_call_overruled` is a member; `ending_stale` is item 4's "Then:" consequence line, never its own question. Put the six questions in `marks-copy.ts` as `REVIEW_ITEM_QUESTION` so T2/T4 share them. Each member keeps its `hintDismissKey` / `pointEndedKey` so per-item Dismiss needs no schema change. `demoted` is the design note's default (99 of 907 points in the 8 complete sessions, 36–46% changed vs a 52% base); keep it as a boolean on the flag rather than returning null so T4 can still draw the evidence lines in the open point. Every count/hint/hidden tier in `LABEL_MARK_META` is unchanged — this is a roll-up, not a retier. Use `tests/fixtures/label-session.ts` (`labelPoint`, `labelShot`) and the `marksOf` pattern from `tests/label-scorecard.spec.ts` for fixtures. No player names in fixtures.

## T2 · Header, flag list and jumps count points, grouped by item

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/lib/services/labels/flag-nav.ts, src/lib/services/labels/marks-copy.ts (`toCheckLabel`, `dataFlagsLabel`), src/components/admin/labels/label-flag-summary.tsx, src/components/admin/labels/label-dashboard.tsx, src/components/admin/labels/label-black-rail.tsx, src/components/admin/labels/label-console.tsx (`openCounts`, `flagStops` — minimal), tests/label-flag-nav.spec.ts, tests/label-marks-copy.spec.ts, tests/label-console.spec.ts
- **routes:** /admin/labels, /admin/labels/[sessionId]
- **done when:**
  - [ ] `openFlags(points, marks)` returns one `OpenFlag` per live, non-demoted point whose `reviewFlag` state is `open`: `{ pointId, pointNumber, data: tone === "data", items: ReviewItem[] }` (open items only, in id order); `tests/label-flag-nav.spec.ts` asserts a point carrying three open count marks yields exactly one flag, and a demoted point yields none.
  - [ ] `flagGroups` groups by item, not code: at most six groups in item order, each `{ name: question, count: points, rows: [{ code: item id as string, label: question, points }] }` (one row per item so `FlagKindRow` / the dashboard's `data-flag-kind` keep working); `flagStopLabel(stop)` for a mark stop is its first open item's question; the "Other" group is gone and the spec's "groups are the four kinds" / "listed under Other" tests are rewritten to the six items.
  - [ ] `toCheckLabel(n)` reads "N points to review" / "1 point to review" (0 stays "Nothing left to check") and `dataFlagsLabel(n)` reads "N data points" with its existing explanatory tail; `tests/label-marks-copy.spec.ts` "the header has one total's words" and any `tests/label-console.spec.ts` assertions on "flags to check" / "data flags" are updated to the new strings.
  - [ ] `LabelFlagSummary`'s count is points (`onPointsDetail` is dropped from the jump tooltip since the two numbers are now the same), its jump tooltip's first detail line is the next point's first open item's question, and the menu's "Next flag" row reads "Point N · <question>"; the score stop and `extraStops` slot stops are unchanged and still stepped.
  - [ ] `label-console.tsx` `flagStops` and `openCounts` compile against the new `OpenFlag` without a change in behaviour (`data` filter still splits amber/grey; recorded counts are now points), `label-dashboard.tsx` renders the item-grouped lists, and `npm run typecheck` plus `tests/label-flag-nav.spec.ts`, `tests/label-console.spec.ts`, `tests/label-session-fields.spec.ts` pass.
- **notes:** `stepFlag` is already one stop per point (`firstPerPoint`) and stays as is; `]`/`[` keep stepping amber flags and `'`/`;` grey ones. The recorded open counts (`recordOpenCounts`, Labels list) change meaning from marks to points — check the list's label on /admin/labels and reword if it says "flags". `FlagKindRow` keys rows by `row.code`; with one row per item use the item id (`"1"`…`"6"`) and keep `data-flag-kind` so the probe attribute survives. `OpenFlag.code` goes away — grep its consumers (`label-flag-summary.tsx` filters `openMarks.filter((f) => f.code === row.code)` for a row's next point; replace with an item-id filter over `items`). Header copy from the design: "332 points to review" · "39 data points"; tooltip "Point 41 · How did the last ball end?".

## T3 · Point-row chip reads the review flag

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/components/admin/labels/label-black-mark.tsx (`pointRowMarks`, `dataChip`, `chipHover`, `MarkChip`), src/lib/services/labels/marks-state.ts (`rollupMarks` removal or deprecation), tests/label-black-marks.spec.ts, tests/label-marks-copy.spec.ts ("the row roll-up")
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] `pointRowMarks` builds the row's chip from `reviewFlag` alone: `dataChip` is deleted and `rollupMarks` is no longer imported by any component (`grep -rn rollupMarks src/components` is empty); the chip's `count` is the flag's item count and `tone`/`state` are the flag's.
  - [ ] Chip words: exactly one open item → that item's question (item 4 with `last_call_overruled` reads the `lastCallQuestion`, e.g. "Was the last ball out?"); two or more open items → "Review · N"; nothing open → the existing quiet outline with no words; `tests/label-black-marks.spec.ts` "three open marks are one chip that counts them" becomes "three open marks on one question are one chip with that question" plus a new two-item "Review · 2" case.
  - [ ] A demoted flag draws no chip on the closed row (`data-mark-chip` absent) while the point's open point still receives its marks (asserted in the spec on the same fixture); a non-demoted grey flag still draws the grey filled chip, and a contradicted-winner point keeps an amber chip after being checked.
  - [ ] The chip tooltip's `name` is the chip's words and its `detail` lists the open items in id order as "N · question" lines (one line each; a single open item keeps today's two-part name/detail form with the item's evidence sentence); `aria-label` is `hoverLine` of the same.
  - [ ] `tests/label-black-marks.spec.ts` "hints are one grey chip on the row" is rewritten for the new rule (a `last_landing_missing` hint alone → grey chip "How did the last ball end?"; `net_hit_contradicts_height` alone → no chip) and the whole file plus `tests/label-black-rows.spec.ts` "the tail (chip, pencil) slides with the score" pass under `npm test -- tests/label-black-marks.spec.ts tests/label-black-rows.spec.ts`.
- **notes:** Keep `MarkChip` itself: same classes, `data-mark-*` attributes, the icon-only form under 600px. Chip copy from the mockup: "Review · 2"; a single open item shows the item's question (an item-6-only point reads "Game & serve order", not its member's `MARK_LABEL`). The grey chip for a kept data flag is the existing `bg-white/[0.10] text-white/70`. Offline component specs render through `tests/fixtures/vm-modules.ts` `createLoader()` + `renderToStaticMarkup`, see the existing describe blocks in `tests/label-black-marks.spec.ts`.

## T4 · Open point: review block replaces the hint line

- **status:** todo
- **model:** opus
- **needs:** T1, T3
- **files:** src/components/admin/labels/label-black-mark.tsx (`PointHintLine` → `ReviewBlock`, `pointHints` → item actions), src/components/admin/labels/label-black-shot-row.tsx (well composition), src/lib/services/labels/review-block.ts (new, pure collapsed-row helper), src/lib/services/labels/marks-copy.ts (answer labels, "Then:" line), tests/label-black-marks.spec.ts, tests/label-after-point-hint.spec.ts, tests/label-review-flag.spec.ts
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] The open point's well ends in one `data-review-block` element in place of `data-point-hints` (the quiet line is gone from the tree) with a header "Review · in this order" and one `data-review-item="<id>"` row per item of `reviewFlag(...).items` in id order, each showing its number, its question, its evidence lines (each member's `markHover` sentence, deduplicated) and its answers as `BlackTextAction`s; a demoted flag's block draws the same items with evidence lines but no header.
  - [ ] Item 4 is one question with one answer row: with `last_call_overruled` the question is `lastCallQuestion(vendorCall)` and the answers are "Yes, make it <call>" (existing `lastCallAction` patch) · "It was in" (shot patch `result: "in"`, only when the vendor call is not in) · "Place the bounce" (selects the last live shot); with no landing (`last_landing_missing` and no `last_call_overruled`) the item leads with "Place the bounce"; `ending_stale` renders as the item's "Then: <ownedEndingPhrase>" line with its existing `staleEndingAction` as the line's one action, never as a separate item; the spec asserts the single answer row and the Then line on a fixture carrying `last_call_overruled` + `ending_suspect_line` + `ending_stale`.
  - [ ] Items that live on one stroke (item 1 `same_player_consecutive` slots, item 3 `second_serve_as_first`, item 2 `shot_after_point_end` / `serve_after_serve_in`, `serve_in_landing_out`) keep their existing inline suggestion row at the stroke (unchanged in the tree) and appear in the block as a one-line pointer "N · <question> — at shot K" with no second copy of their answers; the spec asserts the pointer line and that the inline row is still present.
  - [ ] A pure helper `reviewBlockRows(previous: ReviewItem[] | null, current: ReviewFlag | null)` derives each row's display state: an item no longer `open` renders collapsed as "✓ <what was done>" (`stateHoverParts`' sentence), and an item present in `previous` but absent from `current` renders collapsed as "Cleared by N", N being the lowest-numbered item that changed state between the two; its spec covers answered, cleared and unchanged; the block holds `previous` as the items at the moment the point was opened.
  - [ ] Per-item Dismiss stores every member's `dismissKey` through `operations.onDismissSuggestion` (one call per key); answers render only through `BlackTextAction` (no new button component); "Looks right" in the block header calls the existing check tick's handler, not a new write; `tests/label-after-point-hint.spec.ts` and `tests/label-black-marks.spec.ts` "the hints read off the rows, with their answers" are updated and pass.
- **notes:** Mockup: block is a `rounded-[6px]` wash at `--rail-amber` 6% (`--rail-amber-wash-faint`), 8px/10px padding, title 10px uppercase 1.5px tracking at white/45, items `grid-cols-[16px_1fr]` with a 1px white/6 rule between them, item number in mono amber (grey for a grey item, white/30 once done), question 12px white/92, evidence 11px white/45, answers 11.5px text actions, "Then:" 11px white/50. Example rows: "1 · Missing shot?: at shot 4" / "B hit twice in a row. A stroke near the end decides who hit the last ball."; "2 · How did the last ball end? Out?" / evidence "Vendor called it out · it landed within 1 m of the line · score says B won, last shot says A" / answers "Yes, make it out · It was in · Place the bounce · No" / "Then: error by A, point to B". Answered: "✓ Missing shot: added a backhand by A"; cleared: "– How did the last ball end? Cleared by 1". Keep `hintActions`' existing patches — the block is a new arrangement of the same writes. `label-black-shot-row.tsx` currently splits hints into `under` (inline rows), `offered` and `quiet`; after this task `under` stays and the other two feed the block. Dark-rail tokens only (`label-rail-tone.ts`); read `.skills/advantage-analytics-design/SKILL.md` first.

## T5 · `]` / `[` land on a point with its first open item focused

- **status:** todo
- **model:** opus
- **needs:** T2, T4
- **files:** src/components/admin/labels/label-console.tsx (`findGap`, `stepToFlag`, the jump `useEffect`), src/components/admin/labels/label-black-mark.tsx (`ReviewBlock` focus target), tests/label-console.spec.ts
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] A jump made through `stepToFlag` (keys `]`, `[`, `'`, `;` and the header's Next/Previous rows) opens the landing point unfolded and, once the row has rendered, moves focus to the first open item's first `BlackTextAction` inside `[data-review-block]` (or the item's inline suggestion row's first action when the first open item is stroke-level); the block's items carry `data-review-item-state` so the target is found by `[data-review-item-state="open"]`.
  - [ ] A jump to the score stop or a slot stop (no review flag on the point) behaves as today: the point opens and scrolls into view, nothing is focused, and no error is thrown when `[data-review-block]` is absent.
  - [ ] Opening a point by clicking its row (not a jump) does not move focus — `findGap` takes a `{ focusItem?: boolean }` option that only `stepToFlag` and the summary's `onGoToPoint` set, so the existing "a cell left focused in the old row" blur behaviour is unchanged.
  - [ ] `tests/label-console.spec.ts` gains a case asserting that after `]` the active element is inside the landing point's `[data-review-block]` and belongs to its lowest-numbered open item, and the existing jump/scroll cases still pass.
- **notes:** `findGap` already sets `jumpToPointId.current` and a `useEffect` scrolls the row after the hold renders — the focus call belongs in that same effect, after `scrollTo`, guarded by `focusItem`. Respect `reducedMotionNow()` for scrolling as today. Do not focus when a confirm dialog or an open menu holds the keys (`confirm` guard in `stepToFlag`).

## T6 · Scorecard: per-item table beside the per-code one

- **status:** todo
- **model:** sonnet
- **needs:** T1
- **files:** src/lib/services/labels/scorecard.ts (`buildScorecard`, `renderScorecard`, `Scorecard` type), tests/label-scorecard.spec.ts, scripts/label-scorecard.ts (only if the renderer's call site needs it)
- **done when:**
  - [ ] `Scorecard` gains `items: ScorecardItemRow[]` with `{ id, question, tone: "score" | "data", points, winnerChanged, endingChanged, anythingChanged }`, one row per (item, tone) that at least one point carries, built from `REVIEW_ITEMS` over each seeded point's opening marks: a point counts once per item it carries (not once per member mark), measured against `pointChange` the same way the per-code rows are; a deleted point's absorbed marks follow the existing `combinedInto` rule.
  - [ ] A further row for the demoted points (`demoted: true` under the T1 rule, computed from the opening marks with the hidden tier dropped) so the table shows their change rates beside the kept grey ones.
  - [ ] `renderScorecard` writes a "## Items, against what the labeller changed" section after the per-code table with columns Item · Tone · Points · Winner changed · Ending / ended by changed · Anything changed, using the existing `table` and `share` helpers; rows ordered amber before grey, then by item id.
  - [ ] `tests/label-scorecard.spec.ts` gains a describe "the per-item table" asserting: two count marks of item 4 on one point make one row with `points: 1`; a point with marks in items 1 and 4 counts in both; the rendered Markdown contains the new heading and a row for each; existing per-code tests are untouched and pass.
- **notes:** The scorecard measures seed against now (`pointChange`); live row marks (ending_stale, last_landing_missing, …) are not in `openingMarks`, so they contribute no members here — say so in the section's lead sentence. Tone per item uses T1's rules; `markTone` for item 1 needs `marks.suggestions`, which `openingMarks` carries. `scripts/label-scorecard.ts` is the only importer of `renderScorecard`.
