# Video fullscreen — H2 handoff, phase 2 (the film room)

Source: Claude Design project `afde9116-328b-445c-aeff-8b3c2a702d6f`, file
`H2 - Handoff - Video fullscreen.dc.html` plus the three Design Components it imports, extracted
2026-09-21. The frames are checked in beside this file in
[`2026-09-21-video-fullscreen-h2/`](2026-09-21-video-fullscreen-h2/) — inline styles there are the
measurements. **Read the frame for your surface before writing any px, alpha or radius value**;
this document paraphrases, the frame does not. Phase 1 is
[`2026-09-20-video-tab-in-shell-h1-design.md`](2026-09-20-video-tab-in-shell-h1-design.md) — its
"Rules that apply to every task" apply here unchanged.

| Frame file                 | Holds                                                                   |
| -------------------------- | ----------------------------------------------------------------------- |
| `C1-FilmBoard.html`        | The scoreboard slab: markup, props, colour logic                        |
| `C2-FilmCourt.html`        | The mini court: markup, props, trail/ring/legend logic, sample shots    |
| `C3-FilmTransportBar.html` | The transport: three rows, control order, labels                        |
| `R-states-R1-R11.html`     | The whole H2 canvas: handoff notes for C1–C3 and the eleven room states |
| `render-vals.txt`          | Sample drawer rows, unfolded shots, menu rows, the door and key tables  |

Where the notes text in `R-states-R1-R11.html` and a component file (`C1`–`C3`) disagree, **the
component file is the build target** — the R-frames embed those components, so it is what the
canvas actually draws. The project's `README-phase2-fullscreen.md` carries an older board (214px)
and is not checked in.

Scope: `src/components/dashboard/matches/match-detail/film/*`. The room is
`film-fullscreen.tsx`, mounted by `FilmRoom` in `film-tab.tsx`.

## This is a refactor plus one new object

The room already exists and is mature (PR #225): portal to `document.body` (deliberately not
`requestFullscreen()`), grow/shrink motion (`film-motion.ts`), scroll lock, 3s idle chrome, window
key handler, its own `<video>` handed off with the report player, problem/failed panels.
**Keep all of that.** What changes:

| H2 object        | Today                                                  | Phase 2                                                                                      |
| ---------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| FilmBoard        | `film-scoreboard.tsx` + `board-position.ts`, six spots | Restyled to C1; four corners; ghost; nudge keys                                              |
| FilmTransportBar | `film-transport.tsx` + `film-track.tsx`                | C3 control order, state-in-label tooltips with keys, court toggle, inert More                |
| FilmCourt        | nothing                                                | New component + pure geometry module; needs per-shot coordinates on `MatchShot`              |
| Points drawer    | `film-point-panel.tsx` — a second, dark list with tabs | `PointList tone="dark"`; shots unfold in place; Advanced in-column; the duplicate is deleted |

## Settled mismatches between the handoff and the codebase

Decided with the author on 2026-09-21 unless marked otherwise.

- **Geometry: components win.** Board is 236px, `padding:14px 15px 12px`, `--radius-dropdown`,
  `rgba(13,13,13,.74)` + `backdrop-filter:blur(8px)`, **no shadow**, with the winner-pill foot.
  Court is **168px**, 8px pad, 20px header, **152×227** court, 7px point marks, 4.5px match
  marks, 9.5px legend — not the notes' 214px / 178×266. Court sits at `left:24px; top:198px`.
- **Keys: H2's mapping, in the room only.** `←`/`→` step points, `⇧←`/`⇧→` seek 5s, `L` loops,
  plus `S M C D P` and `Esc`. This replaces the room's phase-1 `J`/`L` seek. The shell
  (`film-tab.tsx`) keeps its phase-1 keys untouched — `L` means different things in the two hosts,
  knowingly.
- **Doors: two, not three.** The player's maximize control (exists) and **⇧-click on a shell point
  row** (new). The "Open fullscreen" button on the Current point strip stays removed, per phase 1.
- **URL:** the param is `?tab=film`, and the room adds `&fullscreen=1`. A refresh must land back
  in the shell on the same point, so the param is written on enter, stripped on exit, and **not
  honoured on load**.
- **Persistence is localStorage**, following `film-room:board-anchor` (`board-position.ts`):
  court on/off, court mode, drawer open/closed. Each read sits in a try/catch lazy initializer.
  No `user_preferences` column, no migration.
- **Dark menu:** `FilmQuickFilters` already takes `tone="dark"` (it branches to `FilmDarkMenu`).
  Keep that. The only string that differs by host is the note: `← →` in the room, `↑↓` in the
  shell.
- **Row copy:** dark rows inherit phase 1's row title/detail (frame P1), not the
  `{result} · {player} {stroke}` sample strings in `render-vals.txt`.
- **Refusal copy:** `film-fullscreen.tsx` holds its own `ROOM_PROBLEM_TITLES`. It must read
  `FILM_REFUSAL_COPY` (`film-refusal-copy.ts`) — one copy table, two hosts.
- **"More"** is drawn at 45% and inert (`aria-disabled`, no handler). Nothing else in the room may
  be disabled.
- **Saved** is the workspace-shared `point_bookmarks` table, written by the existing toggle in
  `film-tab.tsx`. The room calls that; it does not write on its own.

## Court coordinates — read before touching FilmCourt

- `MatchShot` (`src/lib/data/match-points-server.ts`) carries no x/y today. The select already
  fetches `contact_x, contact_y, landing_x, landing_y`; the mapper drops them.
- The stored frame differs by source — see `src/lib/services/splitstep/derivation/court.ts` and
  `src/lib/data/serve-zones.ts` (`normalizeLanding`, the `REAL_*` metre constants). **Verify the
  actual value ranges against the live database** (Supabase MCP), one Advantage Intelligence
  match and one SwingVision match, before writing the mapping. `supabase/migrations/` is not the
  schema.
- Trust `shots.result` (In / Out / Net) for the verdict and colour. Coordinates give position
  only — SwingVision fault coordinates are imputed. A net ball is placed by `contact_y`, never by
  its landing.
- You/opponent comes from `useMatchSides()` (guardrails §4), never from player1/player2 order.
  The court is drawn with **you at the bottom**; when ends change, flip the coordinates, not the
  legend.
- Output of the geometry module is percentages of the court box, so one geometry serves any size.
  A shot with no usable coordinates yields no mark — never a mark at 0,0.

## Rules that apply to every task

Phase 1's list, plus:

- One store. `FilmRoom` owns points, filters, playhead and the single `useAttachmentPlayback`.
  The room receives props and calls back; it never fetches.
- The film never pauses or reloads because of a filter operation, a drawer toggle, a court
  toggle or a board move.
- Keep the test hooks `tests/film-playback-refresh.spec.ts` drives: `data-testid="film-room-video"`,
  `film-room-problem` (+ `data-film-problem`), `film-room-reload`, `data-film-chrome`,
  `data-film-own-keys`, `data-point-id`, `data-playing`, `data-shot-id`.
- Dark-scope alphas are literals, exactly as the frames give them. Everything else is a token.
  Chart-only literals: you `#60A5FA`, opponent `#94A3B8`, out `#FF6478`. The handoff draws out balls in `#E5484D`, which `colors.css` does not own and
  `scripts/check-design-drift.mjs` rejects; `#FF6478` is the dark scope's `--danger`, which the same
  handoff names as loss text on dark (author decision 2026-09-21).
- Motion: 200ms `--ease-primary`; 300ms trail fade on court marks. Reduced motion keeps opacity
  changes and drops transforms — the chrome still fades, nothing slides.
- Focus rings come from the system (`--focus-ring`); write no focus classes. No native `title`
  anywhere — tooltips are the product's dark tooltip.

## A — The three objects

### C1 · FilmBoard (`film-scoreboard.tsx`, `board-position.ts`)

Head: micro status left ("Playing" / "Paused"), mono clock right. Two score rows 11px apart: name
(you 13/500 white, opponent 13/400 at 72%) · 6px blue serve dot · right-aligned mono group of two
11px set tracks (won full white, lost 42%) and a 22px game cell in full white. Hairline
`rgba(255,255,255,.14)` above the foot: a 22px pill for who won the point (blue when it went to
you, 14% white when it went to the opponent) and the point named at 11px/55%, truncating. No point
counter — the drawer counts.

It is the rail's scoreboard on the dark scope: numbers come from the same `boardAt()`
(`film-score.ts`) the report rail uses. Set, game and server are in the cells and the dot, so the
point line never repeats them. Between points the point line falls back to the game state — never
a placeholder sentence. When the point is saved the line gains "· saved". Under a cut it names
the cut's reason — the same string the list row carries.

Movement (R6): free under the pointer, pointer events only, never HTML5 drag-and-drop;
`cursor:grab/grabbing`. A board-sized ghost — `rgba(255,255,255,.06)` fill, inset 1px 28% white
outline — sits at the corner it will land in. **Four corners, each inset 24px; nearest wins;
release snaps, no bounce.** `tabindex=0`; arrows nudge 8px (⇧ 40px), space lifts and drops, Esc
cancels back to where it started; each landing announced politely. Focused board takes
`--focus-ring` on plain `:focus`; held is the same outline at full weight. Position persists.
Survives the chrome collapse at 82% opacity (`dim`).

### C2 · FilmCourt (new `film-court.tsx` + pure `film-court.ts`)

Full court, both halves, net across the middle. Lines `rgba(255,255,255,.24)`, outer `.34`, net
`.6`, surface `rgba(214,228,249,.07)`.

- **Point mode** is the rally as it happens: a donut where the ball was struck, a filled dot where
  it landed, both at opacity `1 → 0.5 → 0.22` by age and gone two shots later, so the court never
  accumulates into a chart. The live bounce carries a `0 0 0 1px rgba(255,255,255,.85)` ring.
- **Match mode** plots bounces only, no trail, legend keys become the two player names, and it
  **follows the applied cut** — 14 points under a cut, not 174. Title takes the cut's name,
  caption its matched count.
- **`none`** (between points): no marks, the lines stay; title "Next point", caption "Not started".

A readout, not a control: not draggable, and the drawer never displaces it. Every mark is a seek
target. Hover (or focus) opens the dark readout — `chart-tooltip.tsx`, 168px, `--ink-900`, 12px
radius, `padding:10px 12px`, 12/500 white title then 11px lines at 64% white — anchored to the
mark and flipped to stay in frame. One readout at a time; hidden the moment the pointer leaves or
the film seeks. Click seeks the film to that shot and returns the court to point mode for the
point it belongs to. Marks are keyboard-reachable in shot order. The `layers` glyph swaps modes;
its label names the destination. Survives the chrome collapse losing only its two header glyphs
(`controls=false`). Off is a transport toggle (and the header `x`), a per-user preference.

### C3 · FilmTransportBar (`film-transport.tsx`, `film-track.tsx`)

Three rows in `padding:0 24px 14px`, 9px apart, over the frame's own bottom scrim
(`linear-gradient(to bottom, … rgba(13,13,13,.78) 100%)`) — the bar draws no surface of its own.

1. 12/500 match title + 10px context left; mono 9px uppercase position (`Point 96 / 174`) + two
   14px point chevrons right.
2. Seek lane, 16px tall: 3px pill track segmented per set with 5px gaps — played `--blue`,
   unplayed `rgba(255,255,255,.22)`, the in-progress set a gradient at the play head; 11px white
   knob. `role="slider"`, keyboard-seekable. Under a cut the lane still represents the whole film.
3. 40px control row, 18px gaps: play · skip-back · skip-forward · mono time · flex · bookmark ·
   dead-time · speed · loop · sound · court · exit · more. 15px Lucide at stroke 1.6, 85% white
   resting, white active.

Every control gets an `aria-label` and a dark tooltip naming it plus its key. **State lives in the
label, not a second glyph.** Bookmark is the one filled glyph when saved; the court glyph dims to
45% when the court is off. With the drawer open the bar's right edge stops at `right:320px`.
Opening state: position blank, duration and time read `—`, play in its paused glyph, lane drawn
but empty of progress.

## B — The eleven states

| Frame | State              | The rule it carries                                                                                                                                                                                                                                                                                                                                                 |
| ----- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1    | Chrome up          | Board 24/24; court same left, `top:198`; "Points" trigger inset 24/18 top-right, 28px, `rgba(13,13,13,.72)`, **labelled**. Click the film plays/pauses, double-click exits; board and court stop the gesture. Scroll locked, focus trapped, `aria-modal`. No second scoreboard, no title bar, no back chevron.                                                      |
| R2    | Chrome collapsed   | After 3s of stillness **while playing**, every operable thing goes: transport, "Points" trigger, the court's header glyphs, the bottom scrim, the cursor. Board, its point line and the court stay. Any pointer move, key or focus restores in 200ms opacity. Never while paused, while a menu is open, or while focus is inside the chrome. Nothing reflows.       |
| R3    | Drawer open        | 320px, full height, `rgba(13,13,13,.88)`, inset 1px `rgba(255,255,255,.1)` left hairline + `-24px 0 48px -12px rgba(0,0,0,.45)`. Phase-1 list, `tone="dark"`. The playing point unfolds its shots in place. Slides 200ms; the left column does not move; never opens on hover; the film keeps playing; open/closed persists. Esc closes the drawer before the room. |
| R4    | Cut menu           | 268px, `rgba(20,20,22,.97)`, 1px `rgba(255,255,255,.1)`, 10px radius, 5px inset. Anchored 6px under the trigger, 10px from the drawer's left edge. Note reads `← →`. Chrome does not collapse while open. Advanced opens in the drawer's own column — never a modal over the film.                                                                                  |
| R5    | Cut applied        | A cut governs the list, the point stepper (chevrons, `← →`, `Point 4 / 14`) **and the court's match mode** — not the seek lane. Clearing via the header X returns all three. The cut survives the trip to the shell and back. The film never pauses on apply or clear.                                                                                              |
| R6    | Moving the board   | See C1 and the paragraph under this table. The board is the only movable object; transport and drawer are fixed.                                                                                                                                                                                                                                                    |
| R7    | Between points     | No point name, **no position counter (blank, not dashed)**, an empty court that keeps its lines, no row selected in the drawer. Board keeps the score and moves the game state into the point line. Not an empty state; gets no words. The court is not hidden and does not animate out.                                                                            |
| R8    | Match mode readout | See C2.                                                                                                                                                                                                                                                                                                                                                             |
| R9    | Saved · court off  | Saving is the one filled glyph — no toast, no tick. Optimistic, reversible from the same control. Court off gives the left column back to the film; the board never moves to fill the space. Court off survives exit and re-entry.                                                                                                                                  |
| R10   | Film cannot play   | No board, no court, no transport — one centred statement and the way back. Headings from `FILM_REFUSAL_COPY`. "Try again" only where asking again could change the answer. If the film dies **while** the room is open, the room stays open and shows this. "Back to the report" and Esc close the portal.                                                          |
| R11   | Opening            | No spinner, no skeleton — the black frame with its chrome is the loading state. Duration and position read `—`; **no board for a point nobody is on**. Board, court and point name appear together the moment the first point resolves, never half-populated. The 3s collapse timer does not start until the film is actually playing.                              |

R6's court rule: the court lives in the board's column. The handoff's example — "if the board
lands top-right, the court follows to the right column, still beneath it" — is the settled case:
board in a top corner, court directly beneath it (R1 draws the gap as 28px: board at `top:24`,
court at `top:198`). The handoff does not draw a bottom-corner board; there the court sits in the
same column directly **above** the board, same gap. That last sentence is this document's
inference, not the designer's — say so in the code comment. The drawer never moves either object.

### The drawer's unfolded shots (R3)

Rows 52px, 14px side padding, 30px mark. Only the playing point is unfolded; stepping refolds the
last one. The well is full-width and recessed — `rgba(0,0,0,.28)` with 6% white inset hairlines
top and bottom — holding 34px grid rows on the row's own 14px side padding. Shot rows are the
phase-1 feed narrowed to `# · player · stroke · placement · result` (`shotRowCells` in
`film-shots.ts`). **Exactly one shot is lit at a time** — the one playing now, at
`rgba(255,255,255,.12)` with its stroke in full white; it advances with the film. Hover is a
lighter 5% wash. The playing row keeps the 2px blue progress rule. No second list, no Shots tab,
no tabs of any kind.

## C — Keys and tooltips (room only)

| Control               | Key       | Tooltip and behavior                                      |
| --------------------- | --------- | --------------------------------------------------------- |
| Play / pause          | `Space`   | "Pause" / "Play" — also click the film                    |
| Previous / next point | `←` `→`   | "Previous point · ←" / "Next point · →" — obeys the cut   |
| Seek ±5s              | `⇧←` `⇧→` | No tooltip                                                |
| Save point            | `S`       | "Save point" / "Saved — remove bookmark"                  |
| Loop point            | `L`       | "Loop this point — off" / "— on"                          |
| Speed                 | `⇧.` `⇧,` | "Playback speed, 1×" — cycles 0.5 · 1 · 1.5 · 2           |
| Sound                 | `M`       | "Sound — on" / "— off"                                    |
| Show the court        | `C`       | "Show the court — on" / "— off"                           |
| Skip dead time        | `D`       | "Skip dead time — off" / "— on"                           |
| Points drawer         | `P`       | "Points" — labelled trigger, tooltip carries the key only |
| Exit fullscreen       | `Esc`     | "Exit fullscreen · Esc" — closes the drawer first if open |

Keys are live whenever the room is open and focus is not in a text field. The existing guards stay:
`isFormControl`, `[data-film-own-keys]` (the board owns its arrows), `overlayIsOpen()`. There is no
shortcut overlay — the tooltips carry the keys.

## Doors

| Door              | Opens on                   | Carries                                 |
| ----------------- | -------------------------- | --------------------------------------- |
| Player maximize   | The shell player's control | Position, playing state, applied cut    |
| Point row ⇧-click | Any row in the shell list  | That point, playing from its first shot |
| Exit              | Esc · minimize · dbl-click | Position and cut back into the shell    |

## Type

Inter: 16/400 refusal heading · 13/500 board names and game cells · 12/500 drawer row titles and
controls · 11 point name, shot rows · 10 counts and context · 9 mono captions (1.4px tracking,
uppercase). Roboto Mono: set digits, clocks, position, counts. `tabular-nums` throughout.
