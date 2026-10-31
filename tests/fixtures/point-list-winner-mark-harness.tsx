import { createRoot } from "react-dom/client";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import { PointList } from "@/components/dashboard/matches/match-detail/film/point-list";
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

const TEAM_CREST = "data:image/gif;base64,R0lGODlhAQABAAAAACw=#team";
const OPPONENT_CREST = "data:image/gif;base64,R0lGODlhAQABAAAAACw=#opponent";

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
    recordingSource: null,
    workspaceHintDoneAt: null,
    activityHintDoneAt: null,
    sampleTourDoneAt: null,
    firstReportTourDoneAt: null,
    firstReportSeenAt: null,
    firstMatchFeedbackDoneAt: null,
    lastSignInAt: null,
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
    pointScore: "15-0",
    pointScoreRaw: "15-0",
  }),
  // A frozen score reading (`score_frozen`): the loader defaults the columns
  // to "0-0" and keeps the nulls in the raw fields; the derivation guessed
  // the winner. The list draws "—" and says the winner is estimated.
  point({
    id: "frozen",
    pointNumber: 3,
    gameNumber: 2,
    gameScore: "0-0",
    gameScoreRaw: null,
    pointScore: "0-0",
    pointScoreRaw: null,
    winnerGuessed: true,
    scoreFrozen: true,
  }),
  // A later game whose score did read, so the game-score column is real.
  point({ id: "read", pointNumber: 4, gameNumber: 3, gameScore: "1-1" }),
];

const root = createRoot(document.getElementById("root")!);

// `?crests` gives each seat a team crest; `?public` drops the workspace, as the
// share page has none; `?flipped` makes the viewer seat two.
const query = new URLSearchParams(window.location.search);
const match: Match = {
  ...MATCH,
  isUserPlayer1: !query.has("flipped"),
  player1: {
    ...MATCH.player1,
    crestUrl: query.has("crests") ? TEAM_CREST : null,
  },
  player2: {
    ...MATCH.player2,
    crestUrl: query.has("crests") ? OPPONENT_CREST : null,
  },
};
const list = (
  <MatchDataProvider match={match} statsResult={null} points={POINTS}>
    <PointList
      allPoints={POINTS}
      visiblePoints={POINTS}
      activePointId={null}
      activeStart={0}
      activeEnd={0}
      onSelect={() => {}}
      onToggleSaved={() => {}}
    />
  </MatchDataProvider>
);

root.render(
  query.has("public") ? (
    list
  ) : (
    <WorkspaceProvider value={WORKSPACE}>{list}</WorkspaceProvider>
  ),
);

document.documentElement.dataset.hydrated = "true";
