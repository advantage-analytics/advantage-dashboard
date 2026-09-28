import { createRoot } from "react-dom/client";
import { ScoreOnlyFlow } from "@/components/dashboard/schedule/score-only-flow";
import type { RoundSeed } from "@/lib/schedule/score-seed";
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
// A tournament names (or renames) every round's opponent in its score row,
// so it reads the same roster — the entry's school's, "Rival State" — and can
// move to another directory school's ("Ridgeline University") from its
// School field. `?noschool=true` opens the entry with no school at all.
if (unnamed || tournament) {
  window.opponentRoster = ["Casey Chen", "Taylor Park", "Sam Ortiz"];
  window.opponentRosterByKey = {
    "rival-state": ["Casey Chen", "Taylor Park", "Sam Ortiz"],
    ridgeline: ["Lee Park", "Ana Ruiz"],
  };
}
const noSchool = params.get("noschool") === "true";
// Our program's team, for the School search's team filter. Absent = no filter.
const ourTeam =
  params.get("team") === "mens" || params.get("team") === "womens"
    ? (params.get("team") as "mens" | "womens")
    : null;

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
      outcomes={{
        "entry-s3": { kind: "default", side: "theirs" },
        // `?forfeit=true`: S2's lineup says "No player" on their side — the
        // note that routes to Edit dual.
        ...(params.get("forfeit") === "true"
          ? {
              "entry-s2": { kind: "forfeit" as const, side: "theirs" as const },
            }
          : {}),
      }}
      eventHref="/dashboard/team/schedule/event-browser"
      canUpload={canUpload}
    />
  );
}

/**
 * A tournament: two entries listed by position, each preset at a round. The
 * second has a saved outcome at QF, the round `?saved=true` opens on — the
 * page would have seeded that from `?round=QF`.
 *
 * `?recorded=true` gives the first entry a played R32 (6-3 7-6(4), against
 * Casey Chen) and opens it at R16 instead, the way `?round=R16` would: the
 * Round control's way back to a recorded round, seeded from `roundSeeds` the
 * way the page builds them. R16 holds no match, so — as `presetFor` answers
 * for a tournament — it opens with NO opponent, never R32's.
 */
function TournamentFlow() {
  const recorded = params.get("recorded") === "true";
  const t1 = {
    ...preset(
      "entry-t1",
      recorded ? "R16" : "R32",
      "Jordan Lee",
      "",
      "tournament",
    ),
    ...(noSchool ? { opponentProgramKey: null, opponentSchool: null } : {}),
  };
  const t2 = preset("entry-t2", "QF", "Alex Kim", "Robin Shah", "tournament");
  const lineup: LineChoice[] = [
    { slot: "#1", playerName: t1.playerName, state: "open", preset: t1 },
    { slot: "#2", playerName: t2.playerName, state: "result", preset: t2 },
  ];
  const roundSeeds: Record<string, RoundSeed> = {
    "entry-t1": {
      matchId: null,
      score: null,
      ending: null,
      opponentName: t1.opponentName,
    },
    "entry-t2": {
      matchId: null,
      score: null,
      ending: null,
      // The page's blank seed: a round with no match names nobody.
      opponentName: "",
    },
    ...(recorded
      ? {
          "entry-t1/R32": {
            matchId: "match-t1-r32",
            score: {
              player1: [6, 7],
              player2: [3, 6],
              player1_tiebreaks: [null, null],
              player2_tiebreaks: [null, 4],
            },
            ending: null,
            opponentName: "Casey Chen",
          },
        }
      : {}),
  };
  return (
    <ScoreOnlyFlow
      preset={saved ? t2 : t1}
      lineup={lineup}
      outcomes={{ "entry-t2/QF": { kind: "withdrawal", side: "theirs" } }}
      recordedRounds={{
        "entry-t2": ["R32", "QF"],
        ...(recorded ? { "entry-t1": ["R32"] } : {}),
      }}
      roundSeeds={roundSeeds}
      eventHref="/dashboard/team/schedule/event-browser"
      canUpload={canUpload}
      ourTeam={ourTeam}
    />
  );
}

createRoot(document.getElementById("root")!).render(
  tournament ? <TournamentFlow /> : <DualFlow />,
);
document.documentElement.dataset.hydrated = "true";
