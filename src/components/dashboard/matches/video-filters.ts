import type { MatchPoint } from "@/lib/data/match-points-server";

/* ── Video filter types ──────────────────────────────────────── */

export type VideoFilters = {
  // Score
  sets: number[];
  scoreTypes: Array<"Pressure" | "Breakpoint" | "Set Point" | "Match Point">;
  pointScores: string[];

  // Serve
  servePlayers: Array<"player1" | "player2">;
  serveSides: Array<"Deuce" | "Ad">;
  serveTypes: Array<"First Serve" | "Second Serve">;
  serveSpins: Array<"Flat" | "Slice" | "Kick">;
  serveZones: Array<"Wide" | "Body" | "T">;

  // Return
  returnPlayers: Array<"player1" | "player2">;
  returnSides: Array<"Deuce" | "Ad">;
  returnTypes: Array<"Forehand" | "Backhand">;
  returnSpins: Array<"Topspin" | "Slice">;
  returnZones: Array<"Down the Line" | "Middle" | "Crosscourt">;
  returnContacts: Array<"Inside" | "Neutral" | "Deep">;

  // Result
  resultPlayers: Array<"player1" | "player2">;
  resultZones: Array<"Serve" | "Return" | "Forehand" | "Backhand" | "Volley" | "Overhead">;
  resultOutcomes: Array<"Won" | "Lost" | "Winner" | "Error">;

  // Custom
  customPlayers: Array<"player1" | "player2">;
  customSides: Array<"Deuce" | "Ad">;
  customDirections: Array<"Crosscourt" | "Down the Line" | "Inside Out" | "Inside In">;
  rallyShots: number[];
};

export const DEFAULT_FILTERS: VideoFilters = {
  sets: [],
  scoreTypes: [],
  pointScores: [],

  servePlayers: [],
  serveSides: [],
  serveTypes: [],
  serveSpins: [],
  serveZones: [],

  returnPlayers: [],
  returnSides: [],
  returnTypes: [],
  returnSpins: [],
  returnZones: [],
  returnContacts: [],

  resultPlayers: [],
  resultZones: [],
  resultOutcomes: [],

  customPlayers: [],
  customSides: [],
  customDirections: [],
  rallyShots: [],
};

export type FilterCategory = "score" | "serve" | "return" | "result" | "custom";

/* ── Filter helpers ──────────────────────────────────────────── */

function pointSide(pointNumberInGame: number): "Deuce" | "Ad" {
  return pointNumberInGame % 2 === 1 ? "Deuce" : "Ad";
}

function winnerOrError(resultType: string): "Winner" | "Error" | null {
  const s = (resultType || "").toLowerCase();
  if (!s) return null;
  if (s.includes("winner") || s === "ace" || s.includes("service winner")) return "Winner";
  if (s.includes("error") || s.includes("double fault")) return "Error";
  return null;
}

function resultZoneFromPoint(point: MatchPoint): VideoFilters["resultZones"][number] | null {
  const t = (point.lastShotType || "").toLowerCase();
  if (t.includes("serve")) return "Serve";
  if (t.includes("forehand")) return "Forehand";
  if (t.includes("backhand")) return "Backhand";
  if (t.includes("volley")) return "Volley";
  if (t.includes("overhead")) return "Overhead";
  if (t.includes("return")) return "Return";

  const rt = (point.resultType || "").toLowerCase();
  if (rt === "ace" || rt.includes("service winner") || rt.includes("double fault")) return "Serve";
  return null;
}

function contactBucketFromZone(zone: string | null | undefined): "Inside" | "Neutral" | null {
  if (!zone) return null;
  if (zone === "Down the Line") return "Inside";
  if (zone === "Crosscourt") return "Neutral";
  return null;
}

/* ── Apply filters ───────────────────────────────────────────── */

export function applyFilters(points: MatchPoint[], filters: VideoFilters): MatchPoint[] {
  const has = <T,>(arr: T[]) => arr.length > 0;

  return points.filter((p) => {
    if (has(filters.sets) && !filters.sets.includes(p.setNumber)) return false;

    if (has(filters.scoreTypes)) {
      const pressure = p.isBreakPoint || p.isSetPoint || p.isMatchPoint;
      if (filters.scoreTypes.includes("Pressure") && !pressure) return false;
      if (filters.scoreTypes.includes("Breakpoint") && !p.isBreakPoint) return false;
      if (filters.scoreTypes.includes("Set Point") && !p.isSetPoint) return false;
      if (filters.scoreTypes.includes("Match Point") && !p.isMatchPoint) return false;
    }

    if (has(filters.pointScores) && !filters.pointScores.includes(p.pointScore)) return false;

    if (
      has(filters.servePlayers) ||
      has(filters.serveSides) ||
      has(filters.serveTypes) ||
      has(filters.serveSpins) ||
      has(filters.serveZones)
    ) {
      const server: "player1" | "player2" = p.serverIsPlayer1 ? "player1" : "player2";
      if (has(filters.servePlayers) && !filters.servePlayers.includes(server)) return false;
      const side = pointSide(p.pointNumber);
      if (has(filters.serveSides) && !filters.serveSides.includes(side)) return false;
      const serveType = p.firstShotType as VideoFilters["serveTypes"][number];
      if (has(filters.serveTypes) && !filters.serveTypes.includes(serveType)) return false;
      const spin = p.firstShotSpin as VideoFilters["serveSpins"][number];
      if (has(filters.serveSpins) && !filters.serveSpins.includes(spin)) return false;
      const zone = p.firstShotZone as VideoFilters["serveZones"][number];
      if (has(filters.serveZones) && !filters.serveZones.includes(zone)) return false;
    }

    if (
      has(filters.returnPlayers) ||
      has(filters.returnSides) ||
      has(filters.returnTypes) ||
      has(filters.returnSpins) ||
      has(filters.returnZones) ||
      has(filters.returnContacts)
    ) {
      const receiver: "player1" | "player2" = p.serverIsPlayer1 ? "player2" : "player1";
      if (has(filters.returnPlayers) && !filters.returnPlayers.includes(receiver)) return false;
      const side = pointSide(p.pointNumber);
      if (has(filters.returnSides) && !filters.returnSides.includes(side)) return false;
      const type = p.secondShotType as VideoFilters["returnTypes"][number];
      if (has(filters.returnTypes) && !filters.returnTypes.includes(type)) return false;
      const spin = p.secondShotSpin as VideoFilters["returnSpins"][number];
      if (has(filters.returnSpins) && !filters.returnSpins.includes(spin)) return false;
      const zone = p.secondShotZone as VideoFilters["returnZones"][number];
      if (has(filters.returnZones) && !filters.returnZones.includes(zone)) return false;
      const contact = contactBucketFromZone(p.secondShotZone);
      if (has(filters.returnContacts) && (!contact || !(filters.returnContacts as string[]).includes(contact))) return false;
    }

    if (has(filters.resultPlayers) && !filters.resultPlayers.includes(p.player)) return false;
    const rz = resultZoneFromPoint(p);
    if (has(filters.resultZones) && (!rz || !filters.resultZones.includes(rz))) return false;
    if (has(filters.resultOutcomes)) {
      const outcome = winnerOrError(p.resultType);
      if (filters.resultOutcomes.includes("Winner") || filters.resultOutcomes.includes("Error")) {
        if (!outcome || !filters.resultOutcomes.includes(outcome)) return false;
      }
      if (filters.resultOutcomes.includes("Won") || filters.resultOutcomes.includes("Lost")) {
        const wonBy = p.wonByPlayer1 ? "player1" : "player2";
        const lostBy = wonBy === "player1" ? "player2" : "player1";
        const okWon =
          filters.resultOutcomes.includes("Won") &&
          (!has(filters.resultPlayers) || filters.resultPlayers.includes(wonBy));
        const okLost =
          filters.resultOutcomes.includes("Lost") &&
          (!has(filters.resultPlayers) || filters.resultPlayers.includes(lostBy));
        if (!okWon && !okLost) return false;
      }
    }

    if (has(filters.customPlayers) && !filters.customPlayers.includes(p.player)) return false;
    if (has(filters.customSides)) {
      const side = pointSide(p.pointNumber);
      if (!filters.customSides.includes(side)) return false;
    }
    if (has(filters.customDirections)) {
      const z = p.lastShotZone;
      const map: Record<string, VideoFilters["customDirections"][number]> = {
        "Crosscourt": "Crosscourt",
        "Down the Line": "Down the Line",
      };
      const dir = z ? map[z] : undefined;
      if (!dir || !filters.customDirections.includes(dir)) return false;
    }
    if (has(filters.rallyShots) && !filters.rallyShots.includes(p.rallyLength)) return false;

    return true;
  });
}

/* ── Active filter count ─────────────────────────────────────── */

export function getActiveFilterCount(filters: VideoFilters, category: FilterCategory): number {
  switch (category) {
    case "score":
      return filters.sets.length + filters.scoreTypes.length + filters.pointScores.length;
    case "serve":
      return filters.servePlayers.length + filters.serveSides.length + filters.serveTypes.length + filters.serveSpins.length + filters.serveZones.length;
    case "return":
      return filters.returnPlayers.length + filters.returnSides.length + filters.returnTypes.length + filters.returnSpins.length + filters.returnZones.length + filters.returnContacts.length;
    case "result":
      return filters.resultPlayers.length + filters.resultZones.length + filters.resultOutcomes.length;
    case "custom":
      return filters.customPlayers.length + filters.customSides.length + filters.customDirections.length + filters.rallyShots.length;
  }
}

export function getTotalActiveFilterCount(filters: VideoFilters): number {
  return Object.values(filters).reduce((sum, arr) => sum + arr.length, 0);
}
