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
import { computeViz } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { RALLY_POINTS } from "./viz-rally-points";

function Harness() {
  const { state, setState } = useVizState();
  const cut = state.cut ?? "rallyPosition";
  const result = computeViz(
    RALLY_POINTS,
    cut,
    state.filters,
    state.filters.player === "you",
  );
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
          chart={state.chart}
          href="#"
        />
      </section>
      <section data-testid="focused" style={{ width: 600 }}>
        <CourtArt cut={cut} dots={result.dots} chart={state.chart} labels />
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
          bands={null}
          transform={{ px: 0, py: 0, z: 1 }}
          stage={{ w: 700, h: 700 }}
          panning={false}
          activeId={null}
          focusedId={null}
          rovingId={null}
          onActivate={() => {}}
          onDeactivate={() => {}}
          onRove={() => {}}
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
