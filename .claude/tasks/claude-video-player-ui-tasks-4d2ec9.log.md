# Run log — claude/video-player-ui-tasks-4d2ec9

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Rename "Current point" to "This point" and drop the speed column — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** `film-this-point.tsx`: eyebrow, `aria-label` and header comment read "This point"; the `Mph`/`Km/h` header cell and speed body cell are gone; `WIDE_COLUMNS` drops its `44px` track (seven tracks), `NARROW_COLUMNS` unchanged; the `unit` prop, `DistanceUnit` and `formatSpeedValue` imports removed from both the outer component and `ShotRow`. `film-tab.tsx`: only the `unit={unit}` prop on `<FilmThisPoint>` removed (the tab's own unit state still feeds `FilmRoom`). H1 spec doc section B retitled, rail-collapsed column list without `Mph`, author decision noted 2026-09-21. `shotRowCells.mph` in `film-shots.ts` untouched — the room's court readout still reads it.

## T2 · Point-row mark shows the point's winner, not the last hitter — done

**gate:** mechanical pass (one live-DB flake: `match-video-attachments-db.spec.ts` "at most 50 rows per claim, and two concurrent sweeps never share a row" failed on the full run and on two solo re-runs; it is the known race already logged on the per-user-point-bookmarks and llm-routing branches — `match_video_claim_cleanup` walks candidates with per-row `for update skip locked`, so two concurrent callers leapfrog and split 55 rows ~30/25 instead of 50/5, and the diff has no path into that RPC) · completion `VERDICT: pass`

**changed:** `point-list.tsx`: `isYou` is now `point.wonByPlayer1 === youIsPlayer1` (was the last stroke's hitter via `point.player`); header comment rewritten to describe the mark as the point's winner sourced from `won_by_player1` (score-folded by `derivation/winners.ts` for Advantage Intelligence, read from the export for SwingVision); the row's mark slot carries `data-mark="you" | "opp"` as a test hook. New `tests/point-list-winner-mark.spec.ts` + `tests/fixtures/point-list-winner-mark-harness.tsx` mount the real `PointList` with two points both hit last by player 2 and opposite `wonByPlayer1`, asserting mark vs chip for a player-1 viewer. `match-points-server.ts`, `film-room-drawer.tsx` untouched.

**follow-ups:**

1. `film-filters.tsx`'s header comment still calls the "Point went to" axis "the ONLY you/opp test in this subtree"; the row mark now makes the same `wonByPlayer1 === sides.you.isPlayer1` comparison. Reword or share a helper.
2. The `max === 50` assertion in `match-video-attachments-db.spec.ts` "at most 50 rows per claim" assumes the two concurrent claims serialise, which the RPC's per-row `skip locked` loop does not guarantee; consider asserting `aIds.length + bIds.length >= 55` and the cap only.

## T3 · Carry the vendor's bounce_frame to shots.bounce_video_time — done

**gate:** mechanical pass · completion `VERDICT: pass` (live column confirmed via `information_schema.columns`: `real`, nullable, comment set; migration recorded in `supabase_migrations.schema_migrations` as `add_shot_bounce_video_time`)

**changed:** New pure `derivation/frame-clock.ts` holds `fitFrameToTime` (moved byte-identical out of `ball-paths.ts`, now exported) and `bounceVideoTimes(strokes)`; `ball-paths.ts` imports the fit; `index.ts` re-exports both. `SplitStepStroke.bounceFrame: number | null` set in `normalizeStroke` (null on missing / non-finite / `-9999` / before the contact frame / no contact frame). `transcript.ts` fits one clock over every rally's strokes and writes `bounce_video_time` per shot; `persist-transcript.ts` inserts it. Migration `20260922042018_add_shot_bounce_video_time.sql` (`alter table shots add column bounce_video_time real null` + column comment) applied live — no backfill, existing rows NULL. `match-points-server.ts` selects the column and `MatchShot.bounceVideoTime` carries it. New `tests/splitstep-frame-clock.spec.ts` (10 cases, incl. frames 0/30/60 @ 100/101/102 with bounce 45 → 101.5). `MatchShot`/`SplitStepStroke` literals updated in `film-shots`, `match-video-attachments-db`, `film-court`, `viz-model`, `splitstep-transcript` specs for typecheck. `tests/splitstep-ball-paths.spec.ts` unchanged. SwingVision path untouched.

**follow-ups:**

1. Every already-derived Advantage Intelligence match has `bounce_video_time` NULL until the author re-derives it (`scripts/splitstep-derive.ts --job <uuid> --write`); Caden Ace v Matt Goodman (`d3bff342-b33a-417a-a332-b5a3192f3f4d`) is the one to do first so T4 has something to show.
2. `ball-paths.ts` still derives its own `bounceTime` from `trajectories.json`; strokes now carry `bounceFrame` too, so the two could be cross-checked as a cheap quality signal.
3. `.claude/skills/create-migration/check.sh` flags the pre-existing `20260913230000_notification_prefs_team.sql` (RLS on, no policy marker) on every run.

## T4 · Room placement marks fire at the stored bounce time — done

**gate:** mechanical pass (two full runs each tripped a different set of `(live)` specs — `viz-bands-rls` "statement timeout", `program-owner-name-live`, `seats-count-players`, then `match-video-attachments-db` "concurrent identical retries", `program-member-avatars`, `program-owner-name-live` — and every one passed alone on re-run; all six are shared-live-DB specs with no path into the film court, the pattern already recorded in reference_live_db_auth_rate_limits) · completion `VERDICT: pass`

**changed:** `ShotStop.bounce: number | null` — `shotStops()` converts `shot.bounceVideoTime` through the same `toFilmTime(clock)` as `start` and keeps it only when ≥ `start`. `film-fullscreen.tsx`'s `courtMarks` memo builds `bounceTime: s.bounce ?? bounceTimes.get(s.shot.id)` — stored regular-JSON bounce first, ball-paths match second, `estimatedBounceTime` last; no other line in the file changed beyond the comment above `useBallPaths`. `film-court.ts`'s `BOUNCE_REVEAL_SHARE` comment names the two measured sources it falls back from. `tests/film-shots.spec.ts` pins 65.8 → 50.8 at offset 15, null for a missing time, null for a landing before its own contact. `tests/film-court.spec.ts` pins a stored 12.25 on a shot struck at 12: bounce live at 12.25, absent at 12.05, contact unaffected.

**follow-ups:**

1. Inert until a match is re-derived: `npx tsx scripts/splitstep-derive.ts --job d3bff342-b33a-417a-a332-b5a3192f3f4d --write` (Caden Ace v Matt Goodman) is the author's step, then an eyes-on pass in the room — first time the court draws a measured landing.
2. Once every Advantage Intelligence match is re-derived, `bounceTimesByShot`/the ball-paths fetch in `courtMarks` is redundant (the moving dot in `film-court-ball.tsx` still needs the file).

## T5 · Design the seek-track set tooltip for the shell player and the room — done

**gate:** mechanical pass · completion `VERDICT: pass` (the subagent hit the session rate limit after writing both files and before reporting; the runner verified the doc's sections, the frame's hex usage and the drift spec itself before gating — note `tests/design-drift.spec.ts` scans only `src/`, so the frame's token discipline was checked by hand)

**changed:** New `docs/superpowers/specs/2026-09-21-film-track-set-tooltip-design.md` (20 KB) and `…/2026-09-21-film-track-set-tooltip/track-tooltip.html` (40 KB frame). Decisions: the readout is a two-line dark data readout (`DARK_READOUT_CLASS`/`STYLE`) on BOTH mounts, positioned by `FilmTrack` itself, not `ChromeTooltip` — one slider, not N triggers; the room's court readout is the precedent. Strings: `Set N · 6–4` over `61 points · 0:00–38:10`; set score from `useMatchSides().sets` (already you-first from `matches.score`), NOT the next set's first-point `setScore`, with the reasoning in "Settled against the code"; all-`0-0` rows change nothing. Interaction table covers enter/move/leave, scrub (closes, stays closed for the drag), touch (never opens), focus (follows the playhead; PageUp/PageDown seek to the previous/next run), Esc, reduced motion. Handoff lists `setSegments` returning `setNumber` + `points`, a pure `trackReadout` builder in `film-score.ts`, `FilmTrack` prop shape and `aria-valuetext`, tests. "Open for the author" has six items. No `src/` or `tests/` change.

**follow-ups:**

1. The author reads the design and, on approval, queues the implementation with `/task-add` pointing at the doc (the doc's Handoff section is the criteria source). Its "Open for the author" items (tiebreak points in the score, PageUp/PageDown as the keys, stacking against a bottom-docked board, the Dartmouth 5-2 vs 4-0 fold) want answers first.

## T6 · Drop the ball's trail; marks fade in fast and out over 2.5 s — done

**gate:** mechanical pass (twice — once on the original criteria, once after the author amended criteria 1/2/5 mid-run with "remove the white moving ball as well") · completion `VERDICT: pass` · widget-states: loading/empty/error unchanged on `film-court-card.tsx` and `film-fullscreen.tsx` (an overlay removed, a mark entrance animation added; no fallback, fetch exit or `return null` touched)

**changed:** The moving ball is gone entirely: `film-court-ball.tsx` deleted; `film-fullscreen.tsx` loses only the `FilmCourtBall` import and the `overlay={<FilmCourtBall …/>}` prop on `<FilmCourt>` (`useBallPaths` + the `bounceTimes` memo stay for T4's bounce marks); the card's `overlay` slot doc no longer names it. `film-ball.ts` drops `ballAt`, `BallAt`, `BallPoint`, `BALL_TAIL_SECONDS` and their private helpers, keeping `FilmBallPath`, `parseBallPathsFile`, `filmBallPaths`, `bounceTimesByShot`; `tests/film-ball.spec.ts` loses the whole `ballAt` section. `film-court.ts`: `MARK_FADE_SECONDS` 3 → 2.5 (hold stays 2; gone at 4.5 s, dated 2026-09-22); `tests/film-court.spec.ts` re-pinned at 12/13.25/14.5 → 1/0.5/0. `globals.css` gains `@keyframes film-mark-in { from { opacity: 0 } }` beside `viz-vt-rise-in`; `film-court-card.tsx` runs `MARK_IN_ANIMATION` (`film-mark-in var(--duration-fast) var(--ease-primary) both`) on point-mode marks only, `MARK_FADE_TRANSITION` unchanged for the fade-out. No reduced-motion opt-out (opacity-only).

**follow-ups:**

1. `film-ball.ts` is now only a bounce-time lookup and its "two clocks" header still frames it as the moving ball's module — rename (e.g. `film-bounce-times.ts`) once settled.
2. `FilmCourtCardProps.overlay` has no caller; drop it and the `{overlay}` render slot if nothing fills it by the next sweep.
3. The `film-mark-in` fade-in has no automated coverage and no eyes-on pass — a spec asserting the mark button carries the animation in point mode and none in match mode would pin criterion 4; the room wants a look in the browser.
4. `film-motion.ts`'s `reducedMotionNow` may have lost its last film-subtree caller — check before the next motion task (T9).

## T7 · Court readout hangs toward the room, never off its edge — done

**gate:** mechanical pass · completion `VERDICT: pass` · widget-states: loading/empty/error unchanged on `film-court-card.tsx` and `film-fullscreen.tsx` (a `dock` prop and a side choice on the existing readout; no fallback, fetch exit or `return null` touched)

**changed:** `readoutPlacement(x, y, dock?)` in `film-court.ts` takes an optional `dock: "left" | "right"` and, when given, hangs the readout toward the room (`dock: "right"` → `side: "left"`, `dock: "left"` → `side: "right"`) regardless of the mark's half; without `dock` the old `x > 50` rule and the `top` clamp are unchanged. `FilmCourt` gains an optional `dock` prop passed straight through. `film-fullscreen.tsx` passes `dock` from `boardRest.anchor`'s column (`top-right` / `bottom-right` → `"right"`, else `"left"`) — the only change in the file. `tests/film-court.spec.ts` gains four dock cases with the 24 px inset / 10 px gap / 168 px width → 154 px off-screen arithmetic in a comment.

## T8 · "Clear all" is a labelled control in the list header and the quick menu — done

**gate:** mechanical pass · completion `VERDICT: pass` · widget-states: loading/empty/error unchanged on `point-list.tsx` and `film-quick-filters.tsx` (a relabelled header control and a new menu row; `EmptyList`, the Suspense fallback and the boundary untouched)

**changed:** `point-list.tsx`: the header's clear control is a text button reading "Clear all" (12 px `X` glyph then the word, no `aria-label`), still `onClick={clearAll}` and drawn only while a cut is on; `LIST_TONE.clear` per tone — light `text-[11px] font-medium text-[var(--ink-600)] hover:text-[var(--ink-900)]`, dark `text-white/60 hover:text-white mb-[7px]` — 22 px, `cursor-pointer`, focus ring. `film-quick-filters.tsx`: a "Clear all filters" row after the Serve group and before "Advanced filters…" in both the `FloatMenu` and `FilmDarkMenu` branches, shown only while `hasActiveFilmFilters(filters)`; it calls `onFiltersChange(DEFAULT_FILM_FILTERS)` and closes the menu. New `tests/point-list-clear-all.spec.ts` + `tests/fixtures/point-list-clear-all-harness.tsx` mount `PointList` twice and assert no button / exactly one button / the click hands back `DEFAULT_FILM_FILTERS`. Advanced-panel footer, `EmptyList`, `film-filters.tsx` untouched.

**follow-ups:**

1. The header button and the quick-menu row both dispatch `onFiltersChange(DEFAULT_FILM_FILTERS)` independently; a third clear entry point would justify a shared helper.

## T9 · Shot rows reveal with a staggered rise when a point opens — done

**gate:** mechanical pass · completion `VERDICT: pass` · widget-states: loading/empty/error unchanged on `point-list.tsx` and `film-this-point.tsx` (a mount animation class + delay on existing rows; no fallback, fetch exit or `return null` touched)

**changed:** `globals.css` gains `@keyframes film-shot-row-in` (opacity 0 / `translateY(4px)` → rest), `.film-shot-row-in { animation: film-shot-row-in 200ms var(--ease-primary) both }` and a `prefers-reduced-motion: reduce` rule setting `animation: none` (the `.viz-crossfade-in` precedent). `ShotWellRow` (room drawer, 34 px) and `ShotRow` (This point, 40 px) both carry the class and an inline `animationDelay` of `Math.min(order - 1, 8) * 25` ms; heights, column tracks, lit/active classes and `data-shot-id` / `aria-current` untouched; rows stay keyed by `shot.id` and memoized, so the reveal is mount-driven. New `tests/film-shot-row-reveal.spec.ts` + `tests/fixtures/film-shot-row-reveal-harness.tsx` mount `PointList` in the dark tone with a 10-shot playing point and assert the class on every row and `0ms` / `25ms` / `200ms` on rows 1, 2, 10. Numbers kept at 200 ms / 25 ms / 4 px / cap 8 after loading the impeccable skill: 200 ms is `--duration-hover`, 25 ms is under the ≤60 ms sibling stagger; the 4 px rise (vs the viz family's 8 px) is deliberate because 34–40 px butted rows read as the column dropping at 8 px.

**follow-ups:**

1. `Math.min(order - 1, 8) * 25` lives in two components; a third shot-row surface (the Visualizations tab's shot table is the likely one) would justify an exported `shotRowRevealDelay(order)` in `film-shots.ts`.
2. Nobody has watched the reveal, the mark fade-in (T6) or the docked readout (T7) in the browser; an eyes-on pass in the room before a PR.

## T10 · Court corner geometry and its own stored anchor — done

**gate:** mechanical pass · completion `VERDICT: pass`

**changed:** `board-position.ts` gains `COURT_ANCHOR_STORAGE_KEY = "film-room:court-anchor"`, the alias `parseCourtAnchor = parseBoardAnchor` (no second corner list), and a pure `courtRest(courtAnchor, board, courtSize, room, insets)`: a null or board-matching corner returns `courtSlot(board.anchor, board.position, board.size, courtSize)` (today's stacking, unchanged for an untouched viewer); any other corner returns `anchorPosition(courtAnchor, courtSize, room, insets)` with the same `POINTS_TRIGGER_CLEARANCE` at top-right. `courtSlot`, `anchorPosition`, `nearestAnchor`, `clampBoardPosition`, `nudgeBoard` untouched. `tests/film-board-position.spec.ts` adds two tests (four assertions: null / matching / bottom-right / top-right at `top: 58`); 9 pass. Nothing else under `src/` in the diff; no component wiring yet (T11).

## T11 · Court card drags to a corner like the board — done

**gate:** mechanical pass (the full run tripped four `(live)` shared-DB specs — two `match-video-attachments-db` RPC cases, `seats-count-players`, `teams-management` — and a re-run of those files tripped only the known `claim racing begin_finalization` race instead; every one passed alone, and the attachments file's serial group re-ran clean at 42/42; none has a path into the film subtree — the pattern already recorded in reference_live_db_auth_rate_limits) · completion `VERDICT: pass` · widget-states: loading/empty/error unchanged on `film-court-card.tsx`, `film-fullscreen.tsx` and `film-scoreboard.tsx` (a drag handle on the card's header row and a positioning wrapper; the only `fallback` hits in the diff are geometry fallbacks, not Suspense; `mode="none"`, the problem panels and every `return null` untouched)

**changed:** New `use-corner-drag.ts` holds the whole mechanic lifted verbatim out of `FilmScoreboard` — pointer capture, 3 px lift threshold, ghost, arrows 8/40 px, Space lift/drop, Escape cancel, blur-drop, the polite landing announcement, the `localStorage` write, the `ResizeObserver` measurement — as `useCornerDrag({ storageKey, size, rest, defaultAnchor, … })` returning `containerProps` + `handleProps`. `film-scoreboard.tsx` calls it with `BOARD_POSITION_STORAGE_KEY` and spreads both prop sets on the one element (the board stays its own handle); `data-board-anchor` and the `onRest(anchor, size)` contract unchanged. `film-fullscreen.tsx` gains `FilmCourtLayer` (same file — the court mounts after the room, so the hook must measure inside the layer): `COURT_ANCHOR_STORAGE_KEY`, `defaultAnchor: null`, `rest = courtRest(at, boardColumn, FILM_COURT_SIZE, room, BASE_BOARD_INSETS)`, `data-court-anchor` (`"follow"` or the corner), `tabIndex=0` + `data-film-own-keys`, its own sr-only hint and live region; `dock` now follows `move.anchor ?? board.anchor`. `film-court-card.tsx`: the 20 px header row takes `handleProps` + `cursor-grab`, with `onPointerDown` returning early when the target is inside a `button` so the two glyphs and every mark still act. H2 spec R6 row + court-rule paragraph record the reversal (author decision 2026-09-22). `tests/film-playback-refresh.spec.ts` adds the 600 px-right drag (plus 100 px up so `top-right` beats `bottom-right` unambiguously) asserting `data-court-anchor="top-right"`, the storage key and the board still `top-left`, and a case that a click on the hide glyph still hides. 53/53 on the three film specs.

**follow-ups:**

1. `data-film-own-keys` on the court wrapper now stands the room's global keys down for a focused mark button: ArrowUp/Down no longer step points there and Space activates the mark instead of toggling play. Arguably right, but a real change for keyboard users walking the marks — wants an eyes-on.
2. Dropping the court onto the board's own corner makes `courtRest` stack it under the board again ("follow" behaviour) but the landing is announced like any corner; consider announcing "under the scoreboard".
3. `FilmCourtLayer` sits inside the ~1500-line `film-fullscreen.tsx` with no dependency on the room beyond its props; move it to its own file next time that file grows.
4. Nobody has watched the court drag, the mark fade-in (T6), the docked readout (T7) or the row reveal (T9) in the browser; one eyes-on pass in the room before a PR.

## T12 · Double-click no longer exits the room — done

**gate:** mechanical pass · completion `VERDICT: pass` (one criterion deviation ruled acceptable: the report player stays mounted under the room whenever the room is open — the existing "the room swaps with the report player" test shows `report.time === 0.3` with the room up — so the "REPORT count 0" assertion the task named would be false against correct behaviour; the spec asserts the report playhead is still at its pre-room value after the burst instead, which is what `exit()` → `onHandoff(state.time)` would have changed) · widget-states: loading/empty/error unchanged on `film-fullscreen.tsx` (one event handler and its comment removed; R10/R11 panels untouched)

**changed:** `film-fullscreen.tsx`: `onDoubleClick={exit}` removed from the room's `<video>`; the R1 comment above `onClick={togglePlay}` now says double-click no longer exits (a click, click, dblclick burst was throwing the viewer out on an ordinary rapid pause/play) and names the three exits that remain — Esc, the transport's minimize, "Back to the report". No `dblclick`/`onDoubleClick` anywhere under `film/`. `exit`, `togglePlay`, the keydown switch and the transport untouched. H2 spec R1 row and Doors table Exit row drop dbl-click, dated as an author decision 2026-09-22 (Prettier reflowed the table columns). `tests/film-playback-refresh.spec.ts` adds "T12: double-click no longer exits the room" — dblclick + three clicks 50 ms apart, 500 ms later `ROOM` count 1 and `REPORT` playhead unchanged; the Escape-exit handoff test passes unmodified. 20/20.

**follow-ups:**

1. A fast click burst still toggles play/pause per click (pause, play) — native behaviour. If the author wants a burst to count once, a ~300 ms settle window in `togglePlay` is a separate decision to queue.

## T13 · Saved points survive a view switch, and the room saves the point just played — done

**gate:** mechanical pass · completion `VERDICT: pass` (first reviewer dispatch was cut off by the session rate limit with no verdict; the work was held at `doing` in the tree and re-reviewed after the reset — one file outside `files:` ruled a required consequence, see below) · widget-states: loading/empty/error unchanged on `match-data-provider.tsx`, `film-tab.tsx`, `film-fullscreen.tsx`, `film-transport.tsx` (state moved up a provider, the room's save target swapped, two comments; the list's three zero states and every panel untouched)

**changed:** `match-data-provider.tsx` now owns the optimistic `points` array — `useState` seeded once from the server prop, a `pointsRef`, and a `setPoints` that writes both — exposed on the context; `film-tab.tsx` reads them via `useMatchData()` and its local `useState`/`useRef` pair is gone, so `MatchReportWhen` unmounting the Video view on a tab switch no longer re-seeds from the stale server render. `handleToggleSaved`'s insert / unfiltered delete / `23505`-is-landed / revert logic unchanged in substance. `(detail)/[matchId]/layout.tsx` adds `key={match.id}` on `MatchDataProvider` (outside `files:` — required now that the provider holds per-match mutable state, or one match's saved flags would ride into the next on a param change). `film-fullscreen.tsx`: new `savePoint = boardStop?.point ?? null` (last point REACHED, the same `activeStopAt` the board's score reads) feeds `toggleSavedActive` (transport control + `S` key), the transport's `saved` and `FilmScoreboard saved=`; `pointName`, `wonByYou`, the position counter, the court's point mode and the drawer's lit row still read `playingStop` (R7 unchanged). `film-transport.tsx`: the `if (p.saved !== null)` guard stays, its comment now says null means only "before the first point". Harness: `remountFilmTab()` seam (`FilmTabSlot`, two `flushSync` passes, providers stay mounted); two specs — toggle, remount, `aria-pressed="true"`; the `?bookmarkOutcome=refused` mirror reverts to `"false"`. 26/26 on the three named specs. `supabase/migrations/` and `match-points-server.ts` not in the diff.

**follow-ups:**

1. The provider ignores a NEW server `points` array for the same match id (seeded once by design). If a surface ever calls `router.refresh()` on the match page (e.g. after a re-analysis), saved flags stay right but other point fields go stale until a hard reload — decide deliberately then.
2. The shell's `FilmPlayer saved=` and the room's `savePoint` are computed from two separate `activeStopAt` calls; a shared `savePointAt(stops, t)` in `film-timeline.ts` would make "always the last point reached" one line.
3. No browser spec covers the room's save-in-dead-time case itself: seek into the padded gap after a point, press `S`, assert the bookmark lands on that point.

## T14 · Instrument the seek path and pin "a point jump is only a seek" — done

**gate:** mechanical pass (the full run tripped two `(live)` shared-DB specs — `claim-eyebrow-width` and a `match-video-attachments-db` cleanup case; both files passed alone, 45/45 on the attachments file with nothing skipped; neither has a path into the film subtree — reference_live_db_auth_rate_limits) · completion `VERDICT: pass` · widget-states: loading/empty/error unchanged on `film-fullscreen.tsx` and `film-player.tsx` (a `data-generation` attribute, one opt-in effect and one ref call per player; no panel, fallback or `return null` touched)

**changed:** New pure `film-trace.ts`: `summariseSeek(events)` → `{ seekToSeekedMs, seekToPlayingMs, waitingCount, stalled, bufferedAtSeek, remounted }` (summarises from the first `seek` to the next), `readTraceFlag()` (reads `localStorage["film-room:trace"] === "1"` once), and `createFilmTrace()` — a trace object that outlives remounts, attaches the six media listeners per element, captures `buffered` at each seek, counts Resource Timing entries on the credential host since the seek, and prints one `console.table` per seek (when the next seek starts, after 5 s, or on unmount). Both players read the flag in a lazy `useState` initializer; with it off the ref stays null — no listener, no `performance` call. `seek` (room) and `seekTo` (shell) gain exactly one line, `traceRef.current?.seek(el, target)` before `el.currentTime = target`, dependency arrays unchanged; `land`, `settle`, the loop/skip-dead re-seeks and `preload="metadata"` untouched. Both `<video>` elements carry `data-generation`. Specs: `tests/film-trace.spec.ts` (buffered / unbuffered with `waiting`+`stalled` / remount mid-seek / no seek); `tests/film-playback-refresh.spec.ts` adds the three-row jump (rows c, a, b 200 ms apart, each within 0.1 s of its stop start, `/__polls` count unchanged, `data-generation` unchanged, the same DOM node via a marker; harness credential TTL set to 1 h so a scheduled refresh cannot masquerade), plus flag-off (0 `getEntriesByType` calls, 0 tables) and flag-on (2 tables + 2 calls after 3 jumps) cases. 29/29.

**author capture steps (criterion 5):**

1. Open match `1415029e-b062-4c9d-9aea-d25cd4e606d7` (Caden Ace v Matt Goodman) on the Video tab in Chrome.
2. In the DevTools console run `localStorage.setItem("film-room:trace", "1")`, then reload — the flag is read once when a player mounts.
3. Open the film room, then the points drawer.
4. Click five different point rows a few seconds apart; include at least one far from the playhead (e.g. the first point, then a late-match point).
5. A table prints when the next seek starts or 5 s after its own seek — wait 5 s after the fifth click so its table prints too.
6. Copy the five `console.table` outputs (surface, generation, target, seekToSeekedMs, seekToPlayingMs, waitingCount, stalled, bufferedAtSeek, remounted, rangeRequests) and paste them into the fix task via `/task-add`.
7. `localStorage.removeItem("film-room:trace")`.

Reading them: `remounted: true` = a credential swap or an error recovery; `bufferedAtSeek: false` with `waitingCount > 0` or a large `seekToSeekedMs` = the unbuffered-range fetch T15's faststart remux targets; `rangeRequests` counts only what Chrome records under Resource Timing, so a 0 means "not visible", not "none".

**follow-ups:**

1. Neither element has a `waiting`/`stalled` handler; if the trace confirms the unbuffered-fetch case, a buffering indicator in the room is the UI half of the fix.
2. The room's trace attaches at mount or on a generation change only; after a `failed` panel it is not re-attached until the next generation — acceptable for a debugging tool.
