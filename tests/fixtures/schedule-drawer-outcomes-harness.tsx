import { createRoot } from "react-dom/client";
import { EventDrawer } from "@/components/dashboard/schedule/static/event-drawer";
import {
  scheduleCapabilitiesFor,
  type ProgramRole,
  type Workspace,
} from "@/lib/workspace/types";
import { OUTCOME_ENTRIES } from "./schedule-dual-outcomes-data";
import {
  detail as tournamentDetail,
  entry as tournamentEntry,
} from "./schedule-tournament-outcomes-data";
import type { EventDetail, EventEntry } from "@/lib/schedule/types";

const params = new URLSearchParams(location.search);
const role = (params.get("role") ?? "owner") as ProgramRole;
const kind = params.get("kind") === "tournament" ? "tournament" : "dual";
const cleared = params.get("cleared") === "true";

declare global {
  interface Window {
    actionCalls: { action: string; input: unknown }[];
    routerPushes: string[];
    routerRefreshes: number;
  }
}

window.actionCalls = [];
window.routerPushes = [];
window.routerRefreshes = 0;

const workspace: Workspace = {
  id: "browser-program",
  kind: "team",
  name: "Browser University",
  team: "mens",
  orgType: "college",
  timeZone: "America/Los_Angeles",
  role,
  mark: "BU",
  canSubmitVideo: true,
  playersCanUpload: true,
  memberUploadEnabled: true,
  uploadPolicy: "everyone",
  myPlayerId: role === "player" ? "player-browser" : null,
};

function cloneEntry(entry: EventEntry): EventEntry {
  return {
    ...entry,
    matches: entry.matches.map((match) => ({ ...match })),
    outcomes: entry.outcomes?.map((outcome) => ({ ...outcome })),
  };
}

function dualDetail(): EventDetail {
  const entries = OUTCOME_ENTRIES.map(cloneEntry);
  if (cleared) {
    const openLine = entries.find((entry) => entry.slot === "S6");
    if (openLine) openLine.outcomes = [];
  }

  return {
    event: {
      id: "dual-outcomes",
      programId: workspace.id,
      kind: "dual",
      name: "Meridian State",
      startsOn: "2026-09-10",
      endsOn: "2026-09-10",
      site: "home",
      surface: "hard",
      host: null,
      format: { bestOf: 3, adScoring: false },
    },
    entries,
  };
}

function tournament(): EventDetail {
  const entry = cloneEntry(tournamentEntry);
  if (cleared) {
    entry.outcomes = entry.outcomes?.filter(
      (outcome) => outcome.round !== "QF",
    );
  }
  return { ...tournamentDetail, entries: [entry] };
}

const detail = kind === "dual" ? dualDetail() : tournament();

createRoot(document.getElementById("root")!).render(
  <EventDrawer
    detail={detail}
    opponent={null}
    index={0}
    total={1}
    onStep={() => {}}
    onClose={() => {}}
    closing={false}
    autoFocus={false}
    onClosed={() => {}}
    onDeleted={() => {}}
    capabilities={scheduleCapabilitiesFor(workspace)}
  />,
);
document.documentElement.dataset.hydrated = "true";
