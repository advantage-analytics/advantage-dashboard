import { createRoot } from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import type { WorkspaceContextValue } from "@/lib/workspace/types";
import { MatchesPageContent } from "@/components/dashboard/matches/matches-page-content";
import { MatchDrawerSlot } from "@/components/dashboard/matches/match-drawer-slot";
import type { DisplayMatch } from "@/lib/data/matches-list-types";
import type { DraftRowData } from "@/components/dashboard/matches/draft-row";

/**
 * The Matches page's client half on fixed rows, laid out as the route lays it
 * out: the page column, then the slot the drawer portals into.
 *
 * - `m-scored` — a scored match with a video draft (`d-folded`) targeting it:
 *   the draft folds onto that row rather than listing a second one.
 * - `m-plain` — an older scored match, no draft.
 * - `d-new` — a draft that will create a match; it lists as its own row.
 *
 * `?scope=team` mounts the team table. Everything else on the URL
 * (`?match=`, `?draft=`) reaches the page through the navigation mock's
 * `useSearchParams()`, as it would from Next.
 */

const scope =
  new URLSearchParams(window.location.search).get("scope") === "team"
    ? "team"
    : "personal";

const WORKSPACE: WorkspaceContextValue = {
  active: {
    id: scope === "team" ? "program-1" : "viewer-1",
    kind: scope,
    name: scope === "team" ? "Team" : "Personal",
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
    onboardedAt: null,
  },
};

function match(
  id: string,
  opponent: string,
  date: string,
  winner: "player1" | "player2",
): DisplayMatch {
  return {
    id,
    canManage: true,
    tournamentName: "Fall Classic",
    date,
    matchType: "Singles",
    player1: { name: "Dana Brooks", id: "viewer-1", profileId: null },
    player2: { name: opponent },
    score: {
      sets: [
        { player1: 6, player2: 4 },
        { player1: 6, player2: 3 },
      ],
      winner,
    },
  };
}

const MATCHES: DisplayMatch[] = [
  match("m-scored", "Avery Stone", "2026-09-20", "player1"),
  match("m-plain", "Riley Chen", "2026-09-10", "player2"),
];

function draft(
  id: string,
  playerName: string,
  updatedAt: string,
  matchId: string | null,
): DraftRowData {
  return {
    id,
    playerName,
    eventLabel: null,
    stepIndex: 2,
    stepCount: 4,
    fileName: "match.mp4",
    updatedAt,
    matchId,
  };
}

const DRAFTS: DraftRowData[] = [
  draft("d-new", "Jordan Park", "2026-09-22T10:00:00Z", null),
  draft("d-folded", "Avery Stone", "2026-09-21T10:00:00Z", "m-scored"),
];

createRoot(document.getElementById("root")!).render(
  <TooltipProvider>
    <WorkspaceProvider value={WORKSPACE}>
      <div className="flex w-full">
        <div className="flex min-w-0 flex-1 flex-col">
          <MatchesPageContent matches={MATCHES} drafts={DRAFTS} scope={scope} />
        </div>
        <MatchDrawerSlot />
      </div>
    </WorkspaceProvider>
  </TooltipProvider>,
);
document.documentElement.dataset.hydrated = "true";
