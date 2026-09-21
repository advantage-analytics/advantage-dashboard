# Tasks — claude/video-tab-in-shell-58193e

> Scope: the in-shell Video tab (H1 handoff, phase 1) — point list, quick and Advanced filters, Current point, no-film refusals, film keys

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

## T1 · Extract the film filter model to filters/types.ts and add cut helpers

- **status:** done
- **model:** sonnet
- **files:** (guess) src/components/dashboard/matches/match-detail/film/filters/types.ts (new), film/film-filters.tsx, tests/film-filters-model.spec.ts (new)
- **done when:**
  - [ ] `film/filters/types.ts` exists with no React/JSX import and holds the cut types, `FilmFilters`, `DEFAULT_FILM_FILTERS`, `hasActiveFilmFilters`, the predicates, `courtSideOf`, `applyFilmFilters`, `lastNameOf` and `describeFilmCut`; `film-filters.tsx` re-exports every name it exported before, so `film-fullscreen.tsx`, `film-point-panel.tsx`, `film-advanced-filters-dialog.tsx` and `tests/film-filters-fullscreen.spec.ts` do not appear in the diff
  - [ ] `cutName(filters, sides)` is exported and returns "All points" for `DEFAULT_FILM_FILTERS`, "Break points" for `pressure: "break"` and "Saved only" for `savedOnly: true`
  - [ ] `countFilmOption(points, filters, youIsPlayer1, patch)` is exported and returns `applyFilmFilters(points, { ...filters, ...patch }, youIsPlayer1).length`; `FilmFiltersPanel`'s `counts` memo calls it instead of its local `sizeWith`, and no other JSX in `film-filters.tsx` changes
  - [ ] `parseCut(params)` reads only `cut=break|saved` and `serve=you|opp` into `pressure` / `savedOnly` / `server` (anything else, or null params, gives the defaults). `serializeCut(filters, params)` returns a new query string that sets or deletes only `cut` and `serve`, carries every other param through and never mutates `params`. `savedOnly` wins over `pressure: "break"`, the same precedence `film-quick-filters.tsx`'s `show` uses
  - [ ] `tests/film-filters-model.spec.ts` imports from `filters/types` and uses `tests/fixtures/film-point.ts`. It asserts: the three `cutName` outputs; one `countFilmOption` case where a second applied axis lowers the count; a `serializeCut`→`parseCut` round trip that keeps `tab=film`; and that an advanced-only filter serializes to neither `cut` nor `serve`
- **notes:** Spec: docs/superpowers/specs/2026-09-20-video-tab-in-shell-h1-design.md — read "Settled mismatches", "Rules that apply to every task" and Steps 1. No UI change in this task. Write the spec in the pure-logic style of tests/film-filters-fullscreen.spec.ts. `cutName` beyond the three pinned outputs (author-confirmed): a server-only cut reads `"{LastName} serving"` (the menu's own label, name via `lastNameOf(sides…)`), and any cut with an Advanced axis set reads "Filtered". Keep `describeFilmCut`'s output byte-identical; the fullscreen spec pins it.

## T2 · Give FilmQuickFilters a light tone through FloatMenu

- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** (guess) film/film-quick-filters.tsx, src/components/ui/float-menu.tsx, film/film-point-panel.tsx
- **done when:**
  - [ ] `FilmQuickFilters` takes `tone: "light" | "dark"`; `film-point-panel.tsx` passes `tone="dark"`, the dark branch still renders through the `FilmDarkMenu*` parts with its "Filters" trigger, and `film-dark-menu.tsx` is not in the diff
  - [ ] The light branch renders `FloatMenu` / `FloatMenuItem` / `FloatMenuNote` from `ui/float-menu.tsx` at width 284, `align="start"`, `sideOffset={6}`. "Filters apply to ↑↓ as well as the list." is the child of a `FloatMenuNote`, not a menu item
  - [ ] The light trigger is glyph + `cutName(filters, sides)` + chevron, carries `aria-expanded={open}` and renders a chevron-up icon while open; the glyph's colour is `var(--blue)` when `hasActiveFilmFilters(filters)` is true
  - [ ] The light branch's "Show points" and "Serve" group captions carry no `uppercase` class and no `eyebrow*` class. Both radio groups keep today's `pick()` semantics: within a group replaces, across groups composes
  - [ ] `onOpenAdvanced` becomes optional and the "Advanced filters…" row is omitted when it is absent. Any change to `float-menu.tsx` is additive (a new optional prop or a new export), with its defaults and existing call sites untouched
- **notes:** Spec: read "Rules that apply to every task", section A/P3, and frame `2026-09-20-video-tab-in-shell-h1/A-point-list-P1-P5.html` (P3) plus `D-phase2-inherits.html` before writing any px, ink or radius value. `FloatMenu`'s defaults are 10px radius and a hard-coded shadow; the frame wants 12px and `--shadow-dropdown`. Get there through `className` on this call site, never by changing the shared default. `FloatMenuItem` has no trailing slot or group-caption part today; add the smallest additive piece needed. Names come from `sides` via `lastNameOf` (guardrails §4). `savedOnly` is already a `FilmFilters` field and `applyFilmFilters` already honours it, so there is nothing to add to the model here.

## T3 · Rebuild the point list header and zero states

- **status:** done
- **model:** opus
- **needs:** T2
- **files:** (guess) film/point-list.tsx, film/film-tab.tsx (PointList call site only)
- **done when:**
  - [ ] Gone from `point-list.tsx`: the `role="tablist"` Points/Saved switcher, the `Popover` + `FilmFiltersPanel` import and usage, the applied-cut strip (the `describeFilmCut … Clear filter` block) and the trailing "All N points" button. `PointList` no longer takes `tab` / `onTabChange`, and `film-tab.tsx` hands it the filter-applied points rather than the tab-scoped `visiblePoints`. `FilmFullscreen`'s `tab`, `onTabChange` and `visiblePoints` props are unchanged
  - [ ] The header renders `<FilmQuickFilters tone="light" …>` without `onOpenAdvanced`. A 22px clear button with an `aria-label` renders only when `hasActiveFilmFilters(filters)` and calls `onFiltersChange(DEFAULT_FILM_FILTERS)`. A tabular count always renders both numbers as `{matched} / {total}`
  - [ ] The header sits outside the `overflow-y-auto` element and outside the `groups.length === 0` conditional, so it is drawn in every zero state
  - [ ] `EmptyList` has exactly three branches, carrying the spec's P5 titles and bodies verbatim. `filters.savedOnly` with no saved point on the match gives "You haven’t saved a point yet" + "Show all points". Any other applied cut that matches nothing gives "No points match this cut" + "Clear the cut", with a body built from `describeFilmCut(filters, sides)` rather than a hard-coded sentence. `allPoints.length === 0` gives "No points were detected in this film" with no action. Both actions reset to `DEFAULT_FILM_FILTERS`. No icon circle, skeleton row or sample point remains
  - [ ] `PointRow` stays exported and keeps `data-point-id`, `data-playing`, `role="button"` and the 2px progress rule
- **notes:** Spec: read "Settled mismatches", "Rules that apply to every task", section A (P1, P2, P5), then frames `A-point-list-P1-P5.html` and `E-route-P1-P2.html`. E wins where they disagree. Rows are already close to frame P1: title `resultType`, detail `description`, 30px mark on 6px radius, 26px score slide. Verify them against the frame; do not redesign. Keep the viewer's `WorkspaceMark`, not the frame's blue initials chip. tests/film-playback-refresh.spec.ts mounts the real FilmTab and selects `[data-point-id="…"][role="button"]` and `[data-playing="true"]`, so keep those. No "Recording requirements" destination exists in the repo (checked), so the third state has no action. Between this task and T5 the shell has no route to Advanced axes; that is expected.

## T4 · Build the in-column Advanced filters panel

- **status:** done
- **model:** opus
- **needs:** T1
- **files:** (guess) film/film-advanced-panel.tsx (new), film/filters/types.ts, tests/film-filters-model.spec.ts
- **done when:**
  - [ ] `film/film-advanced-panel.tsx` exports `FilmAdvancedPanel` taking all points, `sides`, the applied `filters`, `onApply(next)`, `onClose`, and `openSections` / `onOpenSectionsChange`, so open state is owned by the caller. It imports no `Popover`, `Dialog` or portal. Nothing mounts it yet
  - [ ] An exported section table names six sections in order — Score, Serve, Return, Rally, Result, Court — and a spec asserts every key of `DEFAULT_FILM_FILTERS` is assigned exactly once, to a section or to the standalone "Saved only" pill above the sections
  - [ ] Every option is a `<button aria-pressed>` pill showing a count from `countFilmOption` against the draft's other axes; a zero-count unselected pill is `disabled`, not hidden. The file has no `role="checkbox"`, no `<select>`, no segmented control and no "Any" option. A section's summary is `var(--blue)` when set and ink-400 "Any" when not
  - [ ] The draft is seeded from `filters` on mount. Apply is `disabled` while an exported pure `filmFiltersEqual(draft, filters)` is true; the spec covers array-order-insensitive equality and one differing case. Apply calls `onApply(draft)`. "Clear all" calls `onApply(DEFAULT_FILM_FILTERS)`, which also clears the quick cut
  - [ ] The footer reads `{preview} of {total}` from `applyFilmFilters` on the draft, and Apply uses `advButton()`
- **notes:** Spec: read "Rules that apply to every task", section A/P4, then frame `A-point-list-P1-P5.html` (P4) for the 40px title row, 42px section rows, 52px footer, 26px pills, 6px gaps and `scrollbar-gutter:stable`. The spec does not say which axis lives in which section. Take option labels and the rally thresholds (5, 9) from `film-advanced-filters-dialog.tsx` and the old `FilmFiltersPanel`. Set options come from the sets present in the points. You/opponent labels come from `sides` (guardrails §4). Leave `film-advanced-filters-dialog.tsx` untouched; it is fullscreen's.

## T5 · Swap the Advanced panel into the list column; delete FilmFiltersPanel

- **status:** done
- **model:** sonnet
- **needs:** T3, T4
- **files:** (guess) film/point-list.tsx, film/film-tab.tsx, film/film-filters.tsx
- **done when:**
  - [ ] `FilmRoom` in `film-tab.tsx` owns two new pieces of `useState`: whether Advanced is open, and the open-sections value. Both pass down through `PointList`, so section state survives closing and reopening the panel; no second store or context is introduced
  - [ ] `PointList` passes `onOpenAdvanced` to the light `FilmQuickFilters`. While Advanced is open it renders `FilmAdvancedPanel` in place of the header and list, inside the same `<section className="surface-card …">` — no `Popover`, `Dialog` or overlay in the diff
  - [ ] The panel's `onApply` calls `onFiltersChange(next)` and closes the panel; `onClose` closes without changing filters
  - [ ] `FilmFiltersPanel` and its private `Segmented`, `CheckRow` and `Section` are deleted from `film-filters.tsx`, and no import of `FilmFiltersPanel` remains anywhere under `src/`. `film-advanced-filters-dialog.tsx` and `film-point-panel.tsx` are not in the diff
- **notes:** Spec: read "Rules that apply to every task" and section A/P4 ("Takes the list's own column… Apply commits and returns to P2"). The film must not pause or reload, so touch nothing on the `FilmPlayer` props. The window keydown handler in `film-tab.tsx` bails on `button`-focused targets already; do not change it here (T8 owns it). Routed to sonnet by the author's choice (planner proposed opus for the three-large-file span): read only the regions you edit — the `PointList` call site and state block in `film-tab.tsx`, the header/list region in `point-list.tsx`, and the `FilmFiltersPanel` block in `film-filters.tsx`.

## T6 · Mirror the quick cut into the URL

- **status:** done
- **model:** sonnet
- **needs:** T1
- **files:** (guess) film/film-tab.tsx
- **done when:**
  - [ ] `FilmRoom`'s `filters` state initialises from `{ ...DEFAULT_FILM_FILTERS, ...parseCut(searchParams) }`, with `searchParams` from `useSearchParams()` and a null result tolerated
  - [ ] An effect keyed on `filters` writes the URL with `window.history.replaceState(null, "", …)` using `serializeCut`'s output on the current pathname. It skips the write when the query string is already equal. No `router.push`, `router.replace`, `router.refresh` or `pushState` is added
  - [ ] The URL is written only through `serializeCut`, so Advanced axes never reach it, and `tab=film` and any other param are carried through
  - [ ] A code comment at the effect names the `node_modules/next/dist/docs/…` file that was read for the native-history pattern
- **notes:** Spec: read "Rules that apply to every task", section A/P2 (the URL sentence) and Steps 5. The param is `?tab=film`, not `tab=video`. Precedent: `match-report-context.tsx` already uses `window.history.pushState` and documents why Next keeps `useSearchParams` in sync without a refetch. tests/fixtures/film-playback-refresh-harness.tsx mounts `FilmTab` with plain `createRoot` and no Next router, so `useSearchParams()` may return null there and the code must not throw. The film must not pause or reload on a cut change.

## T7 · Rewrite film-this-point as the Current point widget

- **status:** done
- **model:** opus
- **files:** (guess) film/film-this-point.tsx, film/film-shots.ts, tests/film-shots.spec.ts, film/film-tab.tsx (FilmThisPoint call site)
- **done when:**
  - [ ] Gone from `film-this-point.tsx`: the "Open in the room" button and `onOpenRoom` prop, the prose line ("Point n · Set …"), the embedded `PointRow` and its import from `./point-list`, and any "Edit this point" text. `film-tab.tsx`'s call site drops the props that fed them. The eyebrow and the section's `aria-label` read "Current point"
  - [ ] The head carries a stepper showing `{index} / {total}` from `position`, with previous/next buttons calling an `onStep(-1 | 1)` prop that `film-tab.tsx` wires to `playerRef.current?.step` — the same step the transport uses, so it walks the applied cut
  - [ ] `film-shots.ts` exports a pure helper that returns a shot row's cell strings: #, Player, Spin, Stroke, Type, Placement, Mph, Result. Row 1's Stroke is "Serve". A null `speedMph`, `spinType` or `zone` yields "—" and never "0". `tests/film-shots.spec.ts` asserts a serve row, a rally row and an all-null row
  - [ ] Shot rows are laid out with CSS grid in column order `# · Player · Stroke · Placement · Result`, with Placement on the one fluid track. Spin, Type and Mph cells are added, never re-ordered, only under a container-query variant against the report pane's `@container` in `match-report.tsx`. A code comment states the chosen breakpoint and the two pane widths at a 1440 viewport it separates. Nothing reads sidebar state
  - [ ] The footer reads `{n} shots · {s}s · {how it ended}`. A point with one or two timed shots renders the same head and rows through the same path. Each row is a button that calls `onSelectShot`, keeping `data-shot-id` and `aria-current`
- **notes:** Spec: read "Settled mismatches", "Rules that apply to every task", section B, then frames `B-current-point-T1-T2.html` and `E-route-P1-P2.html` (E wins) and `render-vals.txt`'s `shotRows` for sample cells. `MatchShot` only has `shotType`, `spinType`, `speedMph`, `zone` and `result`. "Type" (1st serve / Return / Rally) is derived from position and serve type, and Placement is `zone`. Player names come from `sides` via `lastNameOf` (guardrails §4). The pane container at `match-report.tsx:85` is unnamed and `film-tab.tsx` already uses `@min-[720px]` against it; name it only if you must. Keep the existing "shots were never timed" sentence for a point with zero timed shots; the spec's "never an empty state" is about short points. The memoised `ShotRow` pattern stays, because `timeupdate` re-renders the card about four times a second.

## T8 · Remap film keys: arrows step points, J/L seek 5s

- **status:** todo
- **model:** sonnet
- **files:** (guess) film/film-tab.tsx, film/film-fullscreen.tsx
- **done when:**
  - [ ] In `film-tab.tsx`'s window keydown handler, `ArrowUp` and `ArrowLeft` call `playerRef.current?.step(-1)` and `ArrowDown` and `ArrowRight` call `step(1)`; `j`/`J` call `seekBy(-5)` and `l`/`L` call `seekBy(5)`
  - [ ] In `film-fullscreen.tsx`'s handler, the same four arrows call `step(-1)` / `step(1)`, and `j`/`J` and `l`/`L` seek the current time −5 / +5
  - [ ] The guards are unchanged in the diff: `film-tab.tsx`'s modifier check, input/dialog/popover checks and the `closest("button, [role=button], [role=slider], a[href]")` bail-out; `film-fullscreen.tsx`'s `isFormControl`, `[data-film-own-keys]` and `overlayIsOpen()` checks
  - [ ] The doc comment above `film-tab.tsx`'s handler ("← → step points, ↑ ↓ move 5 seconds") is rewritten to the new mapping
- **notes:** Spec: read "Settled mismatches" (the Keyboard bullet) and "Rules that apply to every task". tests/film-playback-refresh.spec.ts ("a focused point row keeps the arrow keys") depends on the bail-out. The `shortcut="←"` / `"→"` tooltips in `film-player.tsx` and `film-transport.tsx` stay true and need no change.

## T9 · Restyle the no-film refusals from one copy table

- **status:** todo
- **model:** sonnet
- **files:** (guess) film/film-refusal-copy.ts (new), film/film-unavailable-state.tsx, film/film-player.tsx, tests/match-film-entry.spec.ts
- **done when:**
  - [ ] One exported copy table in a new JSX-free module under `film/` holds the heading, body and button labels for `stale`, `unavailable` and the in-player load failure, verbatim from the spec's section C table. `film-unavailable-state.tsx` and `film-player.tsx` both read their strings from it rather than holding literals
  - [ ] `film-unavailable-state.tsx` no longer imports or renders `AlertTriangle` or the 24px divider, and its root drops `items-center`, `justify-center` and `text-center` for a left-aligned, top-weighted block with the body capped at `56ch`. `role="alert"`, `data-testid="film-unavailable"`, `data-film-state` and `<FilmEntryActions>` stay
  - [ ] A ghost `advButton` "Back to the report" renders for both states and calls `useMatchReport().actions.selectView("statistics")`. A primary `advButton` "Try again" renders only for `unavailable` and calls `router.refresh()`
  - [ ] When `entry.attachment !== "present"` (state unknown), the existing heading "This match's video could not be checked" and its "could not read whether this match has a video" body are kept and moved into the table as their own row, and the branch on `entry.attachment === "present"` stays. `tests/match-film-entry.spec.ts`'s "never offers to add a video" test is updated to the new `stale` and known-`unavailable` strings and still asserts the unknown sentence, `role="alert"` and the absence of "Add video"
  - [ ] In `film-player.tsx`, `PROBLEM_TITLES.unplayable` and the rendered body for `problem.reason === "unplayable"` come from the table ("The film stopped loading" / "The stream broke partway through. Your position is kept."), with the existing `onRetry` "Try again" button. The `failed` Reload panel, `film-empty-state.tsx` and `use-attachment-playback.ts` are not changed
- **notes:** Spec: read "Settled mismatches", "Rules that apply to every task", section C, then frame `C-no-film.html` (16px heading, 12px body, 32px buttons 12px apart). `filmEntryView()` returns "unavailable" for both `attachment: "present"` and `null`. The spec's body "the recording is still attached to this match" would be a guess in the null case, and the existing test comment explains that this guess ends in a duplicate upload; criterion 4 exists for that reason. The `failed` panel reloads the page, so "Your position is kept" would be false there; leave its body alone. tests/film-playback-refresh.spec.ts asserts the "Try again" and "Reload" buttons by name. The same test file forbids `useWorkspace` and `createdBy` in this component. No "permission withdrawn" row is added, per the spec.
