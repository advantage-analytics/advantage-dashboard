"use client";

import { VizWall } from "@/components/dashboard/matches/match-detail/shots/viz-wall";
import { VizFocused } from "@/components/dashboard/matches/match-detail/shots/viz-focused";
import {
  useVizState,
  VizStateProvider,
} from "@/components/dashboard/matches/match-detail/shots/viz-state-context";
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
 * `SavedViewsBand` (Task 9, including Part B's Manage mode) is built ONCE
 * here and handed to both surfaces through their existing `savedViewsBand`
 * slot — one band, two mount points, so the wall and the focused view can
 * never draw a different list, count, or Manage-mode state. Manage mode
 * itself is entirely the band's own client state (never a prop from here);
 * it withholds "Manage views" whenever nothing in the list is manageable.
 * F4: only one of the two ever actually renders it at a time (only one of
 * `VizWall`/`VizFocused` mounts per `state.cut`), so `variant` is set here
 * from that same `state.cut` — `"wall"` renders the pre-existing saved-only
 * grid, `"focused"` the Views grid — a wrapping grid reached by scrolling
 * the page, not a scrolling row (defaults, saved, Create view).
 *
 * Saving is always on — everyone, including players, may save a view — so
 * `VizFocused` no longer takes an `onSaveRequest` opt-in; it owns its own
 * Save dialog and only needs the workspace facts that dialog's "Share with
 * team" row depends on.
 *
 * `VizStateProvider` (`viz-state-context.tsx`) is mounted ONCE here, around
 * the whole wall/focused tree, so every descendant's `useVizState()` reads
 * the SAME store — a click in the filters popover and a click in the
 * applied strip a moment later both land, instead of the second racing the
 * first's still-pending navigation. `ShotsTab` itself needs `state.cut` to
 * choose wall vs. focused, so it's split into this outer component (mounts
 * the provider) and `ShotsTabBody` (reads it) — `useVizState()` must run
 * inside the provider it belongs to, never above it.
 */

export function ShotsTab() {
  return (
    <VizStateProvider>
      <ShotsTabBody />
    </VizStateProvider>
  );
}

function ShotsTabBody() {
  const { state } = useVizState();
  const { meta } = useMatchReport();

  const savedViewsBand = (
    <SavedViewsBand
      views={meta.savedViews}
      workspaceRole={meta.workspaceRole}
      workspaceKind={meta.workspaceKind}
      variant={state.cut === null ? "wall" : "focused"}
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
