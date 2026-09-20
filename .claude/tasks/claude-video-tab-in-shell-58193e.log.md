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
