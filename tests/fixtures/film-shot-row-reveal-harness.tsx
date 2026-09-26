import { createRoot } from "react-dom/client";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import { PointList } from "@/components/dashboard/matches/match-detail/film/point-list";
import { DEFAULT_FILM_FILTERS } from "@/components/dashboard/matches/match-detail/film/film-filters";
import type { ShotStop } from "@/components/dashboard/matches/match-detail/film/film-shots";
import type { MatchPoint, MatchShot } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";
import type { WorkspaceContextValue } from "@/lib/workspace/types";

/**
 * T9: the shot well's rows reveal with a staggered rise when a point opens.
 *
 * Mounts the real `PointList` in the room's dark tone with one playing point
 * and a ten-shot feed on it, which is what opens the well (`wellOpen` wants a
 * matching `activePointId`, a non-empty slice and an `onSelectShot`). The
 * spec then reads the class and the inline `animationDelay` off the well's
 * `[data-shot-id]` rows: row 1 at 0ms, row 2 at 25ms, and row 10 pinned at
 * the eight-step cap of 200ms rather than running on to 225ms.
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
  id: "shot-row-reveal-match",
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

const POINT: MatchPoint = {
  id: "playing-point",
  pointNumber: 1,
  setNumber: 1,
  gameNumber: 1,
  setScore: "0-0",
  gameScore: "0-0",
  pointScore: "0-0",
  resultType: "Forehand Winner",
  eventType: "Forehand Winner",
  description: "Rally",
  player: "player1",
  wonByPlayer1: true,
  serverIsPlayer1: true,
  isBreakPoint: false,
  isSetPoint: false,
  isMatchPoint: false,
  rallyLength: 10,
  duration: 22,
  videoTime: 0,
  saved: false,
  savedBy: [],
};

/** Ten strokes, one every two film seconds — a long rally, past the cap. */
const STOPS: ShotStop[] = Array.from({ length: 10 }, (_, index) => {
  const shot: MatchShot = {
    id: `shot-${index + 1}`,
    shotNumber: index + 1,
    isPlayer1: index % 2 === 0,
    shotType: index === 0 ? "Serve" : "Forehand",
    spinType: "Flat",
    speedMph: 78,
    zone: "Deuce",
    result: "In",
    videoTime: index * 2,
    bounceVideoTime: null,
    contactX: null,
    contactY: null,
    landingX: null,
    landingY: null,
  };
  return {
    shot,
    point: POINT,
    start: index * 2,
    end: index * 2 + 2,
    bounce: null,
  };
});

const root = createRoot(document.getElementById("root")!);

root.render(
  <WorkspaceProvider value={WORKSPACE}>
    <MatchDataProvider match={MATCH} statsResult={null} points={[POINT]}>
      <PointList
        allPoints={[POINT]}
        visiblePoints={[POINT]}
        filters={DEFAULT_FILM_FILTERS}
        onFiltersChange={() => {}}
        advancedOpen={false}
        onAdvancedOpenChange={() => {}}
        openSections={[]}
        onOpenSectionsChange={() => {}}
        activePointId={POINT.id}
        activeStart={0}
        activeEnd={22}
        onSelect={() => {}}
        onToggleSaved={() => {}}
        tone="dark"
        shotStops={STOPS}
        activeShotId="shot-1"
        onSelectShot={() => {}}
      />
    </MatchDataProvider>
  </WorkspaceProvider>,
);

document.documentElement.dataset.hydrated = "true";
