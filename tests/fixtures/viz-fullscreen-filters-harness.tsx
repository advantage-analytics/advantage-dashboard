import { createRoot } from "react-dom/client";
import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { MatchReportProvider } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  VizStateProvider,
  useVizState,
} from "@/components/dashboard/matches/match-detail/shots/viz-state-context";
import { VizFullscreen } from "@/components/dashboard/matches/match-detail/shots/viz-fullscreen";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import type { Match } from "@/lib/data/types";
import { ASYMMETRIC_SERVES } from "./viz-serve-points";

const match = {
  id: "fixture",
  tournamentName: "Test match",
  date: "2026-09-23",
  matchType: "Singles",
  player1: { name: "Avery Kim", school: "West" },
  player2: { name: "Blake Rivera", school: "East" },
  isUserPlayer1: true,
  score: {
    sets: [{ player1: 6, player2: 4 }],
    winner: "player1",
    finalScore: "6-4",
  },
} as Match;

function Harness() {
  const { state, setState } = useVizState();
  return (
    <>
      <button
        type="button"
        data-viz-fullscreen-door=""
        onClick={() => setState((prev) => ({ ...prev, fullscreen: true }))}
      >
        Open fullscreen
      </button>
      {state.fullscreen && <VizFullscreen />}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <MatchDataProvider
    match={match}
    statsResult={null}
    points={
      window.location.search.includes("fixture=watch")
        ? ASYMMETRIC_SERVES.map((point, index) =>
            index === 0 ? { ...point, videoTime: 42 } : point,
          )
        : ASYMMETRIC_SERVES
    }
  >
    <MatchReportProvider
      matchId="fixture"
      summary={null}
      canCompare={false}
      isDerived={false}
      statsPublished={false}
      hasPlayableVideo={window.location.search.includes("fixture=watch")}
      savedViews={[]}
      workspaceRole="owner"
      workspaceKind="personal"
      workspaceName="Personal"
      bandSettings={DEFAULT_BANDS}
      canEditBands={false}
      unit="m"
    >
      <VizStateProvider>
        <Harness />
      </VizStateProvider>
    </MatchReportProvider>
  </MatchDataProvider>,
);
