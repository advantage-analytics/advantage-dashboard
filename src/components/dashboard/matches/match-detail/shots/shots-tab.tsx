"use client";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useShotFilters } from "@/components/dashboard/matches/match-detail/shots/use-shot-filters";
import { CourtHeader } from "@/components/dashboard/matches/match-detail/shots/court-header";
import { ServeZonesCourt } from "@/components/dashboard/matches/match-detail/shots/serve-zones-court";
import { ZoneTable } from "@/components/dashboard/matches/match-detail/shots/zone-table";
import { VizWall } from "@/components/dashboard/matches/match-detail/shots/viz-wall";
import { useVizState } from "@/components/dashboard/matches/match-detail/shots/use-viz-state";

/**
 * The Visualizations tab's panel. `?cut=` absent (or unrecognised) renders
 * the wall of default cuts (`VizWall`, P1a/P1b); a recognised `cut` renders
 * the pre-redesign single-court body (`LegacyShots`), kept until Task 5
 * replaces it with the focused view so the branch stays shippable between
 * tasks.
 *
 * Attribution (guardrails §4): "you" is resolved exactly once, by
 * `useMatchSides()`. `VizWall` reads `you`/`opp` off that hook directly and
 * passes each row's own `side.isPlayer1` down to `computeViz` as the
 * subject; `LegacyShots` still feeds `sides.you.isPlayer1` to
 * `useShotFilters` the same way it always has. Nothing below this reads
 * player1/player2 off the match.
 */

export function ShotsTab() {
  const { state } = useVizState();
  return state.cut === null ? <VizWall /> : <LegacyShots />;
}

/**
 * The zone table renders only in Serve · Zones — the artboard (46b) draws it
 * under the zones court and nowhere else, and its rows are service-box zones,
 * which have no meaning for returns.
 */
function LegacyShots() {
  const { points } = useMatchData();
  const sides = useMatchSides();
  const model = useShotFilters(points, sides.you.isPlayer1);

  const courtProps = {
    mode: model.mode,
    view: model.view,
    serveDots: model.serveDots,
    returnDots: model.returnDots,
    zoneStats: model.zoneStats,
    count: model.count,
    total: model.total,
  };

  return (
    <div className="flex flex-col gap-2.5">
      <CourtHeader
        model={model}
        youName={sides.you.name}
        maximizeContent={<ServeZonesCourt {...courtProps} large />}
      />
      <ServeZonesCourt {...courtProps} />
      {model.mode === "serve" && model.view === "zones" && (
        <ZoneTable zoneStats={model.zoneStats} />
      )}
    </div>
  );
}
