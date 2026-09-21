# Tasks — claude/video-fullscreen-handoff-ca4cf8

> Scope: phase 2 of the matchId Video tab — the fullscreen film room (H2 handoff: FilmBoard, FilmCourt, FilmTransportBar, dark points drawer)

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

## T1 · Carry per-shot coordinates on MatchShot and add pure film-court.ts geometry

- **status:** done
- **model:** fable
- **files:** (guess) src/lib/data/match-points-server.ts, film/film-court.ts (new), tests/film-court.spec.ts (new), tests/film-shots.spec.ts, tests/match-video-attachments-db.spec.ts (MatchShot literals)
- **done when:**
  - [ ] `MatchShot` gains `contactX`, `contactY`, `landingX`, `landingY` (each `number | null`), mapped in the existing `pointShots.map(...)` from the columns the select already fetches. The select string is unchanged, no migration is added, and the two spec files that build `MatchShot` literals carry the four fields
  - [ ] `film/film-court.ts` has no React/JSX import. It exports the chart literals `YOU = "#60A5FA"`, `OPP = "#94A3B8"`, `OUT = "#FF6478"` (the dark scope's `--danger`; the frame's `#E5484D` is off-palette and fails `check-design-drift`, author decision 2026-09-21) and `TRAIL = [1, 0.5, 0.22]`. It exports `pointMarks(shots, { youIsPlayer1, activeShot })`, returning, for each shot aged 0–2 behind `activeShot` (1-based, 0 = none), a `contact` mark and a `bounce` mark. Each mark carries `shotId`, `x`/`y` as percentages of the court box, `opacity` from `TRAIL`, a role of `"you" | "opp" | "out"`, and `live: true` only on the age-0 bounce. It exports `matchMarks(points, { youIsPlayer1 })`, returning bounces only, with no trail
  - [ ] The mapping is pinned by `tests/film-court.spec.ts` against the C2 court box. In the DB frame (metres, x about the centre line, y 0 → 23.77), x = ±4.115 lands on 83% / 17% (±0.1) and the net, y = 11.885, lands on 50%. A landing on the far baseline centre gives `{ x: 50, y: 3 }`, and a service line lands on 24.7% / 75.3% (±0.1)
  - [ ] You are drawn at the bottom. The spec feeds one rally twice, the second time with every coordinate mirrored as after an end change (`x → -x`, `y → 23.77 - y`), and asserts identical marks. A shot with a null coordinate pair yields no mark for that pair and never a mark at 0,0
  - [ ] The verdict comes from `result`, never from position. A `result` of "Out" gives role `"out"` wherever it landed. A "Net" ball is placed on the hitter's side of the net as decided by `contactY`, and the spec covers a Net shot whose `landingY` lies on the far side. A doc comment in `film-court.ts` records the value ranges actually observed in the live database for one Advantage Intelligence match and one SwingVision match
- **notes:** Spec: docs/superpowers/specs/2026-09-21-video-fullscreen-h2-design.md — read "Court coordinates — read before touching FilmCourt" and "Rules that apply to every task", then frame `2026-09-21-video-fullscreen-h2/C2-FilmCourt.html`. Its line percentages are the mapping target, and `POINT_SHOTS` / `TRAIL` are the mark logic verbatim. VERIFY AGAINST THE LIVE DB (Supabase MCP `execute_sql`) before writing the mapping. `src/lib/services/splitstep/derivation/court.ts` (`metersToCourtFrame` doc comment) claims both sources share one frame, and `serve-zones.ts` `normalizeLanding` / `REAL_*` agree, but the planner did not query the database. If the ranges disagree, say so in the comment and handle it; the criteria above pin the function's contract for stated inputs only. Which end "you" are on is not stored. The likely source is the `contactY` of a shot you hit, below or above 11.885, per point. Never use player1/player2 order for it (guardrails §4: the caller passes `youIsPlayer1` from `useMatchSides()`). SwingVision fault coordinates are imputed, so trust `result`. Clamp marks to 0–100 so a long ball stays on the card (the frame's long ball sits at y 1.5). Write the spec in the node style of tests/film-board-position.spec.ts. No UI in this task.

## T2 · Rework board-position.ts to four corners and add nudge and court-slot helpers

- **status:** todo
- **model:** sonnet
- **files:** (guess) film/board-position.ts, tests/film-board-position.spec.ts
- **done when:**
  - [ ] `BOARD_ANCHORS` is exactly `top-left`, `top-right`, `bottom-left`, `bottom-right`, and `parseBoardAnchor("top-center")` returns null so a stored six-spot value falls back to `DEFAULT_BOARD_ANCHOR`. `neighbourAnchor` still compiles and walks the four corners, so `film-scoreboard.tsx` is not in the diff
  - [ ] The spec pins the resting positions for a 236×146 board in a 1280×720 room: `top-left` is `{ left: 24, top: 24 }`, `top-right` is `{ left: 1280 - 24 - 236, top: 58 }`, and the bottom corners keep today's 144px clearance above the transport. The "right-hand spots step aside for the open drawer" test is deleted, and `BOARD_POSITION_STORAGE_KEY` is unchanged
  - [ ] `nudgeBoard(position, key, shift, board, room)` is exported. It moves 8px per arrow, or 40px with `shift`, and returns through `clampBoardPosition`. The spec covers one plain nudge, one shifted nudge and one clamped at an edge
  - [ ] `courtSlot(anchor, boardPosition, boardSize, courtSize)` is exported. For a top corner the court's top is the board's bottom + 28. For a bottom corner the court's bottom is the board's top − 28. A left corner shares the board's left edge and a right corner shares its right edge. The spec asserts `top-left` with a 146px-tall board gives `{ left: 24, top: 198 }`
  - [ ] A code comment on `courtSlot` states that the bottom-corner rule is the spec document's inference, not the designer's
- **notes:** Spec: read "Settled mismatches" (Geometry), section A/C1 "Movement (R6)" and the paragraph under the B table ("R6's court rule"). Frame `R-states-R1-R11.html` R6 draws the top-right ghost at `right:24px; top:58px`, which clears the 28px "Points" trigger at `top:18`. That is where 58 comes from, and it overrides the prose's "each inset 24px" for that corner only. The handoff does not draw a bottom-corner board, so keeping the transport clearance is a carry-over. Pure module, no JSX. Keep `clampBoardPosition`, `nearestAnchor` and `BOARD_EDGE_MARGIN`.

## T3 · Move the board by free nudge and lift/drop, and stop the drawer displacing it

- **status:** todo
- **model:** opus
- **needs:** T2
- **files:** (guess) film/film-scoreboard.tsx, film/board-position.ts, film/film-fullscreen.tsx (FilmScoreboard call site only), tests/film-board-position.spec.ts
- **done when:**
  - [ ] `FilmScoreboard` no longer takes `rightInset`, the `lastInset` / `holdReturn` block is gone, and `film-fullscreen.tsx` stops passing it. Nothing else in `film-fullscreen.tsx` changes
  - [ ] On the focused board, arrows call `nudgeBoard` (8px, 40px with ⇧) and Space lifts and drops. A drop and a pointer release both snap through `nearestAnchor` and persist to `BOARD_POSITION_STORAGE_KEY`. Escape while lifted restores the position it started from and does not persist. `neighbourAnchor`, the `0` key reset and the board's double-click reset are deleted, along with their spec cases
  - [ ] The board-sized ghost (`rgba(255,255,255,0.06)` fill, inset 1px `rgba(255,255,255,0.28)`) shows at the corner the board will land in during a pointer drag and during a keyboard lift. No HTML5 drag attribute (`draggable`, `onDragStart`) appears
  - [ ] An `aria-live="polite"` element announces each landing by corner name, and the `sr-only` hint is rewritten to the new model (arrows nudge, Space lifts and drops, Esc cancels)
  - [ ] An optional `onRest(anchor, size)` prop fires when the resting corner or the measured board size changes. `data-film-own-keys`, `data-film-chrome`, `data-board-anchor`, `role="group"`, `aria-label="Scoreboard"` and `tabIndex={0}` stay
- **notes:** Spec: section A/C1 "Movement (R6)", the B-table rows R3 and R6, and "Rules that apply to every task" (the film never pauses on a board move; reduced motion keeps opacity and drops transforms, so keep `motion-reduce:transition-none` on the glide). `[data-film-own-keys]` makes the room's window handler ignore every key from the focused board, including Esc and Space. That is what lets Space lift instead of pausing, so do not remove the attribute. The focus ring comes from the system on plain `:focus`. The existing `focus-visible:outline-none` hides it, so drop that class rather than adding a focus class. "Held is the same outline at full weight" applies while lifted. Leave the slab's markup and styling alone here, because T4 owns it. Restyle nothing in this task.

## T4 · Restyle the scoreboard to the C1 FilmBoard slab

- **status:** todo
- **model:** opus
- **needs:** T3
- **files:** (guess) film/film-scoreboard.tsx, film/film-score.ts, tests/film-score.spec.ts, film/film-fullscreen.tsx (FilmScoreboard call site only)
- **done when:**
  - [ ] `film-score.ts` exports two pure helpers covered in `tests/film-score.spec.ts`. `setTrackTone(mine, theirs)` returns `"won"` only when `Number(mine) > Number(theirs)`. A foot-line builder returns the point name, the point name + " · saved" when the point is saved, and the game state (set, game, who serves, e.g. "Set 2 · game 7 · Reid serving") when no point name is given. It never returns an empty string or a placeholder sentence
  - [ ] The slab is 236px wide with `padding:14px 15px 12px`, `var(--radius-dropdown)`, `rgba(13,13,13,0.74)` and `backdrop-filter: blur(8px)`, and carries no shadow class. The old name panel, the `w-[184px]` cell and the floating point line beneath the slab are gone
  - [ ] Head: a micro status reading "Playing" or "Paused" on the left and a mono tabular clock on the right, fed by new `playing` and `elapsed` props that `film-fullscreen.tsx` passes. Rows: you at 13/500 `#FFFFFF`, opponent at 13/400 `rgba(255,255,255,0.72)`, a 6px `var(--blue)` serve dot with the `sr-only` ", serving" kept, one 11px set track per set column coloured through `setTrackTone` (`#FFFFFF` / `rgba(255,255,255,0.42)`), and a 22px game cell in `#FFFFFF`. All numbers still come from `boardAt()`
  - [ ] Foot: a `rgba(255,255,255,0.14)` hairline, then a 22px pill whose background is `var(--blue)` when the point went to you and `rgba(255,255,255,0.14)` when it went to the opponent. The pill carries `aria-label="{name} won the point"` and the winner's initials, and beside it sits the foot line at 11px `rgba(255,255,255,0.55)`, truncating. No point counter. Who won is passed in by the room as `wonByPlayer1 === sides.you.isPlayer1`
  - [ ] A `dim` prop sets the slab's opacity to 0.82 (1 otherwise) and the room passes `!chrome`. T3's pointer handlers, key handler, ghost, `onRest` and `data-*` attributes are unchanged
- **notes:** Spec: "Settled mismatches" (Geometry: components win), section A/C1, frame `C1-FilmBoard.html` (the build target: markup, props, `renderVals()` colour logic). The notes text in `R-states-R1-R11.html` is older where it disagrees. `useMatchSides()` stays the only source of you/opponent (guardrails §4). The room already computes `board` from it, so do not reach for player1/player2 order. The frame draws two set tracks because its sample is in set 2; render one per column `boardAt()` returns. OPEN, not in the criteria: the spec says that under a cut the foot "names the cut's reason — the same string the list row carries", but list rows carry only `resultType` and `description` (checked in `point-list.tsx`) and no cut-reason string exists. Leave the foot as the point name under a cut and do not invent one. Between points the frame does not say whether the winner pill shows. Omit it when no point is playing and say so in a comment.

## T5 · Bring FilmTransport to C3: court toggle, keyed tooltips, nothing disabled

- **status:** todo
- **model:** opus
- **files:** (guess) film/film-transport.tsx, film/film-track.tsx, film/film-fullscreen.tsx (FilmTransport call site only)
- **done when:**
  - [ ] `FilmTransportProps` gains `courtOn: boolean` and `onToggleCourt`. The control row's JSX order is play · skip-back · skip-forward · time · flex · bookmark · dead-time · speed · loop · sound · court · exit · more. The court control is a `Grid2x2` glyph labelled "Show the court — on" / "Show the court — off" with `aria-pressed`, drawn `#FFFFFF` when on and `rgba(255,255,255,0.45)` when off
  - [ ] Each control's dark tooltip carries its key through `ChromeTooltip`'s `shortcut`: space, ←, →, S, D, L, M, C, and Esc on "Exit fullscreen". The speed tooltip's label is `Playback speed, {rate}×`. No native `title` attribute appears in either file
  - [ ] `film-transport.tsx` contains no `disabled` attribute. The point chevrons, skip buttons and bookmark stay operable, and their handlers no-op when there is nothing to walk or no point is playing. "More" is the only `aria-disabled` control, at 45% opacity with no `onClick`
  - [ ] When `duration <= 0` the time slot renders "—" alone instead of `0:00 / 0:00`, and a null `position` renders no position text and no dash
  - [ ] `FilmTrack`'s `role="slider"` element handles ArrowLeft / ArrowRight (∓5s), Home and End through `onSeek`, and carries `data-film-own-keys` so the room's arrows do not also step a point. `film-fullscreen.tsx` passes `courtOn` / `onToggleCourt` from a local `useState(true)` and changes nothing else (T12 replaces it)
- **notes:** Spec: section A/C3, the key table in section C, frame `C3-FilmTransportBar.html` (component wins; its "Frame overrides" comment gives R7 `position=""` and R11 `time="—"`). Most of C3 is already built. Read the file before changing layout values and leave what matches. `FilmTrack` is shared with the shell player (`film-player.tsx:674`). The shell's window handler already bails on `[role=slider]`, so slider keys are additive there; do not touch `film-tab.tsx`. tests/film-playback-refresh.spec.ts clicks buttons named "Play" (exact) and "Loop this point — off", so keep those labels. OPEN, not in the criteria: the code swaps slashed glyphs for off-states (`TimerOff`, `RepeatOff`, `VolumeOff`, deliberately shared with `film-player.tsx`), while the spec says "State lives in the label, not a second glyph" and the frame draws one static glyph per control. Leave the glyph swap alone until the author rules.

## T6 · Give PointList and PointRow a tone prop

- **status:** todo
- **model:** opus
- **files:** (guess) film/point-list.tsx
- **done when:**
  - [ ] `PointList` and `PointRow` take `tone?: "light" | "dark"` defaulting to `"light"`. `film-tab.tsx` is not in the diff and every existing light class string survives unchanged, with the dark values added beside them through a tone lookup
  - [ ] Under `tone="dark"` the root drops `surface-card`, and no dark-branch class or style reads `var(--ink-*)`, `var(--surface-*)` or `var(--border-hairline)`. The alphas are the frame's literals: playing row `rgba(255,255,255,0.08)`, opponent mark `rgba(255,255,255,0.14)`, header hairline as an inset rule
  - [ ] `tone` is passed on to `FilmQuickFilters` and to `EmptyList` / `EmptyBody`. The three zero-state branches and their copy are byte-identical in both tones
  - [ ] An optional `onCollapse` prop renders a 26px header button with `aria-label="Collapse point list"`, and only when it is provided. The clear button and the `{matched} / {total}` count stay in both tones
  - [ ] `PointRow` keeps `data-point-id`, `data-playing`, `role="button"`, the 2px `var(--blue)` progress rule and 52px / 30px-mark geometry in both tones. You/opponent still comes from `useMatchSides()`
- **notes:** Spec: "Settled mismatches" (Row copy: dark rows inherit phase 1's title/detail, not the `render-vals.txt` sample strings), the B-table row R3, frame `R-states-R1-R11.html` (R3 drawer: 28px trigger + count + 26px collapse glyph over an inset hairline; rows 52px, 14px side padding, 30px mark) and `render-vals.txt`. `film-point-panel.tsx` holds the dark values that ship today in its `PanelRow` and game header; use it as a reference. It is deleted in T9, so do not import from it. Keep the viewer's `WorkspaceMark` (phase-1 decision), not the frame's white initials chip. Dark-scope alphas are literals and everything else is a token. tests/film-playback-refresh.spec.ts selects `[data-point-id="…"][role="button"]` and `[data-playing="true"]`. The shots well is T7, so add no shot props here.

## T7 · Unfold the playing point's shots in place in PointList

- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** (guess) film/point-list.tsx, film/film-shots.ts
- **done when:**
  - [ ] `PointList` takes optional `shotStops`, `activeShotId` and `onSelectShot`. When they are passed, the row whose id is `activePointId` is followed by a well holding that point's shots only. No other point renders shots, so stepping refolds the last one. With the props absent the render is unchanged, and `film-tab.tsx` is not in the diff
  - [ ] Well rows are buttons carrying `data-shot-id`, with `aria-current="true"` on the lit one, laid out on CSS grid as `# · player · stroke · placement · result`. Their strings come from `shotRowCells` in `film-shots.ts` and are not rebuilt locally
  - [ ] Exactly one shot is lit: the row whose id equals `activeShotId`, on `rgba(255,255,255,0.12)` with its stroke in `#FFFFFF`. The rest sit at stroke `rgba(255,255,255,0.72)` and result `rgba(255,255,255,0.5)`. Hover is `rgba(255,255,255,0.05)`
  - [ ] The well is full width on `rgba(0,0,0,0.28)` with inset 1px `rgba(255,255,255,0.06)` hairlines top and bottom, and its rows are 34px on the point row's own 14px side padding. No `role="tablist"`, "Shots" tab or second list appears
  - [ ] The keep-in-view effect follows the lit shot while a well is open and adjusts the list's own `scrollTop`. `scrollIntoView` does not appear in the file. The shot row is a memoised component
- **notes:** Spec: section "The drawer's unfolded shots (R3)", frame `R-states-R1-R11.html` R3 and `render-vals.txt` (`playingShots`, the `shot()` colour logic). `film-point-panel.tsx` has the scroll effect and the comment explaining why `scrollIntoView` dragged the whole room sideways mid-slide; port that reasoning. `film-this-point.tsx` has the memoised `ShotRow` pattern, needed because `timeupdate` re-renders about four times a second. Player names in cells come from `sides` via `lastNameOf` (guardrails §4). The well is only ever asked for by the room, where it is dark; do not build a light treatment nobody mounts.

## T8 · Give FilmAdvancedPanel a dark tone

- **status:** todo
- **model:** opus
- **needs:** T6
- **files:** (guess) film/film-advanced-panel.tsx, film/point-list.tsx (the FilmAdvancedPanel call site only)
- **done when:**
  - [ ] `FilmAdvancedPanel` takes `tone?: "light" | "dark"` defaulting to `"light"`, and `PointList` passes its own tone through. Every existing light class string survives unchanged
  - [ ] No dark-branch class or style reads `var(--ink-*)`, `var(--surface-*)` or `var(--border-*)`. `var(--blue)` for a set summary and the selected pill is the only colour token, and the rest are literal white/black alphas
  - [ ] `filters/types.ts` is not in the diff. The section table, `countFilmOption` counts, `filmFiltersEqual` gating and "Clear all" behave identically, and Apply still comes from `advButton()`
  - [ ] The file still imports no `Popover`, `Dialog` or portal, and every option is still a `<button aria-pressed>`
- **notes:** Spec: B-table row R4 ("Advanced opens in the drawer's own column — never a modal over the film") and "Rules that apply to every task". The handoff draws no dark Advanced frame, so take the dark vocabulary from R3/R4 in `R-states-R1-R11.html` (hairline `rgba(255,255,255,0.1)`, row wash `rgba(255,255,255,0.07–0.08)`, second-line text 45% white, menu surface `rgba(20,20,22,0.97)`) and keep P4's geometry from phase 1 untouched. OPEN, not in the criteria: a zero-count pill and an unchanged Apply are `disabled` by phase-1 design. The spec's "nothing else in the room may be disabled" is written about the transport, so leave both alone unless the author says otherwise. `film-advanced-filters-dialog.tsx` is deleted in T9; do not touch it here.

## T9 · Swap the room's drawer to PointList tone="dark" and delete the duplicates

- **status:** todo
- **model:** opus
- **needs:** T7, T8, T11
- **files:** (guess) film/film-room-drawer.tsx (new), film/film-fullscreen.tsx (drawer mount + props only), film/film-tab.tsx (FilmFullscreen call site + `tab` state), film/film-point-panel.tsx (delete), film/film-advanced-filters-dialog.tsx (delete)
- **done when:**
  - [ ] A new `film/film-room-drawer.tsx` holds the `<aside>` shell moved out of `film-point-panel.tsx`: 320px, `rgba(13,13,13,0.88)`, the inset left hairline + `-24px 0 48px -12px rgba(0,0,0,0.45)` shadow, the translate slide with its reduced-motion fade, `data-state`, `data-film-chrome`, and `onTransitionEnd` → `onExited`. Inside it renders `<PointList tone="dark" … onCollapse shotStops activeShotId onSelectShot>` and nothing else: no tablist and no second list
  - [ ] `film-point-panel.tsx` and `film-advanced-filters-dialog.tsx` are deleted, and neither filename nor `FilmPointPanel` / `FilmAdvancedFiltersDialog` appears anywhere under `src/` or `tests/`, comments included
  - [ ] `FilmFullscreenProps` drops `tab` and `onTabChange`. `film-tab.tsx` deletes its `tab` state and the tab-scoped `visiblePoints` memo and hands the room the filter-applied points, the same array the shell list gets
  - [ ] Advanced opens inside the drawer's column through `PointList`'s existing `advancedOpen` branch, with the open flag and open-sections state held in the drawer. `film-room-drawer.tsx` imports no `Dialog` or `Popover`
  - [ ] The room's `panel` state initialises from `readDrawerOpen()` (T11) in a lazy initializer and `writeDrawerOpen` runs on open and on collapse. Neither handler calls `pause()`, `load()` or `seek`
- **notes:** Spec: "This is a refactor plus one new object" (Points drawer row), B-table rows R3–R5, "Rules that apply to every task". TRAP: `film-fullscreen.tsx` is 941 lines. Read only the imports, the props interface (~l.88–133), the `panel` state block (~l.189–204) and the mount at the bottom (~l.912–934), and leave keys, chrome idle, the problem panels and the video element alone (T13–T15 own them). Keep `PANEL_EXIT_MS` and the closing-timer fallback. `position` and `columns` were `FilmPointPanel` props; `PointList` derives its own, so drop them at the call site instead of re-adding them. The drawer never opens on hover and never moves the board or, later, the court. tests/film-playback-refresh.spec.ts opens the room and reads `film-room-video`. Keep `data-film-chrome` on the aside so the exit animation still fades it.

## T10 · Build the FilmCourt presentational component

- **status:** todo
- **model:** opus
- **needs:** T1
- **files:** (guess) film/film-court.tsx (new), film/film-court.ts, tests/film-court.spec.ts
- **done when:**
  - [ ] `film/film-court.tsx` exports `FilmCourt`. Its props are `mode: "point" | "match" | "none"`, `title`, `caption`, `marks`, the two player names, `controls`, `onSwapMode`, `onHide`, `onSelectMark`, and a key that changes on every seek. It calls no data loader and no `useMatchSides()`, and nothing mounts it yet. The root is `<section aria-label="Shot placement">` at 168px with 8px padding, a 20px header and a 152×227 court box. Lines are `rgba(255,255,255,0.24)`, the outer line `0.34`, the net `0.6` and the surface `rgba(214,228,249,0.07)`
  - [ ] Marks render in the order given as `<button>`s with an `aria-label` and `data-shot-id`. A contact is a 7px donut (1px border, transparent fill) and a bounce is a 7px filled dot. The live bounce carries `0 0 0 1px rgba(255,255,255,0.85)`. Opacity comes from the mark with a 300ms opacity transition. Match-mode marks are 4.5px with no border and no ring. Colours are the `YOU` / `OPP` / `OUT` constants imported from `film-court.ts`
  - [ ] One readout at a time. It opens on pointer enter and on focus, and closes on leave, on blur and when the seek key changes. It uses `DARK_READOUT_CLASS` / `DARK_READOUT_STYLE` from `chart-tooltip.tsx` at 168px, `padding:10px 12px`, `role="tooltip"`, with a 12/500 white title then 11px lines at 64% white. Which side it hangs on comes from an exported pure `readoutPlacement(x, y)` in `film-court.ts`, with a spec case for a mark on the left and one on the right. Click calls `onSelectMark`
  - [ ] The header holds two 20px buttons. The `layers` button is labelled by destination ("Show the whole match" / "Show this point only") and the `x` button reads "Hide the court". With `controls === false` both get opacity 0, `tabIndex={-1}` and `aria-hidden`, and the card keeps its box. The legend reads "Contact" / "Bounce" in point mode and the two player names in match mode. `mode="none"` renders no marks, keeps every line and shows title "Next point", caption "Not started"
  - [ ] The file contains no `draggable`, no native `title` attribute and no `focus-visible:` class
- **notes:** Spec: section A/C2, B-table row R8, "Rules that apply to every task" (chart-only literals, 300ms trail fade, system focus ring, product dark tooltip), frame `C2-FilmCourt.html` (the build target: 168px / 152×227, not the notes' 214 / 178×266). The court is a readout, not a control. It is a sibling of the `<video>`, not a child, so film clicks never reach through it and no `stopPropagation` is needed. Every mark is a seek target and keyboard-reachable in shot order, which the DOM order of the buttons satisfies. Readout copy (`Forehand · 74 mph` / `Lee · shot 4 of 5` / `Deep cross-court · in`) is built from `MatchShot` fields: reuse `shotLabel` / `shotRowCells` from `film-shots.ts` and print `UNMEASURED` for nulls, never "0". Names arrive as props from the room (guardrails §4).

## T11 · Add film-room-prefs.ts: localStorage preferences and the fullscreen param helper

- **status:** todo
- **model:** sonnet
- **files:** (guess) film/film-room-prefs.ts (new), tests/film-room-prefs.spec.ts (new)
- **done when:**
  - [ ] `film/film-room-prefs.ts` has no React/JSX import. It exports three storage keys under the `film-room:` prefix (court on/off, court mode, drawer open). It exports pure parsers: `parseCourtOn(raw)` defaults to `true`, `parseCourtMode(raw)` defaults to `"point"` and accepts only `"point" | "match"`, and `parseDrawerOpen(raw)` defaults to `false`. Anything unrecognised or null gives the default
  - [ ] Read/write helpers per preference (`readCourtOn` / `writeCourtOn`, and so on) wrap every `localStorage` access in try/catch and fall back to the default, the way `film-scoreboard.tsx` reads `BOARD_POSITION_STORAGE_KEY`
  - [ ] `roomParam(params, open)` returns a new query string that sets `fullscreen=1` or deletes `fullscreen`, carries every other param through, tolerates null params and never mutates its input
  - [ ] `tests/film-room-prefs.spec.ts` asserts the three defaults, one accepted and one rejected value per parser, and a `roomParam` round trip that keeps `tab=film&cut=break` intact on enter and on exit
- **notes:** Spec: "Settled mismatches" (URL, and "Persistence is localStorage"): no `user_preferences` column and no migration. Model `roomParam` on `serializeCut` in `film/filters/types.ts` and the spec on tests/film-filters-model.spec.ts. Nothing imports this module yet; T9, T12 and T16 are its callers.

## T12 · Mount the court in the room with its preferences and cut-driven match mode

- **status:** todo
- **model:** opus
- **needs:** T3, T5, T9, T10, T11
- **files:** (guess) film/film-fullscreen.tsx
- **done when:**
  - [ ] Court on/off and court mode are room state, initialised from `readCourtOn()` / `readCourtMode()` in lazy initializers and written through T11's writers on every change. T5's placeholder `useState(true)` is gone and the transport's `courtOn` / `onToggleCourt` read the real state. No toggle handler calls `pause()`, `load()` or `seek`
  - [ ] `<FilmCourt>` renders only inside the playing branch (never beside `film-room-problem` / `film-room-reload`) and only while the court is on. It receives `controls={chrome}`, and its `onHide` is the same toggle the transport uses. It is positioned from `courtSlot(...)` using the corner and size `FilmScoreboard` reports through `onRest`. `panelOpen` appears in neither the court's nor the board's position
  - [ ] Point mode feeds `pointMarks(activePoint.shots, { youIsPlayer1: sides.you.isPlayer1, activeShot })` with title "This point" and caption `{n} shots`. The shot feed (`buildShotStops`) is built whenever the court is on or the drawer is open, not only when the drawer is. With no active point the court gets `mode="none"`
  - [ ] Match mode feeds `matchMarks` from the filter-applied points the room receives. With `hasActiveFilmFilters(filters)` the title is `cutName(filters, sides)`, otherwise "Whole match". The caption is `{count} points` from that same array
  - [ ] `onSelectMark` calls the room's existing `selectShot` and sets the mode to `"point"`. `onSwapMode` flips the mode. The key that closes the readout changes inside the room's `seek`
- **notes:** Spec: "Court coordinates", section A/C2, B-table rows R1, R5, R8, R9, "R6's court rule". TRAP: `shotStops` is currently `panel === "closed" ? [] : buildShotStops(...)` (~l.267) because only the drawer read it. The court needs the active shot with the drawer shut, so widen that condition and keep the laziness for court-off + drawer-closed. `activeShotAt` returns a stop; `pointMarks` wants the 1-based index of that shot within the point. Court off gives the left column back to the film, and the board never moves to fill it. Give the court `data-film-chrome` so the enter/exit fade catches it; like the board, it still survives the 3s collapse because only `fade`-classed nodes hide. Names into the legend come from `lastNameOf(sides.…)` (guardrails §4). Read only the derived block, the transport call site and the render tail of `film-fullscreen.tsx`; leave keys, chrome idle and the problem panels alone (T13–T15).

## T13 · Room states R2, R7 and R11: collapse only while playing, between points, opening

- **status:** todo
- **model:** opus
- **needs:** T12
- **files:** (guess) film/film-timeline.ts, tests/film-timeline.spec.ts, film/film-fullscreen.tsx
- **done when:**
  - [ ] `film-timeline.ts` exports a pure `playingStopAt(stops, filmTime)`. It returns the stop whose window contains the time, and null before the first point and once the time has passed a stop's `end` without reaching the next `start`. `activeStopAt` is unchanged. `tests/film-timeline.spec.ts` covers inside a point, in the gap after it, before the first point, and two points whose windows touch (no gap, never null)
  - [ ] Between points (R7) the room passes the transport a null `position`, the drawer a null `activePointId`, the court `mode="none"`, and the board no point name, so T4's foot falls back to the game state. The board's score still comes from the last reached stop. The court stays mounted
  - [ ] Opening (R11): the `?? p.stops[0]` board fallback is gone. `FilmScoreboard` and `FilmCourt` sit under one shared condition that is false until the film has a duration and a first point has been reached, so they appear together. No spinner, skeleton or "Loading" string is added
  - [ ] Collapse (R2): the mount effect that calls `arm()` unconditionally is gone. The 3s timeout is scheduled only while `playing` is true, and a pause clears it and sets the chrome up. `wake` re-arms only while playing. The existing holds (focus inside the room, `overlayIsOpen()`) stay
  - [ ] While the chrome is down the room root takes a cursor-hiding class. The transport, the "Points" trigger and the bottom scrim still fade on 200ms opacity with no transform added. The board and court keep their boxes (`dim` and `controls={false}` only)
- **notes:** Spec: B-table rows R2, R7, R11, "Rules that apply to every task". TRAP: `activeStopAt` (film-timeline.ts) never returns null once the first point has started. It keeps the last reached stop with `progress` clamped at 1, so "between points" is not a state the room can see today. Loop (`loopStopRef`) and `deadTimeJump` depend on `activeStopAt` as it is; do not change their inputs. A stop's `end` is clamped to the next `start` when points touch, so the gap only exists where the film has one. R7 "is not an empty state and gets no words", and nothing reads "—" between points (the position slot is blank). `S` between points stays a no-op. Keep every test hook: `film-room-video`, `film-room-problem`, `film-room-reload`, `data-film-chrome`. Read targeted ranges of the 941-line file: derived block, `arm`/`wake`, render tail.

## T14 · R10 from one copy table, plus aria-modal, focus trap and double-click exit

- **status:** todo
- **model:** opus
- **needs:** T13
- **files:** (guess) film/film-refusal-copy.ts, film/film-fullscreen.tsx, film/film-player.tsx (PROBLEM_TITLES only), film/film-focus-trap.ts (new), tests/film-focus-trap.spec.ts (new)
- **done when:**
  - [ ] `FILM_REFUSAL_COPY` gains a `denied` row whose heading is "You can no longer watch this video". `ROOM_PROBLEM_TITLES` in `film-fullscreen.tsx` and `PROBLEM_TITLES` in `film-player.tsx` hold no string literal, so all four reasons resolve from the table (`removed` → `stale`, `unreachable` → `unavailable`, `unplayable` → `loadFailure`). The room's "Back to the report" and "Try again" labels read `FILM_REFUSAL_COPY.buttons`
  - [ ] The problem branch still renders no board, court or transport, and keeps `data-testid="film-room-problem"`, `data-film-problem`, `role="alert"` and the `canRetry` gate on "Try again". The `film-room-reload` panel keeps its body and "Reload" button and takes its heading from `loadFailure.heading`
  - [ ] The room root is `role="dialog"` with `aria-modal="true"` and `aria-label="Film room"`, and carries no `data-state` attribute
  - [ ] A new JSX-free `film/film-focus-trap.ts` exports a pure function that returns the element to focus next, given the ordered focusables, the active element and `shiftKey`, wrapping at both ends. `tests/film-focus-trap.spec.ts` covers forward wrap, backward wrap and an empty list. The room's Tab handling uses it, stands down while `overlayIsOpen()`, and on unmount returns focus to the element that was focused when the room opened
  - [ ] The `<video>` gains `onDoubleClick={exit}` and keeps `onClick={togglePlay}`. No double-click handler is added to the board, the court or the root
- **notes:** Spec: "Settled mismatches" (Refusal copy), B-table rows R1 and R10. TRAP: `overlayIsOpen()` matches `[role="dialog"][data-state="open"]`. The root becoming `role="dialog"` is safe only while it never carries `data-state`, which is why that is a criterion. Radix menus and tooltips portal to `body`, outside the room root, so the trap must not fight them; hence the stand-down. `@radix-ui/react-focus-scope` is in node_modules only transitively, so do not import it without adding it to package.json. The pure helper avoids the question. The board and court are siblings of the `<video>`, not children, so a double-click on them never reaches it. tests/film-playback-refresh.spec.ts asserts "Try again" / "Reload" by name and presses Escape to leave the room. No `denied` body is added: the hook's `problem.message` stays the sentence.

## T15 · Remap the room's keys to the H2 table; shell untouched

- **status:** todo
- **model:** sonnet
- **needs:** T14
- **files:** (guess) film/film-fullscreen.tsx (the window keydown effect + the Points trigger), film/film-quick-filters.tsx (the dark note string)
- **done when:**
  - [ ] In the room's keydown `switch`: Space toggles play. `ArrowLeft` / `ArrowRight` call `step(-1)` / `step(1)` without Shift, and seek −5s / +5s with `e.shiftKey`. `l`/`L` toggles loop, `s` save, `m` mute, `c` the court, `d` skip-dead-time, and `p` opens or collapses the drawer. `>` steps the playback rate up through `PLAYBACK_RATES` and `<` steps it down. The `j`/`J` cases are removed. `ArrowUp` / `ArrowDown` stay as aliases for previous / next point (author decision 2026-09-21)
  - [ ] `Escape` collapses the drawer when it is open and exits the room otherwise
  - [ ] The three guards are unchanged in the diff (`isFormControl(e.target)`, the `[data-film-own-keys]` bail-out and `overlayIsOpen()`), and every letter key ignores `metaKey` / `ctrlKey` / `altKey`. `film-tab.tsx` is not in the diff
  - [ ] The "Points" trigger is wrapped in the product's dark tooltip with the key `P`, and keeps its visible "Points" label and `aria-expanded`
  - [ ] In `film-quick-filters.tsx` the dark branch's note reads "Filters apply to ← → as well as the list." and the light branch's still reads "Filters apply to ↑↓ as well as the list."
- **notes:** Spec: "Settled mismatches" (Keys: H2's mapping, in the room only. `L` means loop in the room and seek in the shell, knowingly), section C's table and the guards sentence under it. There is no shortcut overlay. `ArrowUp` / `ArrowDown` are kept on purpose: nothing else in the room uses them and phase 1 taught them. `cycleRate` only steps upward today, so give it a direction. Edit only the keydown effect (~l.634–688), `cycleRate` and the Points trigger, and nothing else in the 941-line file. tests/film-playback-refresh.spec.ts presses Escape with the drawer closed and expects the room gone.

## T16 · Doors: ⇧-click a shell point row, and the fullscreen=1 param

- **status:** todo
- **model:** opus
- **needs:** T6, T11, T15
- **files:** (guess) film/point-list.tsx (PointRow click), film/film-tab.tsx (enterRoom / exitRoom + a mount effect)
- **done when:**
  - [ ] `PointList` and `PointRow` take an optional `onOpenInRoom(point)`. A click with `e.shiftKey` on a seekable row calls it instead of `onSelect` when it is provided, and a plain click is unchanged. `film-room-drawer.tsx` does not pass it
  - [ ] `film-tab.tsx` passes a stable callback that pauses the report player and opens the room with `{ time: stop.start, playing: true }` for that point's stop. A point with no stop falls back to the ordinary select and opens nothing
  - [ ] Entering the room by either door writes `fullscreen=1` with `window.history.replaceState` through `roomParam(current, true)`, and `exitRoom` strips it through `roomParam(current, false)`. No `router.push`, `router.replace`, `router.refresh` or `pushState` is added, and the film's cut effect is unchanged
  - [ ] A mount effect strips a `fullscreen` param found on load, and no code path reads that param to open the room
  - [ ] No "Open fullscreen" button is added to `film-this-point.tsx` or anywhere else. The doors are the player's maximize control and the ⇧-click
- **notes:** Spec: "Settled mismatches" (Doors: two, not three; URL), the Doors table. `render-vals.txt`'s `doors` lists a third door that phase 1 removed; ignore it. Precedent for native history without a router call is the cut effect already in `film-tab.tsx` (~l.132–150), whose comment names the Next doc it follows. `useSearchParams()` can be null in tests/fixtures/film-playback-refresh-harness.tsx (bare `createRoot`), so nothing here may throw there. The cut survives the trip because `filters` lives in `FilmRoom`; do not copy it into the room. `PointRow` is memoised on stable callbacks, so keep `onOpenInRoom` stable. Shift-click can start a text selection on the row; prevent it on `mousedown` only when Shift is held.
