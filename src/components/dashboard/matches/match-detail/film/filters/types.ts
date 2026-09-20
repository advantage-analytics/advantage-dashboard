import type { MatchPoint } from "@/lib/data/match-points-server";
import type { MatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";

/**
 * The film filter model: the cut types, the predicates and the sentence that
 * describes a cut. Pure logic, no React — the report tab's panel, the quick
 * menu, the fullscreen room and the in-shell Video tab all apply ONE
 * `FilmFilters` value. `film-filters.tsx` re-exports everything here.
 */

/* ── State ──────────────────────────────────────────────────────────────── */

export type PressureCut = "any" | "break" | "set-match";
export type BallCut = "any" | "first" | "second";
export type WingCut = "any" | "forehand" | "backhand";
export type OutcomeCut = "any" | "you" | "opp";

export type ScoreKey = "deuce" | "game";
export type ServeKey = "ace" | "double-fault" | "t" | "body" | "wide";
export type ReturnKey = "in-play" | "winner" | "error";
export type ResultKey = "winner" | "forced" | "unforced" | "long";

/*
 * The fullscreen film room's axes (Film Room Fullscreen handoff, F4 + F5).
 * Additive: the report tab's panel above knows nothing about them, and both
 * surfaces apply ONE `FilmFilters` value, so a cut made in either place is
 * the cut ↑↓ walks in both.
 */
export type ServerCut = "any" | "you" | "opp";
export type CourtCut = "any" | "deuce" | "ad";
/** "Point ended with" — one OR group across serve and rally endings. */
export type EndedKey =
  "winner" | "forced" | "unforced" | "ace" | "double-fault";
/** "Shot" — the shot that ended the point. */
export type ShotKey = "forehand" | "backhand" | "volley" | "serve-plus-one";

export interface FilmFilters {
  pressure: PressureCut;
  ball: BallCut;
  wing: WingCut;
  outcome: OutcomeCut;
  score: ScoreKey[];
  serve: ServeKey[];
  returns: ReturnKey[];
  result: ResultKey[];
  /** Who served the point. */
  server: ServerCut;
  /** Only bookmarked points — the quick menu's "Saved only". */
  savedOnly: boolean;
  /** One set, or every set. */
  set: number | null;
  /** Rallies of at least this many shots, or any length. */
  rallyMin: number | null;
  ended: EndedKey[];
  shot: ShotKey[];
  /** Which service court the point was played from. */
  court: CourtCut;
}

export const DEFAULT_FILM_FILTERS: FilmFilters = {
  pressure: "any",
  ball: "any",
  wing: "any",
  outcome: "any",
  score: [],
  serve: [],
  returns: [],
  result: [],
  server: "any",
  savedOnly: false,
  set: null,
  rallyMin: null,
  ended: [],
  shot: [],
  court: "any",
};

export function hasActiveFilmFilters(f: FilmFilters): boolean {
  return (
    f.pressure !== "any" ||
    f.ball !== "any" ||
    f.wing !== "any" ||
    f.outcome !== "any" ||
    f.score.length > 0 ||
    f.serve.length > 0 ||
    f.returns.length > 0 ||
    f.result.length > 0 ||
    f.server !== "any" ||
    f.savedOnly ||
    f.set !== null ||
    f.rallyMin !== null ||
    f.ended.length > 0 ||
    f.shot.length > 0 ||
    f.court !== "any"
  );
}

/* ── Predicates ─────────────────────────────────────────────────────────── */

function scoreParts(point: MatchPoint): [string, string] | null {
  const parts = (point.pointScore ?? "").split("-");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return [parts[0], parts[1]];
}

/** 40-40 (and the parser's rarer AD-AD) — nobody is a point from the game. */
function isDeucePoint(point: MatchPoint): boolean {
  const parts = scoreParts(point);
  if (!parts) return false;
  const [a, b] = parts;
  return (a === "40" && b === "40") || (a === "AD" && b === "AD");
}

/** Somebody wins the game with this point: an advantage, or exactly one 40. */
function isGamePoint(point: MatchPoint): boolean {
  const parts = scoreParts(point);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === "AD" && b === "AD") return false;
  if (a === "AD" || b === "AD") return true;
  return (a === "40") !== (b === "40");
}

function isWinnerResult(point: MatchPoint): boolean {
  return /winner$/i.test(point.resultType.trim());
}

function matchesScore(point: MatchPoint, key: ScoreKey): boolean {
  return key === "deuce" ? isDeucePoint(point) : isGamePoint(point);
}

function matchesServe(point: MatchPoint, key: ServeKey): boolean {
  switch (key) {
    case "ace":
      return point.resultType === "Ace";
    case "double-fault":
      return point.resultType === "Double Fault";
    case "t":
      return point.firstShotZone === "T";
    case "body":
      return point.firstShotZone === "Body";
    case "wide":
      return point.firstShotZone === "Wide";
  }
}

function matchesReturn(point: MatchPoint, key: ReturnKey): boolean {
  const result = point.secondShotResult;
  switch (key) {
    case "in-play":
      return result === "In";
    // The return itself missed. Not "the returner lost the point" — this is
    // the shot's own recorded result, which is what "return error" means.
    case "error":
      return result === "Out" || result === "Net";
    // The point ended on the return and it ended as a winner. `rallyLength <= 2`
    // is serve + return; "Service Winner" is excluded because that one belongs
    // to the server.
    case "winner":
      return (
        result === "In" &&
        point.rallyLength > 0 &&
        point.rallyLength <= 2 &&
        isWinnerResult(point) &&
        point.resultType !== "Service Winner"
      );
  }
}

function matchesResult(point: MatchPoint, key: ResultKey): boolean {
  switch (key) {
    case "winner":
      return isWinnerResult(point);
    case "forced":
      return /(^|[^n])forced error$/i.test(point.resultType.trim());
    case "unforced":
      return /unforced error$/i.test(point.resultType.trim());
    case "long":
      return point.rallyLength >= 9;
  }
}

function matchesEnded(point: MatchPoint, key: EndedKey): boolean {
  switch (key) {
    case "winner":
      return isWinnerResult(point);
    case "forced":
      return matchesResult(point, "forced");
    case "unforced":
      return matchesResult(point, "unforced");
    case "ace":
      return point.resultType === "Ace";
    case "double-fault":
      return point.resultType === "Double Fault";
  }
}

function matchesShot(point: MatchPoint, key: ShotKey): boolean {
  const last = (point.lastShotType ?? "").toLowerCase();
  switch (key) {
    case "forehand":
      return last.includes("forehand") && !last.includes("volley");
    case "backhand":
      return last.includes("backhand") && !last.includes("volley");
    case "volley":
      return last.includes("volley") || last.includes("overhead");
    // The server's first ball after the return decided the point: either it
    // was the winner (third shot of the rally) or it forced the returner's
    // next ball into an error (fourth shot). `rallyLength` counts from the
    // serve in play. Product owner's definition, 2026-09-14.
    case "serve-plus-one":
      return (
        (point.rallyLength === 3 && isWinnerResult(point)) ||
        (point.rallyLength === 4 && /error$/i.test(point.resultType.trim()))
      );
  }
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
  point: MatchPoint,
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

function matchesFilm(
  point: MatchPoint,
  f: FilmFilters,
  youIsPlayer1: boolean,
  court: "deuce" | "ad",
): boolean {
  if (f.savedOnly && !point.saved) return false;
  if (f.set !== null && point.setNumber !== f.set) return false;
  if (f.rallyMin !== null && point.rallyLength < f.rallyMin) return false;
  if (f.court !== "any" && court !== f.court) return false;
  if (f.server !== "any") {
    const youServed = point.serverIsPlayer1 === youIsPlayer1;
    if (f.server === "you" && !youServed) return false;
    if (f.server === "opp" && youServed) return false;
  }
  if (f.ended.length > 0 && !f.ended.some((k) => matchesEnded(point, k))) {
    return false;
  }
  if (f.shot.length > 0 && !f.shot.some((k) => matchesShot(point, k))) {
    return false;
  }

  if (f.pressure === "break" && !point.isBreakPoint) return false;
  if (f.pressure === "set-match" && !(point.isSetPoint || point.isMatchPoint)) {
    return false;
  }

  if (f.ball === "first" && point.firstShotType !== "First Serve") return false;
  if (f.ball === "second" && point.firstShotType !== "Second Serve")
    return false;

  if (f.wing === "forehand" && point.secondShotType !== "Forehand")
    return false;
  if (f.wing === "backhand" && point.secondShotType !== "Backhand")
    return false;

  if (f.outcome !== "any") {
    const youWon = point.wonByPlayer1 === youIsPlayer1;
    if (f.outcome === "you" && !youWon) return false;
    if (f.outcome === "opp" && youWon) return false;
  }

  if (f.score.length > 0 && !f.score.some((k) => matchesScore(point, k))) {
    return false;
  }
  if (f.serve.length > 0 && !f.serve.some((k) => matchesServe(point, k))) {
    return false;
  }
  if (f.returns.length > 0 && !f.returns.some((k) => matchesReturn(point, k))) {
    return false;
  }
  if (f.result.length > 0 && !f.result.some((k) => matchesResult(point, k))) {
    return false;
  }

  return true;
}

export function applyFilmFilters(
  points: MatchPoint[],
  f: FilmFilters,
  youIsPlayer1: boolean,
): MatchPoint[] {
  if (!hasActiveFilmFilters(f)) return points;

  // The court side costs a string split per point and the panel re-filters on
  // every keystroke, so it is only worked out when a court filter asks for it.
  // `points` arrive in match order, so a point's index within its game is a
  // running count — computed once here rather than per predicate.
  const needsCourt = f.court !== "any";
  const hasPointScore =
    needsCourt && points.some((p) => p.pointScore !== "0-0");
  let gameKey = "";
  let indexInGame = 0;

  return points.filter((point) => {
    if (!needsCourt) return matchesFilm(point, f, youIsPlayer1, "deuce");
    const key = `${point.setNumber}-${point.gameNumber}`;
    if (key !== gameKey) {
      gameKey = key;
      indexInGame = 0;
    } else {
      indexInGame += 1;
    }
    const court = courtSideOf(point, indexInGame, hasPointScore);
    return matchesFilm(point, f, youIsPlayer1, court);
  });
}

/* ── The cut, in words ──────────────────────────────────────────────────── */

const SCORE_PHRASE: Record<ScoreKey, string> = {
  deuce: "deuce points",
  game: "game points",
};
const SERVE_PHRASE: Record<ServeKey, string> = {
  ace: "aces",
  "double-fault": "double faults",
  t: "serves to the T",
  body: "serves to the body",
  wide: "wide serves",
};
const RETURN_PHRASE: Record<ReturnKey, string> = {
  "in-play": "returns in play",
  winner: "return winners",
  error: "return errors",
};
const RESULT_PHRASE: Record<ResultKey, string> = {
  winner: "winners",
  forced: "forced errors",
  unforced: "unforced errors",
  long: "rallies of 9+ shots",
};
const ENDED_PHRASE: Record<EndedKey, string> = {
  winner: "winners",
  forced: "forced errors",
  unforced: "unforced errors",
  ace: "aces",
  "double-fault": "double faults",
};
const SHOT_PHRASE: Record<ShotKey, string> = {
  forehand: "forehands",
  backhand: "backhands",
  volley: "volleys",
  "serve-plus-one": "serve +1",
};

function orList(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} or ${phrases[phrases.length - 1]}`;
}

/** "Reid" out of "Marcus Reid" — the artboard's group-header/pill shorthand. */
export function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : name;
}

/**
 * The applied cut as a sentence — never chips (v3 Data Table law 6, and the
 * same shape `matches-page-content.tsx` already uses above the match table).
 */
export function describeFilmCut(f: FilmFilters, sides: MatchSides): string {
  const clauses: string[] = [];

  if (f.savedOnly) clauses.push("saved points");
  if (f.set !== null) clauses.push(`set ${f.set}`);
  if (f.pressure === "break") clauses.push("break points");
  if (f.pressure === "set-match") clauses.push("set and match points");
  if (f.server === "you") clauses.push("your serve");
  if (f.server === "opp") {
    clauses.push(`${lastNameOf(sides.opp.name)} serving`);
  }
  if (f.court === "deuce") clauses.push("deuce court");
  if (f.court === "ad") clauses.push("ad court");
  if (f.rallyMin !== null) clauses.push(`rallies of ${f.rallyMin}+ shots`);
  if (f.ended.length > 0) {
    clauses.push(orList(f.ended.map((k) => ENDED_PHRASE[k])));
  }
  if (f.shot.length > 0) {
    clauses.push(`ended on ${orList(f.shot.map((k) => SHOT_PHRASE[k]))}`);
  }
  if (f.score.length > 0) {
    clauses.push(orList(f.score.map((k) => SCORE_PHRASE[k])));
  }
  if (f.ball === "first") clauses.push("first serves");
  if (f.ball === "second") clauses.push("second serves");
  if (f.serve.length > 0) {
    clauses.push(orList(f.serve.map((k) => SERVE_PHRASE[k])));
  }
  if (f.wing === "forehand") clauses.push("forehand returns");
  if (f.wing === "backhand") clauses.push("backhand returns");
  if (f.returns.length > 0) {
    clauses.push(orList(f.returns.map((k) => RETURN_PHRASE[k])));
  }
  if (f.result.length > 0) {
    clauses.push(orList(f.result.map((k) => RESULT_PHRASE[k])));
  }
  if (f.outcome === "you") clauses.push("points you won");
  if (f.outcome === "opp") {
    clauses.push(`points ${lastNameOf(sides.opp.name)} won`);
  }

  if (clauses.length === 0) return "All points";
  const sentence = clauses.join(", ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/* ── Cut helpers (URL + short name) ─────────────────────────────────────── */

/**
 * The short name of a cut, for a list header or a pill. The quick menu's own
 * labels where the cut is one the menu can make; "Filtered" once an Advanced
 * axis is involved. `savedOnly` wins over `pressure: "break"`, matching the
 * quick menu's `show`.
 */
export function cutName(f: FilmFilters, sides: MatchSides): string {
  const advanced =
    f.pressure === "set-match" ||
    f.ball !== "any" ||
    f.wing !== "any" ||
    f.outcome !== "any" ||
    f.score.length > 0 ||
    f.serve.length > 0 ||
    f.returns.length > 0 ||
    f.result.length > 0 ||
    f.set !== null ||
    f.rallyMin !== null ||
    f.ended.length > 0 ||
    f.shot.length > 0 ||
    f.court !== "any";
  if (advanced) return "Filtered";

  const show = f.savedOnly
    ? "Saved only"
    : f.pressure === "break"
      ? "Break points"
      : null;
  const server =
    f.server === "you"
      ? `${lastNameOf(sides.you.name)} serving`
      : f.server === "opp"
        ? `${lastNameOf(sides.opp.name)} serving`
        : null;

  if (show && server) return `${show} · ${server}`;
  return show ?? server ?? "All points";
}

/**
 * How many points an option would give inside the rest of the filters: the
 * option's own group is replaced by `patch`, not added to.
 */
export function countFilmOption(
  points: MatchPoint[],
  filters: FilmFilters,
  youIsPlayer1: boolean,
  patch: Partial<FilmFilters>,
): number {
  return applyFilmFilters(points, { ...filters, ...patch }, youIsPlayer1)
    .length;
}

/* ── The Advanced panel's section table ─────────────────────────────────── */

export type FilmSectionId =
  "score" | "serve" | "return" | "rally" | "result" | "court";

/** Axis keys — every field of `FilmFilters` except the standalone ones. */
export type FilmAxisKey = Exclude<keyof FilmFilters, "savedOnly">;

/**
 * Which axis lives in which section of the in-column Advanced panel (handoff
 * P4). Six sections in the frame's order over the fourteen axes; `savedOnly`
 * is the standalone pill above them, not a section. Pure data, so the spec
 * can assert the partition without React.
 */
export const FILM_FILTER_SECTIONS: readonly {
  id: FilmSectionId;
  name: string;
  keys: readonly FilmAxisKey[];
}[] = [
  { id: "score", name: "Score", keys: ["set", "pressure", "score"] },
  { id: "serve", name: "Serve", keys: ["server", "ball", "serve"] },
  { id: "return", name: "Return", keys: ["wing", "returns"] },
  { id: "rally", name: "Rally", keys: ["rallyMin", "shot"] },
  { id: "result", name: "Result", keys: ["result", "ended", "outcome"] },
  { id: "court", name: "Court", keys: ["court"] },
];

/** Keys that are drawn outside the sections, as their own pill. */
export const FILM_STANDALONE_KEYS: readonly (keyof FilmFilters)[] = [
  "savedOnly",
];

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const seen = [...b];
  for (const value of a) {
    const at = seen.indexOf(value);
    if (at === -1) return false;
    seen.splice(at, 1);
  }
  return true;
}

/**
 * Whether two filter values would give the same cut. The four OR groups are
 * sets, not sequences — picking "Aces" then "Wide" is the same cut as picking
 * them the other way round — so they compare order-insensitively. This is what
 * gates the panel's Apply: a draft equal to what is applied has nothing to
 * commit.
 */
export function filmFiltersEqual(a: FilmFilters, b: FilmFilters): boolean {
  return (
    a.pressure === b.pressure &&
    a.ball === b.ball &&
    a.wing === b.wing &&
    a.outcome === b.outcome &&
    a.server === b.server &&
    a.savedOnly === b.savedOnly &&
    a.set === b.set &&
    a.rallyMin === b.rallyMin &&
    a.court === b.court &&
    sameSet(a.score, b.score) &&
    sameSet(a.serve, b.serve) &&
    sameSet(a.returns, b.returns) &&
    sameSet(a.result, b.result) &&
    sameSet(a.ended, b.ended) &&
    sameSet(a.shot, b.shot)
  );
}

/** Anything with `get`, so `URLSearchParams` and `ReadonlyURLSearchParams` both fit. */
type ParamsReader = { get(name: string): string | null };

/**
 * The quick-menu cut from the URL: only `cut=break|saved` and `serve=you|opp`.
 * Anything else — or no params at all — is the default.
 */
export function parseCut(params: ParamsReader | null | undefined): FilmFilters {
  const cut = params?.get("cut");
  const serve = params?.get("serve");
  return {
    ...DEFAULT_FILM_FILTERS,
    pressure: cut === "break" ? "break" : "any",
    savedOnly: cut === "saved",
    server: serve === "you" || serve === "opp" ? serve : "any",
  };
}

/**
 * A new query string with `cut` and `serve` set or deleted; every other param
 * is carried through and `params` is never mutated. Advanced-only axes have no
 * URL form and serialize to nothing.
 */
export function serializeCut(
  f: FilmFilters,
  params: URLSearchParams | string,
): string {
  const next = new URLSearchParams(params.toString());
  if (f.savedOnly) next.set("cut", "saved");
  else if (f.pressure === "break") next.set("cut", "break");
  else next.delete("cut");
  if (f.server === "you" || f.server === "opp") next.set("serve", f.server);
  else next.delete("serve");
  return next.toString();
}
