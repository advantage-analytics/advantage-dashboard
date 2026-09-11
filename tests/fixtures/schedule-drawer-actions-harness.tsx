import { createRoot } from "react-dom/client";
import { StaticSchedule } from "@/components/dashboard/schedule/static/static-schedule";
import {
  canUploadForProgram,
  scheduleCapabilitiesFor,
  type ProgramRole,
  type Workspace,
} from "@/lib/workspace/types";
import type {
  EntryMatch,
  EventDetail,
  EventEntry,
  ProgramEvent,
  ScheduleRow,
} from "@/lib/schedule/types";

const params = new URLSearchParams(location.search);
const role = (params.get("role") ?? "player") as ProgramRole;

declare global {
  interface Window {
    actionCalls: { action: string; input: unknown }[];
    routerPushes: string[];
    routerRefreshes: number;
    failNextDelete?: string;
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

function event(
  id: string,
  kind: ProgramEvent["kind"],
  name: string,
  startsOn: string,
): ProgramEvent {
  return {
    id,
    programId: workspace.id,
    kind,
    name,
    startsOn,
    endsOn: startsOn,
    site: kind === "dual" ? "away" : "neutral",
    surface: "hard",
    host: kind === "tournament" ? "Browser Tennis Center" : null,
    format: { bestOf: 3, adScoring: true },
  };
}

function playedMatch(id: string): EntryMatch {
  return {
    id,
    round: null,
    status: "manual",
    score: { player1: [6, 6], player2: [2, 3] },
    opponentLabels: ["Opponent"],
    hasVideo: false,
  };
}

function entry(
  eventId: string,
  position: number,
  options: { tournament?: boolean; played?: boolean } = {},
): EventEntry {
  const doubles = !options.tournament && position > 6;
  const slot = options.tournament
    ? null
    : `${doubles ? "D" : "S"}${doubles ? position - 6 : position}`;
  return {
    id: `${eventId}-entry-${position}`,
    eventId,
    discipline: doubles ? "doubles" : "singles",
    slot,
    position,
    draw: options.tournament ? "main" : null,
    seed: null,
    playerUserIds: [`player-${position}`],
    playerLabels: [`Player ${position}`],
    opponentLabels: [`Opponent ${position}`],
    opponentSchool: null,
    opponentProgramId: eventId === "dual-open" ? "opponent-program" : null,
    forfeit: null,
    matches: options.played
      ? [
          {
            ...playedMatch(`${eventId}-match-${position}`),
            round: options.tournament ? `R${position}` : null,
          },
        ]
      : [],
    outcomes: [],
  };
}

const openDual = event("dual-open", "dual", "Long Open Dual", "2026-09-30");
const tournament = event(
  "tournament-open",
  "tournament",
  "Browser Invitational",
  "2026-09-20",
);
const settledDual = event("dual-settled", "dual", "Settled Dual", "2026-09-10");

const details: Record<string, EventDetail> = {
  [openDual.id]: {
    event: openDual,
    entries: Array.from({ length: 9 }, (_, index) =>
      entry(openDual.id, index + 1),
    ),
  },
  [tournament.id]: {
    event: tournament,
    // A real tournament may hold a long field. This makes the drawer body
    // scroll while its action remains pinned outside that scroll region.
    entries: Array.from({ length: 18 }, (_, index) =>
      entry(tournament.id, index + 1, { tournament: true, played: true }),
    ),
  },
  [settledDual.id]: {
    event: settledDual,
    entries: Array.from({ length: 9 }, (_, index) =>
      entry(settledDual.id, index + 1, { played: true }),
    ),
  },
};

const rows: ScheduleRow[] = [
  {
    id: openDual.id,
    kind: "dual",
    name: openDual.name,
    startsOn: openDual.startsOn,
    endsOn: openDual.endsOn,
    site: openDual.site,
    entryCount: 9,
    playedCount: 0,
    workingCount: 0,
    teamScore: null,
  },
  {
    id: tournament.id,
    kind: "tournament",
    name: tournament.name,
    startsOn: tournament.startsOn,
    endsOn: tournament.endsOn,
    site: tournament.site,
    entryCount: 18,
    playedCount: 18,
    workingCount: 0,
    teamScore: null,
  },
  {
    id: settledDual.id,
    kind: "dual",
    name: settledDual.name,
    startsOn: settledDual.startsOn,
    endsOn: settledDual.endsOn,
    site: settledDual.site,
    entryCount: 9,
    playedCount: 9,
    workingCount: 0,
    teamScore: { us: 9, them: 0 },
  },
];

// The harness intentionally uses the real components but not the app's CSS
// bundle. These few structural rules make height and overflow measurable in
// the browser without restating any product colours or button treatment.
document.head.insertAdjacentHTML(
  "beforeend",
  `<style>
    body { margin: 0; font-family: Inter, system-ui, sans-serif; }
    [data-schedule-drawer] { position: fixed; inset: 0 0 auto auto; width: 340px; height: 360px; overflow: hidden; }
    [data-schedule-drawer] > div { display: flex; height: 100%; flex-direction: column; }
    [data-schedule-drawer] > div > div:first-child { flex: 0 0 44px; }
    [data-schedule-drawer-body] { display: flex; min-height: 0; flex: 1 1 0%; flex-direction: column; overflow-y: auto; padding: 12px 22px; }
    [data-schedule-drawer-body] [class~="h-9"] { min-height: 36px; }
    [data-schedule-drawer-footer] { flex: 0 0 auto; padding: 0 22px 22px; }
    [data-schedule-drawer-footer] > a { display: flex; width: 100%; height: 36px; }
  </style>`,
);

document.documentElement.dataset.uploadEntitled = String(
  canUploadForProgram(workspace),
);

createRoot(document.getElementById("root")!).render(
  <StaticSchedule
    schedule={{ rows, details }}
    season={{
      form: ["won"],
      dualRecord: { won: 1, lost: 0 },
      lines: { analyzed: 27, total: 36 },
    }}
    today="2026-09-01"
    capabilities={scheduleCapabilitiesFor(workspace)}
    canAddOwnMatch={canUploadForProgram(workspace)}
    programName={workspace.name}
    opponents={{
      "opponent-program": {
        id: "opponent-program",
        conference: "Browser Conference",
        division: "I",
      },
    }}
    initialSelectedId={null}
  />,
);
document.documentElement.dataset.hydrated = "true";
