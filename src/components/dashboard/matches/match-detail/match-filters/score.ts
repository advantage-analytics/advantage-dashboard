import type { MatchPoint } from "@/lib/data/match-points-server";

/**
 * Point-score reading for the match filters — pure, no React.
 *
 * Every score here is SERVER-FIRST, the way `points.point_score` has always
 * been stored ("30-40" is server 30, returner 40; see
 * `services/splitstep/derivation/scores.ts`) and the score BEFORE the point
 * was played.
 */

/* ── Formerly `film/filters/types.ts`, before the old film filter model was
 * deleted (T8) ──────────────────────────────────────────────────────────── */

function scoreParts(
  point: Pick<MatchPoint, "pointScore">,
): [string, string] | null {
  const parts = (point.pointScore ?? "").split("-");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

/** 40-40 (and the parser's rarer AD-AD) — nobody is a point from the game. */
export function isDeucePoint(point: Pick<MatchPoint, "pointScore">): boolean {
  const parts = scoreParts(point);
  if (!parts) return false;
  const [a, b] = parts;
  return (a === "40" && b === "40") || (a === "AD" && b === "AD");
}

/** Somebody wins the game with this point: an advantage, or exactly one 40. */
export function isGamePoint(point: Pick<MatchPoint, "pointScore">): boolean {
  const parts = scoreParts(point);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === "AD" && b === "AD") return false;
  if (a === "AD" || b === "AD") return true;
  return (a === "40") !== (b === "40");
}

const RUNG: Record<string, number> = {
  "0": 0,
  "15": 1,
  "30": 2,
  "40": 3,
  AD: 4,
};

/**
 * Which service court a point was played from.
 *
 * Tennis alternates courts every point of a game, starting in the deuce
 * court, so with a real point score the answer is the parity of the rungs
 * (0-0, 15-15, 30-0 and 40-40 are deuce; 15-0, 30-15, AD-40 are ad). Without
 * one, the point's index within its game gives the same parity — a let or a
 * replayed point would shift it, which is the accepted approximation.
 */
export function courtSideOf(
  point: Pick<MatchPoint, "pointScore">,
  indexInGame: number,
  hasPointScore: boolean,
): "deuce" | "ad" {
  if (hasPointScore) {
    const parts = point.pointScore
      .split("-")
      .map((p) => p.trim().toUpperCase());
    const a = RUNG[parts[0] ?? ""];
    const b = RUNG[parts[1] ?? ""];
    if (a !== undefined && b !== undefined) {
      return (a + b) % 2 === 0 ? "deuce" : "ad";
    }
  }
  return indexInGame % 2 === 0 ? "deuce" : "ad";
}

type CourtSidePoints = readonly Pick<
  MatchPoint,
  "pointScore" | "setNumber" | "gameNumber"
>[];

// Keyed by array identity, never by content: every caller passes the same
// whole-match array (`applyMatchFilters`, `optionAvailability`, and every
// `FilmCut` a card composes over it), so a card that lays several cuts over
// one match — `head-to-head-card.tsx`'s `counts`, up to three per row — walks
// this O(n) derivation once instead of once per cut. The match array is never
// mutated in place, only replaced, so a stale entry is never observable.
const courtSidesCache = new WeakMap<CourtSidePoints, ("deuce" | "ad")[]>();

/**
 * The service court of every point, index-aligned with `points` (which must be
 * in match order — the running index within a game depends on it). The same
 * walk `applyMatchFilters` makes for the court axis: the score's rung parity
 * when the match has real point scores at all, else the point's index in its
 * game.
 */
export function courtSidesOf(points: CourtSidePoints): ("deuce" | "ad")[] {
  const cached = courtSidesCache.get(points);
  if (cached) return cached;
  const hasPointScore = points.some((p) => p.pointScore !== "0-0");
  let gameKey = "";
  let indexInGame = 0;
  const courts = points.map((point) => {
    const key = `${point.setNumber}-${point.gameNumber}`;
    if (key !== gameKey) {
      gameKey = key;
      indexInGame = 0;
    } else {
      indexInGame += 1;
    }
    return courtSideOf(point, indexInGame, hasPointScore);
  });
  courtSidesCache.set(points, courts);
  return courts;
}

/* ── The Points grid ────────────────────────────────────────────────────── */

/**
 * The Score › Points grid, server-first, in the order the panel lays it out.
 * Only real game scores: "0-Ad", "Ad-Ad" and tiebreak counts are not options.
 */
export const POINT_SCORE_OPTIONS = [
  "0-0",
  "15-0",
  "30-0",
  "40-0",
  "0-15",
  "15-15",
  "30-15",
  "40-15",
  "0-30",
  "15-30",
  "30-30",
  "40-30",
  "0-40",
  "15-40",
  "30-40",
  "40-40",
  "Ad-40",
  "40-Ad",
] as const;

export type PointScoreOption = (typeof POINT_SCORE_OPTIONS)[number];

const GRID = new Set<string>(POINT_SCORE_OPTIONS);

const RUNG_LABEL: Record<string, string> = {
  "0": "0",
  "15": "15",
  "30": "30",
  "40": "40",
  AD: "Ad",
};

/**
 * A raw `points.point_score` as a Points-grid value, or null when it is not
 * one. Trims, tolerates spaces around the dash, and spells the advantage "Ad"
 * whatever its case ("AD-40", "ad - 40" → "Ad-40").
 *
 * Never a match — null:
 *   - an unknown score (`null`/`undefined`/empty). `MatchPoint.pointScore` is
 *     defaulted to "0-0", so this must be given `pointScoreRaw`, never it;
 *   - a tiebreak count — any number outside 0/15/30/40 ("5-1", "3-3");
 *   - any point of a 6-6 game, which is the tiebreak even when its first
 *     point's count happens to read "0-0" (`gameScore`, when given);
 *   - a pair the grid does not offer ("0-Ad", "Ad-Ad").
 */
export function normalizePointScore(
  raw: string | null | undefined,
  gameScore?: string | null,
): PointScoreOption | null {
  if (typeof raw !== "string") return null;
  if (isTiebreakGame(gameScore)) return null;
  const parts = raw.split("-").map((p) => p.trim().toUpperCase());
  if (parts.length !== 2) return null;
  const a = RUNG_LABEL[parts[0]];
  const b = RUNG_LABEL[parts[1]];
  if (a === undefined || b === undefined) return null;
  const value = `${a}-${b}`;
  return GRID.has(value) ? (value as PointScoreOption) : null;
}

function isTiebreakGame(gameScore: string | null | undefined): boolean {
  if (typeof gameScore !== "string") return false;
  return gameScore.replace(/\s+/g, "") === "6-6";
}
