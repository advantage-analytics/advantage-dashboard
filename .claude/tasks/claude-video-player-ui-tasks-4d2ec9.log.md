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
