import { createRoot } from "react-dom/client";
import { ChartMenu } from "@/components/dashboard/matches/match-detail/shots/chart-menu";
import { CourtArt } from "@/components/dashboard/matches/match-detail/shots/court-art";
import { VizFullscreenCourt } from "@/components/dashboard/matches/match-detail/shots/viz-fullscreen-court";
import {
  VizStateProvider,
  useVizState,
} from "@/components/dashboard/matches/match-detail/shots/viz-state-context";
import {
  computeViz,
  EMPTY_VIZ_FILTERS,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { ASYMMETRIC_SERVES, servePoint } from "./viz-serve-points";

function Harness() {
  const { state, setState } = useVizState();
  const faults = new URLSearchParams(window.location.search).has("faults");
  const points = faults ? [servePoint({ result: "Net" })] : ASYMMETRIC_SERVES;
  const result = computeViz(
    points,
    "serve",
    state.filters,
    state.filters.player === "you",
  );
  return (
    <>
      <h1>Serve placement</h1>
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
          setState((s) => ({
            ...s,
            filters: {
              ...s.filters,
              court: ["deuce"],
              zone: ["wide"],
              set: [2],
            },
          }))
        }
      >
        Deuce wide, second set
      </button>
      <button
        onClick={() =>
          setState((s) => ({
            ...s,
            filters: { ...EMPTY_VIZ_FILTERS, set: [3] },
          }))
        }
      >
        Empty set
      </button>
      <output>
        {result.count} of {result.total}
      </output>
      <section data-testid="focused" style={{ width: 600 }}>
        <CourtArt
          cut="serve"
          dots={result.dots}
          chart={state.chart}
          zones={
            state.chart === "zones"
              ? (result.zoneStats ?? undefined)
              : undefined
          }
          labels
        />
      </section>
      <section
        data-testid="fullscreen"
        style={{ position: "relative", width: 700, height: 700 }}
      >
        <VizFullscreenCourt
          cut="serve"
          chart={state.chart}
          dots={result.dots}
          zoneStats={result.zoneStats}
          filters={state.filters}
          subjectName="Selected player"
          unit="m"
          bands={null}
          transform={{ px: 0, py: 0, z: 1 }}
          stage={{ w: 700, h: 700 }}
          panning={false}
          activeId={null}
          focusedId={null}
          selectedId={null}
          rovingId={null}
          onActivate={() => {}}
          onDeactivate={() => {}}
          onRove={() => {}}
          onSelect={() => {}}
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
