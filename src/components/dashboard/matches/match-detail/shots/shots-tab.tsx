"use client";

import { VizWall } from "@/components/dashboard/matches/match-detail/shots/viz-wall";
import { VizFocused } from "@/components/dashboard/matches/match-detail/shots/viz-focused";
import { useVizState } from "@/components/dashboard/matches/match-detail/shots/use-viz-state";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";

/**
 * The Visualizations tab's panel. `?cut=` absent (or unrecognised) renders
 * the wall of default cuts (`VizWall`, P1a/P1b); a recognised `cut` renders
 * the focused court view (`VizFocused`, Task 5) — the wall's tiles and the
 * toolbar's cut/chart menus are the only way in.
 *
 * Attribution (guardrails §4): "you" is resolved exactly once, by
 * `useMatchSides()` — `VizWall` and `VizFocused` each call it directly and
 * pass the resolved side's own `isPlayer1` down to `computeViz`. Nothing
 * below this reads player1/player2 off the match.
 *
 * `savedViews` (Task 8) comes from `useMatchReport().meta` — loaded once in
 * `page.tsx` via `getSavedViews()` and threaded through `MatchReportProvider`
 * rather than fetched here. `SavedViewRow` is structurally a `SavedViewLite`
 * (id/name/cut/chart/filters plus `shared`/`mine`), so it needs no mapping to
 * reach `VizFocused`'s prop. This task only wires the read side: the "Saved
 * views" group in the cut menu populates and a saved view loads when picked.
 * `onSaveRequest` stays unset — the Save dialog and Manage UI (which would
 * need `mine`/`shared`/`workspaceRole` to decide the ⋯ menu) are the next
 * task, so "Save this view…" stays hidden for now.
 */

export function ShotsTab() {
  const { state } = useVizState();
  const { meta } = useMatchReport();
  return state.cut === null ? (
    <VizWall />
  ) : (
    <VizFocused savedViews={meta.savedViews} />
  );
}
