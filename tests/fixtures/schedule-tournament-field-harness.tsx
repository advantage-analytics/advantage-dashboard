import { createRoot } from "react-dom/client";
import { NewTournamentFlow } from "@/components/dashboard/schedule/static/new-tournament-flow";
import type { LadderPlayer } from "@/lib/data/roster-server";
import type { EventDetail } from "@/lib/schedule/types";

declare global {
  interface Window {
    actionCalls: { action: string; input: unknown }[];
    routerPushes: string[];
  }
}

const roster: LadderPlayer[] = [
  { userId: "athlete-ana", name: "Ana Vasquez", ladderPosition: 1 },
  { userId: "athlete-ben", name: "Ben Cole", ladderPosition: 2 },
];

const event: EventDetail = {
  event: {
    id: "event-browser",
    programId: "program-browser",
    kind: "tournament",
    name: "Saved Fall Classic",
    startsOn: "2026-09-12",
    endsOn: "2026-09-13",
    site: "neutral",
    surface: "Hard",
    host: null,
    format: { bestOf: 3, adScoring: true },
  },
  entries: [
    {
      id: "entry-ana",
      eventId: "event-browser",
      discipline: "singles",
      slot: null,
      position: 2,
      draw: "Main draw",
      seed: 3,
      playerUserIds: ["athlete-ana"],
      playerLabels: ["Ana Saved"],
      opponentLabels: [],
      opponentSchool: null,
      forfeit: null,
      matches: [
        {
          id: "match-ana",
          round: "R32",
          status: "imported",
          score: { player1: [6, 6], player2: [2, 3] },
          opponentLabels: ["Opponent One"],
          hasVideo: false,
        },
      ],
      outcomes: [],
    },
    {
      id: "entry-ben",
      eventId: "event-browser",
      discipline: "singles",
      slot: null,
      position: 4,
      draw: "Qualifying",
      seed: null,
      playerUserIds: ["athlete-ben"],
      playerLabels: ["Ben Cole"],
      opponentLabels: [],
      opponentSchool: null,
      forfeit: null,
      matches: [],
      outcomes: [],
    },
    {
      id: "doubles-carry",
      eventId: "event-browser",
      discipline: "doubles",
      slot: null,
      position: 8,
      draw: "Consolation",
      seed: null,
      playerUserIds: ["former-1", "former-2"],
      playerLabels: ["Former One", "Former Two"],
      opponentLabels: [],
      opponentSchool: null,
      forfeit: null,
      matches: [],
      outcomes: [],
    },
  ],
};

window.actionCalls = [];
window.routerPushes = [];

const editing = new URLSearchParams(location.search).get("mode") === "edit";
createRoot(document.getElementById("root")!).render(
  editing ? (
    <NewTournamentFlow
      mode="edit"
      event={event}
      roster={roster}
      defaultSurface="Clay"
    />
  ) : (
    <NewTournamentFlow roster={roster} defaultSurface="Hard" />
  ),
);
document.documentElement.dataset.hydrated = "true";
