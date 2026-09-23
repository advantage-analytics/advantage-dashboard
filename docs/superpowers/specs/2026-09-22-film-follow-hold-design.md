# Film points: follow playback, or hold the point you are reading

Drawn in-repo on 2026-09-22 against the code as it stands after T1–T16 on
`claude/video-player-ui-tasks-4d2ec9`; the approved plan is
`~/.claude/plans/the-following-tasks-cheeky-muffin.md` and this document does not reopen any
decision in it. The frame is checked in beside this file in
[`2026-09-22-film-follow-hold/frames.html`](2026-09-22-film-follow-hold/frames.html) — inline
styles there are the measurements. **Read the frame before writing any px, alpha or radius value**;
this document paraphrases, the frame does not. It links the real token files under
`src/styles/design-system/`, so it renders from a plain checkout.

| Frame section | Holds                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------- |
| A1            | The room drawer following — the drawer as shipped, with the smooth scroll                    |
| B1            | The room drawer held: the well under point 9, the lit row at point 14 further down, the pill |
| C1            | The shell "This point" card held: the header line in the counter's slot                      |
| D             | Motion measured, the reduced-motion path, keyboard and screen-reader notes                   |

Scope: `src/components/dashboard/matches/match-detail/film/point-list.tsx`,
`film-room-drawer.tsx`, `film-this-point.tsx`, `film-tab.tsx` (the state's owner) and
`film-fullscreen.tsx` (the drawer's wiring and the room's `step`). Phase-1 and H2 "Rules that
apply to every task" apply unchanged
([`2026-09-21-video-fullscreen-h2-design.md`](2026-09-21-video-fullscreen-h2-design.md)).

## What it is

Both the room's points drawer and the shell's "This point" card track the _playing_ point. When
the film crosses into the next point, the drawer's well under the point you were reading unmounts
and reopens under the new row, the list scrolls to it, and the card swaps its rows. Reading a
point's shots while the film plays on is therefore hard, which is the drawer's main job.

The fix is one state shared by both surfaces:

```ts
type PointFocus = { mode: "follow" } | { mode: "held"; pointId: string | null };
```

`pointId: null` (T25, 2026-09-23) is **held with no well**: a hand scroll made while nothing was
displayed — the drawer's R7 dead time, or either surface before the first point — holds the list
where the viewer left it and opens no well.

In `follow` everything is as today, except the scroll is smooth. In `held` the **well and the
card hold** on the held point while the **lit row, the board, the court, the position counter
and the room's court title keep following** the film. A small return affordance — a dark pill in
the drawer, a header line in the card — names the point now playing and takes you back to it.
No per-point accordion: one open well stays the rule (H2 R3, "No second list, no Shots tab, no
tabs of any kind"). Playback, loop and skip-dead are untouched. The state is not persisted.

## Settled against the code

- **The state splits exactly two reads, both in `point-list.tsx`.** `wellStops` (l.294–297)
  filters `shotStops` by `activePointId` — that is the well slice, and it becomes a read of the
  _displayed_ point. `isActive` (l.456, `point.id === activePointId`) is the lit row, and it keeps
  reading the _playing_ point. Nothing else in the list distinguishes the two. `activeStart` /
  `activeEnd` (the 2px progress rule) belong to the lit row and follow with it.
- **The effect comment promises what the code does not do.** l.303–305 reads "Keep whatever is
  lit in view as the film moves on … without fighting a user who is scrolling the list
  themselves." l.312–328 has no hand-scroll detection at all: it reads the row's box against the
  list's box on every change of `activePointId` / `activeShotId` / `wellOpen` and moves
  `scrollTop` by the difference, instantly. The claim in the comment is this design's job; the
  code beneath it is what B1 replaces.
- **The rule at l.306–310 stands.** The effect moves the scroller's own `scrollTop` and never calls
  `scrollIntoView`, because the DOM method walks every ancestor and dragged the whole room
  sideways while the drawer was still off-canvas mid-slide. Smooth scrolling keeps that rule:
  `list.scrollTo({ top, behavior: "smooth" })` on the same element.
- **The `scroll` event cannot detect intent.** A programmatic `scrollTo` fires `scroll` exactly as
  a wheel does, and a smooth one fires it on every frame. Intent is read from `wheel`,
  `touchmove` and `pointerdown` on the scroller — events a programmatic scroll never produces —
  and never from `scroll`.
- **The shell counter and the room's transport counter share one array.** The shell's
  `position` (film-tab.tsx l.313–317) is the playing point's index in `walkStops` plus one;
  the room's `step` (film-fullscreen.tsx l.798–808) walks `p.walkStops`, the same array
  (film-tab.tsx l.648). So "Point 14" in the pill, in the header line, in the card's `14 / 87`
  and in the transport's `Point 14 / 87` is the same number from the same field.
- **Leaving the Video tab already resets everything held in `FilmRoom`.** film-tab.tsx l.121–126:
  `MatchReportWhen` _unmounts_ this view when the viewer switches to Statistics or Shots. A
  `useState` in `FilmRoom` therefore resets to `follow` on tab-leave with no reset code — and it
  is exactly why the state must live in `FilmRoom` and not in `FilmFullscreen` (which unmounts on
  room exit) or in `PointList` (which is mounted twice: shell column and room drawer).
- **Opening and closing the room cannot touch the state** for the same reason: the room is a
  child of `FilmRoom` (film-tab.tsx l.633–660). The drawer's open/closed flag (`panel`) is the
  room's, and the pill mounts inside the drawer, so a closed drawer simply has no pill.
- **The drawer has no padding of its own** (film-room-drawer.tsx l.98: the `aside` is the 320px
  sheet, its hairline and its shadow; `PointList` on `tone="dark"` paints "nothing of its own",
  point-list.tsx l.121–123). The scroller is `PointList`'s `listRef` div (l.433–436), a flex child
  of the list's `section`. The pill's positioning wrapper therefore goes in `PointList`, around
  that div — see Handoff 4.
- **The room's court title is "This point"** (film-fullscreen.tsx l.599–604) whenever the court is
  in point mode. It names the court, and the court follows the film; the title does not change
  while held.

## The state, per surface

| Surface                                     | HOLDS on `held.pointId`                                                                                                                                                                                                      | KEEPS FOLLOWING the playing point                                                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Room drawer (`PointList tone="dark"`)       | The open well (`wellStops` reads the displayed id); the list's scroll position (the keep-in-view effect is off while held). A null hold (T25): no well; the scroll position                                                  | The lit `data-playing` row and its 2px progress rule (`isActive`, `activeStart`/`activeEnd`); the lit shot _inside_ the well only when the playing point is the held point                                  |
| Shell point list (`PointList tone="light"`) | The open well (none today: the shell passes no `onSelectShot`); the list's scroll position (keep-in-view off while held). Same hold sources as the drawer (T24, 2026-09-23). A null hold (T25): no well; the scroll position | The lit row                                                                                                                                                                                                 |
| Room (outside the drawer)                   | Nothing                                                                                                                                                                                                                      | The scoreboard, the court and its marks, the court title "This point", the transport's `Point 14 / 87` counter and its chevrons, `S` (save the point on screen — the playing one)                           |
| Shell "This point" card (`FilmThisPoint`)   | Nothing (T22, 2026-09-23: the card follows again — T20's hold is reverted)                                                                                                                                                   | The shot rows, the footer (`N shots · Ns · Result`), the empty copy, the position counter (`14 / 87`), the step buttons, the active-row wash — the whole card, as the room's own "(outside the drawer)" row |
| Shell (outside the card)                    | Nothing                                                                                                                                                                                                                      | The player, the seek lane, the rail scoreboard (`usePublishFilmHead`)                                                                                                                                       |

The **displayed point** on each surface is `held.pointId` when held, else the playing point —
drawer: `playingStop`, shell: `activeStopAt`, both unchanged.

## Enter and leave

| Trigger                                                                                                             | Surface            | Result                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Click (or Enter/Space) on a point row                                                                               | Drawer, shell list | `held(thatPointId)` — and the click still seeks (`selectPoint` / `handleSelect` unchanged). Held ≡ playing at that instant — no pill until the lit row leaves the box (T24)                                                                                                                             |
| Click on a shot row                                                                                                 | Drawer well, card  | `held(stop.point.id)` — the shot's own point; the click still seeks. Same as above — no pill until the lit row leaves the box                                                                                                                                                                           |
| Click on the row that is already playing                                                                            | Drawer, shell list | `follow` (it is the way to "go back" without the pill). The seek still happens — a restart of the point                                                                                                                                                                                                 |
| Hand scroll of the list: `wheel`, `touchmove`, or `pointerdown` whose target is the scroller itself (the scrollbar) | Drawer, shell list | `held(displayedPointId)` — the point whose well is open (or, with no well, the lit point) — null in dead time or before the first point: held with no well, the list stays put (T25). Never from the `scroll` event. The follow effect sets a flag around its own `scrollTo` so its scrolls never count |
| The return affordance (the "Now playing" pill)                                                                      | Drawer, shell list | `follow`. The list scrolls smoothly to the playing row and its well unfolds                                                                                                                                                                                                                             |
| `←` `→` (room: also `↑` `↓`; shell: the same four), the transport chevrons, the card's step buttons                 | Both               | `follow`, then the step from the playing point (`step`, film-fullscreen.tsx l.798; `handleStep`, film-tab.tsx l.308; the key handlers). Stepping means "take me on"                                                                                                                                     |
| Open / close the room; open / collapse the drawer                                                                   | —                  | Leaves the state alone. The drawer re-mounts with the pill already showing if held ≠ playing                                                                                                                                                                                                            |
| Leaving the Video tab                                                                                               | —                  | `follow` — `FilmRoom` unmounts (film-tab.tsx l.121–126)                                                                                                                                                                                                                                                 |
| A cut change (filters) that removes the held point from `visiblePoints`                                             | Both               | `follow` — there is no row left to hold. A cut that keeps it changes nothing. A null hold is not reset: it has no row for a cut to drop (T25)                                                                                                                                                           |
| Seeking on the lane, `J`/`L`, skip-dead, loop, play/pause                                                           | —                  | Not an enter or a leave. The playing point moves; the pill's number and chevron follow it                                                                                                                                                                                                               |

Hand scroll is an **enter** only: scrolling while already held keeps the held point (the well does
not move to whatever scrolled into view).

## The strings

| Case                                                      | Drawer pill                                                | List pill                      | `aria-label`                                              | Shown when                                                                                                                                                                  |
| --------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------ | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Held; playing point in the cut, lit row pinned **bottom** | `Now playing · Point 14` + `chevron-down`                  | same as the drawer pill (T23)  | `Now playing: point 14 — follow playback`                 | `held` AND a point is playing AND the lit row is not wholly inside the scroller's box                                                                                       |
| Held; playing point in the cut, lit row pinned **top**    | `Now playing · Point 14` + `chevron-up`                    | same as the drawer pill (T23)  | same                                                      | same                                                                                                                                                                        |
| Held; playing point in the cut, lit row fully in view     | — (the drawer pill is unmounted)                           | — (unmounted, as the drawer's) | —                                                         | never — the lit row is on screen, there is nothing to point at (both tones)                                                                                                 |
| Held; playing point outside the applied cut               | `Now playing · not in this cut`, no chevron, pinned bottom | same as the drawer pill (T23)  | `Now playing: a point outside this cut — follow playback` | `held` AND a point is playing — there is no row to point at, but re-follow still puts the list back on the film's next in-cut point                                         |
| Held; held point filtered out of the cut                  | — (state resets to `follow`)                               | —                              | —                                                         | never                                                                                                                                                                       |
| Held; no point playing (R7 dead time)                     | —                                                          | —                              | —                                                         | never — "Between points … gets no words" (H2 R7); the pill returns when the next point begins, and a hold made in dead time shows the pill once the next point begins (T25) |
| Held; playing point is the held point                     | as the rows above                                          | as the rows above              | as the rows above                                         | as the rows above — shown once the lit row is out of the box (T24)                                                                                                          |
| `follow`                                                  | —                                                          | —                              | —                                                         | never                                                                                                                                                                       |

Where each part comes from:

- **`14`** — `position.index` (film-tab.tsx l.313–317): the playing point's index in `walkStops`
  plus one. The same field feeds the card's `14 / 87` and the room's `Point 14 / 87`, so all four
  agree. A playing point with no index (`position === null`) is the "not in this cut" row.
- The visible string is `Now playing · Point N` with a middot; the number is Inter, not mono —
  it is a sentence, not a machine value. The pill's chevron is Lucide at 12px (chrome.md's chevron
  size): `chevron-up` when the pill is pinned top, `chevron-down` when pinned bottom — it always
  points at the edge the pill sits on, which is the side the lit row is beyond (next section).
  The line's arrow is `chevron-right` at 12px — its "→" in the plan is that glyph.
- The `aria-label` uses a colon and an em dash so the spoken form is one sentence; "follow
  playback" says what pressing does.

### Where the drawer pill sits (T21)

- **Two edges, one inset.** The pill pins inside the edge of the scroller the lit row is beyond:
  `top-3` or `bottom-3` — the same 12px inset on both — with `left-1/2 -translate-x-1/2`
  unchanged. Exactly one of the two classes is ever on it.
- **Hysteresis.** The edge changes only once the lit row is _wholly_ beyond one: it becomes top
  once `row.bottom <= box.top` and bottom once `row.top >= box.bottom` (the lit
  `[data-point-id][data-playing="true"]` row's `getBoundingClientRect()` against the scroller's).
  While the row straddles an edge the pill keeps the edge it had, so a row sliding past the box
  cannot flip it back and forth.
- **Hidden while the lit row is fully in view.** With `row.top >= box.top && row.bottom <=
box.bottom` the pill is **unmounted** (not merely chevron-less) — the playing row is on screen,
  and the lit wash already names it. It leaves on the usual 100ms fade and returns on the enter
  rise once the row leaves the box again. The placement is read in a layout effect, so a pill whose
  row is already in view is never painted.
- **Memory across the hidden spell.** The memory lives in `FollowPill`, which stays mounted while
  its button is not, but it is **cleared** whenever the lit row is fully in view and whenever the
  affordance goes away (follow, dead time, held ≡ playing). With no memory, a row that straddles
  an edge takes the edge it crosses (`row.top < box.top` → top, else bottom); a row wholly beyond
  one sets it outright. So a pill returning after the row was in view pins to the side the row
  left by, never to a stale edge from before; hysteresis applies only to a pill that is on screen.
  The last edge is kept (not reset) for the exit fade, so a leaving pill does not jump edges.
- **Not in this cut.** No row to measure: always bottom, no chevron, always mounted while the
  affordance says so.

## Interaction — with the motion values

Motion thesis (impeccable `animate`, DS scale): the one authored moment is **re-follow** — the
smooth scroll to the playing row and its well unfolding together, which is the state change made
legible. Everything else is feedback at the fast end of the scale. Nothing new animates on hold:
holding is the _absence_ of a scroll.

| Event                          | Drawer                                                                                                        | Card                                                               | Motion                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Follow-mode keep-in-view       | The effect (l.312–328) computes the target `scrollTop` as today and applies it via `scrollTo` on the scroller | n/a (the card does not scroll to its point)                        | `scrollTo({ top, behavior: "smooth" })` on the list's own `scrollTop` — Chromium eases ~300ms; no custom scroll-jacking; no `scrollIntoView` (l.306–310)                                                                                                                                                                                       |
| Pill / header line appears     | Mounts as a child of the positioning wrapper, pinned top or bottom                                            | Replaces the counter span between the step buttons                 | Enter: 150ms (`--duration-fast`) opacity 0→1 + a 4px travel on `--ease-primary` (`film-shot-row-in`'s distance) _away from the edge it lands on_: pinned bottom it rises from 4px below, pinned top it drops from 4px above (`--film-pill-rise: -4px`, read by the one `film-follow-pill-in` keyframe). The card line rises as the bottom pill |
| Pill / header line disappears  | Unmounts after the exit                                                                                       | The counter returns                                                | Exit: 100ms opacity only                                                                                                                                                                                                                                                                                                                       |
| Re-follow                      | Smooth scroll to the lit row; the well mounts under it                                                        | Rows re-key to the playing point                                   | Scroll as above; well fold `film-shot-well-open` (250ms) and row stagger `film-shot-row-in` (200ms, 25ms steps) **unchanged**                                                                                                                                                                                                                  |
| Hold (click or hand scroll)    | The effect stops firing; the well stays                                                                       | Rows stay                                                          | None. The lit row's wash moves to the playing row with its shipped 200ms colour transition                                                                                                                                                                                                                                                     |
| Pill hover / press             | `rgba(13,13,13,0.72)` → `0.9`                                                                                 | `hover:bg-[var(--surface-subtle)]` (the step buttons')             | 200ms `--ease-primary` (the trigger's own transition); press `scale 0.97`                                                                                                                                                                                                                                                                      |
| R2 chrome collapse / room exit | The pill fades with the transport (it is `data-film-chrome`)                                                  | n/a                                                                | Collapse 200ms opacity; exit fade 120ms (film-fullscreen.tsx l.926–934)                                                                                                                                                                                                                                                                        |
| `prefers-reduced-motion`       | Instant scroll; pill fades, no rise or drop on either edge                                                    | Line fades, no rise; rows swap with `animation: none` (as shipped) | `behavior: "auto"`; opacity only (foundations.md l.349: "skip transforms, keep opacity"); the well's `film-shot-well-fade` path is already there                                                                                                                                                                                               |

No value outside this table is introduced.

### Accessibility

- **Keyboard reach of the pill.** It is a `<button>` inside `aside[aria-label="Points"]`, placed in
  DOM order _after_ the scroller inside the positioning wrapper, so Tab reaches it after the last
  row of the list and before the transport (the drawer is the last chrome in the room's focus
  trap order). It is unmounted when hidden — never `opacity: 0` in the tab order. Focus on it
  holds the room's chrome up, like focus on any other chrome control (`focusHolds`,
  film-fullscreen.tsx l.1062–1067).
- **The header line** is a `<button>` in the card's head, between the two step buttons, in
  their tab order.
- **`aria-label`** on both: `Now playing: point 14 — follow playback` (the "not in this cut"
  variant in the strings table). The visible text stays the short form.
- **The lit row keeps naming the playing point.** `data-playing="true"` (point-list.tsx
  l.608) stays on `isActive`, so a harness that asserts "the selection moved" still passes while
  held, and a screen-reader user walking the list hears the row that is playing. The held row
  gets no attribute of its own — its open well (`data-shot-well`) is the mark, and the well's
  rows keep their `aria-current` on the lit shot only when the held point is the playing one.
- **Icon-only rule.** The pill and the line have visible text; the chevron inside each is
  `aria-hidden`. No dark tooltip: they are not icon-only controls (chrome.md, "The dark Tooltip
  … names a control whose label is not on screen").

## Geometry (frame sections B1, C1, D)

The frame's inline styles are the measurements; the classes below are what the implementation
reuses.

- **Pill** — the "Points" trigger's recipe (film-fullscreen.tsx l.1509–1536): `inline-flex h-7
items-center gap-[7px] rounded-[var(--radius-button)] bg-[rgba(13,13,13,0.72)] px-2.5
text-[11px] font-medium text-white transition-[opacity,transform,background-color]
duration-200 ease-[var(--ease-primary)] hover:bg-[rgba(13,13,13,0.9)]
focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none`, plus the drawer's own
  `shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]` so it reads over a lit row as well as the
  sheet. `data-film-chrome`. Positioned `absolute left-1/2 -translate-x-1/2` inside the wrapper,
  plus `top-3` xor `bottom-3` (12px either way — "Where the drawer pill sits"). The chevron `size-3`
  (12px) at `strokeWidth 1.6`.
- **Header line** — `inline-flex h-7 items-center gap-1 rounded-[var(--radius-element)] px-1.5
text-[11px] font-medium whitespace-nowrap transition-colors duration-200
hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)]
focus-visible:outline-none`, colour `var(--ink-600)` inline (the footer's ink, l.161 — the
  eyebrow's weight without its tracking). The chevron `size-3` at `strokeWidth 1.6`, same ink. It
  takes the counter span's place; the head keeps its 28px row height.
- **Everything else is as shipped**: drawer `w-[320px] bg-[rgba(13,13,13,0.88)]` + hairline
  (film-room-drawer.tsx l.98); list header `px-2.5 pt-[13px] pb-[3px]` (point-list.tsx l.129);
  rows `min-h-[52px] px-[14px]`, `playing: bg-white/[0.08]` (l.534–536); well
  `bg-[rgba(0,0,0,0.28)]` + 6% inset hairlines, rows `h-[34px] px-[14px]` on `SHOT_COLUMNS`, lit
  `rgba(255,255,255,0.12)` (l.771–839); card `surface-card` `10px 8px 8px`, head `pt-0.5
pr-[5px] pb-2.5 pl-3`, `size-7` step buttons, `min-w-[56px] text-[11px] mono` counter, `h-10
px-3` rows on `NARROW_COLUMNS` (film-this-point.tsx l.44–106, l.252–255).
- **No new colour.** Every alpha above is already in point-list.tsx, film-room-drawer.tsx or
  film-fullscreen.tsx; `grep -o '#[0-9A-Fa-f]\{3,6\}'` on the frame returns `#FFFFFF` only.
  `tests/design-drift.spec.ts` runs `scripts/check-design-drift.mjs` whose walk root is
  `SRC = "src"`, so it never sees `docs/` — checked by hand instead.

## Handoff — the code changes an implementation task would make

1. **State owner — `film-tab.tsx`, beside `room`** (l.166).
   `const [pointFocus, setPointFocus] = useState<PointFocus>({ mode: "follow" })` with the type
   (`{ mode: "follow" } | { mode: "held"; pointId: string | null }` since T25 — null is a hold
   with no well) exported from `film-timeline.ts` (pure, no React) so `point-list.tsx`, `film-this-point.tsx`
   and the harness can import it. Derived: `displayedPointId = pointFocus.mode === "held" ?
pointFocus.pointId : activePointId`. Two stable callbacks: `holdPoint(id)` and
   `followPlayback()`; `holdPoint` takes `string | null` (T25). The tab-leave reset is free (the view unmounts); no effect needed.
2. **The cut-change reset.** An effect on `[filteredPoints, pointFocus]`: if held and no point in
   `filteredPoints` has the held id, `followPlayback()` — skipped for a null hold (T25).
3. **Props down.** `FilmThisPoint` gains `displayedPointId` — in practice `point` becomes the
   displayed point (`stops.find(s => s.point.id === displayedPointId)?.point`), `shots` its shots,
   plus `nowPlaying: { index: number | null; visible: boolean }` and `onFollow`. `FilmFullscreen`
   gains `pointFocus`, `displayedPointId`, `onHoldPoint`, `onFollow` and forwards them to
   `FilmRoomDrawer` → `PointList`. `PointList` gains `displayedPointId: string | null`,
   `onHoldPoint`, `onFollow`, `nowPlaying` (the pill's number and direction inputs). The shell
   column's `PointList` (film-tab.tsx l.608) gets the same props: its row clicks hold, its lit row
   follows, but it draws no pill (`tone="light"` has no scroller-following effect to stop —
   confirm in Open).
   _Superseded for the card by T22 (2026-09-23): `FilmThisPoint` keeps `point` = the playing
   point and takes no `nowPlaying`/`onFollow`; the list and room props stand._
4. **Where the pill lives — `point-list.tsx`.** Wrap the `listRef` div (l.433–436) in a
   `relative flex min-h-0 flex-1 flex-col` wrapper and render the pill as the wrapper's second
   child, only on `tone="dark"`, only while `nowPlaying.visible`. The wrapper, not the drawer:
   the drawer has no padding and the Advanced branch (l.337) replaces the scroller in the same
   `section`, so the pill must sit with the scroller it belongs to. The pill's edge (and so its
   chevron) is computed from the lit row's box against the scroller's with the T21 hysteresis
   ("Where the drawer pill sits"), re-read on `scroll` of the scroller (reading `scroll` for
   _placement_ is fine; it is intent that `scroll` cannot carry).
5. **The well slice and the lit row split.** `wellStops` (l.294–297) filters by
   `displayedPointId`; `isActive` (l.456) keeps `activePointId`. The keep-in-view effect
   (l.312–328) early-returns while `pointFocus.mode === "held"`; otherwise it computes the target
   as today and calls `list.scrollTo({ top, behavior: prefersReducedMotion() ? "auto" :
"smooth" })` (`reducedMotionNow` in `film-motion.ts` l.68, imported as `prefersReducedMotion` at film-fullscreen.tsx l.78).
6. **Scroll-intent listeners and the follow flag — `point-list.tsx`.** On the scroller:
   `wheel` (passive), `touchmove` (passive), and `pointerdown` where `e.target === list` (the
   scrollbar gutter is the only part of the scroller that is not a child). Each calls
   `onHoldPoint(displayedPointId)` when `displayedPointId` is set. The effect sets
   `followScrollRef.current = true` before `scrollTo` and clears it on the scroller's `scrollend`
   (fallback: a 400ms timer where `scrollend` is missing — Safari), so nothing derived from the
   scroller's motion can ever read the effect's own travel as the viewer's. The three intent
   listeners do not consult the flag: a wheel arriving mid-follow-scroll is intent and holds.
   Never `scroll` for intent.
7. **Row and shot clicks.** `PointRow`'s `onSelect` path (l.625) and `ShotWellRow`'s
   (l.828): the list's `handleSelect` wrapper calls `onHoldPoint(point.id)` then `onSelect(point)`
   — except when `point.id === activePointId`, where it calls `onFollow()` then `onSelect`. Same
   wrapper for `FilmThisPoint`'s `ShotRow` (l.244) with `stop.point.id`.
   _Superseded for the card by T22 (2026-09-23): `FilmThisPoint`'s shot click only seeks again —
   no hold/follow wrapper; the list's wrapper stands._
8. **Re-following on a step.** `step` (film-fullscreen.tsx l.798–808) and `handleStep`
   (film-tab.tsx l.308–310) call `onFollow()` / `followPlayback()` before seeking. The shell's key
   handler (film-tab.tsx l.427–445) routes through `playerRef.current?.step`, whose two transport
   buttons (film-player.tsx l.724–732) also call the player's internal `step` — so `FilmPlayer`
   gains an `onStep?: () => void` notification (or its `step` is lifted to the tab; the
   implementation picks, and says why). The room's `←`/`→`/`↑`/`↓` go through `step` already.
9. **The card's head — `film-this-point.tsx` l.84–105.** While `nowPlaying.visible`, the counter
   span is replaced by the header-line button (geometry above); otherwise the counter as today.
   The step buttons' `disabled={!position}` stays keyed to the _playing_ position.
   _Superseded by T22 (2026-09-23): the card's head always shows the counter; there is no header
   line._
10. **Motion.** The pill and the line get an enter class — a new `film-follow-pill-in` keyframe
    in `globals.css` beside `film-shot-row-in` (150ms, opacity + 4px rise, `--ease-primary`, with
    a `prefers-reduced-motion` block that drops the transform) — and exit via the room's
    `data-film-chrome` fade or a 100ms opacity transition before unmount (the drawer's
    `onTransitionEnd` pattern, film-room-drawer.tsx l.94–96, is the precedent for waiting on it).
    _Superseded for the line by T22 (2026-09-23): the card has no line, so `film-follow-pill-in`
    serves the pill only — on both lists since T23._
11. **Harness specs.** Extend `tests/film-playback-refresh.spec.ts` (it already mounts both
    surfaces): (a) click a row, drive the film into the next point → `data-shot-well` stays under
    the clicked row, `data-playing` moves, the pill names the playing point; (b) press the pill →
    `pointFocus` back to follow, the scroller's `scrollTop` reaches the row, the well is under the
    playing row; (c) dispatch `wheel` on the scroller → held, no scroll on the next shot change;
    (d) `ArrowRight` → follow; (e) change the cut to exclude the held point → follow; (f) the
    shell card: rows stay on the held point, the header line shows, press → rows swap; (g)
    `page.emulateMedia({ reducedMotion: "reduce" })` → `behavior: "auto"` (assert via a spy on
    `scrollTo` or the absence of intermediate `scrollTop` values) and no transform on the pill.
    A pure spec `tests/film-timeline.spec.ts` for the `PointFocus` helpers (`displayedPointId`,
    the pill's visibility rule over the strings table).
    _(f) superseded by T22 (2026-09-23): the shell card now follows — the spec asserts its rows
    and counter read the playing point while the list holds, and no header line mounts._
12. **Widget-states / drift.** No new hex; the two alphas the pill uses are the trigger's and the
    drawer's. Run the `widget-states` skill on the dashboard diff before commit, as the hooks
    require. Hook naming precedent if a hook is extracted (`useScrollIntent`): `use-scroll-intent.ts`
    beside `use-corner-drag.ts` / `use-seek-settling.ts` — never a `.tsx` beside a `.ts` of the
    same name.

Expected split (the plan's guess, refined): **one** task for the state, the split reads, the
intent listeners, the pill and the room's re-follow (items 1–8, 10 for the pill, 11a–e, 12);
**one** for the shell card (3's card props, 7's card wrapper, 8's `FilmPlayer` notification, 9,
10 for the line, 11f); **one** for reduced motion and the harness's motion assertions (5's
`behavior` switch, 10's reduced-motion block, 11g) — or fold the third into the first two if the
author prefers two tasks; the motion values are few.

## Open for the author

- **The card's counter while held.** The design puts the header line _in place of_ the counter
  span (the plan's words), so `14 / 87` is not on the card while held — the line carries "14" and
  the counter returns on re-follow. The alternative is the line to the left of the stepper cluster
  with the counter kept, at the cost of "14" printed twice in a 720px head. Confirm the
  replacement.
- **The shell point list's own scroll.** The shell column's `PointList` (`tone="light"`) has the
  same keep-in-view effect. The design holds it too (a row click holds on both surfaces, and the
  effect checks the state), but draws no pill there — the card's header line is the shell's return
  affordance. Confirm no pill in the shell list.
  _Answered by T23 (2026-09-23): yes, a pill. T22 removed the header line, so the shell list mounts
  the drawer's own pill (same strings, edge and hysteresis; `--shadow-floating` in place of the
  inset hairline over the white card). Its hold sources stay clicks and Enter/Space — no hand-scroll
  hold on the light tone._
  _Superseded by T24 (2026-09-23): hand scroll holds on the light tone too — the shell list takes
  the drawer's `wheel`/`touchmove`/scroller `pointerdown`/scrolling-key hold, so T23's "no case
  asserts hand-scroll holds the shell list" no longer stands (T24's cases assert it). On the shell an
  arrow on a focused row is a scroll that holds, not a step._
- **Keyboard scrolling of the drawer.** `PageDown`/`Space`/arrow keys with focus on the scroller
  or a row scroll it without `wheel`/`touchmove`/`pointerdown`. The plan fixes the three pointer
  sources; a `keydown` on the scroller for those keys would be the fourth. Add it, or leave
  keyboard scrolling as a non-holding scroll?
- **"Not in this cut" wording.** `Now playing · not in this cut` is the design's string for a
  playing point the cut excludes. It is the one case where the pill points at nothing. Alternative:
  hide the pill and let the transport's blank counter carry it (as R7 does for dead time).
- **Hold from the room's court marks.** A mark click seeks to a shot (`selectMark`,
  film-fullscreen.tsx l.827–836) — it is a shot click in spirit. The design does not hold on it
  (the court follows, and its marks are the playing point's); confirm.
