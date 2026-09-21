# Run log — claude/video-fullscreen-handoff-ca4cf8

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Carry per-shot coordinates on MatchShot and add pure film-court.ts geometry — done

**gate:** mechanical pass (second run — the first failed `tests/design-drift.spec.ts` on the off-palette `#E5484D`; the author's delegate changed `OUT` to the dark scope's `--danger` `#FF6478` in the code, the spec, the design doc and the criterion, then re-ran) · completion `VERDICT: pass`

**changed:** `MatchShot` carries `contactX/Y` and `landingX/Y` from columns the select already fetched. New JSX-free `film/film-court.ts` maps the DB frame (metres, x about the centre line, y 0 → 23.77, confirmed identical for one Advantage Intelligence and one SwingVision match in the live DB) to percentages of the C2 court box, decides which end "you" are on per point by a vote of contacts, rotates the point so you are drawn at the bottom, takes the verdict from `result`, and keeps Net balls on the hitter's side. `tests/film-court.spec.ts` (13 cases) pins it.

**follow-ups:**

1. A Net ball keeps the hitter's colour — only "Out" maps to the out role. Decide in the FilmCourt UI whether netted balls also read red.
2. Advantage Intelligence leaves about 17% of landings null, so point mode will sometimes show a contact donut with no bounce. Treat as normal.
3. About 3% of Advantage Intelligence "In" shots land on the hitter's own side of the net (vendor noise); plotted as recorded.

## T2 · Rework board-position.ts to four corners and add nudge and court-slot helpers — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** `BOARD_ANCHORS` is the four corners; a stored six-spot value parses to null and falls back to the default. Top inset drops to 24, with `top-right` held at 58 to clear the "Points" trigger; the bottom corners keep the 144px transport clearance. New pure `nudgeBoard` (8px, 40px shifted, clamped) and `courtSlot` (28px gap, beneath a top-corner board, above a bottom-corner one — commented as the spec document's inference). `neighbourAnchor` keeps its signature so `film-scoreboard.tsx` stays out of the diff. Spec rewritten for a 236×146 board in a 1280×720 room.

**follow-ups:**

1. In T12, confirm `onRest` reports the measured board size, not a static 236×146 — the slab's height changes once T4 restyles it.

## T3 · Move the board by free nudge and lift/drop, and stop the drawer displacing it — done

**gate:** mechanical pass on re-run — the full suite had one failure, `tests/match-video-attachments-db.spec.ts:3225` ("two concurrent sweeps never share a row"), a live-database spec this diff does not touch; re-run alone it passed, and the whole file passed 42/42, so it was recorded as a shared-DB load flake, not waved through unchecked · completion `VERDICT: pass`

**changed:** `FilmScoreboard` loses `rightInset` and the drawer-aware inset block, so the drawer no longer displaces the board; `film-fullscreen.tsx` changes by one deleted line. Arrows nudge through `nudgeBoard` (8px, 40px shifted), Space lifts and drops, Escape while held returns to where the move began without persisting. One `free` position drives the landing ghost for both a pointer drag and a keyboard hold. A polite live region announces each landing by corner. New optional `onRest(anchor, size)`. `neighbourAnchor`, the `0` reset and the double-click reset are deleted with their spec case. The system focus ring shows on plain `:focus`.

**follow-ups:**

1. `[data-film-own-keys]` makes the room ignore every key from the focused board, so Escape on a focused-but-not-held board cannot close the drawer or the room. Consider forwarding an unhandled Escape.
2. A keyboard nudge moves instantly; a short glide might read better, but the spec gives no motion for it.

## T4 · Restyle the scoreboard to the C1 FilmBoard slab — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** The scoreboard is the C1 slab: 236px, `14px 15px 12px`, `--radius-dropdown`, `rgba(13,13,13,0.74)` with an 8px blur and no surface shadow. Head carries "Playing"/"Paused" and a mono clock; rows use one set track per column toned by the new pure `setTrackTone`; the foot is a hairline, a 22px winner pill and a truncating line from the new pure `footLine` (point name, "· saved", or the game state). `Board` gains `gameNumber`. `dim` sets 82% opacity and the room passes `!chrome`. The slab is an inner element so the drag root T3 built stays byte-identical and no empty box paints before the first point resolves. The winner pill is omitted between points, with a comment.

**follow-ups:**

1. The landing ghost still uses `--radius-element` while the slab is `--radius-dropdown` — a one-line fix.
2. `board.pointLine` is no longer read by the room; only the report rail uses it.
3. The board clock re-renders at `timeupdate` cadence; it could read `--film-t` in CSS if that ever matters.

## T5 · Bring FilmTransport to C3: court toggle, keyed tooltips, nothing disabled — done

**gate:** mechanical pass on re-run — the full suite had one failure, `tests/match-video-attachment-flow.spec.ts:868` ("a tab closing mid-upload still retires the attempt"), in upload code this diff does not touch; the file re-run alone passed 20/20, so it was recorded as a timing flake under parallel load · completion `VERDICT: pass`

**changed:** `FilmTransport` gains `courtOn` / `onToggleCourt` and a `Grid2x2` court control between sound and exit (white on, 45% off, `aria-pressed`, label carries the state). Every control's dark tooltip carries its key; the two title-row chevrons gain tooltips; speed reads `Playback speed, {rate}×`. All `disabled` attributes are gone — step and save guard inside their handlers — and "More" is the only `aria-disabled` control, with no handler. The time slot reads "—" before the duration is known. `FilmTrack`'s slider handles ←/→ (5s), Home and End and carries `data-film-own-keys`. The room holds a placeholder `useState(true)` for the court until T12.

**follow-ups:**

1. `data-film-own-keys` on the seek lane also swallows Space, S and Esc while it has focus. T15 should narrow the guard or have the lane pass them on.
2. Speed's tooltip carries no key; the H2 table gives it `⇧.` / `⇧,`.
3. The bar now mixes two conventions: slashed off-state glyphs (kept by decision) beside the court glyph that only dims.

## T6 · Give PointList and PointRow a tone prop — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** `PointList` and `PointRow` take `tone` (default light). Three module-level lookups — list, row, zero state — hold the shipped light strings verbatim beside the frame's dark literals; no dark branch reads an ink, surface or hairline token. Tone is threaded to `FilmQuickFilters`, every row and the zero states, whose copy is unchanged. Dark text on elements with a DS type class is set inline. An optional `onCollapse` adds a 26px "Collapse point list" button. Hooks, the blue progress rule and the 52px / 30px geometry are shared by both tones. One file in the diff.

**follow-ups:**

1. The dark header's spacing compensates for a `mb-[7px]` baked into `FilmQuickFilters`' dark trigger; moving that margin onto the hosts would be sturdier.
