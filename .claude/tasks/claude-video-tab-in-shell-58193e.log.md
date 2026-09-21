# Run log — claude/video-tab-in-shell-58193e

Written by `/task-next`. Do not hand-edit — the queue file is yours, this one
is the runner's. Newest entries at the bottom.

## T1 · Extract the film filter model to filters/types.ts and add cut helpers — done

**gate:** mechanical pass; completion review pass
**changed:** Moved the film filter model into `film/filters/types.ts` (no React import) and re-exported every name from `film-filters.tsx`. Added `cutName`, `countFilmOption`, `parseCut` and `serializeCut`, and the `counts` memo now calls `countFilmOption`. New `tests/film-filters-model.spec.ts` covers the cut names, a count that drops with a second axis, the URL round trip and the advanced-only case. A cut with both a show label and a server reads "Break points · Reid serving", which the task left open. Code landed in 04f22565; this entry and the status were recorded one commit later.

## T2 · Give FilmQuickFilters a light tone through FloatMenu — blocked

**gate:** mechanical FAIL (2026 passed, 2 failed); completion review not run
**reason:** `tests/float-menu-selected-option.spec.ts` (2 tests) reads `ui/float-menu.tsx` as source and pins the strings `role={icon ? "menuitem" : "menuitemradio"}`, `aria-checked={icon ? undefined : chosen}` and `{!icon && <ChosenCheck chosen={chosen} className="mt-[2px]" />}`. The subagent's `trailing` prop rewrote those lines (`isAction`), so both fail. Everything else passed, including typecheck and lint.
**stash:** 3a320a211973c7f514c194fd6f62e540ad4b250d
**fix hint:** keep those three lines byte-identical and add the trailing slot beside them (for example a separate branch for `trailing`), or update the spec deliberately. The rest of the T2 work is believed complete.

## T2 · Give FilmQuickFilters a light tone through FloatMenu — done

**gate:** mechanical pass (after one re-run: `program-owner-name-live.spec.ts` failed once under the shared live-DB auth limit and passed alone); completion review pass
**changed:** Re-run of the blocked attempt, with the float-menu fix applied by hand at the author's request. `FilmQuickFilters` takes `tone`, with a light branch built on `FloatMenu` (width 284, 12px radius and `--shadow-dropdown` through `className`) and `onOpenAdvanced` optional. `float-menu.tsx` gains a `FloatMenuCaption` export and an optional `trailing` slot on `FloatMenuItem`, with the three source lines `float-menu-selected-option.spec.ts` pins left byte-identical (the trailing row's role is a spread override after them).
**follow-ups:**

1. Row padding in the frame is 7/9px and radius 6px; `FloatMenuItem` keeps its shared 7/10px and 7px.
2. The `role` override on the `trailing` row is order-dependent; restructure if a reviewer objects.
3. Nothing renders `FilmQuickFilters` with `tone="light"` yet; T3 does.

## T3 · Rebuild the point list header and zero states — done

**gate:** mechanical pass; completion review pass
**changed:** `point-list.tsx` loses the Points/Saved tablist, the `Popover` + `FilmFiltersPanel`, the applied-cut strip and the "All N points" button. The header is one row outside the scroller and outside the zero-state branch: light `FilmQuickFilters` without `onOpenAdvanced`, a 22px "Clear the cut" button shown only for an active cut, and a tabular `{matched} / {total}` count. `EmptyList` has exactly three branches with the spec's P5 copy (no points detected, no saved point, no match for this cut), the last built from `describeFilmCut`. `PointList` drops `tab`, `onTabChange` and `filteredCount`; `film-tab.tsx` passes the filter-applied points. `PointRow` untouched.
**follow-ups:**

1. `FilmFiltersPanel` in `film-filters.tsx` is now unreferenced; T5 deletes it.
2. Until T5 a cut carrying an Advanced axis reads only "Filtered" with no way to adjust it in the shell.
3. `PointList`'s `filtered` local now only gates the clear button; consider deriving it once T6 lands URL cut state.

## T4 · Build the in-column Advanced filters panel — done

**gate:** mechanical pass; completion review pass
**changed:** New `film/film-advanced-panel.tsx` exports `FilmAdvancedPanel` (caller-owned `openSections`, no Popover/Dialog/portal; nothing mounts it yet). Every option is an `aria-pressed` pill with a `countFilmOption` count, a zero-count unselected pill is `disabled`, the footer reads `{preview} of {total}`, Apply uses `advButton()`. `filters/types.ts` gains the JSX-free `FILM_FILTER_SECTIONS` (Score, Serve, Return, Rally, Result, Court; `savedOnly` is the standalone pill), `FILM_STANDALONE_KEYS` and `filmFiltersEqual`. Two new specs cover the section partition of `DEFAULT_FILM_FILTERS` and array-order-insensitive equality. Axis-to-section mapping (the spec left it open): Score = set, pressure, score; Serve = server, ball, serve; Return = wing, returns; Rally = rallyMin, shot; Result = result, ended, outcome; Court = court.
**follow-ups:**

1. T5 mounts the panel and wires `onOpenAdvanced` plus the `openSections` state in `FilmRoom`; `FilmFiltersPanel` and its helpers are then dead.
2. Result's `result` and `ended` axes overlap (winner/forced/unforced) and read as near-duplicate pill groups; decide whether to merge them.
3. The title-row count duplicates the footer's preview number.

## T5 · Swap the Advanced panel into the list column; delete FilmFiltersPanel — done

**gate:** mechanical pass (after one re-run: `match-video-attachments-db.spec.ts` "two concurrent sweeps never share a row" failed once against the shared live DB and passed alone); completion review pass
**changed:** `FilmRoom` owns `advancedOpen` and `openSections` state and passes both through `PointList`. `PointList` gives the light `FilmQuickFilters` an `onOpenAdvanced` and, while Advanced is open, renders `FilmAdvancedPanel` in place of the header and list inside the same `surface-card` section. Apply commits the draft and closes; close leaves filters alone. `FilmFiltersPanel` and its `Segmented`, `CheckRow` and `Section` helpers are deleted from `film-filters.tsx`, with every re-export kept.
**follow-ups:**

1. The header comment left in `film-filters.tsx` still describes the old Apply-not-live behaviour and segmented rows.
2. Esc to close the panel is not wired; T8 owns window key handling.
3. Not exercised in a browser: open, apply, reopen.

## T6 · Mirror the quick cut into the URL — done

**gate:** mechanical pass (after two re-runs: `film-playback-refresh.spec.ts` "a paused viewer is in the same place on the new credential" failed once in the full run and passed alone, then `teams-management.spec.ts` (live DB) failed once and passed alone; the third full run was clean); completion review pass
**changed:** `FilmRoom`'s `filters` state now initialises from `{ ...DEFAULT_FILM_FILTERS, ...parseCut(searchParams) }` (null tolerated), and an effect keyed on `filters` mirrors the quick cut into the URL with `window.history.replaceState` through `serializeCut`, skipping the write when the query is already equal. No router calls or `pushState`; Advanced axes never reach the URL, and `tab=film` and other params carry through. The comment at the effect names `node_modules/next/dist/docs/01-app/02-guides/single-page-applications.md`. Outside `files:`: `tests/film-playback-refresh.spec.ts` and `tests/fixtures/next-navigation-browser-mock.ts` gain a `next/navigation` alias and a null-returning `useSearchParams()`, because the webpack-bundled harness otherwise pulled in Next's real runtime and never hydrated.
**follow-ups:**

1. Back/forward does not re-read the URL into `filters`; replace-only history has no entries to step through.
2. The film-playback spec failed once in a loaded full run; if it recurs, check whether the new effect adds enough render work to tip its timing.
3. Not exercised in a real browser.

## T7 · Rewrite film-this-point as the Current point widget — done

**gate:** mechanical pass; completion review pass
**changed:** `film-this-point.tsx` is now the "Current point" widget: the "Open in the room" button, the prose line, the embedded `PointRow` and any "Edit this point" text are gone. The head carries a `{index} / {total}` stepper whose buttons call `onStep`, which `film-tab.tsx` wires to `playerRef.current?.step` (the transport's own step, so it walks the applied cut). `film-shots.ts` gains a pure `shotRowCells` (Serve on row 1, derived Type, "—" for unmeasured values, a measured 0 mph kept) with three new specs. Shot rows use CSS grid in the order # · Player · Stroke · Placement · Result, with Spin, Type and Mph added at `@min-[880px]` against the report pane's `@container` (796px with the sidebar expanded, 964px collapsed at 1440; comment in the file). Footer reads `{n} shots · {s}s · {resultType}`. Call site in `film-tab.tsx` drops the props that fed the removed parts; dead `activeIsYou` removed.
**follow-ups:**

1. The Result cell is coloured by measured/unmeasured, not by who lost the point as the frame draws it; `MatchPoint.wonByPlayer1` could drive it.
2. The per-shot blue progress rule was dropped with the old row; the playing shot is now only the `surface-subtle` wash. Worth a look on a real match.
3. `film-point-panel.tsx` (fullscreen Shots tab) still draws the old two-line row; phase 2 could adopt `shotRowCells`.
4. The 880px breakpoint is measured against the pane, but the widget sits in the left column (about 336px narrower); the fixed tracks still fit.
5. Not exercised in a browser.

## T8 · Remap film keys: arrows step points, J/L seek 5s — done

**gate:** mechanical pass; completion review pass
**changed:** In `film-tab.tsx` and `film-fullscreen.tsx`, ArrowUp/ArrowLeft step to the previous point, ArrowDown/ArrowRight to the next, and J/L seek −5 / +5 seconds (both through the existing clamping seek helpers). All existing guards are untouched. The doc comment above the `film-tab.tsx` handler describes the new mapping. Outside `files:`: one comment in `film-track.tsx` that quoted the old mapping. `film-fullscreen.tsx` has no shared modifier check, so the `j` and `l` cases carry an inline one (as the `s` case already does), so Cmd+L and Ctrl+J are not swallowed.
**follow-ups:**

1. No spec asserts the new arrow/J/L mapping; the existing ones only cover the bail-out.
2. No tooltip or keyboard-help text stated the old ↑↓ = 5 seconds mapping.
