import { createRoot } from "react-dom/client";
import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import {
  MatchReportProvider,
  useMatchReport,
} from "@/components/dashboard/matches/match-detail/match-report-context";
import { ShotsTab } from "@/components/dashboard/matches/match-detail/shots/shots-tab";
import {
  MatchFiltersProvider,
  useMatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/provider";
import { EMPTY_MATCH_FILTERS } from "@/components/dashboard/matches/match-detail/match-filters/model";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { DEFAULT_BANDS } from "@/lib/data/viz-bands";
import type { Match } from "@/lib/data/types";
import { ASYMMETRIC_SERVES } from "./viz-serve-points";
import { RALLY_POINTS } from "./viz-rally-points";

/**
 * The Visualizations tab as the report mounts it — the real `ShotsTab`, the
 * wall and the lightbox — over serve and rally fixtures. `?fixture=watch`
 * gives one serve point a clip and the match a playable video;
 * `?fixture=watchall` gives every point one. On `?tab=film` the tab is
 * unmounted, as the report's own view switch does, so Back remounts it.
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
const watchAll = window.location.search.includes("fixture=watchall");
const points = [...ASYMMETRIC_SERVES, ...RALLY_POINTS].map((point, i) =>
  watchAll || (watch && point.id === "p1-high-0-0")
    ? { ...point, videoTime: 42 + i }
    : point,
);

/** Two saved views: a Saved collection to open from, and a second view to
 *  go Back/Forward to. */
const savedViews = [
  {
    id: "sv1",
    name: "Saved serve",
    cut: "serve" as const,
    chart: "scatter" as const,
    filters: { ...EMPTY_VIZ_FILTERS },
    order: 0,
    shared: false,
    mine: true,
  },
  {
    id: "sv2",
    name: "Saved returns",
    cut: "returnPlacement" as const,
    chart: "scatter" as const,
    filters: { ...EMPTY_VIZ_FILTERS },
    order: 1,
    shared: false,
    mine: true,
  },
];

/**
 * Test-only: seeds a landed statistic's Film remainder (as `watchCut` does)
 * and shows whether one is in force, so a spec can see the Watch hand-off
 * clear it.
 */
function RemainderProbe() {
  const { filmRemainder, setFilmRemainder } = useMatchFilters();
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          setFilmRemainder({
            label: "Net points won",
            extras: { netBy: "you" },
            landed: EMPTY_MATCH_FILTERS,
          })
        }
      >
        Seed remainder
      </button>
      <output data-testid="remainder">
        {filmRemainder ? "remainder" : "none"}
      </output>
    </div>
  );
}

/** The report's view switch: the tab mounts only while it is shown. */
function ShownTab() {
  const { state } = useMatchReport();
  return state.view === "film" ? <p>Video tab</p> : <ShotsTab />;
}

createRoot(document.getElementById("root")!).render(
  <MatchDataProvider match={match} statsResult={null} points={points}>
    <MatchFiltersProvider
      initialQuery={
        new URLSearchParams(window.location.search).get("f") ?? undefined
      }
    >
      <MatchReportProvider
        matchId="fixture"
        summary={null}
        isDerived={false}
        statsPublished={false}
        hasPlayableVideo={watch}
        savedViews={savedViews as never}
        workspaceRole="owner"
        workspaceKind="personal"
        workspaceName="Personal"
        bandSettings={DEFAULT_BANDS}
        canEditBands={false}
        unit="m"
        // `?readonly=1`: the public share page's report — nothing that writes.
        readOnly={window.location.search.includes("readonly=1")}
      >
        <main className="mx-auto max-w-[1200px] p-6">
          <RemainderProbe />
          <ShownTab />
        </main>
      </MatchReportProvider>
    </MatchFiltersProvider>
  </MatchDataProvider>,
);
