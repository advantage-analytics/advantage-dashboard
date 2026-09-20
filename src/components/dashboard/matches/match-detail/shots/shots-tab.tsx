"use client";

import { VizWall } from "@/components/dashboard/matches/match-detail/shots/viz-wall";
import { VizFocused } from "@/components/dashboard/matches/match-detail/shots/viz-focused";
import { useVizState } from "@/components/dashboard/matches/match-detail/shots/use-viz-state";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import { SavedViewsBand } from "@/components/dashboard/matches/match-detail/shots/saved-views-band";

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
 * `savedViews`/`workspaceRole`/`workspaceKind`/`workspaceName` (Task 8/9)
 * come from `useMatchReport().meta` — loaded once in `page.tsx` and threaded
 * through `MatchReportProvider` rather than fetched here.
 *
 * `SavedViewsBand` (Task 9 step 1, no Manage mode yet) is built ONCE here
 * and handed to both surfaces through their existing `savedViewsBand` slot
 * — one band, two mount points, so the wall and the focused view can never
 * draw a different list or count. `onManage` is left unset (Part B's no-op
 * seam; the band itself withholds "Manage views" whenever nothing is
 * manageable regardless).
 *
 * Saving is always on — everyone, including players, may save a view — so
 * `VizFocused` no longer takes an `onSaveRequest` opt-in; it owns its own
 * Save dialog and only needs the workspace facts that dialog's "Share with
 * team" row depends on.
 */

export function ShotsTab() {
  const { state } = useVizState();
  const { meta } = useMatchReport();

  const savedViewsBand = (
    <SavedViewsBand
      views={meta.savedViews}
      workspaceRole={meta.workspaceRole}
    />
  );

  return state.cut === null ? (
    <VizWall savedViewsBand={savedViewsBand} />
  ) : (
    <VizFocused
      savedViews={meta.savedViews}
      savedViewsBand={savedViewsBand}
      workspaceKind={meta.workspaceKind}
      workspaceName={meta.workspaceName}
    />
  );
}
