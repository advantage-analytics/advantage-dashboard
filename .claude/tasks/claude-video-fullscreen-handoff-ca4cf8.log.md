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
