# Run log — claude/arnis-match-data-review-4459f6

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Start score: column + scoring from a start — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Migration `20261024075521_label_sessions_start_score` adds `label_sessions.start_score jsonb` (applied live). `LabelStartScore` + `LabelSession.startScore`; `session-fields.ts` parses `start_score` (four exact keys) or null. `labelScores`, `labelSetScores`, `gameOverflow`/`gameUnderflow` (and the shift/pull plans), `buildAppliedRows` and the completion warnings count from an optional start; null behaves as before. New start-score specs in five label spec files.
**follow-ups:**

1. Console consumers (label-console, black rail, point menu, game underflow, dashboard, flag-nav, scorecard, score-marks, tiebreak-fold, game-shift-session) still call the scorers without the start — thread `session.startScore` through all of them in T2.
2. Validate the start's point counts against the first game's type in the editor: a start that already settles the first game makes its first row a leftover.

## T2 · Start score: rail prompt, editor, saved line — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** New `label-start-score.tsx`: the amber "Does the video start mid-match?" prompt above point 1 (built on `gameSlot`), the inline editor (sets/games steppers, 0/15/30/40 or tiebreak count, server; refuses a start that already settles the first game) and the saved line "Video starts at … , X serving" with Edit. The rail gains a "⋯" session menu with "Video starts mid-match…". "It starts at 0–0" saves a real 0–0 start. `session.startScore` is threaded through every console-side scorer (console, rail, dashboard, underflow, point menu, row parts, flag-nav, score-marks, scorecard + script, tiebreak-fold, session-status, game-shift-session). New `tests/label-start-score.spec.ts` (15 specs).
**follow-ups:**

1. The rail's "⋯" session-menu button has an aria-label but no dark tooltip, which the design system's banned list requires for icon-only buttons.
2. The prompt only shows when marks are built (it reuses the score chip's mismatch gate).
3. No way to clear a saved start back to null; saving 0–0 has the same effect.
4. A start with sets already played is not matched against the vendor's set numbering.

## T3 · Locked game boundary: lock column + lock-aware readings — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Migration `20261024085016_label_points_game_start_locked` adds `label_points.game_start_locked boolean not null default false` (applied live; the undo journal already captures whole rows, so Undo rewinds the lock with no journal change). `LabelPoint.gameStartLocked` via `rows.ts`. `planGameBoundary` returns `lockPointId` / `unlockPointIds`, and `writeLabelPointsMove` writes the lock in the same op as the moves. New `lockedGames` and `lockedGameImbalance` in `game-boundary.ts`; `gameOverflow` / `gameUnderflow` skip locked games, `planGameShift` refuses a locked destination and `planGamePullFrom` answers `add_point` for a locked donor. Split keeps the lock on the earlier half, combine keeps it from either part, a move out clears it. Specs in label-game-shift, label-serve-order, label-operations, label-point-split, label-point-combine.
**follow-ups:**

1. The one-at-a-time `movePoint` fallback writes no lock (the page always supplies `movePoints`).
2. Inserting a point before a locked first point leaves the lock on the second row — decide whether insert-before should carry it.
3. No way to clear a lock except Undo; T4 may want an explicit unlock.
4. `lockedGameImbalance` follows the literal `band.winner` rule; in an overflowing game it flags the decider's points — confirm on real data.

## T4 · Locked game boundary: band lock + amber "doesn't add up" slot — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `label-game-band.tsx` reads `locked` from the game's first live row and draws a Lucide Lock + "set by you" (`data-game-locked`). New `label-game-locked.tsx`: `lockedSlotsAtPoints`, a wrapping per-game `checkStepper`, and `BlackGameLocked` — the amber `gameSlot` row `game-imbalance` "Game N doesn’t add up: an ending is probably wrong" with "Check N points" (steps through `lockedGameImbalance`'s ids via the console's `findGap(id, { arm: true })`) and "Add point" (the underflow slot's insert). Rendered by `label-black-rail.tsx` under the locked band; `label-black-parts.tsx` gains the row value. Specs in label-game-band (+2) and label-game-shift (+5).
**follow-ups:**

1. The locked-game slot is not in `slotStops`, so `]` / `[` and the header's flag count skip it.
2. Two specs check console/rail wiring by reading source text — brittle against refactors.
3. Not yet checked in a browser.

## T5 · Placement flow: next shot after a landing, one-click edge contact, guides by default — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** `nextPlacement(state, point, shot, strokes)` arms the next live stroke's contact after a landing (its stored half, else by hitter) and answers `NO_PLACEMENT` on the last stroke; `placementNotice()` gives "Landing placed · next: shot N contact", drawn in the court panel's subtitle slot (`data-placement-notice`). The run-off growth click is gone (`PlacementState.runoff`, the console's `growing`); a back-edge contact is placed in one click and `placementRunoff`/the deep slide still work from a stored contact. New `windowRunoffs(top)`: labelled +2 m… guides and the usual-edge line on every half view, following `moveWindow`, kept at size under zoom. Court box, scale and lines unchanged. Specs in label-stroke-keys-court-zoom, label-court-panel, label-console-edit, label-console.
**follow-ups:**

1. Arming the next stroke's contact does not seek the film to it — decide whether it should.
2. The notice replaces the subtitle, hiding the "run-off to X m" readout while it shows; T6 may restyle.

## T6 · Placement cues: visible prompt, end glyphs, nearest-end reselect — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** While placing, the court panel's title is the end glyph plus the visible prompt "Click where shot N was hit / landed" (13px, `aria-live`, `data-court-prompt`); the Contact / Landing switch carries `EndGlyph`s (`data-end-glyph`). The half court box carries `data-court-cursor` with an SVG ring/dot cursor at zoom 1 (grab hand unchanged when zoomed). New pure `nearestEnd(shot, point)`; `markEndAt` selects a drawn end clicked within the mark's own screen radius (5.5px ring / 4px dot) via a new `onSelectShot`, never the armed stroke's armed end, so placing beside an existing mark still places. `placementOf` unchanged; court box/scale/lines unchanged (mark sizes hoisted into constants with identical values). Specs in label-court-panel (20) and label-stroke-keys-court-zoom (36).
**follow-ups:**

1. While placing, the panel draws only the selected stroke, so click-to-select in practice only switches to that stroke's other end; drawing the point's other strokes faintly would let it select a different stroke.
2. A pointer cursor over a selectable mark would make it discoverable.
3. The `CourtEndControls` glyphs also appear in the inline review block's switch.

## T7 · Court zoom: reproduce, then pin the behaviours as pure specs — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Reproduced headless on a temporary fixture page (removed): + / −, ⌃-wheel and drag-pan behaved, but a placing click's near↔far flip and a box slide kept the zoom's percent offsets, so the zoomed view jumped to another court spot (near baseline corner y≈0.3 m → far service box y≈14.9 m; a 27.27→30 slide moved it 2.7 m). New pure `carryZoom(zoom, fromTop, toTop)` keeps the court spot under the box centre and clamps via `panBy`; `LabelCourt` carries the zoom when `openedTop` changes and resets to `NO_ZOOM` on whole↔half and when the target stroke changes; `zoomAbout` snaps ≈1 to exactly `NO_ZOOM`. Court box/scale/lines unchanged. New specs in label-stroke-keys-court-zoom: the reproduced failure, anchor hold for {1.5, 2.25, 4}, in-then-out → NO_ZOOM, carry coverage, reset keys, 1 cm round trip.
**follow-ups:**

1. After a flip clamps to an edge, a later carry starts from the clamped centre, so the original spot is not remembered across two moves.

## T8 · Cache the derived transcript per job — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Migration `20261024102938_label_transcript_cache` (applied live) adds `public.label_transcript_cache`: one row per `job_id` (FK, cascade) keyed on `derivation_version`, `results_object_key`, `trajectories_object_key` and a sha256 fingerprint of score/format/ad_scoring, holding the transcript and rallies as jsonb; RLS on, no policies, anon/authenticated revoked (service_role only; security advisor shows only the expected `rls_enabled_no_policy` INFO). New `transcript-cache.ts` (`cachedTranscriptForJob`, read/write, rally serialise/revive — `serves` rebuilt on read since they share identity with strokes). `buildJobMarks` reads the cache first (0 Storage downloads on a hit), writes only when `transcript.ok`, falls back silently on any cache error, and still joins `buildLabelMarks` per request. `persist-transcript.ts` exports `readJobAndMatch`. 16 specs in the new label-transcript-cache spec.
**follow-ups:**

1. A cached row is about 1 MB per job (156-rally fixture: ~418 KB transcript + ~575 KB rallies); dedupe strokes in the rallies payload if jobs grow.
2. `seed-session.ts` still builds uncached because it needs `raw`.

## T9 · Undo answers a diff, not every row — done

**gate:** mechanical GATE PASS · completion VERDICT: pass
**changed:** Migration `20261024110044_undo_label_op_returns_rows` (applied live via the claude.ai connector after the plain MCP declined; repo file renamed to the live version by the runner) `create or replace`s `undo_label_op(uuid) returns jsonb` with the same signature: the answer keeps `undone`/`remaining` and the `P0001` refusal and adds `points`, `shots`, `deleted_points`, `deleted_shots` and `shot_points` (each touched shot's current and journaled owner). Grants unchanged (service_role + owner); no new security advisor findings. `undoLabelOp` reads only the touched points with their shots (`readLabelPointsByIds`) and answers `{ ok, undone, remaining, changed, removedPointIds }`; a failed read-back is reported, not thrown. New pure `applyUndoDiff`; the console applies the diff instead of re-reading the session. Specs in label-undo, label-console (split and combine), label-game-shift.
**follow-ups:**

1. `add-missing-shots.ts` still re-reads the whole session; the same diff treatment would speed it up.
