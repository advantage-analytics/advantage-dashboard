# Tasks — codex/visualization-fixes

> Scope: Match-detail Visualizations previews, focused courts, statistics, zones, and fullscreen behavior.

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

## Queue-specific execution instructions

- User-approved routing override: dispatch on each exact Codex `model:` value and the reasoning level in its `notes:`. These replace the skill's Claude aliases for this queue only; do not change global task automation or silently substitute a model.
- File targets are guesses relative to `src/components/dashboard/matches/match-detail/shots/` unless another path is given. Follow the rendered route from `/dashboard/matches/[matchId]` through `ShotsTab`; the legacy `serve-placement-widget.tsx` is not the rendered widget.
- Clicking a preview keeps the focused view and hides only the selected tile from the gallery. Other previews remain available; fullscreen is a separate action. Hover provides feedback only.
- Zones covers every visualization type using existing depth/contact bands; serves retain six service zones.
- Use the existing `/task-next` checks, targeted coordinate/serialization tests, and committed browser regressions. Actual browser review supplements diff-verifiable criteria.

## T1 · Reconcile serve zones and plotted coordinates

- **status:** done
- **model:** gpt-6-astra
- **files:** Guess: `viz-model.ts`, `court-geometry.ts`, `court-art.tsx`, `viz-focused.tsx`, `viz-fullscreen-court.tsx`; associated visualization and court-geometry tests under `tests/`.
- **done when:**
  - [ ] Asymmetric fixtures covering both court ends, both players, and both service sides establish the correct orientation and identify whether existing dots, numbers, or both were wrong.
  - [ ] Serve zone labels, membership, counts, percentages, and plotted coordinates agree in focused and fullscreen views, including after filtering.
  - [ ] Selecting Serve placement → Zones renders correctly; regression tests cover boundaries, faults, and missing coordinates.
- **notes:** Reasoning: high. Dots and zone aggregation currently use different normalization paths. Establish correctness from source coordinates rather than assuming either display is authoritative. Preserve player attribution and explicitly test denominator semantics.

## T2 · Add rally placement

- **status:** done
- **model:** gpt-6-astra
- **needs:** T1
- **files:** Guess: `viz-model.ts`, `cut-menu.tsx`, `default-cuts.ts`, `default-tiles.ts`, `viz-url.ts`, `viz-labels.tsx`, `court-art.tsx`, `court-geometry.ts`, `viz-fullscreen-court.tsx`; `src/lib/data/saved-views-logic.ts` and associated tests under `tests/`.
- **done when:**
  - [ ] Rally placement is available through the cut selector and default previews, distinct from rally contact/position.
  - [ ] Marks represent the selected player's rally-shot landing coordinates, using existing shot-role classification to exclude serves, returns, and feeds.
  - [ ] Scatter and Heat render consistently in previews, focused view, and fullscreen; URLs and saved views round-trip the new cut.
  - [ ] Tests cover multiple rally shots per point, either player, both court ends, and missing/out/net coordinates.
- **notes:** Reasoning: high. Extend existing cut types and validation without changing existing saved cuts. Inspect live saved-view constraints before deciding whether a narrowly scoped compatibility migration is required.

## T3 · Enable zones for every visualization type

- **status:** todo
- **model:** gpt-6-astra
- **needs:** T1, T2
- **files:** Guess: `chart-menu.tsx`, `viz-model.ts`, `viz-bands-overlay.tsx`, `court-art.tsx`, `viz-focused.tsx`, `viz-fullscreen-court.tsx`, `viz-url.ts`; `src/lib/data/saved-views-logic.ts` and associated tests under `tests/`.
- **done when:**
  - [ ] Zones is supported for serve placement, return placement, return contact, rally placement, and rally contact/position.
  - [ ] Serves retain six service zones; other views reuse their applicable depth/contact bands, with counts and statistics derived from the same filtered data.
  - [ ] Preview, focused, and fullscreen rendering updates consistently when the person, filters, or applicable bands change.
  - [ ] URLs and saved views preserve all supported Zones combinations; tests cover empty results, band boundaries, and band changes.
- **notes:** Reasoning: high. Reuse existing band controls and permissions. No new lateral-by-depth grid.

## T4 · Remove the selected preview's duplicate while focused

- **status:** blocked
- **model:** gpt-6-sol
- **files:** Guess: `shots-tab.tsx`, `viz-focused.tsx`, `saved-views-band.tsx`, `default-tiles.ts`, `viz-state-context.tsx`; navigation regression tests under `tests/`.
- **done when:**
  - [ ] Clicking a default or saved preview opens its focused visualization and omits only that preview from the gallery.
  - [ ] Selecting another preview restores the previous tile; returning to the overview restores all tiles without changing saved records or ordering.
  - [ ] Focus remains click/tap and keyboard activated, with an explicit fullscreen action and preserved reduced-motion behavior.
  - [ ] A committed browser test covers default and saved previews, switching selection, and browser back/forward.
- **notes:** Reasoning: medium. Match the selected preview by its stable identity, not merely by visualization type. Hover provides feedback only.

## T5 · Redesign the statistics widget and match court height

- **status:** todo
- **model:** gpt-6-sol
- **needs:** T3, T4
- **files:** Guess: `stats-card.tsx`, `viz-focused.tsx`; layout regression tests under `tests/`.
- **done when:**
  - [ ] The widget follows the repository design system for typography, spacing, surfaces, and emphasis, with sentence-case labels and unnecessary dividers removed.
  - [ ] Side-by-side court and statistics widgets share aligned top and bottom edges; long statistics scroll within the available height.
  - [ ] Narrow layouts stack cleanly without horizontal overflow or inaccessible content.
  - [ ] Counts, percentages, empty states, and accessible announcements remain correct; committed browser tests cover populated/empty states and equal-height layout.
- **notes:** Reasoning: high. Apply the repository design guidance and UI UX Pro Max before implementation. Review the rendered result in a browser. Scope is the statistics widget beside the court.

## T6 · Fix fullscreen filter overflow and selected-person avatar

- **status:** blocked
- **model:** gpt-6-sol
- **files:** Guess: `viz-fullscreen.tsx`, `applied-strip.tsx`; fullscreen regression tests under `tests/`.
- **done when:**
  - [ ] Fullscreen filter chips remain on one horizontally scrollable line within the bar instead of wrapping or overflowing.
  - [ ] With many filters and narrow widths, menus, zoom, fit, and exit controls remain reachable without overlap.
  - [ ] The scorecard avatar/initials follows the selected person and uses the court's subject identity, without changing match-score attribution.
  - [ ] A committed browser test covers both people, reopening fullscreen, keyboard access to overflowing filters, and removing a filter.
- **notes:** Reasoning: medium. Preserve existing avatar fallbacks. Apply nonwrapping behavior specifically to fullscreen.

## T7 · Enlarge ace stars slightly

- **status:** done
- **model:** gpt-6-luna
- **files:** Guess: `court-art.tsx`, `court-geometry.ts`, `viz-focused.tsx`, `viz-fullscreen-court.tsx`.
- **done when:**
  - [ ] Ace-star outer radius increases by 20% in previews, focused courts, and fullscreen.
  - [ ] Ordinary dots, ace classification, and marker colors remain unchanged.
  - [ ] Stars remain centered on their shot coordinates and preserve hover, focus, and readout behavior.
- **notes:** Reasoning: medium. Use 20% as the concrete default for "slightly bigger."
