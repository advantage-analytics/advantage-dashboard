"use client";

import { VizWall } from "@/components/dashboard/matches/match-detail/shots/viz-wall";
import { VizFocused } from "@/components/dashboard/matches/match-detail/shots/viz-focused";
import { useVizState } from "@/components/dashboard/matches/match-detail/shots/use-viz-state";

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
 * `savedViews` is empty until the saved-views feature lands (out of scope
 * here) — `VizFocused`'s "Save this view…" row stays hidden without
 * `onSaveRequest`, and the "Saved views" group stays hidden without entries.
 */

export function ShotsTab() {
  const { state } = useVizState();
  return state.cut === null ? <VizWall /> : <VizFocused savedViews={[]} />;
}
