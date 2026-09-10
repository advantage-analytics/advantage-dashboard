import { createRoot } from "react-dom/client";
import { LineRow } from "@/components/dashboard/schedule/line-row";
import type { EventEntry } from "@/lib/schedule/types";

declare global {
  interface Window {
    actionCalls: { action: string; input: unknown }[];
  }
}

window.actionCalls = [];
const params = new URLSearchParams(location.search);
const round = params.get("round");
const saved = params.get("saved") === "true";
const legacy = params.get("legacy") === "true";
const entry: EventEntry = {
  id: "entry-browser",
  eventId: "event-browser",
  discipline: "singles",
  slot: round ? null : "S1",
  position: 1,
  draw: round ? "main" : null,
  seed: null,
  playerUserIds: ["player-browser"],
  playerLabels: ["Jordan Lee"],
  opponentLabels: ["Casey Chen"],
  opponentSchool: null,
  forfeit: legacy ? "ours" : null,
  matches: [],
  outcomes: saved
    ? [
        {
          id: "outcome-browser",
          round,
          kind: "default",
          side: "theirs",
          actorUserId: "staff-browser",
          recordedAt: "2026-09-10T00:00:00Z",
        },
      ]
    : [],
};

createRoot(document.getElementById("root")!).render(
  <LineRow
    entry={entry}
    match={null}
    label={round ?? "S1"}
    round={round}
    canEdit
    columns="grid-cols-[56px_52px_minmax(0,1fr)_120px_130px]"
    last
  />,
);
document.documentElement.dataset.hydrated = "true";
