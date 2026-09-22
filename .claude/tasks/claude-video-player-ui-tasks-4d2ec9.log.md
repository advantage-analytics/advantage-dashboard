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
