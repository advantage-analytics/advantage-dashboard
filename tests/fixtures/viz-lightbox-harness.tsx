import { createRoot } from "react-dom/client";
import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { MatchReportProvider } from "@/components/dashboard/matches/match-detail/match-report-context";
import { ShotsTab } from "@/components/dashboard/matches/match-detail/shots/shots-tab";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import type { Match } from "@/lib/data/types";
import { ASYMMETRIC_SERVES } from "./viz-serve-points";
import { RALLY_POINTS } from "./viz-rally-points";

/**
 * The Visualizations tab as the report mounts it — the real `ShotsTab`, the
 * wall and the lightbox — over serve and rally fixtures. `?fixture=watch`
 * gives one serve point a clip and the match a playable video.
 */
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

const watch = window.location.search.includes("fixture=watch");
const points = [...ASYMMETRIC_SERVES, ...RALLY_POINTS].map((point) =>
  watch && point.id === "p1-high-0-0" ? { ...point, videoTime: 42 } : point,
);

createRoot(document.getElementById("root")!).render(
  <MatchDataProvider match={match} statsResult={null} points={points}>
    <MatchReportProvider
      matchId="fixture"
      summary={null}
      isDerived={false}
      statsPublished={false}
      hasPlayableVideo={watch}
      savedViews={[]}
      workspaceRole="owner"
      workspaceKind="personal"
      workspaceName="Personal"
      bandSettings={DEFAULT_BANDS}
      canEditBands={false}
      unit="m"
    >
      <main className="mx-auto max-w-[1200px] p-6">
        <ShotsTab />
      </main>
    </MatchReportProvider>
  </MatchDataProvider>,
);
