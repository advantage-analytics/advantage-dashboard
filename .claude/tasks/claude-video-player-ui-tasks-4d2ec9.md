# Tasks — claude/video-player-ui-tasks-4d2ec9

> Scope: matchId Video tab follow-ups — the "This point" widget, the point-row winner mark, bounce times from the vendor's regular results JSON, and the seek-track set tooltip design

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

## T1 · Rename "Current point" to "This point" and drop the speed column

- **status:** done
- **model:** sonnet
- **files:** (guess) src/components/dashboard/matches/match-detail/film/film-this-point.tsx; docs/superpowers/specs/2026-09-20-video-tab-in-shell-h1-design.md (section B, prose only)
- **done when:**
  - [ ] The eyebrow and the section's `aria-label` both read "This point", and the string "Current point" no longer appears in `film-this-point.tsx`
  - [ ] The speed header cell (`Mph` / `Km/h`) and the speed body cell are gone, `WIDE_COLUMNS` has seven tracks (the `44px` track removed, every other value unchanged) and `NARROW_COLUMNS` is unchanged
  - [ ] `unit` / `DistanceUnit` / `formatSpeedValue` are removed from the file and from its call site in `film-tab.tsx` only if nothing else in the file reads them; `npm run lint` and `npm run typecheck` pass
  - [ ] `film-shots.ts`, `point-list.tsx`, `film-court-card.tsx` and `tests/film-shots.spec.ts` are not in the diff — `shotRowCells.mph` stays because the room's court readout reads it
  - [ ] Section B of the H1 spec doc names the widget "This point" and its rail-collapsed column list no longer lists `Mph`, dated as an author decision 2026-09-21
- **notes:** Resolved via trace-route: `/dashboard/matches/[matchId]` → Video tab → `film-tab.tsx` → `FilmThisPoint` in `film-this-point.tsx`. The room's court already titles its point mode "This point" (`film-fullscreen.tsx`, T12), so the rename makes the two agree. No spec asserts on the heading. Keep the `#`, Player, Spin, Stroke, Type, Placement, Result columns and the "added and removed, never re-sorted" rule from the H1 spec.

## T2 · Point-row mark shows the point's winner, not the last hitter

- **status:** done
- **model:** sonnet
- **files:** (guess) src/components/dashboard/matches/match-detail/film/point-list.tsx (the `isYou` line ~451 and the "decisive-player mark" doc comment ~44–49); tests/film-playback-refresh.spec.ts or its fixture tests/fixtures/film-point.ts for the pinning case
- **done when:**
  - [ ] `isYou` in `PointList` is computed from `point.wonByPlayer1 === youIsPlayer1`; `point.player` is not read anywhere in `point-list.tsx`
  - [ ] The file's header comment describes the mark as the point's WINNER — the viewer's `WorkspaceMark` when the viewer won it, the opponent's initials chip otherwise — and says the value is `won_by_player1`, which the Advantage Intelligence derivation folds from consecutive point scores (`derivation/winners.ts`) and the SwingVision parser reads from the export
  - [ ] Both tones are covered by the one change: no second `isYou` computation exists for the dark drawer, and `film-room-drawer.tsx` is not in the diff
  - [ ] A spec renders (or unit-tests through the fixture) a point with `player: "player2"`, `wonByPlayer1: true` for a viewer who is player 1 and asserts the row carries the workspace mark, not the initials chip; the mirrored case asserts the chip
  - [ ] `src/lib/data/match-points-server.ts` is not in the diff: `MatchPoint.player` and `determinePlayer()` stay for their other readers
- **notes:** The room's scoreboard pill (`film-fullscreen.tsx` `wonByYou`) and the "Point went to" filter axis (`filters/types.ts:291`) already use `wonByPlayer1`, so after this the three agree. `won_by_player1` IS the score-derived winner the author asked for: `resolveWinner` in `derivation/winners.ts` walks the ladder / game / set counts between consecutive rallies and deliberately ignores the last stroke's `in` flag. Points flagged `winner_disputed` (22 of 87 on Caden Ace v Matt Goodman) are exactly where the old chip and the new one differ. `useMatchSides()` stays the only source of you/opponent (guardrails §4). `tests/film-playback-refresh.spec.ts` selects rows by `[data-point-id]` and never asserts on the mark, so it needs no change; add the pinning case in the node style if the browser harness is heavier than the assertion deserves.

## T3 · Carry the vendor's bounce_frame to shots.bounce_video_time

- **status:** done
- **model:** fable
- **files:** (guess) src/lib/services/splitstep/derivation/types.ts, parse.ts, ball-paths.ts (move `fitFrameToTime` to a new pure `frame-clock.ts` and import it back), transcript.ts, persist-transcript.ts, src/lib/data/match-points-server.ts (select + `MatchShot`), supabase/migrations/<stamp>_add_shot_bounce_video_time.sql (new), tests/splitstep-derivation.spec.ts or a new node spec, tests/splitstep-ball-paths.spec.ts (import path only), the two specs that build `MatchShot` literals
- **done when:**
  - [ ] `SplitStepStroke` gains `bounceFrame: number | null`; `normalizeStroke` sets it from `raw.bounce_frame`, null when the value is missing, non-finite, the `-9999` sentinel, or less than `raw.frame`. A spec pins each of those four nulls and one accepted value
  - [ ] A pure exported `bounceVideoTimes(strokes)` (in `frame-clock.ts` beside the relocated `fitFrameToTime`, no I/O) returns, per stroke, the fitted seconds of its `bounceFrame` on the SAME clock as `videoTime` (trim offset already included), or null when the frame is null or fewer than two distinct stroke frames exist. `deriveBallPaths` imports the fit from the new module and `tests/splitstep-ball-paths.spec.ts` still passes unchanged apart from any import path. The spec pins: strokes at frames 0/30/60 with `videoTime` 100/101/102 and a `bounceFrame` of 45 on the first give `101.5`
  - [ ] The transcript's shot rows carry `bounce_video_time` and `persistTranscript` writes it; the SwingVision path (`process-match`, `swingvision-parser.ts`) is not in the diff, so imported rows stay NULL
  - [ ] A new migration adds `shots.bounce_video_time real null` with a column comment naming the source (`bounce_frame` fitted through the strokes' frame/time pairs) — nothing else in the DDL — and it is applied to the live project through the Supabase MCP, following `.claude/skills/create-migration/SKILL.md` (RLS on `shots` is unchanged; a column adds no policy). `mcp__supabase__list_tables` output in the run log shows the column
  - [ ] `match-points-server.ts` selects the column and `MatchShot` gains `bounceVideoTime: number | null`; the two specs that build `MatchShot` literals (`tests/film-shots.spec.ts`, `tests/match-video-attachments-db.spec.ts`) carry the field; `npm run typecheck` passes
- **notes:** The regular results JSON already carries `bounce_frame` per stroke (`RawSplitStepStroke`, types.ts:64) — only `trajectories.json` was ever converted, in `ball-paths.ts:137–145`, with the same sentinel and ordering rules; reuse that logic, do not fork it. `videoTime = raw.time + startTimeSeconds` (parse.ts:153) already carries the trim offset, so a fit against `videoTime` lands the bounce on the source-video clock, equal to `shots.video_time`; `toFilmTime` in the room does the one conversion later (T4). Verify column names against the live DB, not `supabase/migrations/` (about 100 behind). Guardrails §2: additive column, no backfill, no mutation of existing rows — existing matches get the value only when the author re-derives them by hand. **No client code and no room change in this task.** Do not run `scripts/splitstep-derive.ts --write` against any live job; a `--job <uuid>` dry run is fine and read-only. This touches the service-role boundary only through `persistTranscript`, which is unchanged in shape; `rls-boundary-reviewer` runs at `/pr-check`.

## T4 · Room placement marks fire at the stored bounce time

- **status:** todo
- **model:** opus
- **needs:** T3
- **files:** (guess) src/components/dashboard/matches/match-detail/film/film-shots.ts (`ShotStop`), film-fullscreen.tsx (the `courtMarks` memo ~411–439 only), film-court.ts (doc comment on `bounceEventTime` / `BOUNCE_REVEAL_SHARE`), tests/film-shots.spec.ts, tests/film-court.spec.ts
- **done when:**
  - [ ] `ShotStop` gains `bounce: number | null` — `toFilmTime(shot.bounceVideoTime, clock)` when the shot carries one and it is ≥ the shot's own `start`, else null. `tests/film-shots.spec.ts` pins one converted value (with a non-zero clock offset), one null for a missing time and one null for a bounce before contact
  - [ ] The `courtMarks` memo in `film-fullscreen.tsx` builds `TimedShot.bounceTime` as `stop.bounce ?? bounceTimes.get(stop.shot.id)` — the regular-JSON bounce first, the ball-paths match second, and `estimatedBounceTime` (inside `pointMarks`) only when both are absent. Nothing in the keydown switch, the Tab-trap effect, the problem panels or `arm` / `wake` is in the diff
  - [ ] `tests/film-court.spec.ts` adds a case: a shot whose `bounceTime` comes from the stored value draws its bounce mark at that time (opacity 1 at `bounceTime`, absent at `bounceTime − 0.2`) rather than at the 60 % estimate, while its contact mark still appears at `contactTime`
  - [ ] The `BOUNCE_REVEAL_SHARE` provenance comment in `film-court.ts` now says the estimate is the fallback for shots with no stored bounce time and no ball-paths match, and no longer claims "which today is all of them"
  - [ ] `film-tab.tsx`, `film-player.tsx` and `film-this-point.tsx` are not in the diff (the shell has no court; nothing else reads the new field)
- **notes:** Two clocks: `shots.bounce_video_time` is SOURCE-video seconds; `ShotStop.start` and everything the room compares against are FILM seconds (`toFilmTime`, minus `clock.offset`, clamped). Convert in `shotStops()` where `start` is converted, so the room stays on one clock. Contact marks already fire at the regular JSON's `time` (`contactTime: s.start`), so this task changes only the bounce event. `ballAt` / `film-court-ball.tsx` (the moving dot) keep reading the ball-paths file and are untouched. After this lands the author must re-derive a match (`npx tsx scripts/splitstep-derive.ts --job d3bff342-b33a-417a-a332-b5a3192f3f4d --write` for Caden Ace v Matt Goodman) before any existing match shows a stored bounce; that run is the author's, not a criterion. Keep the test hooks `film-room-video`, `data-film-chrome`, `data-shot-id`. Run `tests/film-playback-refresh.spec.ts`.

## T5 · Design the seek-track set tooltip for the shell player and the room

- **status:** todo
- **model:** fable
- **files:** (guess) docs/superpowers/specs/2026-09-21-film-track-set-tooltip-design.md (new), docs/superpowers/specs/2026-09-21-film-track-set-tooltip/track-tooltip.html (new frame); read-only: film-track.tsx, film-timeline.ts (`setSegments`), film-player.tsx, film-transport.tsx, chrome-tooltip.tsx, chart-tooltip.tsx, .skills/advantage-analytics-design/SKILL.md (+ `foundations`, `components`, `chrome`)
- **done when:**
  - [ ] The design doc states what a set segment's tooltip shows, with the exact strings for a decided set ("Set 2 · 6–4 · 41 points · 0:38:10–1:12:05" or whatever is chosen), the set in progress, a one-set match, and a match whose rows carry no set score (every `setScore` is `0-0`) — and says which field each string is built from (`FilmStop.point.setNumber`, `setScore` of the NEXT set's first point for a final score, `matches.score` as fallback, `youFirstScore` orientation)
  - [ ] It settles the interaction for both mount points: hover and focus on the shell player's light chrome and on the room's dark transport, what happens while scrubbing (pointer down), on touch, and with `prefers-reduced-motion`; and names the primitive per surface (`ChromeTooltip` vs `DARK_READOUT_CLASS` / `DARK_READOUT_STYLE`) with the reason
  - [ ] The frame draws both surfaces at their real geometry (3 px track, 2.5 px segment pad, the room's transport row) using only design-system tokens and the room's existing white/black alpha literals — no new hex — and passes `npx playwright test tests/design-drift.spec.ts` if that spec scans `docs/`
  - [ ] The doc lists the code changes an implementation task would make (`setSegments` returning set identity, `FilmTrack` prop shape, keyboard reachability of a segment) as a "handoff" section, and ends with an "Open for the author" list of anything it could not decide from the code
  - [ ] No file under `src/` or `tests/` is in the diff
- **notes:** The author asked for this to be designed first. `setSegments` today discards the set identity it splits on (film-timeline.ts:314–318 cuts at each new set's serve and returns bare `{start,end}`), and `FilmTrack` has no hover state at all, so the design has to decide the data contract as well as the look. Read `film-track.tsx` before drawing: the watched share is a CSS gradient split off `--film-t`, the playhead is a transform, and the slider owns ←/→/Home/End with `data-film-own-keys`. The frame files of the two prior handoffs (`docs/superpowers/specs/2026-09-21-video-fullscreen-h2/`, `…-h1/`) are the format to match. The implementation task is NOT queued here on purpose: its criteria depend on this document, and the author reviews it first. When they approve, add it with `/task-add` pointing at the doc.
