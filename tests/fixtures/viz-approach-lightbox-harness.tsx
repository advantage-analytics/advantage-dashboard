import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { VizLightboxShell } from "@/components/dashboard/matches/match-detail/shots/viz-lightbox-shell";
import type { Hand } from "@/components/dashboard/matches/match-detail/match-filters/shot-geometry";
import {
  bandZonesFor,
  EMPTY_VIZ_FILTERS,
  type Cut,
  computeVizStats,
  type VizDot,
  type VizDotMeta,
  type VizFilters,
  type VizResult,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";

/**
 * `VizLightboxShell` on the Approaches cut, from a HAND-BUILT result: three
 * contact/placement pairs and one approach whose contact went unmeasured
 * (a placement alone). No points, no model run — the court is exactly these
 * dots, so the spec can find each pair by id.
 *
 * Query: `?hand=left|right|unknown` hands the shell the opponent's hand (the
 * apron's wing names); without it the shell gets none, as on the season's
 * court. `?cut=<cut>` opens the same dots on another cut instead.
 * `?bands=1` draws the cut's saved depth/contact bands (`DEFAULT_BANDS`,
 * through `bandZonesFor`, as `use-viz-view.ts` does); without it the court
 * has none.
 */

const params = new URLSearchParams(window.location.search);
const HAND_PARAM = params.get("hand");
const OPPONENT_HAND: Hand | null | undefined =
  HAND_PARAM === "left" || HAND_PARAM === "right"
    ? HAND_PARAM
    : HAND_PARAM === "unknown"
      ? null
      : undefined;
const CUT = (params.get("cut") ?? "approaches") as Cut;
const BANDS = params.get("bands") === "1";

function meta(extra: Partial<VizDotMeta>): VizDotMeta {
  return {
    setNumber: 1,
    pointScore: "15-0",
    wonBySubject: true,
    shotType: "Forehand",
    result: "In",
    isAce: false,
    entry: "approach",
    handAssumed: true,
    ...extra,
  };
}

const APPROACH_DOTS: VizDot[] = [
  {
    id: "pair-a",
    outcome: "won",
    shape: "circle",
    lateralM: -2.5,
    depthM: 8,
    atNet: false,
    pair: { lateralM: -2, depthM: 0.5 },
    meta: meta({ pointId: "p1", wing: "forehand" }),
  },
  {
    id: "pair-b",
    outcome: "lost",
    shape: "triangle",
    lateralM: 2.5,
    depthM: 6,
    atNet: false,
    pair: { lateralM: 2, depthM: -2 },
    meta: meta({
      pointId: "p2",
      wing: "backhand",
      shotType: "Backhand",
      wonBySubject: false,
    }),
  },
  {
    id: "solo-c",
    outcome: "won",
    shape: "circle",
    lateralM: 0,
    depthM: 10,
    atNet: false,
    meta: meta({ pointId: "p3", wing: "middle" }),
  },
  {
    id: "pair-d",
    outcome: "won",
    shape: "circle",
    lateralM: 0.5,
    depthM: 4,
    atNet: false,
    pair: { lateralM: -0.5, depthM: -4 },
    meta: meta({ pointId: "p4", wing: "middle" }),
  },
];

function Approaches() {
  const [filters, setFilters] = useState<VizFilters>(EMPTY_VIZ_FILTERS);
  const result = useMemo<VizResult>(
    () => ({
      dots: APPROACH_DOTS,
      count: APPROACH_DOTS.length,
      total: APPROACH_DOTS.length,
      noun: "approaches",
      zoneStats: null,
    }),
    [],
  );
  const stats = useMemo(
    () => computeVizStats([], CUT, filters, true, result, DEFAULT_BANDS, "ft"),
    [filters, result],
  );
  const bandZones = useMemo(
    () => (BANDS ? bandZonesFor(CUT, DEFAULT_BANDS, "ft", stats) : null),
    [stats],
  );
  return (
    <VizLightboxShell
      cut={CUT}
      chart="scatter"
      opponentHand={OPPONENT_HAND}
      filters={filters}
      result={result}
      stats={stats}
      subjectName="Avery Kim"
      unit="ft"
      bandZones={bandZones}
      hasFilters={false}
      statRowDots={() => null}
      title="Approaches"
      subtitle={`Approaches · ${result.count} approaches`}
      filterPhrases={[]}
      panelActive={false}
      onClose={() => {}}
      onClearFilters={() => setFilters(EMPTY_VIZ_FILTERS)}
    />
  );
}

createRoot(document.getElementById("root")!).render(<Approaches />);
