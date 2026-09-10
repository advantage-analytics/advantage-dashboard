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

function preset(
  entryId: string,
  round: string,
  playerName: string,
  opponentName: string,
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
    eventKind: "dual",
    opponentProgramKey: "rival-state",
    opponentSchool: "Rival State",
  };
}

const s1 = preset("entry-s1", "S1", "Jordan Lee", "Casey Chen");
const s2 = preset("entry-s2", "S2", "Morgan Reed", "Taylor Park");
const s3 = preset("entry-s3", "S3", "Alex Kim", "Robin Shah");
const savedOutcome = { kind: "default", side: "theirs" } as const;
const params = new URLSearchParams(location.search);
const saved = params.get("saved") === "true";

const lineup: LineChoice[] = [
  { slot: "S1", playerName: s1.playerName, state: "open", preset: s1 },
  { slot: "S2", playerName: s2.playerName, state: "open", preset: s2 },
  { slot: "S3", playerName: s3.playerName, state: "result", preset: s3 },
];

createRoot(document.getElementById("root")!).render(
  <ScoreOnlyFlow
    preset={saved ? s3 : s1}
    lineup={lineup}
    outcomes={{ "entry-s3": savedOutcome }}
    eventHref="/dashboard/team/schedule/event-browser"
  />,
);
document.documentElement.dataset.hydrated = "true";
