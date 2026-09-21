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

## T7 · Unfold the playing point's shots in place in PointList — done

**gate:** mechanical pass on re-run — the full suite's one failure was again `tests/match-video-attachments-db.spec.ts:3225` ("two concurrent sweeps never share a row"), a live-database spec this one-file UI diff cannot reach. Re-run alone it failed once and then passed; the test is intermittent against the shared database (see follow-up 1) · completion `VERDICT: pass`

**changed:** `PointList` takes optional `shotStops`, `activeShotId` and `onSelectShot`. When given, the active point's row is followed by a sibling well holding that point's shots only, so stepping refolds the last one; without them the render is unchanged. Well rows are memoised 34px grid buttons (`# · player · stroke · placement · result`) with `data-shot-id` and `aria-current` on the lit one, strings from `shotRowCells`. One shot is lit at 12% white with a white stroke; hover is 5% and only on unlit rows. Keep-in-view follows the lit shot through the list's own `scrollTop`. Names come from `sides` via `lastNameOf`.

**follow-ups:**

1. `match-video-attachments-db.spec.ts:3225` has now failed in three gate runs on this branch (T3, T7) and once when run alone, while passing on the next attempt each time. It claims from a cleanup queue on the shared live database, so another session's sweep can take its rows. Worth isolating by marker or serialising.
2. The R3 frame draws each shot's player as a 20px initials chip; the well prints the last name because the criterion required `shotRowCells` strings. Decide whether the chip is wanted.
3. The well's slicing and one-lit rule have no spec of their own.

## T8 · Give FilmAdvancedPanel a dark tone — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** `FilmAdvancedPanel` takes `tone` (default light) and `PointList` passes its own through. Two module-level lookups, panel and pill, hold the shipped light strings verbatim beside R3/R4's dark literals; `var(--blue)` is the only colour token in a dark branch. On dark the selected pill's wash is 7% white rather than the blue tint, which is invisible over film — the blue border and label carry the state. Geometry, the section table, live counts, the Apply gate and `advButton()` are unchanged; `filters/types.ts` is not in the diff.

**correction to the T7 entry above:** the intermittent `match-video-attachments-db.spec.ts:3225` failure had occurred in two gate runs (T3 and T7) plus one solo re-run, not three gate runs.

**follow-ups:**

1. This panel's docstring still names `film-advanced-filters-dialog.tsx`; T9 deletes that file and forbids the filename anywhere under `src/`, comments included.
2. Dark zero-count pills (30% white on a 4% wash) are the lowest-contrast thing in the column.

## T10 · Build the FilmCourt presentational component — done

**gate:** mechanical pass · completion `VERDICT: pass`. The component file is `film-court-card.tsx`, not the `film-court.tsx` the task first named: that basename collides with `film-court.ts`, which TypeScript resolves `.ts`-first and Next `.tsx`-first. The author's delegate amended the criterion and the design doc to the new name before the review.

**changed:** New `film/film-court-card.tsx` exporting `FilmCourt`: a 168px card with a 152×227 court at the frame's line alphas, marks as buttons in the order given (7px donut for a contact, 7px dot for a bounce, the ring on the live bounce, 4.5px flat in match mode, 300ms opacity fade), one dark readout at a time that closes when the seek key changes, a destination-labelled `layers` button and a "Hide the court" button that go inert under `controls={false}`, and a designed `none` state. No loader, no `useMatchSides()`, nothing mounts it yet. `film-court.ts` gains pure `readoutPlacement` and four fields on `CourtMark` so a mark can describe itself; `pointMarks` / `matchMarks` signatures are unchanged. The end-change assertions compare through a projection that reduces the carried shot to its id.

**follow-ups:**

1. T12 must import from `./film-court-card`; its notes still say `film-court.tsx`.
2. `pointMarks` wants the point's shots in rally order, the same array `activeShotAt` indexed into.
3. The readout flips by which half of the court the mark is in; with the board in a right-hand corner it may need to flip by available room instead.

## T11 · Add film-room-prefs.ts: localStorage preferences and the fullscreen param helper — done

**gate:** mechanical pass on re-run — the full suite's one failure was again the intermittent live-database `tests/match-video-attachments-db.spec.ts:3225`; this task is two new files nothing imports, and the test passed when re-run alone · completion `VERDICT: pass`

**changed:** New import-free `film/film-room-prefs.ts`: three `film-room:` storage keys (court on, court mode, drawer open), pure parsers that fall back to `true` / `"point"` / `false` on anything unrecognised, read/write helpers that wrap every `localStorage` access in try/catch, and `roomParam(params, open)`, which sets or deletes `fullscreen` on a fresh copy of the query string and tolerates null. Booleans are stored as `"1"` / `"0"`. `tests/film-room-prefs.spec.ts` covers defaults, one accepted and one rejected value per parser, and a round trip that keeps `tab=film&cut=break` intact.

## T9 · Swap the room's drawer to PointList tone="dark" and delete the duplicates — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** New `film/film-room-drawer.tsx` holds the 320px `<aside>` shell moved out of the old panel — surface, hairline, shadow, the translate slide with its reduced-motion fade, `data-state`, `data-film-chrome`, `onTransitionEnd` → `onExited` — and renders only `PointList tone="dark"` with the collapse button and the shots well. Advanced opens in the drawer's own column; its open flag and section state live in the drawer. `film-point-panel.tsx` and `film-advanced-filters-dialog.tsx` are deleted (about 1,000 lines), and no reference to either survives under `src/` or `tests/`, comments included. `FilmFullscreenProps` drops `tab` / `onTabChange`; `film-tab.tsx` drops its tab state and hands the room the same filtered points the shell list gets. The drawer's open state initialises from `readDrawerOpen()` and is written on open and collapse; neither handler touches playback.

**follow-ups:**

1. A persisted-open drawer now slides in while the room is still growing; worth a look once the court shares that screen.
2. The `aside` ("Points") and the `PointList` section inside it ("Point list") are two nested landmarks with near-identical names.
3. `FilmFullscreenProps.visiblePoints` is now always the same array as the filtered points; it could collapse into one prop.

## T12 · Mount the court in the room with its preferences and cut-driven match mode — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** The room mounts `FilmCourt` (from `film-court-card.tsx`) inside the playing branch only, while the court is on. Court on/off and mode are room state from `readCourtOn` / `readCourtMode`, written through T11's writers; T5's placeholder is gone and the transport and the card's `x` share one toggle, none of which touches playback. The court is placed by `courtSlot` from the corner and measured size the board reports through `onRest`; the drawer appears in neither position. Point mode feeds `pointMarks` from the playing point's timed shots in rally order with the 1-based playing index; with no active point the mode is `none`. Match mode feeds `matchMarks` from the filter-applied points, titled by `cutName` under a cut, captioned by that array's count. A mark click runs the existing `selectShot` and returns to point mode; `seek` bumps the key that closes the readout. The shot feed is built whenever the court is on or the drawer is open. `film-court-card.tsx` exports and pins `FILM_COURT_SIZE` (168×296) so the slot can be computed before the card renders.

**follow-ups:**

1. The card's height is a constant; if the legend row grows, `FILM_COURT_SIZE.height` must move with it.
2. Match mode renders every filtered point's bounce as a DOM button — a few thousand on a full three-set match. Check on real data; cap or canvas-draw if it drags.

## T13 · Room states R2, R7 and R11: collapse only while playing, between points, opening — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** New pure `playingStopAt` in `film-timeline.ts` reports containment only — null before the first point and in the gap after a stop's `end` — with four spec cases; `activeStopAt` is unchanged and still feeds Loop and dead-time skipping. In the room, the playing point now comes from `playingStopAt`, so between points the transport gets a null position, the drawer no selected row, the court `none` in point mode, and the board no point name while its score still reads the last reached stop. Board and court sit under one `firstPointReached` condition and the `stops[0]` fallback is gone. The 3s collapse is armed only while playing; pause clears it and brings the chrome up; `wake` re-arms only while playing. The root hides the cursor with the chrome. The bottom scrim is its own faded span, the Points trigger's translate fires only for the drawer, and the transport's opacity fade sits on the transport itself, so the collapse path adds no transform.

**follow-ups:**

1. The shell (`film-tab.tsx`) still lights its playing row from `activeStopAt`, so the report list keeps a row lit through dead time while the room does not.
2. The court's "Next point" / "Not started" copy is now reachable between every pair of points, not only before the first — worth an eyeball in the running app.
3. The chrome returns at the end of the film through `onPause`; a browser that fires `ended` without `pause` would need the same two lines on `onEnded`.

## T14 · R10 from one copy table, plus aria-modal, focus trap and double-click exit — done

**gate:** mechanical pass on re-run — the full suite's one failure was `tests/match-video-attachment-flow.spec.ts:848` ("unmounting mid-upload cancels the attempt"), in upload code this diff does not touch and that imports nothing it changed; the file re-run alone passed 20/20, the same file that flaked under load in T5 · completion `VERDICT: pass`

**changed:** `FILM_REFUSAL_COPY` gains a `denied` heading row (no body — the hook's message stays the sentence). `ROOM_PROBLEM_TITLES` in the room and `PROBLEM_TITLES` in the shell player now hold no string literal; all four reasons, the room's button labels and the reload panel's heading resolve from the table. The room root is `role="dialog"` with `aria-modal` and `aria-label="Film room"`, and deliberately carries no `data-state`, so `overlayIsOpen()` never matches the room against itself. New pure `film/film-focus-trap.ts` (`nextFocusTarget`, wrapping both ends, null on an empty ring) with a five-case spec; the room handles Tab in its own effect, stands down while an overlay is open, and on unmount returns focus to whatever had it when the room opened. The `<video>` gains `onDoubleClick={exit}`; it is the only double-click handler under `film/`. The letter and arrow key switch is untouched.

**follow-ups:**

1. If the focused control unmounts when the chrome collapses, focus falls to `body` and the next Tab re-enters at the top of the ring. Re-focusing the root when focus leaves it would keep the viewer's place.
2. The browser harness has no case for double-click exit or Tab wrapping in the live room.
3. `match-video-attachment-flow.spec.ts` has now flaked twice under full-suite load on this branch (T5, T14) on two different mid-upload cases; both pass alone.
