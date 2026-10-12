# Run log — claude/opponents-page-build-a55d4b

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Personal opponents loader + pure grouping module — done

**gate:** mechanical pass · completion pass

**changed:** New `src/lib/data/personal-opponents.ts` (pure grouping: key = `opponent_player_id` else normalised opponent name; record, last-five form, last match, `recent` ×6, four measures, season helpers, totals), `src/lib/data/personal-opponents-server.ts` (`getPersonalOpponents(userId)`, `cache()`d, server client only, own `matches` read on `created_by = userId AND program_id IS NULL` + `match_stats_with_percentages`), `tests/personal-opponents.spec.ts` (15 offline tests). Deviations kept: viewer side via `playerSide()` + `getMyPlayerIds()`; name key is side-aware (`player1_name` when the viewer sits as player 2); matches naming no opponent are left out, so `totals.matches` counts matches against a named opponent; dates are stored ISO values; matches where `playerSide` is null are dropped.

**follow-ups:**

1. Merge a name group into the id group it matches once `opponent_player_id` starts being written.
2. Add a short `pill` label beside `label` on measures if the drawer wants "Pts won"-style pills.
3. Expose an `unattributed` count for matches with no opponent named.
4. `currentSeason` reads the clock in UTC — a user-zone clock would be exact around Aug 1.
5. The PostToolUse typecheck hook picks up the main checkout's `_video/` errors from inside a worktree.
6. Confirm at /pr-check that a `created_by = me` match is never legitimately dropped by the null-`playerSide` skip.

## T2 · Opponents list page: title row, table card, footer, skeleton, day zero — done

**gate:** mechanical pass (lint + typecheck clean; full suite failed twice on unrelated load-only flakes under a machine load average of ~26 — run 1: 7 failures in event-table / film-playback-refresh / match-video-attachment-flow / match-video-azure-smoke / match-video-file-step / schedule-doubles-picker, all 7 passed re-run alone; run 2: 5,816 passed, 2 failed, `film-playback-refresh.spec.ts:571` and `match-video-attachment-flow.spec.ts:1015`, both 4/4 alone with `--repeat-each=4`; none reachable from this diff) · completion pass · widget-states audit: loading ✓, empty ✓, error ✓

**changed:** `src/app/dashboard/opponents/page.tsx` branches on workspace kind — team keeps the literal `ComingSoonPage` call, personal renders `getPersonalOpponents` inside `Suspense` with `OpponentsSkeleton`, wrapped in `WidgetBoundary`. New `src/components/dashboard/opponents/`: `opponents-table-layout.ts` (grid, labels, row box, page frame), `opponents-title-row.tsx`, `opponents-table.tsx`, `opponents-page-content.tsx` (client; holds `selectedKey` for T4), `opponents-skeleton.tsx`, `opponents-day-zero.tsx`, `opponents-toolbar.tsx` (the frame's toolbar drawn inert for T3), `opponent-style.ts` (hand/backhand labels). Deviations kept: day zero fires on `opponents.length === 0` (loader has no raw match count); card `min-w-[822px]` rather than the frame's 720px; shared `FormTicks` and comma-joined score sets kept; no `cursor-pointer` until T4; counts singularised. Not opened in a browser.

**follow-ups:**

1. Return a raw personal-match count from the loader so "no matches" and "matches, none naming an opponent" get different copy.
2. Widen the Last match column when any row needs the year, as Matches does.
3. `formatShortDate` parses date-only ISO as UTC — the cell can read a day early in US zones (shared with Matches).
4. Skeleton shows the h1, day zero drops it — an empty account sees the title flash; reuse the layout's presence read.
5. Give `WidgetBoundary`'s retry state the page padding on this route.
6. Add an offline spec for `opponent-style.ts`.
7. Confirm the 822px card floor and form-tick alignment at /pr-check eyes-on.

## T3 · Opponents view chips, sort menu and filter panel — done

**gate:** mechanical pass (lint + typecheck clean; full suite 5,837 passed, 4 failed under a machine load average of 20–65, none reachable from this diff: `film-playback-refresh.spec.ts:1422` and `:1455`, `schedule-drawer-actions.spec.ts:270`, `viz-fullscreen-filters-browser.spec.ts:317`. Repeated alone ×3 at load ~10: schedule-drawer and viz-fullscreen 3/3 each variant; the two film T16 tests passed 2 of 3 each, the miss a 30 s timeout — intermittent, in the file already recorded as a load-only flake. Counted as passed on that basis; worth a clean re-run at /pr-check) · completion pass · widget-states audit: loading ✓ (skeleton and day zero keep the inert toolbar), empty ✓ (`TableEmptyBody` under the kept header row), error ✓

**changed:** New `src/components/dashboard/opponents/opponents-views.ts` (pure chip / facet / sort predicates, labels, `applyOpponentCut`, strip and empty-sentence copy) and `tests/opponents-views.spec.ts` (29 tests). `opponents-toolbar.tsx` gains the live `OpponentsToolbar` (four chips via the shared `Chip`, `SortTrigger` + `FloatMenu`, `FilterTrigger` through the shared `MatchesFilterPanel`); `OpponentsToolbarStatic` stays inert for the skeleton and day zero. `opponents-page-content.tsx` owns the cut state, applied strip, empty body and footer count, and exposes `visibleOpponents` for T4. `opponents-table.tsx` gains an `empty` slot. Deviations kept: the filter panel applies live and closes on outside click / Esc (shared panel, no Apply button) rather than "on apply"; panel and strip "N of M" read against the current chip's set; chips use `schedule/static/chip.tsx`; empty-body icon is the Opponents nav icon. Not opened in a browser.

**follow-ups:**

1. Eyes-on: filter panel placement on a right-side trigger, the strip, and the empty body inside the 822px card.
2. One constant for the Opponents nav icon and the empty-body icon.
3. Decide whether the cut (chip, filter, sort) should survive a reload via URL params.
4. If a literal close-on-apply is wanted, add an opt-in to `MatchesFilterPanel` as its own task — it affects Matches and Schedule.
5. The two film T16 tests (`film-playback-refresh.spec.ts:1422`, `:1455`) time out intermittently even when run alone on a busy machine — add them to the known-flake notes or harden them.

## T4 · Opponent peek drawer on the roster shell + selection model — done

**gate:** mechanical pass (lint, typecheck, full suite clean at a load average of ~5) · completion pass · widget-states audit: loading ✓ (drawer reads props already on the page — no fetch, no skeleton), empty ✓ (stat block absent when nothing is measured, one sentence in its place; unknown hand/backhand draw `EmptyMark`), error ✓ (inside the page's `WidgetBoundary`)

**changed:** New `src/components/dashboard/opponents/opponent-drawer.tsx` (`OpponentDrawer` through `PeekDrawerFrame`: identity, gated stat block with `Sparkline` + four `StatPill`s, up to three recent-match record rows, pinned Ask / Statistics footer; no ⋯, no Advantage Intelligence note). `opponents-page-content.tsx` gains the roster selection model (toggle, close, step over `visibleOpponents`, window keydown, `?opponent=` via `history.replaceState`, close when a cut hides the selection); `opponents-table.tsx` gains row ids, the click handler, the selected wash and `cursor-pointer`; `page.tsx` reads `searchParams.opponent`. `Sparkline` / `StatPill` lifted verbatim from `team/player-drawer.tsx` into new `shared/drawer-stat-chart.tsx` (roster drawer now imports them; `percent` renamed `drawerPercent`). T1's `personal-opponents.ts` / `-server.ts` gain `recent[].event` from `matches.tournament_name`. Deviations kept: recent-row date is "Sep 14" this year, "Sep ’25" otherwise; pills carry the full label and a trend delta; drawer is `hidden lg:block` as on Matches. The subagent reported it did NOT read `docs/ui-revamp-guardrails.md` or the design SKILL.md in full — the guardrails pass at /pr-check is the first check against them. Not opened in a browser.

**follow-ups:**

1. Eyes-on: slide-in and reflow, Esc and arrows, cut-hides-selection close, and the roster drawer unchanged after the chart lift.
2. Sparkline tooltip reads "{opponent name} · date" inside that opponent's own drawer — a `caption` on `SparkPoint` could carry the event name.
3. "W-L against you" could be read as the opponent's record — consider "You lead 5-2".
4. Lift `PeekDrawerFrame` / `DRAWER_ATTR` out of `matches/match-drawer.tsx` into `shared/`.
5. A small-screen fallback for peek drawers (Matches and Opponents).
6. An offline spec for the selection model, ideally after extracting a hook shared with the roster view.

## T5 · Lift the personal comingSoon flag, amend the two nav tests, npm run map — done

**gate:** mechanical pass (lint, typecheck, full suite clean) · completion pass · widget-states: `page.tsx` change is its doc comment only — no state affected

**changed:** `src/lib/dashboard/nav.ts` — `PERSONAL_NAV`'s Opponents entry loses `comingSoon`, `TEAM_NAV`'s keeps it, and the comment above `TEAM_NAV` says the personal page shipped. `tests/nav-icons.spec.ts` gains the commented `splitByWorkspace` allowlist (`/dashboard/opponents`: personal false, team true) and asserts each list against it. `tests/search-palette-pages.spec.ts` expects Opponents absent from team shortcuts and present in personal ones, and the exact personal label list now includes "Opponents". `page.tsx` doc comment reads "not finalised for a team". `npm run map` reported MAP.md already current (byte-identical).

**follow-ups:**

1. `AGENTS.md`'s Routes section still lists `/dashboard/opponents` among the pages that render `ComingSoonPage` — now true for the team workspace only.
2. The remaining comment lines above `TEAM_NAV` about the Opponents stub want a pass once the team page is built.

## T6 · Migration: opponent_program_id + opponent_school on matches, grants, applied live — done

**gate:** mechanical pass · completion pass (checked against the live database)

**changed:** New `supabase/migrations/20261012003309_matches_opponent_program.sql`, applied live as version `20261012003309`: `matches.opponent_program_id uuid null references programs(id) on delete set null`, `matches.opponent_school text null`, CHECK that at most one is set, partial index on `opponent_program_id`, column grants to `authenticated` and `service_role`, two column comments. No policy changed (four policies identical before and after); 0 rows carry either column. Deviation: the task's reason for the column grants was false — `matches` has a table-wide grant to `authenticated` and no real column ACLs (only `users` has them), so the grants are redundant; they were kept and the file's comment says so. No generated Supabase types file exists in the repo, so none was updated.

**follow-ups:**

1. AGENTS.md / memory: "every new column needs a column grant" is true for `users` only (the one table with column-scoped grants).
2. `program_event_entries.opponent_program_id` and the new `matches` pair can disagree for a match with an `event_entry_id` (0 such matches today) — decide which wins, or backfill.

## T7 · Lift the personal page's selection model onto `useRowSelection` — done

**gate:** mechanical pass · completion pass · widget-states audit: no loading, empty or error state touched (selection logic only)

**changed:** New `src/components/dashboard/schedule/row-selection-model.ts` (pure reducer: `initialRowSelection`, `rowSelectionReducer` with select / toggle / close / step / cutHid / finishClose). `use-row-selection.ts` is now a thin wrapper over it with `rowId` and `focusTarget` options and a `[data-row-keys="ignore"]` stand-down. `opponents-page-content.tsx` drops its hand-copied model and calls the hook; `opponents-table.tsx`'s `onToggle` takes `(key, viaKeyboard)`; the Opponents toolbar root and `MatchesFilterPanel`'s `PopoverContent` carry `data-row-keys="ignore"`. Behaviour notes: for existing hook callers (dual and tournament detail) a row that leaves `ids` during the close slide-out now finishes sliding out rather than vanishing; on Opponents, keys also stand down inside alert dialogs, an `?opponent=` naming no listed row is stripped from the URL on mount, and a refresh that leaves the selection outside the current cut clears the drawer at once. Not opened in a browser.

**follow-ups:**

1. Eyes-on for Opponents: deep link, cut-hides-row slide-out, Esc focus return, arrows on a chip or sort trigger not stepping the drawer.
2. `close()` with nothing open still sets `closing` for 240ms — could be a no-op in the model.
3. `team/roster-view.tsx` and the Matches page keep their own copies and lack the `data-row-keys` guard — a separate branch.
4. `schedule/README.md` could mention `row-selection-model.ts`.

## T8 · Offline spec for the row-selection model — done

**gate:** mechanical pass · completion pass

**changed:** New `tests/row-selection-model.spec.ts` (30 tests, pure import): toggle, close → finishClose, stepping over a filtered order and stopping at both ends, `cutHid` clearing a hidden selection and standing down while closing, initial state from `(ids, initialId)`, `openedByKeyboard` after keyboard and pointer actions, same-object identity on no-op transitions, and position derived from `drawerId` during a close. To make position testable, `row-selection-model.ts` gains the pure selector `rowSelectionPosition(state, ids)` and `use-row-selection.ts` calls it (same expressions, moved).

**follow-ups:**

1. Make `close` an identity no-op when nothing is selected or open.
2. Make `finishClose` stand down unless `closing` is true (a stray `onClosed` can leave a selected row with no drawer).
3. Decide whether `step` from a selection not in `ids` should be a no-op in both directions (today ↓ lands on the first row, ↑ does nothing).
4. `use-row-selection.ts`'s DOM side (key-guard selectors, URL mirror, focus return) has no direct test.

## T9 · Wizard data: team keys, persistence, history prefill, richer directory search — done

**gate:** mechanical pass · completion pass · widget-states audit: no loading, empty or error state touched (`DetailsStepContent.tsx` changed in callbacks and a prop type only, no markup)

**changed:** New `new-match-wizard/opponent-team.ts` (pure: `opponentTeamColumns` for inserts, `opponentTeamUpdate` for updates, `opponentTeamFromHistory`) and `tests/opponent-team.spec.ts` (23 tests). `formData` gains `opponentTeamProgram` / `opponentTeamSchool` / `opponentTeamSource`, reset with Start over and on a line swap; the line's own `opponentProgramKey` / `opponentSchool` are only read. Save: inserts write both columns (explicit nulls when empty); a reuse-update writes both when the field is set or a dual line's program resolves, and NEITHER when the field is empty — amended after the first handback so a wizard re-save cannot wipe a team set later from the edit dialog or the drawer (differs from the criterion's literal "writes the same two keys"; reviewer accepted). `opponentsPlayed` rows carry the most recent match's team via the `matches_opponent_program_id_fkey` embed; picking or typing a known opponent prefills with source "history". `searchPrograms` and `/api/programs/search` return `id`, `schoolAbbrev`, `crestUrl` through a follow-up `programs` read (the `search_programs` RPC was not widened — that needs DDL and resets its anon grant). Guardrail-protected inputs untouched. The FK embed has not been exercised against live PostgREST.

**follow-ups:**

1. A dual line with a hand-typed school and no program key saves no team — `line.opponentSchool` could fall back into `opponent_school`.
2. "Most recent match" is literal: a newer match with no team makes history forget an older one.
3. The line fallback does not exclude the workspace's own program id (`program_event_entries` has such a CHECK, `matches` does not).
4. `tests/fixtures/local-supabase/live-baseline.sql` lacks the two new `matches` columns.
5. `tests/upload-start-over.spec.ts`'s `RESET_FIELDS` could list the three new keys.
6. Fold `id` / abbrev / crest into `search_programs` in a later migration to drop the second read.
7. Confirm the `opponent_program:programs!matches_opponent_program_id_fkey` embed on a real request (eyes-on, team wizard).

## T16 · ProgramCrest: short code, fixed letters, three characters, never wraps — done

**gate:** mechanical pass · completion pass · widget-states audit: no loading, empty or error state touched (a presentational tile)

**changed:** New `src/lib/ui/crest-letters.ts` (`crestLetters(shortCode, name)`: a 1–3 character short code uppercased, else `getInitials(name)` capped at three) and `tests/crest-letters.spec.ts`. `ProgramCrest` takes `shortCode?`, sets letters at 9px / 0.2px tracking in the 26px tile (10px at 38 and 52, 16px at 64, unchanged), and the tile is `flex-none overflow-hidden whitespace-nowrap leading-none`. No caller edited; none passes `shortCode` yet. Visible change for existing callers: 26px tiles go from 10px to 9px letters. A one-word name with no usable short code still gives one letter ("Stanford" → "S") because `getInitials` was kept unchanged.

**follow-ups:**

1. If one-word names should show three letters ("STA"), that changes every existing caller — its own task.

## T10 · Wizard UI: "their team" under the opponent's name — done

**gate:** mechanical pass · completion pass · widget-states audit: loading ✓ (search shows a hint under two characters and results as they arrive; no skeleton needed for an inline field), empty ✓ (the "Add their team" link is the empty state; "Use … as typed" covers no results), error ✓ (a failed search leaves the as-typed row usable)

**changed:** New `src/components/dashboard/matches/opponent-team-field.tsx` (`OpponentTeamField`, prop-driven: link → combobox search → chosen line; exports `OpponentTeamChange`). `DetailsStepContent.tsx` mounts it under the opponent's read-back name, in team workspaces only and not in admin mode, and derives the read-only "line" state in the UI from the saving dual line when the field is empty. Results are `ProgramCrest` 26 + school + "conference · division · squad" (long labels, e.g. "Men's"), then "Use “…” as typed"; results with no id are not listed; capped at six. Validation and `canContinue` untouched; guardrail-protected inputs untouched. Deviations kept: the field appears only once an opponent is named; the menu shows "Type their school." under two characters; rows restate `FloatMenuItem`'s geometry by hand because its leading slot cannot hold a crest. Not opened in a browser, and the details step needs an uploaded file, so eyes-on probably cannot reach it.

**follow-ups:**

1. No way to clear a team once set (Change only swaps it) — a "Remove" row, if wanted.
2. Enter before the debounced results arrive keeps the term as typed rather than picking the matching program.
3. The search can list the workspace's own program as an opponent's team.
4. The line state shows an initials crest; resolving the line's program to its short code and crest needs a read the wizard defers to save.
5. `OpponentTeamProgram` / `OpponentTeamSource` could move out of the wizard's `types.ts` now that T11 and T15 reuse the field.
6. An offline spec for the field's three states.
7. The hand/backhand provenance line can sit directly above "From your last match against {name}" — check on screen.

## T11 · Edit-match dialog: the same team line in the opponent row — done

**gate:** mechanical pass · completion pass · widget-states audit: loading ✓ (the dialog's existing load state covers the new fields), empty ✓ ("Add their team" link), error ✓ (team-key refusals reach the dialog's error line)

**changed:** `GET /api/matches/[matchId]` selects `opponent_program_id`, `opponent_school` and the `opponent_program:programs!matches_opponent_program_id_fkey(...)` embed (the FK hint is required: `matches` has two foreign keys to `programs`). `normalizeMatchPatch` accepts the two keys (uuid or null; text trimmed, ≤120, or null), refuses both non-null with 400 `opponent_team_exclusive`, and nulls the other key when only one is set. The PATCH route checks the program exists before writing (422 `opponent_program_not_found`); ownership filters unchanged. `EditMatchPlayers` mounts `OpponentTeamField` in its own row under the opponent, for a team match in a team workspace only; the dialog sends the pair only when the field was touched and differs from the stored row. New `tests/patch-match-opponent-team.spec.ts` (8 tests) and five route cases in `tests/match-route-guards.spec.ts`; `openapi/advantage-api.yaml` updated; `CRESTS_BUCKET` exported from `programs-server.ts`. Route not converted to `errorResponse()` (that helper cannot carry `field`). Not opened in a browser.

**follow-ups:**

1. Hand check in a team workspace: Matches → row menu → Edit match (no team, search, pick, as typed, save, reopen).
2. Decide whether a match on a dual line should read its team back locked and be refused server-side.
3. A team pointing at a program the viewer cannot read shows "Add their team" — a server-resolved name would let it read back.
4. Field-level errors for the team keys land in the dialog's general error line, not under the field.
5. Convert this route to `errorResponse()` once that helper can carry `field` and non-video codes.
6. One constant for the crest bucket name (`programs-server.ts` and `teams-server.ts`).

## T12 · Team opponents loader + pure grouping with facedBy — done

**gate:** mechanical pass · completion pass

**changed:** New `src/lib/data/team-opponents.ts` (pure: `groupTeamOpponents(inputs, roster, season, viewerId?)` → `{ opponents, totals }`, composing `groupPersonalOpponents` for the team row and for each roster player's `facedBy` entry; `TeamOpponent` adds `program`, `school`, `recent[].rosterPlayerId`, `matchIds`, `editableMatchIds`, `facedBy`), `src/lib/data/team-opponents-server.ts` (`getTeamOpponents(programId, viewerId)`: cookie client only, `matches` by `program_id` with the `programs!matches_opponent_program_id_fkey` embed, stats view, roster via the `program_roster_full` RPC, photos via `getMemberAvatarUrls`; throws on a roster error rather than drawing a false day zero) and `tests/team-opponents.spec.ts` (13 tests). `personal-opponents.ts` untouched. Decisions kept: a typed school is a sibling `school` field beside `program`; a directory program outranks a typed school even on a newer match; `totals.programs` counts distinct directory programs plus distinct typed schools; `team` is selected but not exposed.

**follow-ups:**

1. Matches by archived roster players count as `unattributed` (`program_roster_full` omits archived profiles) — say what the count means on the page, or read archived profiles too.
2. Matches naming no opponent are dropped silently; team totals have no `unnamed` count like the personal page's.
3. Expose `team` (men's / women's) on `TeamOpponentProgram` if a cell or the drawer needs it.
4. `firstName` is the first token of `display_name` — two-word first names are cut short.
5. Both opponents loaders pass every match id to one `.in()` — chunk or use an RPC before programs reach hundreds of matches.
6. `byDateDescending` exists privately in both pure modules.

## T20 · Eyes-on harness: open any path in the team workspace with a `team:` prefix — done

**gate:** mechanical pass · completion pass · live check by the runner: `capture.mjs "team:/dashboard/opponents" /dashboard/opponents` produced `team_dashboard_opponents.png` (ZZ Test Program team workspace) and `dashboard_opponents.png` (personal), with `workspace: "team"` / `"personal"` in `report.json`, both 200

**changed:** New `scripts/eyes-on/path-spec.mjs` (`parsePathSpec(arg)` → `{ team, path, clicks }` or null; no side effects) and `tests/eyes-on-path-spec.spec.ts` (7 tests). `capture.mjs` uses it: `team:/…` is accepted, stripped before the `::` split, sets the workspace cookie, and the bounce note fires only for `/dashboard/team` paths; `report.json` entries gain `workspace`. `.claude/agents/ui-verifier.md` and `.claude/skills/pr-check/SKILL.md` each describe the prefix. Syntax: `[team:]/route[::click…]`.

## T13 · Team Opponents page: six-column table, faced-by stack, toolbar facets, skeleton, day zero — done

**gate:** mechanical pass · completion pass · widget-states audit: loading ✓ (`OpponentsSkeleton scope="team"` as the Suspense fallback), empty ✓ (team day zero for no opponents; `TableEmptyBody` under the kept header for an empty cut; `EmptyMark` for no team, no style, no result), error ✓ (inside `WidgetBoundary`; the loader throws on a roster error instead of drawing a false day zero)

**changed:** `page.tsx`'s team branch renders `getTeamOpponents` (the `ComingSoonPage` stub is gone). New in `src/components/dashboard/opponents/`: `team-opponents-page-content.tsx`, `team-opponents-table.tsx`, `faced-by-stack.tsx` (avatar stack with the Dark Tooltip, no caret), `opponent-cells.tsx` (shared Plays / Record + ticks / Last-match cells), `opponents-filter-strip.tsx` (extracted, personal page renders the same), and `team-opponent-drawer.tsx` as a minimal placeholder for T14. `opponents-table-layout.ts` gains the six-track team grid and its compact twin (Program and Plays collapse); `opponents-views.ts` gains Program (incl. "No team") and Faced-by facets and the subline / footer copy; `tests/opponents-views.spec.ts` +16 cases. A typed school with no directory program is its own Program option and draws a crest from its initials. First run was cut off by a network failure after the work was on disk; a second agent verified and finished it. Deviations kept: the footer adds "· N more match(es) with no roster player" when any are unattributed; counts singularise. `TEAM_NAV` still flags Opponents `comingSoon` until T18. On screen: the harness shows only team day zero (the verifier's team has no opponent matches); the populated table was checked through a throwaway fixture route, since deleted.

**follow-ups:**

1. Seed the eyes-on verifier's team with opponent matches (a directory program, a typed school, no team, four or more roster players) so the populated table is visible to the harness.
2. Stack faces ring in `--surface-card` on the selected row; the design rings them in `--surface-muted` there.
3. `formatShortDate` parses date-only strings as UTC — rows can read a day early in US zones (shared helper).
4. A row with no result and no score shows two adjacent dashes in Last match.
5. The stack is focusable for its tooltip, so each row has two tab stops.

## T14 · Team opponent drawer: identity, Faced by, narrowed stats, recent rows with faces — done

**gate:** mechanical pass · completion pass · widget-states audit: loading ✓ (the drawer reads props already on the page — no fetch), empty ✓ (stat block absent with a one-sentence placeholder naming the scope; "No team" line; `EmptyMark` for unknown hand / backhand / result), error ✓ (inside the page's `WidgetBoundary`)

**changed:** `team-opponent-drawer.tsx` rewritten from the placeholder: `PeekDrawerFrame`, identity (48px avatar, wrapping name, `ProgramCrest` + wrapping school with "conference · division", or "No team · Add their team"; a typed school draws an initials crest), "Faced by" as `Chip`s ("All" + one per roster player with an 18px face, first name and own record) or a `SortTrigger` + `FloatMenu` above four players, stats and recent matches narrowed to the chosen scope, recent rows on the new `RECENT_MATCH_GRID_WITH_FACE`, footer via the shared rule. New `opponent-drawer-shared.ts` (`isLive(nav, href)`, `rowDate`, `opponentFirstName`, `opponentMatchesHref`, `opponentDrawerFooter` — the personal drawer now imports these and renders the same), `team-opponent-scope.ts` (pure scope / label / chip-vs-menu rules) and `tests/team-opponent-scope.spec.ts` (19 tests). `schedule/static/chip.tsx` gains optional `leading` and `detail`. "Add their team" is a button with no handler until T15. Verified on screen in every state through a throwaway fixture route, since deleted. Deviations kept: the menu's first row reads "Whole team" while the trigger reads "Faced by: All"; 18px faces use 8px initials (7px is off the type scale); "All N" shows the chosen scope's count but links to the opponent-name search.

**follow-ups:**

1. With a player chosen, "All N" opens a Matches search listing every roster player's matches against that opponent — needs a player facet in the link.
2. `FloatMenuItem` could gain `leading` and `detail` slots so the Faced-by rows are not hand-built.
3. Sparkline hover tips print the opponent's name on every point; in the "All" scope the roster player's name would say more.
4. The sparkline's left date label prints the full date where recent rows use the short form (both drawers).
5. A typed-school opponent has no route to a directory program — decide whether it gets a "Change" action.

## T19 · `set_opponent_team` RPC: staff set an opponent's team on any of the program's matches — done

**gate:** mechanical pass · completion pass (function body, definer flag, search_path and grants checked against the live database)

**changed:** New `supabase/migrations/20261012071550_set_opponent_team.sql`, applied live as version `20261012071550`: `public.set_opponent_team(p_program_id, p_match_ids, p_opponent_program_id, p_opponent_school) returns setof uuid`, plpgsql, SECURITY DEFINER, `search_path = ''`. Refuses a signed-out caller (28000), anyone whose role on the program is not owner / coach / staff (42501), both-or-neither team inputs, an empty or over-200 id list, or the caller's own program as the opponent (22023), an unknown opponent program (23503), and any id that is not one of the program's matches (42501, nothing written — counted under `for update` before the update). Updates only the two columns; returns the ids changed. `revoke all from public, anon; grant execute to authenticated, service_role` — live: anon false, authenticated true, service_role true. No policy changed. New `tests/set-opponent-team-rls.spec.ts` (7 cases; staff / player / stranger / mixed-program / both inputs / anon) registered in `LIVE_DB_SPECS`. The spec SKIPS against production, so it has not executed; the function was not called on real rows. Additions beyond the criteria: null and duplicate ids are stripped before counting.

**follow-ups:**

1. Run the spec once against a non-production project (export the three Supabase keys for it) — the only way it executes.
2. Consider a `program_audit_log` row from the function, as `add_self_as_program_player` writes.
3. `contribute_opponent_player` gates on the schedule helper; the same role-vs-`events_policy` reasoning may apply there.

## T15 · Drawer "No team · Add their team": staff set every match, players their own — done

**gate:** mechanical pass · completion pass · widget-states audit: loading ✓ (an optimistic team line with "Saving…" until the refresh), empty ✓ ("No team" alone when the viewer cannot act), error ✓ (inline line for a refusal, a failure, or a partial save; the action returns)

**changed:** New `src/components/dashboard/opponents/add-opponent-team.ts` (pure `teamWriteMode`, `canAddTeam`, `describeApplies`, `buildTeamPatch`, `chunkMatchIds`, `describeUnsaved`, and the one write function `applyOpponentTeam` with the browser client imported lazily) and `tests/add-opponent-team.spec.ts` (22 tests). `team-opponent-drawer.tsx` gates the button on no team + (`isProgramStaff` or the viewer recorded a match) and reuses `OpponentTeamField`'s search; staff call `set_opponent_team` over all the opponent's matches (chunks of 200, stopping at the first failure), players update the matches they recorded. `OpponentTeamField` gains optional `lead` and `searchNote` (wizard and edit dialog pass neither). Verified on screen through a throwaway route with intercepted requests, since deleted; no live write was made. Deviations kept: singular copy for one match; error text in `--danger-hover`; a typed-school opponent shows no action.

**follow-ups:**

1. Let staff change or upgrade an existing team from the drawer — the action disappears once any team is set, including after a partial save.
2. Filter the viewer's own program out of the search; picking it returns the generic error (the RPC refuses it with 22023).
3. Move focus to the new team line after a pick.
4. Clear a stale error line when the viewer steps away from the opponent and back.
5. Eyes-on for `team:/dashboard/opponents?opponent=<key>` takes the staff path on the real ZZ Test Program — open the search only, never pick.
