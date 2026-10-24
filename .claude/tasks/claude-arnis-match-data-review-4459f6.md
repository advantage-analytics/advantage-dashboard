# Tasks — claude/arnis-match-data-review-4459f6

> Scope: label console (/admin/labels/[sessionId]) review speed — call toggle and last-ball fix (PR #539), then start score, locked game boundaries, placement, zoom, caching, navigation, timestamps and reset keys.

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

## T1 · Start score: column + scoring from a start

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<ts>_label_sessions_start_score.sql (new), src/lib/services/labels/session-fields.ts, src/lib/services/labels/session.ts, src/lib/data/labels-server.ts, src/lib/services/labels/score.ts, src/lib/services/labels/set-scores.ts, src/lib/services/labels/game-shift.ts, src/lib/services/labels/apply.ts, tests/label-score.spec.ts, tests/label-set-scores.spec.ts, tests/label-game-shift.spec.ts, tests/label-apply.spec.ts, tests/label-session-fields.spec.ts (guesses)
- **done when:**
  - [ ] A committed migration adds `label_sessions.start_score jsonb` (null = the video starts at the beginning of the match) and the same migration is applied to the live project; `LabelSession` gains `startScore` read in `labels-server.ts`, and `session-fields.ts` adds `start_score` to `KEYS` with `parseLabelSessionPatch` accepting `{ sets: [n, n], games: [n, n], points: [n, n], server: "p1" | "p2" }` or null and refusing anything else (spec).
  - [ ] `labelScores(points, adScoring, start?)` counts from the start: with `start = { sets: [0,0], games: [2,0], points: [1,0], server: "p1" }` the first band's `gamesBefore` is `"2–0"`, its `server` is `p1`, the first point's `scoreBefore` is `"15–0"`, and a game decided after three more p1 points is `decided` (spec on a fixture).
  - [ ] `labelSetScores` starts set 1's games at `start.games`, and `gameOverflow` / `gameUnderflow` read the first game from `start.points` so a game that is complete only when counted from the start is neither overflow nor underflow (spec).
  - [ ] `buildAppliedRows` (apply.ts) writes set, game and point scores and the pressure flags (`is_break_point`, `is_set_point`, `is_match_point`) counted from the start, with sets-won-before including `start.sets` (spec with a start on the apply fixture).
  - [ ] With `start_score` null every spec above produces exactly what it produced before (existing specs unchanged and green).
- **notes:** Design A (approved 2026-10-24, canvas board "StartScore"). `video_starts_mid_match` and `first_server` already exist on `label_sessions` but nothing reads them — leave them in place, do not drop or read them; the new jsonb carries the whole start. `points` are counts (0–3 for 0/15/30/40 in an ordinary game; any count when the first game's `gameType` is a tiebreak). Label tables are service-role-writes-only (`label_tables_service_role_writes_only`), so the existing `updateSessionFields` server action path carries the write — no new grants. Live DB is the source of truth: apply via the Supabase MCP `apply_migration` and commit the file. T2 builds the rail UI on this.

## T2 · Start score: rail prompt, editor, saved line

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** src/components/admin/labels/label-black-rail.tsx, src/components/admin/labels/label-console.tsx, src/components/admin/labels/label-start-score.tsx (new), tests/label-session-fields.spec.ts, tests/label-black-rows.spec.ts (guesses)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] On an editable rail, when set 1's labelled games do not add up to the entered/record score and `startScore` is null, a prompt row "Does the video start mid-match?" renders above point 1 (`data-start-score-prompt`); it does not render when the set adds up or a start is saved (renderToStaticMarkup spec via `createLoader`).
  - [ ] The rail header's session menu has a "Video starts mid-match…" item that opens the same editor, whether or not the prompt is showing (spec on the menu's rows).
  - [ ] The inline editor offers sets, games, points (0 / 15 / 30 / 40 in an ordinary first game; a count when the first game is a tiebreak) and the server, and Save calls `updateSessionFields(sessionId, { start_score: {...} })` with the parsed shape (spec with the console's `operations` spies).
  - [ ] With a start saved, the prompt is replaced by a saved line reading `Video starts at 2–0 · 15–0, Rudy serving` (names from `sideNames`) with an Edit button that reopens the editor (markup spec).
  - [ ] The console passes `session.startScore` into every `labelScores` / `labelSetScores` / `gameOverflow` / `gameUnderflow` call it makes, so the first band and point scores on the rail count from it (spec: the first band's score text reads `2–0` on a fixture with a start).
- **notes:** Design A. Inline editor sits in the rail where the prompt was, not a dialog. Keep the existing "Score doesn't add up" chip; this prompt is a second answer to the same mismatch (the other being `video_ends_early`). Read `.skills/advantage-analytics-design/SKILL.md` before building; the rail is the black view (`label-black-*`).

## T3 · Locked game boundary: lock column + lock-aware readings

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<ts>_label_points_game_start_locked.sql (new), src/lib/services/labels/session.ts, src/lib/data/labels-server.ts, src/lib/services/labels/game-boundary.ts, src/lib/services/labels/operations.ts, src/lib/services/labels/game-shift.ts, src/lib/services/labels/point-split.ts, src/lib/services/labels/point-combine.ts, tests/label-game-shift.spec.ts, tests/label-point-split.spec.ts, tests/label-point-combine.spec.ts, tests/label-operations.spec.ts (guesses)
- **done when:**
  - [ ] A committed migration (also applied live) adds `label_points.game_start_locked boolean not null default false`; `LabelPoint` carries `gameStartLocked` read in `labels-server.ts`, and the boundary move (`planGameBoundary` → the console's `moveBoundary` writes) sets it true on the game's new first live point in the same op, so one `undo_label_op` rewinds both the move and the lock (spec over the fake client: the write batch contains the flag; label-undo.spec unchanged).
  - [ ] A pure reading `lockedGames(points)` lists the game keys whose first live point is locked, and `gameOverflow` / `gameUnderflow` skip those games (spec: a locked overflowing game is absent from both lists).
  - [ ] A pure reading `lockedGameImbalance(points, adScoring, start?)` lists, for each locked game whose outcome is not `decided` on its last row, the ids of the game's live points NOT won by `band.winner` (score.ts: the winner of its last counted point), in rail order (spec on a 5-point game with one wrong winner → one id).
  - [ ] Point split keeps the lock on the earlier half; point combine keeps it when either combined point held it; a point move into a locked game does not clear it and a move out does not carry it (specs on each plan).
- **notes:** Design B (approved 2026-10-24, board "Boundary"). Evidence behind it: in 124 unbalanced games a winner was wrong in 103, so a dragged boundary is the labeller's word and the rail should stop offering to move points across it. The lock lives on `label_points` (not a session jsonb) so the row-history journal undoes it with the move — that is the reason for the column choice. T4 draws it.

## T4 · Locked game boundary: band lock + amber "doesn't add up" slot

- **status:** done
- **model:** opus
- **needs:** T3
- **files:** src/components/admin/labels/label-game-band.tsx, src/components/admin/labels/label-black-rail.tsx, src/components/admin/labels/label-game-underflow.tsx, src/components/admin/labels/label-game-locked.tsx (new), src/components/admin/labels/label-console.tsx, tests/label-game-band.spec.ts, tests/label-game-shift.spec.ts (guesses)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] A locked game's band renders a lock icon and the text "set by you" (`data-game-locked`); an unlocked band renders neither (markup spec).
  - [ ] For a locked game, neither the "Game N is already won → Move to game N" slot nor the "isn't finished → Move here" slot renders; in their place one amber slot reads `Game N doesn't add up: an ending is probably wrong` with two actions, `Check N points` and `Add point`, where N is `lockedGameImbalance`'s count for that game (markup spec on a locked overflowing fixture; the unlocked fixture still gets the old slots).
  - [ ] `Check N points` steps the console through those point ids in order (first click → first id, next click → next, wrapping), using the console's existing `findGap(pointId, { arm: true })`; `Add point` calls the same insert the underflow slot's "Add point" calls (spec with the console's operations spies / react-tree).
  - [ ] Undo after a boundary drag leaves no lock (the band loses the icon once the undone rows come back without the flag) — spec applying the undo result rows to the console's state.
- **notes:** Design B. Amber = the rail's existing `--rail-amber` slot tone (see `label-game-underflow.tsx` for the slot shape and `data-game-underflow-action` convention). The lock survives split/combine/move by T3.

## T5 · Placement flow: next shot after a landing, one-click edge contact, guides by default

- **status:** done
- **model:** opus
- **files:** src/components/admin/labels/court-placement.ts, src/components/admin/labels/label-console.tsx, src/components/admin/labels/label-court.tsx, src/components/admin/labels/label-court-panel.tsx, tests/label-stroke-keys-court-zoom.spec.ts, tests/label-court-panel.spec.ts (guesses)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] `nextPlacement` takes the point's live strokes (or the next shot's id) and, after a landing, answers a state armed on the NEXT stroke's contact (`shotId` = next shot, `target: "contact"`, half = that hitter's); on the point's last stroke it answers no selected shot rather than cycling back to the same stroke's contact (spec).
  - [ ] The console shows a notice `Landing placed · next: shot N contact` (`data-placement-notice`) after such a landing, and no notice after a contact (markup spec via the court panel / console render).
  - [ ] The `RUNOFF_EDGE` growth branch is gone from `nextPlacement` and the console's `growing` is removed: a contact clicked at the run-off's back edge is written as clicked and the state moves on to the landing in one click (spec replacing the current "stays armed with more run-off" test; `RUNOFF_EDGE`/`RUNOFF_STEP` exports may go).
  - [ ] On a half view the run-off guides (`runoffGuides`) and the usual-edge line render by default, each guide labelled (`+2 m`, `+4 m`, …, "usual edge"), out to the box's current depth; deeper contacts are reached by the existing drag/scroll of the box (`moveWindow`) with guides continuing (markup spec: a half view with no slide contains the `+2 m` guide label).
- **notes:** Design C (approved 2026-10-24, board "Placement") — the SAME court as today: same box, scale and lines; only the flow and cues change. Keep `courtSlide`'s "deep" slide for a stored contact deeper than the usual run-off (`placementRunoff` from the stored contact still applies); only the click-to-grow is removed. T6 adds the prompt/glyph cues on the same files.

## T6 · Placement cues: visible prompt, end glyphs, nearest-end reselect

- **status:** done
- **model:** opus
- **needs:** T5
- **files:** src/components/admin/labels/label-court-panel.tsx, src/components/admin/labels/label-court.tsx, src/components/admin/labels/court-placement.ts, src/components/admin/labels/label-console.tsx, tests/label-court-panel.spec.ts, tests/label-stroke-keys-court-zoom.spec.ts (guesses)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] The placement prompt (`placementPrompt`: "Click where shot N was hit" / "… landed") renders visibly in the court panel (`data-court-prompt` is no longer `sr-only`) while placing, and is absent with no stroke selected (markup spec).
  - [ ] The Contact / Landing switch buttons each carry an end glyph — a hollow ring for Contact, a filled dot for Landing (`data-end-glyph="contact" | "landing"`) — and the half court's box carries `data-court-cursor="contact" | "landing"` with a CSS `cursor` of the matching SVG data-URI glyph while placing (markup spec).
  - [ ] A pure `nearestEnd(shot, point)` answers `"contact"` or `"landing"` by distance to the stroke's stored ends (null when neither is placed) (spec); a court click within the mark's hit radius of an already-placed end of the open point's strokes selects that stroke on that end instead of placing (`onSelectShot(shotId, end)` via the court's existing `selectShot(id, target)`), spec'd with the console's render harness or a source assertion.
  - [ ] Selecting an already-placed stroke from its row still opens on its contact by default (existing `placementOf` behaviour unchanged, existing specs green).
- **notes:** Design C, same court as today. Glyphs match the court's own marks (hollow ring = hit, filled dot = landed, label-court.tsx header comment). Cursor glyph: inline SVG data URI in a `style` prop is fine; keep the crosshair at zoom > 1 drag states as today.

## T7 · Court zoom: reproduce, then pin the behaviours as pure specs

- **status:** done
- **model:** opus
- **files:** src/components/admin/labels/label-court.tsx, src/components/admin/labels/court-geometry.ts, tests/label-stroke-keys-court-zoom.spec.ts (guesses)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] The spec gains a test whose comment names the failure reproduced in the browser (which control — + / −, ⌃-wheel pinch, drag-pan, or a placing click's near↔far flip — and what went wrong) and whose assertion fails on the pre-task `label-court.tsx` and passes after; the commit message names the same failure.
  - [ ] `zoomAbout` is the one function + / − (about the box centre, 50/50) and the ⌃-wheel (about the cursor) use; a spec asserts that for scales {1.5, 2.25, 4} the court point under the anchor is unchanged after the zoom, and that zooming in then out by the same factor from any pan returns exactly `NO_ZOOM` at scale 1.
  - [ ] A pure `carryZoom(zoom, fromTop, toTop)` (name as you like) re-anchors the zoom across a box slide / near↔far flip so the court spot under the box centre stays under the centre, clamped so the art never shows outside the box; `LabelCourt` uses it where `openedTop` changes, resets to `NO_ZOOM` on whole↔half AND when the selected stroke changes (spec on the function; source assertion for the reset keys, as the existing spec does).
  - [ ] A round-trip property spec: for scales {1, 1.5, 2.25, 4}, several pans and several box tops, a court point drawn at box percent (`fromCourtInWindow` then the zoom transform) maps back through `artPoint` + `toCourtInWindow` to within 1 cm of the same point.
- **notes:** The user reported "zoom in/out is broken" with no detail — reproduce first (dev server, a half view: + / −, pinch with ⌃-wheel, drag-pan, then a placing click that flips near↔far, then a slide) and record what you saw in the spec comment and commit; do not invent a bug. Lead worth checking: `zoomState` keeps the percent offsets `zoom.x/y` across an `openedTop` change, which is a different court spot once the box has moved. Transform origin is already `0 0`, so `panBy`'s clamp math matches the CSS.

## T8 · Cache the derived transcript per job

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<ts>_label_transcript_cache.sql (new), src/lib/data/labels-server.ts, src/lib/services/labels/transcript-cache.ts (new), src/lib/services/splitstep/persist-transcript.ts, tests/label-marks.spec.ts, tests/label-transcript-cache.spec.ts (new) (guesses)
- **done when:**
  - [ ] A committed migration (also applied live) adds a service-role-only cache table keyed on `job_id` + `derivation_version` + `results_object_key` + `trajectories_object_key` + a fingerprint of the match's `score`, `format` and the job's `ad_scoring`, holding the built transcript and rallies as jsonb; no grant to `anon` or `authenticated`.
  - [ ] `buildJobMarks` reads the cache before `buildTranscriptForJob`: on a hit it downloads nothing from Storage (spec over a fake client counting `.download` calls: second call → 0); a change to any key part misses and rebuilds (spec).
  - [ ] The cache is written only after a build whose `transcript.ok` is true; a failed or unreconciled build writes nothing (spec).
  - [ ] `buildLabelMarks` still runs on every load over the request's live points — the join is not cached (spec: two loads with different points produce different marks from the same cache row).
- **notes:** The page is `force-dynamic`, so a Next cache would not hold across Vercel invocations; a table is the durable spot. `DERIVATION_VERSION` lives in `src/lib/services/splitstep/derivation/index.ts`. Keep `marks_enabled` semantics: the ground-truth session never computes marks. T9 is the Undo half of the same intent.

## T9 · Undo answers a diff, not every row

- **status:** done
- **model:** fable
- **files:** supabase/migrations/<ts>_undo_label_op_returns_rows.sql (new), src/lib/services/labels/undo-session.ts, src/lib/data/labels-server.ts, src/components/admin/labels/label-console.tsx, tests/label-undo.spec.ts, tests/label-console.spec.ts (guesses)
- **done when:**
  - [ ] A committed migration (also applied live) replaces `undo_label_op` so its answer also lists the rows it touched: `{ undone, remaining, points: [row ids], shots: [row ids], deleted_points: [...], deleted_shots: [...] }`; the function keeps its `P0001` refusal for a non-`labelling` session and its existing grants (service_role only — a `drop` + `create` resets grants, re-grant).
  - [ ] `undoLabelOp` reads only the touched rows (points by id with their shots, plus the owning points of touched shots) and answers `{ ok, undone, remaining, changed: LabelPoint[], removedPointIds: string[] }` instead of every row (label-undo.spec: the fake client is asked for exactly the listed ids).
  - [ ] The console applies the diff — replaces `changed` points in place, drops `removedPointIds`, and re-sorts rows by the existing rail order — with no whole-session re-read (console spec applying a diff to the fixture).
  - [ ] An undone split/combine, which moves strokes between two points, comes back correct because both owning points are in `changed` (spec with a two-point diff).
- **notes:** Current flow: `undo_label_op` → `readLabelSessionRows` whole (`undo-session.ts`). The journal (`label_row_history`) already records `tbl`, `op`, `row_id` per undone row, so the function can return them from the rows it rewinds before pruning them. `apply_migration` via the MCP declines a bare `DROP` — use `create or replace` where the signature allows, else see the repo memory on that.

## T10 · Navigation: pin holds while the film plays, selection follows the current point, ←/→ re-follow

- **status:** done
- **model:** opus
- **files:** src/components/admin/labels/label-console.tsx, src/components/admin/labels/label-now-playing.ts, tests/label-console.spec.ts, tests/label-playback.spec.ts (guesses)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] A pure `currentPointOf({ pinned, playing, rest, points })` (extracted from the console) answers the pinned point while the pin holds, even when `playing` moves to another point; the pin is released only when its point is deleted/combined away or the labeller lets go — not by playback (spec; the current `pinned.at === playingKey` release is gone).
  - [ ] When the current point changes, a placement/selection whose stroke is not in the new current point is cleared to `NO_PLACEMENT` in the same render (spec via the console render harness or a pure helper `selectionFor(placement, currentPoint)`), so stroke keys never hit a stroke of another point.
  - [ ] ← / → (the film step keys) release the pin and the console follows the film again (spec: after the key the pinned state is null; source assertion acceptable as the existing specs do).
  - [ ] The `holdPoint` / follow pill (`label-follow-pill.tsx`) copy and behaviour still match: the pill offers the way back to the playing point while held (existing specs green).
- **notes:** The console's `currentPointId = pinnedPointId ?? playingPointId ?? restPointId` stays the one derivation. T11, T12, T13 edit the same keyboard effect — chain, do not run in parallel.

## T11 · Navigation: ↑/↓ on a folded point, focus never seeks, flag jumps step from the last flag

- **status:** todo
- **model:** opus
- **needs:** T10
- **files:** src/components/admin/labels/label-console.tsx, src/components/admin/labels/label-black-shot-row.tsx, src/components/admin/labels/label-black-rail.tsx, tests/label-console.spec.ts, tests/label-black-rows.spec.ts, tests/label-flag-nav.spec.ts (guesses)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] ↑ / ↓ on a folded current point unfolds it and selects its first (↓) or last (↑) live stroke instead of doing nothing (`stepShot` no longer bails on `unfoldedPointId !== expanded.id`) (spec).
  - [ ] Focusing a shot row (`onFocus={select}` in `label-black-shot-row.tsx`) selects without seeking: the row passes a `{ seek: false }` option through `onSelectShot`, while a click still seeks (react-tree spec asserting the two handlers' arguments).
  - [ ] `]` / `[` and `'` / `;` step from the last flag landed on (`lastFlagPointId` ref, set by `stepToFlag` and cleared when the labeller selects or clicks another point), falling back to `currentPointId` when none (spec with `stepFlag` inputs or the console harness).
  - [ ] Existing `label-flag-nav.spec.ts` and `label-black-rows.spec.ts` stay green.
- **notes:** Same keyboard effect as T10/T12/T13. The seek lives in the console's `selectShot(..., { seek })` already — the row only needs to say which it wants.

## T12 · Shot timestamp: T key, time cell, editor survives a scrub, Escape cancels

- **status:** todo
- **model:** opus
- **needs:** T11
- **files:** src/components/admin/labels/label-console.tsx, src/components/admin/labels/label-video.tsx, src/components/admin/labels/label-cells.tsx, src/components/admin/labels/label-black-shot-row.tsx, src/components/admin/labels/stroke-keys.ts, tests/label-console-edit.spec.ts, tests/label-console.spec.ts, tests/label-stroke-keys-court-zoom.spec.ts (guesses)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] `T` (outside a text field, menu or dialog) writes the selected stroke's `video_time` to the paused frame's time on the analysis clock — the player's file time plus `fileOffset` (`LabelVideoHandle` gains `currentTime()` or the console reads its playhead store), rounded to milliseconds like `parseFileTime` — through the usual `patchShot`; `{ key: "T", label: "time = frame" }` joins `STROKE_KEY_HINTS` (spec on the hint list and the console's key handler).
  - [ ] Clicking the time cell of an unselected row selects the row without seeking the film (the cell's click passes `{ seek: false }`; the row's other cells keep seeking) (react-tree spec).
  - [ ] An open time `TextEditor` stays mounted while the film scrubs: its draft is keyed by the shot id, not by the shown text, so a `text` prop change under it does not unmount or reset the draft (spec rendering the editor twice with different `text` and the same draft).
  - [ ] Escape in the time editor reverts the draft and does NOT commit — `onBlur`'s commit is skipped when the blur follows an Escape (spec: Escape then blur → `onCommit` never called; Enter → called once).
- **notes:** Clocks: `label_shots.video_time` is on the analysis clock; the player shows file time (`formatFileTime` / `fileSeconds`, label-format.ts). Today Escape in `TextEditor` sets `draft` null and the following blur sees `draft === null` → no commit — verify whether the console's window-level Escape handler blurs before React processes the state, which is the likely cause of the reported commit; fix at the editor, not by guarding the console.

## T13 · Reset shortcuts: R and ⇧R

- **status:** todo
- **model:** sonnet
- **needs:** T12
- **files:** src/components/admin/labels/label-console.tsx, src/components/admin/labels/stroke-keys.ts, src/components/admin/labels/label-black-shot-row.tsx, tests/label-stroke-keys-court-zoom.spec.ts, tests/label-reset.spec.ts (guesses)
- **routes:** /admin/labels/[sessionId]
- **done when:**
  - [ ] `R` (no modifier, outside a text field/menu/dialog) asks the existing `reset-shot` confirm for the selected stroke when `canResetShot(shot)` is true, and does nothing otherwise (spec via the console harness: `setConfirm` kind `reset-shot`).
  - [ ] `⇧R` asks the existing `reset-point` confirm for the open point with `pointResetScope(point, sharesVendorRally(point, points))`, and does nothing when `canResetPoint` is false (spec).
  - [ ] `STROKE_KEY_HINTS` gains `{ key: "R", label: "reset shot" }` and `{ key: "⇧R", label: "reset point" }` (spec on the list).
  - [ ] The shot tray's Reset button carries `aria-keyshortcuts="R"` (react-tree / markup spec in label-black-rows.spec).
- **notes:** Both go through the existing confirm — never a direct reset. Chained after T12 only because it edits the same keyboard effect.
