# Tasks — claude/video-stats-filters-1facce

> Scope: one shared filter model (Score / Serve / Return / Result / Custom) for the match detail Statistics and Film tabs

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

## T1 · Add court-half, shot-direction and spin helpers for match filters

- **status:** done
- **model:** opus
- **files:** src/components/dashboard/matches/match-detail/match-filters/shot-geometry.ts, match-filters/spin.ts, tests/match-filters-geometry.spec.ts (guess)
- **done when:**
  - [ ] `shot-geometry.ts` exports `hitterHalf(shot)` → `"deuce" | "ad" | null` (the half the hitter struck from, in the hitter's own facing frame: contact x, plus which end from contact y); the spec asserts a serve from the deuce court at 0-0 reads `"deuce"` for a server at EACH end of the court
  - [ ] `shotDirection(shot, hand)` returns one of `Crosscourt | Down the Line | Inside Out | Inside In | null`, starting from `shot.zone`: a forehand struck from the hitter's backhand half is `Inside Out` when zone = Crosscourt and `Inside In` when zone = Down the Line (backhand half = ad half for a right-hander, deuce half for a left-hander); backhands, `hand === null`, and Middle/null zones never return Inside-*. Middle returns null. The spec covers righty and lefty at both ends
  - [ ] `inferHand(points, isPlayer1)` returns `"right"`/`"left"` only when that player has ≥10 forehands with ≥65% struck from one half, else null; the spec covers below-sample and below-margin cases
  - [ ] `spin.ts` exports `normalizeServeSpin` (flat→Flat, slice|sidespin→Slice, kick|topspin→Kick) and `normalizeReturnSpin` (topspin→Topspin, slice|backspin→Slice), case-insensitive, anything else → null; the spec asserts every mapping
  - [ ] The diff touches nothing under `supabase/` and does not change `shots.zone` derivation (`court.ts` `directionZone`, process-match)
- **notes:** Plan: ~/.claude/plans/this-should-be-all-zippy-pizza.md. Inside-out/in is layered in the browser on top of the "one rule" (`src/lib/services/splitstep/derivation/court.ts` `directionZone`: crosscourt = contact and landing on opposite sides of x=0, Middle = landing within 1.0 m of centre). The court frame is `MatchShot`'s (metres, x about the centre line, y 0→23.77 baseline to baseline, fixed for the match, does NOT flip at end changes). See `film/film-court.ts` and `courtSideOf` in `film/filters/types.ts` for the existing deuce/ad and end conventions; anchor to them rather than re-deriving. Never put a `.tsx` beside a same-basename `.ts`.

## T2 · Expose the raw point score and both players' hands to the match page

- **status:** done
- **model:** sonnet
- **files:** src/lib/data/match-points-server.ts, src/components/dashboard/matches/match-data-provider.tsx or a small helper next to it, tests/ (guess)
- **done when:**
  - [ ] `MatchPoint` gains `pointScoreRaw: string | null`, filled from `points.point_score` with no fallback; `pointScore` keeps its existing `?? "0-0"` default unchanged
  - [ ] A helper (e.g. `playerHands(match, youIsPlayer1)`) returns `{ player1, player2 }`, each `"right" | "left" | null`, normalised from the raw match hand values ("right", "Right Handed", "left"…); a spec asserts that when the account's player is player2, the account's hand lands under `player2`
  - [ ] No existing reader of `pointScore` changes behaviour (the diff doesn't touch its consumers)
- **notes:** The unknown-score coercion to "0-0" is at `match-points-server.ts` ~line 375. Hands come from match-row `player_hand`/`opponent_hand` → `PlayerProfile.hand` in `src/lib/data/match-detail-server.ts` (~line 175). Values are raw ("right", "two-handed"), see the player-style-labels note. Player attribution must follow `youIsPlayer1` exactly; read `docs/ui-revamp-guardrails.md`.

## T3 · Build the shared MatchFilters model and predicates

- **status:** done
- **model:** opus
- **needs:** T1, T2
- **files:** src/components/dashboard/matches/match-detail/match-filters/model.ts, tests/match-filters-model.spec.ts (guess)
- **done when:**
  - [ ] `model.ts` exports `MatchFilters`, `EMPTY_MATCH_FILTERS`, `applyMatchFilters(points, filters, ctx)` with OR within a group and AND across groups/sections; Serve.Player and Return.Player are ONE `server` field and Serve.Side and Return.Side are ONE `court` field (spec: returner = you ⇔ server = opponent)
  - [ ] Score: Pressure = pre-point `pointScoreRaw` 30-30 or 40-40, OR a break/set/match point; the Points grid matches `pointScoreRaw` server-first with "AD" normalised to "Ad"; null scores and tiebreak scores (e.g. "5-1") never match. Each is covered in the spec
  - [ ] Result is from the POV player (the Result Player, or "you" when none is set for Won/Lost): Won/Lost = POV player won/lost the point; Winner = POV player hit a winner/ace/service winner; Error = POV player made the error, including a double fault and a null `resultType` whose last shot is Out/Net. Shot group: Serve = final shot is shot 1, Return = shot 2, else `lastShotType`, hit by the POV player (anyone if unset). Each is covered in the spec
  - [ ] Custom is the same-shot rule: a point matches only if ONE shot satisfies every chosen Custom group (player, `hitterHalf`, `shotDirection`, `shotNumber` 1–12; shot numbers of 0 never match). The spec includes the negative case: Rudy + Crosscourt + shot 4 does NOT match when shot 4 is Rudy's Down the Line and shot 6 is his crosscourt
  - [ ] `optionAvailability(points, ctx)` reports zero-count options across the WHOLE match (not the current selection); `serializeMatchFilters`/`parseMatchFilters` round-trip every field in the spec; `activeFilterCount` and `filtersEqual` exist
- **notes:** The full semantics table is in the plan (~/.claude/plans/this-should-be-all-zippy-pizza.md). Groups: Score{sets, type[pressure, breakpoint, setPoint, matchPoint], points[grid incl. Ad-40, 40-Ad]}; Serve{server, court, type[first, second], spin[Flat, Slice, Kick], zone[Wide, Body, T]}; Return{type[Forehand, Backhand], spin[Topspin, Slice], zone[Down the Line, Middle, Crosscourt] from `secondShotZone`, contact[Inside = in front of the baseline, Middle = 0–1.0 m behind, Neutral = >1.0 m behind] from the return's contact_y}; Result{player, shot[Serve, Return, Forehand, Backhand, Volley, Overhead], outcome[Won, Lost, Winner, Error]}; Custom{player, side[Deuce, Ad], direction[Crosscourt, Down the Line, Inside Out, Inside In], rallyShot[1..12]}. Spin uses T1's normalisers; `ctx` = `{ youIsPlayer1, hands }` with the `inferHand` fallback. Move `courtSideOf` and the deuce/game-point parsing out of `film/filters/types.ts` rather than duplicating them. Serve/return shots come from the existing `firstShot*`/`secondShot*` fields (picked by role, not array index).

## T4 · Add MatchFiltersProvider with a URL mirror, replacing set scope

- **status:** done
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/matches/match-detail/match-filters/provider.tsx, set-scope.tsx, head-to-head-card.tsx, performance-tracker-chart.tsx, rally-length-card.tsx, point-endings-card.tsx, src/app/dashboard/matches/(detail)/[matchId]/page.tsx (guess)
- **done when:**
  - [ ] `MatchFiltersProvider` + `useMatchFilters()` (applied filters, setter, `filteredPoints`, `filtersActive`) is mounted in `page.tsx` ABOVE the Statistics/Film view switch, so the state survives switching views
  - [ ] The provider seeds from one URL search param via `parseMatchFilters` and writes back with `history.replaceState` + `serializeMatchFilters` (same approach as `film-tab.tsx:167-176`), and the param is dropped when filters are empty
  - [ ] head-to-head, performance tracker, rally length and point endings read `filteredPoints` instead of `scopePoints(points, activeSet)`; head-to-head's derived path (`tallySide`/`buildDerivedRows`) is gated on `filtersActive` instead of `activeSet !== null`
  - [ ] `useSetScope`/`scopePoints` are removed, or kept only for importers outside these four cards; `tests/set-scope.spec.ts` is updated or replaced to match
- **notes:** `later` until claude/head-to-head-widget-interactions-836a3a (a big head-to-head-card.tsx rewrite) merges and this branch is synced; promote to `todo` by hand then. Everything is computed in the browser from `useMatchData().points`, so no server change. The `watchCut` handoff (`match-report-context.tsx`, `film-cut-context.tsx` `scopeCut`) still reads `activeSet`; leave the cut vocabulary to T7, but don't break its compile. The public `/m/[token]` page also renders `StatisticsView`, so it needs the provider (or a no-op default) too.

## T5 · Build the FiltersPanel from the mockups

- **status:** done
- **model:** opus
- **needs:** T3
- **files:** src/components/dashboard/matches/match-detail/match-filters/filters-panel.tsx, tests/match-filters-panel.spec.ts (guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] `FiltersPanel` renders a "Filters" title and collapsible sections in order Score, Serve, Return, Result, Custom, with grey group labels and the option labels from T3's catalog (including "Winner", Rally Shot 1–12 with 5, and the Result row labelled "Shot"). An offline spec (via `createLoader()` from `tests/fixtures/vm-modules.ts`) asserts the section order and labels in the rendered markup
  - [ ] Options that `optionAvailability` reports as zero-count are not rendered, and a group with no options left is not rendered; the spec asserts this with a fixture that has no Ad scores
  - [ ] The panel edits a draft and only calls `onApply(filters)` on Apply; picking a Serve player shows the other player selected under Return; Clear all resets the draft to `EMPTY_MATCH_FILTERS`
  - [ ] Pills are `rounded-full` toggles with `aria-pressed`; Clear all is a blue text action with no icon (`--blue` → `--blue-hover`); Apply uses `advButton()`; the diff adds no off-palette hex
- **notes:** Read `.skills/advantage-analytics-design/SKILL.md` first, then the reference files it routes to (components, chrome, empty-and-loading). The mockups show an outlined "Clear All" pill; the settled rule (blue text) overrides it. DS type classes beat Tailwind colour utilities, so override colour with inline style. No `filters-panel.ts` beside the `.tsx`.

## T6 · Wire filters into the Statistics tab

- **status:** done
- **model:** opus
- **needs:** T4, T5
- **files:** src/components/dashboard/matches/match-detail/statistics-view.tsx, a new applied-chips component in match-filters/, src/app/m/[token]/page.tsx (guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] Statistics renders ONE Filter button whose badge shows `activeFilterCount` and is hidden at 0; it is not rendered on the public `/m/[token]` page (a prop from that page turns it off)
  - [ ] The button opens `FiltersPanel` in the 340px right rail using the existing rail drawer shell (re-click closes, Esc closes); Apply writes to `useMatchFilters()`
  - [ ] While filters are active, removable chips plus "N of M points" appear above the cards; removing a chip removes that value from the applied filters
  - [ ] When the filters match zero points, the cards are replaced by an empty state ("No points match these filters") with a Clear all action; an offline spec or `tests/report-empty-states.spec.ts` asserts it
- **notes:** `later` until the head-to-head branch merges and T4 is promoted. Find the existing rail shell via the roster drawer (CSS width-keyframe shell). One Filter button with a count badge, not per-category chips in the header. Widget edits trigger the widget-states hook, so run it. Read `docs/ui-revamp-guardrails.md`.

## T7 · Move the Film tab onto the shared model and rewrite watch cuts

- **status:** done
- **model:** opus
- **needs:** T4, T5
- **files:** film/film-tab.tsx, film/film-advanced-panel.tsx, film/film-quick-filters.tsx, film-cut-context.tsx, match-report-context.tsx, head-to-head-card.tsx, rally-length-card.tsx, point-endings-card.tsx (guess)
- **routes:** /dashboard/matches/[matchId]
- **done when:**
  - [ ] `film-tab.tsx` filters the list and ↑/↓ navigation (`walkStops`) with `applyMatchFilters` over the shared provider's filters; `FilmFilters`/`applyFilmFilters` are no longer imported by `film-tab.tsx`
  - [ ] The Advanced panel's body is `FiltersPanel`; the quick menu maps "Break points" → Score type Breakpoint and "{You}/{Opp} serving" → the shared `server` field; "Saved only" stays a Film-only local toggle, not part of `MatchFilters`
  - [ ] Every stat cut (head-to-head Aces/Double faults/1st and 2nd serve points/Break points saved/Winners/Unforced errors + side cut, the rally-length bands, the point-endings cuts) is expressed as `Partial<MatchFilters>` (rally-length bands as a Film-only rally-length cut). A cut is ANDed on top of the shared filters in Film only, shows as a removable chip there, and is never written to the shared provider
  - [ ] `tests/film-cut-intent.spec.ts`, `tests/stat-widget-cuts.spec.ts`, `tests/head-to-head-cuts.spec.ts` and `tests/film-filters-fullscreen.spec.ts` are updated to the new vocabulary and pass
- **notes:** `later` until the head-to-head branch merges and T4 is promoted. The head-to-head hover readout's per-cell counts (`counts` memo → `applyFilmFilters(mergeFilmCut(scopeCut(...)))`, added by claude/head-to-head-widget-interactions-836a3a) must move to `applyMatchFilters` along with the click cuts. `PointList` mounts twice (report column + fullscreen drawer), and both must read the same filters. The legacy `?cut=break|saved` and `?serve=you|opp` URL params should map into the new model on parse, so old links still work. "Unforced errors" has no direct equivalent (Result Error covers forced and unforced, and video matches don't separate them); keep a Film-only cut for it rather than widening it silently. If `film-tab.tsx` blows the context, split off the cut rewrite and say so.

## T8 · Delete the old FilmFilters model and its specs

- **status:** todo
- **model:** sonnet
- **needs:** T6, T7
- **files:** src/components/dashboard/matches/match-detail/film/filters/types.ts, film/film-advanced-panel.tsx option table, tests/film-filters-model.spec.ts (guess)
- **done when:**
  - [ ] `FilmFilters`, `DEFAULT_FILM_FILTERS`, `applyFilmFilters`, `matchesFilm`, `countFilmOption`, `filmFiltersEqual` and the `groupsFor` option table are deleted, and `grep -rn "FilmFilters\|applyFilmFilters" src tests` returns nothing
  - [ ] `tests/film-filters-model.spec.ts` is deleted or folded into `tests/match-filters-model.spec.ts`, with no assertion lost that still applies to the new semantics
  - [ ] `npm run typecheck` passes (the diff has no remaining imports of deleted symbols)
- **notes:** `later` until T6 and T7 are promoted. Pure cleanup; there should be no behaviour change. If something still imports a symbol, stop and report rather than re-creating it.
