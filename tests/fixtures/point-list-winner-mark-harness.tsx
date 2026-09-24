import { createRoot } from "react-dom/client";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import { PointList } from "@/components/dashboard/matches/match-detail/film/point-list";
import { DEFAULT_FILM_FILTERS } from "@/components/dashboard/matches/match-detail/film/film-filters";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";
import type { WorkspaceContextValue } from "@/lib/workspace/types";

/**
 * T2: the point-row mark carries the point's WINNER, not who hit the last
 * shot.
 *
 * Both points below were hit by "player2" — `player` is identical on both —
 * and differ only in `wonByPlayer1`. A harness built on `point.player` would
 * draw the same mark on both rows; this is the regression the fix (and this
 * spec) exists to catch. The viewer here is player1 (`isUserPlayer1: true`),
 * so `won-by-you` should carry the workspace mark and `won-by-opp` the
 * opponent's initials chip.
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
  id: "winner-mark-match",
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

const POINTS: MatchPoint[] = [
  // Hit by player2, but WON by player1 (the viewer) — the mark should be the
  // viewer's own workspace mark.
  point({ id: "won-by-you", player: "player2", wonByPlayer1: true }),
  // Hit by player2 AND won by player2 — the mirrored case, the initials chip.
  point({
    id: "won-by-opp",
    player: "player2",
    wonByPlayer1: false,
    pointNumber: 2,
  }),
];

const root = createRoot(document.getElementById("root")!);

root.render(
  <WorkspaceProvider value={WORKSPACE}>
    <MatchDataProvider match={MATCH} statsResult={null} points={POINTS}>
      <PointList
        allPoints={POINTS}
        visiblePoints={POINTS}
        filters={DEFAULT_FILM_FILTERS}
        onFiltersChange={() => {}}
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

document.documentElement.dataset.hydrated = "true";
