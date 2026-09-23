import { createRoot } from "react-dom/client";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import { PointList } from "@/components/dashboard/matches/match-detail/film/point-list";
import { DEFAULT_FILM_FILTERS } from "@/components/dashboard/matches/match-detail/film/film-filters";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";
import type { WorkspaceContextValue } from "@/lib/workspace/types";

/**
 * T8: the header's "Clear all" is a labelled text button, not a bare glyph,
 * and it is drawn only while a cut is applied (`hasActiveFilmFilters`).
 *
 * Two `PointList`s are mounted side by side, in separate root divs so the
 * spec can address each header independently: one with
 * `DEFAULT_FILM_FILTERS` (no button), one with `pressure: "break"` applied
 * (exactly one button, clicking it hands `onFiltersChange` the
 * `DEFAULT_FILM_FILTERS` object). Each root's `onFiltersChange` records its
 * argument on the container's `data-cleared-with` attribute as JSON, so the
 * spec can assert on the exact object without a live React state loop.
 */

const WORKSPACE: WorkspaceContextValue = {
  active: {
    id: "viewer-1",
    kind: "personal",
    name: "Personal",
    team: null,
    orgType: null,
    timeZone: "UTC",
    role: "owner",
    mark: "CG",
    iconUrl: null,
    canSubmitVideo: true,
    programStatus: null,
    playersCanUpload: true,
    memberUploadEnabled: true,
    uploadPolicy: "everyone",
    eventsPolicy: "owner",
    myPlayerId: null,
  },
  available: [],
  viewer: {
    id: "viewer-1",
    email: "viewer@example.com",
    name: "Viewer",
    firstName: "Viewer",
    initials: "CG",
    avatarUrl: null,
    plan: "free",
    role: null,
    memberSince: null,
    onboardedAt: "2026-01-01",
  },
};

const MATCH: Match = {
  id: "clear-all-match",
  tournamentName: "Spring Invitational",
  date: "2026-04-18",
  matchType: "Singles",
  round: "R1",
  player1: { name: "Marcus Reid", school: "Riverside" },
  player2: { name: "Jordan Alvarez", school: "Northgate" },
  score: {
    sets: [{ player1: 6, player2: 4 }],
    winner: "player1",
    finalScore: "6-4",
  },
  won: true,
  isUserPlayer1: true,
};

function point(overrides: Partial<MatchPoint> & { id: string }): MatchPoint {
  return {
    pointNumber: 1,
    setNumber: 1,
    gameNumber: 1,
    setScore: "0-0",
    gameScore: "0-0",
    pointScore: "0-0",
    resultType: "Forehand Winner",
    eventType: "Forehand Winner",
    description: "Rally",
    player: "player2",
    wonByPlayer1: true,
    serverIsPlayer1: true,
    isBreakPoint: false,
    isSetPoint: false,
    isMatchPoint: false,
    rallyLength: 4,
    duration: null,
    videoTime: null,
    saved: false,
    savedBy: [],
    ...overrides,
  };
}

const POINTS: MatchPoint[] = [point({ id: "only-point" })];

function mount(
  containerId: string,
  filters: typeof DEFAULT_FILM_FILTERS,
): void {
  const container = document.getElementById(containerId)!;
  const root = createRoot(container);
  root.render(
    <WorkspaceProvider value={WORKSPACE}>
      <MatchDataProvider match={MATCH} statsResult={null} points={POINTS}>
        <PointList
          allPoints={POINTS}
          visiblePoints={POINTS}
          filters={filters}
          onFiltersChange={(next) => {
            container.dataset.clearedWith = JSON.stringify(next);
          }}
          advancedOpen={false}
          onAdvancedOpenChange={() => {}}
          openSections={[]}
          onOpenSectionsChange={() => {}}
          activePointId={null}
          activeStart={0}
          activeEnd={0}
          onSelect={() => {}}
          onToggleSaved={() => {}}
        />
      </MatchDataProvider>
    </WorkspaceProvider>,
  );
}

mount("no-filters-root", DEFAULT_FILM_FILTERS);
mount("with-filters-root", { ...DEFAULT_FILM_FILTERS, pressure: "break" });

document.documentElement.dataset.hydrated = "true";
