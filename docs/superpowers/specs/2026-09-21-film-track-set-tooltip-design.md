# Film track — the set readout (shell player and room)

Drawn in-repo on 2026-09-21 against the code as it stands after T1–T4 on
`claude/video-player-ui-tasks-4d2ec9`; there is no Claude Design source for this one. The frame is
checked in beside this file in
[`2026-09-21-film-track-set-tooltip/track-tooltip.html`](2026-09-21-film-track-set-tooltip/track-tooltip.html)
— inline styles there are the measurements. **Read the frame before writing any px, alpha or radius
value**; this document paraphrases, the frame does not. It links the real token files under
`src/styles/design-system/`, so it renders from a plain checkout.

| Frame section | Holds                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------- |
| A1–A2         | The shell player's lane: hover on a decided set; keyboard focus at the playhead              |
| B1–B4         | The room's transport: hover mid-run; a set with no entered score; scrubbing; a one-set match |
| C             | The readout box measured — skin, geometry, offset, anchor, reveal, ARIA                      |
| D             | Every string, and the field each part is built from                                          |
| E             | Where the readout is not (touch, drag, idle chrome, background, Esc)                         |

Scope: `src/components/dashboard/matches/match-detail/film/film-track.tsx`,
`film-timeline.ts` (`setSegments`), `film-score.ts` (a new pure readout builder), plus the two
hosts that hand `FilmTrack` its segments — `film-player.tsx` (shell) and `film-fullscreen.tsx` →
`film-transport.tsx` (room). Phase-1 and H2 "Rules that apply to every task" apply unchanged
([`2026-09-21-video-fullscreen-h2-design.md`](2026-09-21-video-fullscreen-h2-design.md)).

## What it is

The seek lane is already split per set — `setSegments` (`film-timeline.ts:305–330`) cuts at each
new set's first serve — but the runs are mute. Hovering a run opens a **dark readout** above the
lane that names the set, its final score, how many points the run holds and the film time it
spans. It is a readout about a span of film, not a control's name, and that distinction decides
everything below.

## Settled against the code

Two things the task notes assumed are not what the code does, and the design follows the code.

- **`points.set_score` is the sets tally, not the games.** `process-match/index.ts:642–654`
  builds `setScore` as `hostSets-guestSets` and splits it to compare against `setsToWin - 1`;
  `derivation/quality.ts:134–143` compares `pred_set_score` as `"1-2"` pairs; `MatchPoint.setScore`'s
  own comment reads "Sets won before this point". So "the `setScore` of the next set's first point"
  yields `1–0`, not `6–4` — it says who won the set, which the entered score already implies, and
  it cannot supply a set's games. **No string in this design reads `setScore`.**
- **A decided set's games come from the entered score, because the board already does that.**
  `film-score.ts:15–17`: "Settled sets come from the ENTERED score (`sides.sets`, already
  you-first), because a set that is over has a final that the vendor's running count may disagree
  with." The lane sits under that board in the room; the two must agree. `useMatchSides().sets`
  (`use-match-sides.ts:32–40`) is `matches.score` oriented **you-first by construction** — the
  orientation step guardrails §4 requires happens there, once, and the readout never touches
  player order. This is also why the Dartmouth disagreement (entered 4-6 6-4 5-2, strokes ending
  4-6 6-4 4-0) resolves the same way on the lane as on the board: the entered score wins.
- **Never `gameScore` as a fallback.** A point's `gameScore` is the games BEFORE it was played
  (`derivation/scores.ts:3–8`), so the last stop of a 6–4 set reads `5–4`. `scoreColumns`'s
  argument applies (`film-score.ts:232–240`): a wrong number in the one place a player reads as
  fact is worse than no number. A set the entered score does not have prints its number alone.
- **The "set in progress" is the run holding the playhead** — the C3 spec's "the in-progress set a
  gradient at the play head". Its string has the same form as any other run's; a running games
  count was considered and rejected (it would drift on every seek, and the board shows it).
- **Both mounts are dark.** The shell player is on the light page, but its lane sits in the
  player's own bottom scrim (`film-player.tsx:679`,
  `linear-gradient(to top, rgba(13,13,13,0.68) …)`), and the room's transport sits on the room's
  scrim. So the same box is right on both, and the difference between the surfaces is where the
  box may go, not what it looks like.

## The strings

Two lines, in the readout's own type (a 12px white medium title over an 11px line at 64% white —
`chart-tooltip.tsx:9–10`). Middots join fields, an en dash joins the two numbers of a score and the
two ends of a range, the range is mono (a machine value), the count is Inter.

| Case                                           | Title          | Detail                        |
| ---------------------------------------------- | -------------- | ----------------------------- |
| Decided set                                    | `Set 1 · 6–4`  | `61 points · 0:00–38:10`      |
| The set in progress (run holding the playhead) | `Set 2 · 4–6`  | `74 points · 38:10–1:12:05`   |
| A one-set match                                | `Set 1 · 6–3`  | `58 points · 0:00–44:28`      |
| A set the entered score does not have          | `Set 3`        | `27 points · 1:12:05–1:42:18` |
| No entered score at all                        | `Set 1`        | `61 points · 0:00–38:10`      |
| Every row's `setScore` is `"0-0"`              | `Set 1 · 6–4`  | `61 points · 0:00–38:10`      |
| One point in the run                           | `Set 3`        | `1 point · 1:12:05–1:42:18`   |
| A film with no timed points                    | — no readout — |                               |

Where each part comes from:

- **`Set N`** — `FilmStop.point.setNumber` of the stops that fall in the run (`setSegments` assigns
  each stop to the run whose `[start, end)` holds its `serve`; a run is cut at a serve, so the
  serve belongs to the run it opens).
- **`6–4`** — `useMatchSides().sets[N − 1]` → `${player1}–${player2}`, where `player1` is **you**
  because `getMatchSides` has already oriented `matches.score` (jsonb `{player1:[…], player2:[…]}`)
  you-first. Absent (index past the array, or the array empty) → no score, no dash. Games only —
  tiebreak points are not printed (see Open).
- **`61 points`** — the count of `FilmStop`s in the run, i.e. timed points (`videoTime != null`);
  a point the source never timed is not on the lane and is not counted. Singular at 1.
- **`0:00–38:10`** — `formatClock(run.start)` and `formatClock(run.end)`, the transport clock's own
  form (no forced hour, so the pair matches the `41:12 / 1:42:18` under it).
- The all-`"0-0"` `setScore` case changes nothing because nothing reads that column; the runs
  still split on `setNumber`, and the games still come from the entered score.

## Interaction — one rule set, two mounts

**Primitive: `DARK_READOUT_CLASS` / `DARK_READOUT_STYLE` on both mounts, positioned by
`FilmTrack` itself.** Not `ChromeTooltip`, for three reasons that hold on the shell's light chrome
and the room's dark transport alike:

1. **It is a data readout, not a control's name.** The design system gives the dark `Tooltip`
   exactly one job — naming an icon-only control (`reference/chrome.md`, "The dark `Tooltip` is the
   product's only tooltip … It names a control") — and gives a hovered chart mark ("a bar
   segment") the dark readout (`reference/components.md`, Data Tooltip, ratified 2026-09-07). A
   run of the lane is a bar segment.
2. **The lane is one slider, not N triggers.** `FilmTrack` is a single `role="slider"` whose runs
   are `aria-hidden` decoration; it `preventDefault`s pointer-down and scrubs through `window`
   listeners. A Radix `TooltipTrigger` per run would put N tooltip roots inside a slider, open on
   whichever run the pointer crosses mid-drag, and fight the pointer model the track already owns.
   One state (`hover: {run, x} | null`) in the component that already has `scrubbing` is the
   whole implementation.
3. **It is the room's precedent.** `film-court-card.tsx:407–443` draws exactly this box for its
   marks — `role="tooltip"`, opens on hover and focus, one at a time, closes when the film moves.
   A second readout in the same room drawn a different way would read as a second system.

`ChromeTooltip` stays on every glyph around the lane (`film-transport.tsx:68`,
`film-player.tsx:232`), untouched; its 400ms reveal is for controls you can already see, which the
runs are not.

| Event                        | Shell player (`film-player.tsx`)                                                                                                                                                                                                                    | Room transport (`film-transport.tsx`)                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Pointer enters the 16px lane | Start a 150ms (`--duration-fast`) rest timer; on expiry open the readout for the run under the pointer's x, anchored at that x, 200ms `--ease-primary` fade in. The run's unplayed share lifts `rgba(255,255,255,0.22)` → `0.34`, 200ms             | Same                                                                                                                                          |
| Pointer moves along the lane | The box follows the pointer's x (no transition on x); crossing into another run swaps the content and the lift instantly — no second delay                                                                                                          | Same                                                                                                                                          |
| Pointer leaves the lane      | 200ms fade out; the lift returns                                                                                                                                                                                                                    | Same. When the chrome collapses (3s idle while playing) the transport goes `pointer-events-none`, the lane gets pointer-leave, and this fires |
| Pointer down (scrub)         | Close immediately (fade), no lift, and stay closed for the whole drag — the pointer is the anchor and mid-drag it leaves the lane. Reopens only after `pointerup` + a fresh enter + the rest                                                        | Same                                                                                                                                          |
| Touch                        | Never opens: the first touch event is the pointer-down above. The lane on touch is exactly what it is today                                                                                                                                         | Same                                                                                                                                          |
| Focus (`Tab` to the slider)  | Open for the run holding `currentTime`, anchored at the playhead's x; `--focus-ring` on the lane as shipped. `←`/`→` step 5s and the box follows the playhead across cuts. `PageDown`/`PageUp` seek to the next/previous run's `start`. Blur closes | Same. Focus on the lane holds the chrome up (the room's `focusHolds`, `film-fullscreen.tsx:880–888`), so the box never fades under a keyboard |
| Esc                          | Not handled by the lane (the shell handler bails on `[role=slider]` anyway)                                                                                                                                                                         | Not handled — Esc is the room's exit key; blur is what closes the box                                                                         |
| `prefers-reduced-motion`     | Identical: there is no transform to drop, and the opacity fades are what the room keeps under reduced motion (H2 rules)                                                                                                                             | Same                                                                                                                                          |
| Where the box may go         | Inside the player's `overflow-hidden rounded-[14px]` frame: hangs 6px above the lane, `translateX(-50%)` then clamped so its edges stay within the lane's box (`align` start/center/end as `ChartTooltip` does)                                     | Same clamp; the lane is 24px in from the room's edges (and 320px from the right with the drawer open), so the box never meets an edge         |

Nothing grows under the cursor: the lane stays 3px and the thumb 11px. The 6px offset is the dark
tooltip's, so every dark box over the transport sits the same distance from what it names.

## Geometry (frame section C)

Skin `DARK_READOUT_CLASS` (`rounded-[12px]`, which is `--radius-dropdown`) + `DARK_READOUT_STYLE`
(`--ink-900`, `--shadow-dropdown`). Inside: `padding: 10px 12px`, `gap: 3px`, `white-space:
nowrap`, auto width — the court card's readout minus its fixed 168px. Title 12/500 `#FFFFFF`;
detail 11px `rgba(255,255,255,0.64)`, range in `--font-mono` with `tabular-nums`. No caret.
`bottom: calc(100% + 6px)` from the lane's 16px box. Lane and runs exactly as `film-track.tsx`
draws them: 16px hit row, 3px runs with 2.5px pads either side of each cut, played share
`var(--blue)` from `--film-t`, unplayed `rgba(255,255,255,0.22)`, lift to `0.34`.

## Handoff — the code changes an implementation task would make

1. **`film-timeline.ts` — `setSegments` returns set identity.** `TrackSegment` gains
   `setNumber: number | null` (the `point.setNumber` of the run's stops; `null` for a run with
   none) and `points: number` (the count of stops in the run). Assignment: a stop belongs to the
   run whose `[start, end)` contains `stop.serve` — cuts fall at serves, so a serve opens its run.
   The `cut <= start || cut >= duration` skips stay; a run that absorbs a skipped cut reports the
   `setNumber` of its **first** stop (and the test should pin that). Extend
   `tests/film-timeline.spec.ts` (already covers `setSegments`): identity per run, the one-run
   case, the no-stops case (`setNumber: null, points: 0`).
2. **`film-score.ts` — a pure readout builder.**
   `trackReadout(segment: TrackSegment, sets: ScoreLineSet[]): { title: string; detail: string } | null`
   — `null` when `setNumber` is null; title `Set N` plus ` · ${sets[N-1].player1}–${sets[N-1].player2}`
   when that entry exists; detail `${points} point(s) · ${formatClock(start)}–${formatClock(end)}`.
   It takes `sets` already you-first from `useMatchSides()` and never `youIsPlayer1` — there is
   nothing left to orient. Also `trackRuns(stops, duration, sets)` composing the two, so both hosts
   call one function. Tests in `tests/film-score.spec.ts` for every row of the strings table.
3. **`FilmTrack` prop shape.** `segments: TrackRun[]` where
   `TrackRun = TrackSegment & { readout: { title: string; detail: string } | null }`. Hosts:
   `film-player.tsx:317–319` and `film-fullscreen.tsx:522–525` become
   `trackRuns(stops, duration, sets)`; `FilmTab` passes `sets={sides.sets}` to `FilmPlayer` (it
   already holds `useMatchSides()` at `film-tab.tsx:121`); the room has `sides` at
   `film-fullscreen.tsx:211`. `FilmTransport` forwards the array unchanged.
4. **`FilmTrack` internals.** `hover: { run: number; x: number } | null` set from
   `onPointerMove`/`onPointerLeave` on the lane (run index from `clientX` against each run's
   x-range, pads included so there is no dead zone at a cut); a 150ms open timer; `scrubbing`
   suppresses it and `onPointerDown` clears it. `focused` state from `onFocus`/`onBlur`; while
   focused the active run is the one whose `[start, end)` holds `currentTime`, anchored at the
   playhead's fraction. The run's rest alpha becomes a custom property on the run
   (`--run-rest`, `0.22` → `0.34`) so the existing `--film-t` gradient string is unchanged apart
   from reading it. The box: `role="tooltip"`, `aria-hidden` when closed, `pointer-events-none`,
   `DARK_READOUT_CLASS`/`STYLE`, opacity-driven like `ChartTooltip` (mounted, faded — no layout
   shift). Clamp: compute the box's `align` from its measured width against the lane's width.
5. **Keyboard reachability of a run.** The slider stays the one tab stop (runs are not focusable —
   a slider cannot contain buttons). `PageDown`/`PageUp` in the existing `onKeyDown` seek to the
   next/previous run's `start` (`data-film-own-keys` already keeps every key on the lane; the shell
   handler bails on `[role=slider]`). `aria-valuetext` becomes
   `` `${formatClock(currentTime)} of ${formatClock(duration)}${active ? ` · ${active.readout.title}` : ""}` ``
   so a screen-reader user hears the set on every step and nothing essential lives only in the box.
6. **Tests.** A Playwright spec on the shell player and the room: hover a run → `role=tooltip`
   carries the expected title; pointer-down → it is gone; `PageDown` → `currentTime` lands on the
   next run's start; focus → the box names the playhead's run. Reuse the fixtures
   `tests/film-playback-refresh.spec.ts` drives (`data-testid="film-room-video"` etc.).
7. **Widget-states / drift.** No new hex: the two alphas are literals the room already draws
   (`0.22` in `film-track.tsx`, `0.34` = `OUTER_LINE` in `film-court-card.tsx`). Run the
   `widget-states` skill on the dashboard diff before commit, as the hooks require.

## Open for the author

- **Count: timed points only?** The design counts `FilmStop`s (rows with `videoTime`). A source
  that timed some points and not others would under-count against the point list. Alternative:
  count every `MatchPoint` with that `setNumber` and say "on film" when the two differ.
- **A set beyond the entered score.** `Set 3` alone is the honest string. If the match is retired
  (`match-utils.ts:179` derives `"RETIRED"` from a result string) the detail could say so; the
  design does not, because it could not settle from the rows whether a third set is unfinished or
  merely unentered.
- **Tiebreak sets.** `ScoreLineSet` carries tiebreak points but which slot holds what is disputed
  (`score-format.ts:39–45`); the readout prints games only (`7–6`). Confirm, or name the rule.
- **Stacking against a bottom-docked board.** The box hangs ~50px above the lane. With the board
  in a bottom corner (`board-position.ts` insets) the two could overlap for a pointer near that
  corner; whether the readout sits above the board or the board wins is a `z-index` call the
  design leaves to the implementation to measure.
- **A time-at-pointer readout.** The obvious neighbour of this box is the clock under the pointer
  (what every video player draws). It is deliberately not folded in — the task is the set — but
  the anchor and the reveal are the same, so it could be one more line later.
- **`PageUp`/`PageDown`** are free on both hosts today (the room's `⇧←`/`⇧→` are window-level 5s
  seeks; the shell has no page keys). Confirm they are the wanted keys for "next set".
- **The Dartmouth fold.** The entered 5-2 will print over a third run whose strokes end 4-0, as
  the board already does. Confirm that is acceptable on the lane too, or the third run of that one
  match should read like B2.
