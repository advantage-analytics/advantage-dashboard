import { createRoot } from "react-dom/client";
import { ScoreOnlyFlow } from "@/components/dashboard/schedule/score-only-flow";
import type {
  EventPreset,
  LineChoice,
} from "@/components/dashboard/matches/new-match-wizard/types";

declare global {
  interface Window {
    actionCalls: { action: string; input: unknown }[];
    routerPushes: string[];
  }
}

window.actionCalls = [];
window.routerPushes = [];
window.routerReplaces = [];

function preset(
  entryId: string,
  round: string,
  playerName: string,
  opponentName: string,
  eventKind: EventPreset["eventKind"] = "dual",
): EventPreset {
  return {
    entryId,
    eventId: "event-browser",
    eventName: "Rival State",
    matchId: null,
    round,
    playerName,
    playerUserId: `${entryId}-player`,
    opponentName,
    date: "2026-09-10",
    surface: "hard",
    bestOf: 3,
    adScoring: true,
    score: null,
    supportsVideo: true,
    eventHref: "/dashboard/team/schedule/event-browser",
    site: "away",
    eventKind,
    opponentProgramKey: "rival-state",
    opponentSchool: "Rival State",
  };
}

const params = new URLSearchParams(location.search);
const saved = params.get("saved") === "true";
const tournament = params.get("kind") === "tournament";
// The viewer's upload grant, which the page reads off the upload policy.
const canUpload = params.get("upload") !== "false";

// `?unnamed=true`: the lineup left S1's and S2's opponents blank, so the
// score rows name them — against this saved roster.
const unnamed = params.get("unnamed") === "true";
if (unnamed) {
  window.opponentRoster = ["Casey Chen", "Taylor Park", "Sam Ortiz"];
}

function DualFlow() {
  const s1 = {
    ...preset("entry-s1", "S1", "Jordan Lee", unnamed ? "" : "Casey Chen"),
    discipline: "singles" as const,
  };
  // A doubles line: the one the vision pipeline refuses, naming two opponents.
  const s2 = {
    ...preset(
      "entry-s2",
      "S2",
      "Morgan Reed / Drew Park",
      unnamed ? "" : "Taylor Park / Sam Ortiz",
    ),
    discipline: "doubles" as const,
    supportsVideo: false,
  };
  const s3 = {
    ...preset("entry-s3", "S3", "Alex Kim", "Robin Shah"),
    discipline: "singles" as const,
  };
  // Another doubles line whose pair is already named — "on D2" in the picker.
  const d2 = {
    ...preset("entry-d2", "D2", "Riley Chen / Pat Lane", "Sam Ortiz / Jo Park"),
    discipline: "doubles" as const,
    supportsVideo: false,
  };
  const lineup: LineChoice[] = [
    { slot: "S1", playerName: s1.playerName, state: "open", preset: s1 },
    { slot: "S2", playerName: s2.playerName, state: "open", preset: s2 },
    {
      slot: "S3",
      playerName: s3.playerName,
      // `?open3=true` leaves a third line open, so two saves in a row still
      // have somewhere to walk to.
      state: params.get("open3") === "true" ? "open" : "result",
      preset: s3,
    },
    ...(unnamed
      ? [
          {
            slot: "D2",
            playerName: d2.playerName,
            state: "result" as const,
            preset: d2,
          },
        ]
      : []),
  ];
  return (
    <ScoreOnlyFlow
      preset={saved ? s3 : s1}
      lineup={lineup}
      outcomes={{ "entry-s3": { kind: "default", side: "theirs" } }}
      eventHref="/dashboard/team/schedule/event-browser"
      canUpload={canUpload}
    />
  );
}

/**
 * A tournament: two entries listed by position, each preset at a round. The
 * second has a saved outcome at QF, the round `?saved=true` opens on — the
 * page would have seeded that from `?round=QF`.
 */
function TournamentFlow() {
  const t1 = preset("entry-t1", "R32", "Jordan Lee", "", "tournament");
  const t2 = preset("entry-t2", "QF", "Alex Kim", "Robin Shah", "tournament");
  const lineup: LineChoice[] = [
    { slot: "#1", playerName: t1.playerName, state: "open", preset: t1 },
    { slot: "#2", playerName: t2.playerName, state: "result", preset: t2 },
  ];
  return (
    <ScoreOnlyFlow
      preset={saved ? t2 : t1}
      lineup={lineup}
      outcomes={{ "entry-t2/QF": { kind: "withdrawal", side: "theirs" } }}
      recordedRounds={{ "entry-t2": ["R32", "QF"] }}
      eventHref="/dashboard/team/schedule/event-browser"
      canUpload={canUpload}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  tournament ? <TournamentFlow /> : <DualFlow />,
);
document.documentElement.dataset.hydrated = "true";
