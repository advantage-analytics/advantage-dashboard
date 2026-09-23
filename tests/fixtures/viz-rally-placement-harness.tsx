import { useState } from "react";
import { DEFAULT_BANDS, type BandSettings } from "@/lib/data/viz-bands";
import { createRoot } from "react-dom/client";
import { ChartMenu } from "@/components/dashboard/matches/match-detail/shots/chart-menu";
import { CutMenu } from "@/components/dashboard/matches/match-detail/shots/cut-menu";
import { CourtArt } from "@/components/dashboard/matches/match-detail/shots/court-art";
import { CourtTile } from "@/components/dashboard/matches/match-detail/shots/court-tile";
import { VizFullscreenCourt } from "@/components/dashboard/matches/match-detail/shots/viz-fullscreen-court";
import {
  VizStateProvider,
  useVizState,
} from "@/components/dashboard/matches/match-detail/shots/viz-state-context";
import {
  computeViz,
  computeVizStats,
  bandZonesFor,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { RALLY_POINTS } from "./viz-rally-points";

// Return cuts consume the loader's resolved second-shot summary. Supply
// both subjects, both ends, and a landing that changes bands after editing.
const RETURN_POINTS = RALLY_POINTS.flatMap((p) => {
  const shot = p.shots!.find((s) => s.id.endsWith("-return"))!;
  const point = {
    ...p,
    secondShotType: shot.shotType,
    secondShotResult: shot.result,
    secondShotContactX: shot.contactX,
    secondShotContactY: shot.contactY,
    secondShotLandingX: shot.landingX,
    secondShotLandingY: 11.885 + (shot.contactY! > 11.885 ? -9.5 : 9.5),
  };
  return [
    point,
    {
      ...point,
      id: `${point.id}-opponent`,
      serverIsPlayer1: false,
      shots: point.shots!.map((s) => ({ ...s, isPlayer1: !s.isPlayer1 })),
    },
  ];
});

function Harness() {
  const { state, setState } = useVizState();
  const [contactHidden, setContactHidden] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [bands, setBands] = useState<BandSettings>(DEFAULT_BANDS);
  const cut = state.cut ?? "rallyPosition";
  const points =
    cut === "returnPlacement" || cut === "returnContact"
      ? RETURN_POINTS
      : RALLY_POINTS;
  const result = computeViz(
    points,
    cut,
    state.filters,
    state.filters.player === "you",
  );
  const stats = computeVizStats(
    points,
    cut,
    state.filters,
    state.filters.player === "you",
    result,
    bands,
    "ft",
  );
  const bandZones = bandZonesFor(cut, bands, "ft", stats, contactHidden);
  return (
    <>
      <h1>Rally placement rendering regression</h1>
      <CutMenu savedViews={[]} onSaveRequest={() => {}} />
      <ChartMenu />
      <button
        onClick={() =>
          setState((s) => ({
            ...s,
            filters: {
              ...s.filters,
              player: s.filters.player === "you" ? "opponent" : "you",
            },
          }))
        }
      >
        Switch player
      </button>
      <button
        onClick={() =>
          setState((s) => ({ ...s, filters: { ...s.filters, set: [2] } }))
        }
      >
        Second set
      </button>
      <button
        onClick={() =>
          setBands({
            depthScheme: "custom",
            depthDividersFt: [3, 8],
            contactDividersFt: [1, 4],
          })
        }
      >
        Change bands
      </button>
      <button onClick={() => setBands({ ...bands, depthScheme: "none" })}>
        No depth bands
      </button>
      <button
        onClick={() =>
          setState((s) => ({ ...s, filters: { ...s.filters, set: [99] } }))
        }
      >
        Empty set
      </button>
      <pre data-testid="stats">
        {JSON.stringify(
          stats.groups.find((g) => g.key === "depth")?.rows ?? [],
        )}
      </pre>
      <button onClick={() => setContactHidden((hidden) => !hidden)}>
        Toggle contact bands
      </button>
      <output>
        {result.count} of {result.total}
      </output>
      <section data-testid="preview" style={{ width: 300 }}>
        <CourtTile
          as="static"
          playerName="Selected player"
          name="Rally preview"
          pills={[]}
          countLabel={`${result.count} of ${result.total}`}
          cut={cut}
          dots={result.dots}
          zones={result.zoneStats ?? undefined}
          bandZones={bandZones}
          chart={state.chart}
          href="#"
        />
      </section>
      <section data-testid="focused" style={{ width: 600 }}>
        <CourtArt
          cut={cut}
          dots={result.dots}
          chart={state.chart}
          zones={result.zoneStats ?? undefined}
          bandZones={bandZones}
          labels
        />
      </section>
      <section
        data-testid="fullscreen"
        style={{ position: "relative", width: 700, height: 700 }}
      >
        <VizFullscreenCourt
          cut={cut}
          chart={state.chart}
          dots={result.dots}
          zoneStats={result.zoneStats}
          filters={state.filters}
          subjectName="Selected player"
          unit="m"
          bands={bandZones}
          transform={{ px: 0, py: 0, z: 1 }}
          stage={{ w: 700, h: 700 }}
          panning={false}
          activeId={selectedId}
          focusedId={null}
          selectedId={selectedId}
          rovingId={null}
          onActivate={() => {}}
          onDeactivate={() => {}}
          onRove={() => {}}
          onSelect={(id) =>
            setSelectedId((current) => (current === id ? null : id))
          }
        />
      </section>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <VizStateProvider>
    <Harness />
  </VizStateProvider>,
);
