"use client";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useShotFilters } from "@/components/dashboard/matches/match-detail/shots/use-shot-filters";
import { CourtHeader } from "@/components/dashboard/matches/match-detail/shots/court-header";
import { ServeZonesCourt } from "@/components/dashboard/matches/match-detail/shots/serve-zones-court";
import { ZoneTable } from "@/components/dashboard/matches/match-detail/shots/zone-table";

/**
 * The Shots & placement tab's panel — 47a's header over 46b's page: court card
 * then zone table. Replaces the parked ServePlacementCard in `page.tsx`.
 *
 * Attribution (guardrails §4): "you" is resolved exactly once, by
 * `useMatchSides()` — its `you.isPlayer1` feeds the filter model (which shots
 * are yours, what Won/Lost/Serving mean) and its `you.name` feeds the legend.
 * Nothing below this reads player1/player2 off the match.
 *
 * The zone table renders only in Serve · Zones — the artboard (46b) draws it
 * under the zones court and nowhere else, and its rows are service-box zones,
 * which have no meaning for returns.
 */

export function ShotsTab() {
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
