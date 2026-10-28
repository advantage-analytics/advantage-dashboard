import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import { MatchDataProvider } from "@/components/dashboard/matches/match-data-provider";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import { PointList } from "@/components/dashboard/matches/match-detail/film/point-list";
import {
  SelfReviewContext,
  type SelfReviewContextValue,
} from "@/components/dashboard/matches/match-detail/self-review/self-review-context";
import { FixModeNotice } from "@/components/dashboard/matches/match-detail/self-review/fix-mode-notice";
import {
  readingOf,
  sameReading,
  selfReviewStateFrom,
  type PointReading,
} from "@/lib/data/self-review";
import type { MatchPoint } from "@/lib/data/match-points-server";
import type { Match } from "@/lib/data/types";
import type { WorkspaceContextValue } from "@/lib/workspace/types";

/**
 * Fix points, offline (Advantage Review step 2): the real `PointList` and
 * `FixModeNotice` under a self-review context that keeps its drafts in
 * component state, as `SelfReviewProvider` does — minus the server action
 * and the router, which a bare browser bundle cannot load. One point is
 * already edited by the viewer ("saved"), one carries a reviewer flag, so the
 * spec can see the leading group, the struck original and the inline form.
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
  id: "self-review-match",
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
  point({ id: "plain", videoTime: 10 }),
  point({
    id: "flagged",
    pointNumber: 2,
    videoTime: 20,
    resultType: "Backhand Unforced Error",
    wonByPlayer1: false,
    reviewFlags: ["ending_suspect_line"],
  }),
  // Saved by the viewer: stored now as player 1's forehand winner, read
  // first as player 2's backhand winner.
  point({ id: "edited", pointNumber: 3, gameNumber: 2, videoTime: 30 }),
];

const STATE = selfReviewStateFrom({
  can_fix: true,
  edits: [
    {
      point_id: "edited",
      winner: "p1",
      ending: "winner",
      last_stroke: "forehand",
      seed: { winner: "p2", ending: "winner", last_stroke: "backhand" },
      edited_by: "viewer-1",
    },
  ],
  editors: [],
});

function Harness() {
  const fixing = new URLSearchParams(location.search).get("mode") !== "view";
  const [drafts, setDrafts] = useState(new Map<string, PointReading>());
  const [openPointId, setOpenPointId] = useState<string | null>(null);
  const value = useMemo<SelfReviewContextValue>(() => {
    const edits = new Map(STATE.edits.map((e) => [e.pointId, e]));
    const stored = (p: MatchPoint) =>
      edits.get(p.id)?.current ?? readingOf(p.resultType, p.wonByPlayer1);
    return {
      state: STATE,
      viewerId: "viewer-1",
      locked: false,
      fixing,
      start: () => {},
      cancel: () => {},
      drafts,
      setDraft: (p, reading) =>
        setDrafts((current) => {
          const next = new Map(current);
          if (!reading || sameReading(reading, stored(p))) next.delete(p.id);
          else next.set(p.id, reading);
          return next;
        }),
      openPointId,
      setOpenPointId,
      editOf: (id) => edits.get(id),
      readingFor: (p) => drafts.get(p.id) ?? stored(p),
      originalFor: (p) =>
        edits.get(p.id)?.original ?? readingOf(p.resultType, p.wonByPlayer1),
      pendingCount: drafts.size,
      save: () => {},
      saving: false,
      error: null,
      saved: null,
      dismissSaved: () => {},
    };
  }, [fixing, drafts, openPointId]);

  return (
    <SelfReviewContext value={value}>
      <div
        style={{
          width: 360,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <FixModeNotice />
        <div style={{ height: 640, display: "flex", flexDirection: "column" }}>
          <PointList
            allPoints={POINTS}
            visiblePoints={POINTS}
            activePointId={null}
            activeStart={0}
            activeEnd={0}
            onSelect={() => {}}
            onToggleSaved={() => {}}
          />
        </div>
      </div>
    </SelfReviewContext>
  );
}

createRoot(document.getElementById("root")!).render(
  <WorkspaceProvider value={WORKSPACE}>
    <MatchDataProvider match={MATCH} statsResult={null} points={POINTS}>
      <Harness />
    </MatchDataProvider>
  </WorkspaceProvider>,
);

document.documentElement.dataset.hydrated = "true";
