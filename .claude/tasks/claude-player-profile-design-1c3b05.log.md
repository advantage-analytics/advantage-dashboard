# Run log — claude/player-profile-design-1c3b05

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Fold a player's analyzed matches into season Head to head rows — done

**gate:** mechanical PASS · completion PASS

**changed:** New pure `src/lib/data/player-season.ts` (`foldSeasonRows`, `seasonPerMatch`, `seasonOutcomes`, `seasonNetGame`, `seasonRallyBands`, `foldSeasonTallies`) with `tests/player-season.spec.ts` (23 tests). The report's row config/calculators moved out of the "use client" cards into `match-detail/head-to-head-rows.ts` and `point-endings-tally.ts` (cards re-export every old name) so server loaders can call them; `report-empty-states.spec.ts` allowlists the two new modules. Total points won folds as a pooled rate, matching the canvas.

**follow-ups:**

1. T6 could move the Rally length card's band loop into a pure module and have `seasonRallyBands` call it instead of its own shot-sum loop.
2. `SeasonValue.matches` lets the season table say "over 3 of 5 matches" where a row covers fewer matches than analyzed (lob/pass rows).
3. `/pr-check` should confirm the ~1,000-line move out of `head-to-head-card.tsx` is byte-equivalent.

## T2 · Season loader for the profile — done

**gate:** mechanical PASS · completion PASS

**changed:** New `src/lib/data/player-season-server.ts` (`getPlayerSeason` cached, `loadPlayerSeason`, `seasonOpponentCount`, `lobKeysFromBallPathsBody`) with `tests/player-season-loader.spec.ts` (16 tests). `player-profile-server.ts` shares its roster + matches read as `readPlayerMatchSides`/`getPlayerMatchSides` (select adds `errors_judged_at`, `opponent_player_id`). `match-stats-server.ts` exports its existing column list and transform. Service role only for the ball-paths blob after the RLS read; a failed points/stats read throws rather than folding a short season; opponents counted on seat-one matches, as the team Opponents page attributes them.

**follow-ups:**

1. Each view costs N points+shots reads and one ball-paths download per derived match; cache lob keys per job or write them at derivation time.
2. List `lib/data/player-season-server.ts` in `client-bundle-boundary.spec.ts`'s `SERVER_ONLY`.
3. T9 can take `PlayerSeason.perMatch` directly (it carries each match's side, flags, lob keys and points).
4. T12 must keep `readPlayerMatchSides`/`getPlayerMatchSides`.

## T3 · Profile frame: report rail, two tabs, links, header slot — done

**gate:** mechanical PASS · completion PASS

**changed:** The roster profile page now renders the match report's frame: new `profile-rail.tsx` (player block, Statistics/Visualizations tabs, "N matches ›"/"N opponents ›" links, full-width New match in the rail footer), `profile-frame.tsx` (`useProfileView`, `ProfileViewSwitcher`, `ProfileTitle`), pure `profile-view.ts` (`?tab=`, default statistics) with `tests/profile-view.spec.ts` and `tests/profile-rail.spec.ts`. `MatchReportRail` takes an optional `label`. `ProfileActions` keeps Ask + ⋯ only. The matches link filters by the player's NAME (`?player=<name>`), since the Matches page's `?player=` compares names, not ids. The pane shows the title row only until T7/T9.

**follow-ups:**

1. Every profile render now runs `getPlayerSeason` just for the rail counts; fine once T7/T9 use it, heavier than before until then.
2. Add an id-keyed player filter to the Matches page, or keep the name link.
3. Eyes-on check of `/dashboard/team/roster/[playerId]` and `?tab=visualizations` at `/pr-check`.

## T4 · Season Head to head card — done

**gate:** mechanical PASS · completion PASS

**changed:** The Head to head card's drawing is extracted into a presentational `match-detail/head-to-head-table.tsx` (`HeadToHeadTable`, optional `interaction` for cuts/readouts); `HeadToHeadCard` renders it with identical HTML (checked in four configurations; existing specs unchanged). New `player-profile/season-head-to-head-card.tsx` (`SeasonHeadToHeadCard({ playerName, analyzed, groups })`): eyebrow "Head to head", "Per match · N analyzed", columns surname / "Opponents", no cuts or Watch. `tests/season-head-to-head.spec.ts` (5 tests). Column head uses `surname()`, not `surnameLabels()`.

**follow-ups:**

1. Season Lob/Passed dash tooltips reuse T1's "…for this match" notes; a season wording is a one-line change in `player-season.ts`.
2. T5/T6 can reuse the optional-`interaction` pattern for their body splits.
