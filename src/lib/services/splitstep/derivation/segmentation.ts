/**
 * Where the games are, found as the cheapest legal score that reaches the
 * entered result.
 *
 * The vendor's game keys are read off its score stream, and the stream is the
 * least reliable thing in the payload: it cuts one deuce game in two, places a
 * changeover boundary a rally late, and freezes outright (frozen.ts). The
 * serve itself is a far better witness. Its END names the server, because the
 * changeover schedule (position.ts) says who stands where; its SIDE says how
 * many points the game has seen (deuce court on an even count, ad court on an
 * odd one); and who won relative to the server survives any mislabelling of
 * the players. None of these is reliable alone — ends are unknown when the
 * serve has no position, sides fail on a no-ad deciding point, and the winner
 * is a guess on about a tenth of rallies — so every one of them is a COST,
 * not a rule. The one hard constraint is the score the player entered.
 *
 * So this is a constrained shortest path. Each state is a legal tennis score
 * (set, games in the set, points in the game capped at deuce equivalence, or
 * the points of a tiebreak at 6–6); each step consumes one rally as one point,
 * or two rallies as one point where the vendor cut a point in two, won by the
 * server or by the receiver; a step pays for every piece of evidence it
 * contradicts; and the final state must equal the entered score, set by set.
 * The cheapest path is the proposal. Who serves each game follows from the
 * first server and the game count alone, so the path is run once per
 * candidate first server and the cheaper run wins.
 *
 * The runner-up is tracked alongside: every state keeps its best two ways in
 * whose proposals differ (game boundaries, game winners or merges — hashed
 * incrementally, see `mix`), so the cheapest path with a different proposal
 * is exact, and `ambiguous` says when it costs the same as the winner.
 *
 * The gap between rallies is read from `strokes[].videoTime`: the last stroke
 * of the previous rally to the first stroke of this one, which is how the
 * design's thresholds (30 s, 80 s) were measured. Serve-to-serve would add the
 * previous rally's length and read long on long rallies.
 *
 * Two shapes were tried first and rejected:
 *
 *   - Pattern repair — merge ad→ad pairs, cut at deuce→deuce, move a boundary
 *     to the nearest long gap. Each rule fires blind to the others, nothing
 *     ties the result to the entered score, and on one labelled block two
 *     cuts satisfy every local rule; only game length plus who won picks
 *     between them.
 *   - A position-only witness (server-witness.ts) — name every server from
 *     end plus changeovers and fold on those. It finds changeovers by gap,
 *     which fails on a match whose changeovers ran 12–67 s, it cannot place
 *     the same-end boundary, and it cannot use the score at all. Its end
 *     arithmetic is reused here as one cost.
 *
 * Review-only: this proposes, and the weights are first guesses against three
 * labelled matches. Nothing here changes a published row. Pure: no I/O.
 */

import { serveCourtSide } from "./court";
import { playerAtEnd, serveEnd, type CourtEnd } from "./position";
import type { MatchScore } from "./reconcile";
import { lastServeIndex } from "./result-type";
import type { SplitStepRally } from "./types";

export type ServeSide = "deuce" | "ad";

/** Who won a rally relative to the player who served it, and how sure we are. */
export interface RallyOutcome {
  /** Null when the winner could not be read at all; a flip then costs nothing. */
  won: "server" | "receiver" | null;
  /** `high` when the score stream resolved the winner, `low` when guessed or frozen. */
  confidence: "high" | "low";
}

export interface SegmentationInput {
  /** Post-`playedRally`, in play order, as the transcript sees them. */
  rallies: readonly SplitStepRally[];
  /** Parallel to `rallies`. */
  outcomes: readonly RallyOutcome[];
  /**
   * Parallel to `rallies`: true where the vendor's game key changed, so the
   * rally opens one of the vendor's games. The first rally always does.
   */
  vendorGameStarts: readonly boolean[];
  adScoring: boolean;
  bestOf: number;
  /** The entered result, `matches.score`. */
  score: MatchScore;
  /** The vendor label at the top of the frame at the first point. */
  topAtStart: string;
  /** Which vendor label is player1 (`reconciliation.player1Label`). */
  player1Label: string;
  player2Label: string;
  /**
   * Who served the first game. Omit to let the path decide: both labels are
   * tried and the cheaper run wins, with the vendor's first server breaking
   * a tie.
   */
  firstServer?: string;
}

export interface ProposedGame {
  /** 1-based set. */
  set: number;
  /** 1-based within the set, not match-cumulative (`points.game_number` is). A tiebreak is game 13. */
  game: number;
  /** For a tiebreak, the player who served its first point. */
  server: "player1" | "player2";
  firstRallyId: number;
  lastRallyId: number;
  winner: "player1" | "player2";
}

export interface SegmentationProposal {
  /** `ambiguous`: the best path with a different proposal costs the same (within one unit). */
  status: "fit" | "ambiguous" | "no_fit";
  version: 1;
  /** Only on no_fit, and only where the DP was not run at all. */
  reason?: "starts_mid_match";
  cost: number;
  /**
   * Cost of the best path with a different proposal (boundaries, winners or
   * merges) when it is within one unit of `cost` — i.e. on `ambiguous`.
   * Null otherwise: every fit has a distant runner-up, and it says nothing.
   */
  runnerUpCost: number | null;
  /** Fit only, or the closest reachable on no_fit. */
  games: ProposedGame[];
  /** Rally pairs consumed as one point, as [first, second] rally ids. */
  merges: Array<[number, number]>;
  /** On no_fit: the score the cheapest unconstrained path reaches. */
  closestScore: MatchScore | null;
  diff: {
    /**
     * Game-boundary edits between the vendor's cut and the proposal: a
     * boundary moved counts once, one added or dropped counts once. Zero
     * when the cuts agree. max(|proposed − vendor|, |vendor − proposed|).
     */
    gamesMoved: number;
    /** Rallies whose proposed server is not the vendor's `rally.server`. */
    serversChanged: number;
    /** Rally ids whose game start or server differs from the vendor's. */
    rallies: number[];
  };
  /** Per cost row, what the chosen path paid. */
  costBreakdown: Record<CostRow, number>;
}

/**
 * The weights. The design table's first guesses (end 5 / side 2 / flipHigh 4
 * / flipLow 1 / one unit for every boundary, gap and merge row) were tuned
 * HERE and nowhere else — no other line may carry a weight — against three
 * labelled sessions, read-only, with `scripts/splitstep-eval.ts --session`.
 * Two rows moved:
 *
 *   - `flipHigh` 4 → 2. The score stream's winner is wrong far more often
 *     than a tenth of the time on a bad payload (one labelled match had the
 *     published winner right on 35 of 56 points), and at 4 a wrong winner
 *     made the vendor's wrong cut self-consistent: the path paid several
 *     flips to keep a boundary rather than one to move it. At 2 a flip costs
 *     what a side mismatch does, still twice a guessed one.
 *   - `changeoverShortGap` 1 → 4 and `longGapNotChangeover` 1 → 3. The end
 *     cannot see a changeover boundary — the next server stands where the
 *     last one did — and the side only says the count is even, so the pause
 *     is the one witness that places it. Both labelled no-ad matches put a
 *     changeover a rally or two after a 100 s gap and the ad match's game 7/8
 *     cut was decided by a 67 s pause against a 19 s one. Both stay below
 *     `end`, which is still the top witness.
 *
 * Result (published → proposed server, firings hit/total), each session
 * fitting the entered score where it did before:
 *   be930d79 (ad): fit, 42/56 → 54/56, 22/23 hit, 4 of 4 labelled merges
 *     proposed (was 52/56, 8/23). The two remaining server misses sit on a
 *     rally the labeller split into two points with different servers.
 *   868a7696 (no-ad): fit, 101/106 → 105/106, 5/5 hit, the one labelled
 *     merge proposed (was ambiguous, 103/106, 2/2).
 *   45ff4bd7 (no-ad): ambiguous, 99/101 → 99/101, no firing — the tie is
 *     two seven-point games whose deciding points the stream got wrong the
 *     same way, so either may be the one the loser took; the vendor's late
 *     changeover there costs 1 unit against 14 units of wrong winners.
 * No proposed metric fell below its published one on any session.
 *
 * End outranks everything because the schedule named the server on every
 * labelled game; a vendor boundary is worth one unit, so of two fits with
 * equal evidence the one that moves fewer of them wins.
 */
export const SEGMENT_COSTS = {
  /** Serve end is not the end the schedule puts this game's server at. */
  end: 5,
  /** Serve side is not the side the point count expects (free on a no-ad deciding point and in a tiebreak). */
  side: 2,
  /** Outcome flipped against a high-confidence winner. */
  flipHigh: 2,
  /** Outcome flipped against a low-confidence winner. */
  flipLow: 1,
  /** A proposed game boundary where the vendor's game key did not change. */
  vendorBoundaryMoved: 1,
  /** A vendor game boundary the proposal does not keep. */
  vendorBoundaryDropped: 1,
  /** A changeover (the ends swap) opened after a gap under `CHANGEOVER_SHORT_GAP_S`. */
  changeoverShortGap: 4,
  /** A gap of `LONG_GAP_S` or more crossed by anything but a changeover or a set break. */
  longGapNotChangeover: 3,
  /** Two rallies consumed as one point. */
  merge: 1,
} as const;

/**
 * The merge thresholds, from four ad→ad pairs in one labelled match. A merge
 * is allowed only when rallies i and i+1 serve from the same end and side,
 * the gap between them is under `MERGE_MAX_GAP_S`, and rally i ends on a
 * serve or has at most `MERGE_MAX_STROKES` strokes.
 */
export const MERGE_MAX_GAP_S = 30;
export const MERGE_MAX_STROKES = 2;
/** A changeover opened after a shorter gap than this is suspect. */
export const CHANGEOVER_SHORT_GAP_S = 30;
/** A gap this long is a changeover or a set break; anything else crossing it is suspect. */
export const LONG_GAP_S = 80;

export type CostRow = keyof typeof SEGMENT_COSTS;

const COST_ROWS = Object.keys(SEGMENT_COSTS) as CostRow[];

type Outcome = "server" | "receiver";
const OUTCOMES: readonly Outcome[] = ["server", "receiver"];

/** Tiebreak points past this would overflow the state key; no real tiebreak gets near it. */
const TIEBREAK_POINT_CAP = 127;

/**
 * The finished sets a state carries, interned once per run so a state can be
 * keyed by a small integer: in a three-set match only a handful of these ever
 * exist, while thousands of states share them.
 */
interface SetsEntry {
  id: number;
  /** Finished sets as [player1 games, player2 games]. */
  sets: ReadonlyArray<readonly [number, number]>;
  /** Each finished set's game total — `playerAtEnd`'s `completedSets`. */
  totals: readonly number[];
  gamesTotal: number;
}

/** A legal score, the DP's state. Immutable; transitions return a new one. */
interface State {
  sets: SetsEntry;
  /** Games in the current set. */
  g1: number;
  g2: number;
  /**
   * Outside a tiebreak: points in the current game for the server and the
   * receiver, capped at deuce equivalence (3–3, 4–3, 3–4). In a tiebreak:
   * player1's and player2's points, uncapped, since the server rotates.
   */
  ps: number;
  pr: number;
  /** True at 6–6 until the tiebreak is decided. */
  tiebreak: boolean;
  /** Unique per score; the layer map's key. */
  key: number;
}

/** g1, g2 < 8 and ps, pr < 128 (`TIEBREAK_POINT_CAP`), so this never collides. */
function keyOf(
  sets: SetsEntry,
  g1: number,
  g2: number,
  ps: number,
  pr: number,
  tiebreak: boolean,
) {
  return (
    ((((sets.id * 8 + g1) * 8 + g2) * 128 + ps) * 128 + pr) * 2 +
    (tiebreak ? 1 : 0)
  );
}

function stateOf(
  sets: SetsEntry,
  g1: number,
  g2: number,
  ps: number,
  pr: number,
  tiebreak = false,
): State {
  return {
    sets,
    g1,
    g2,
    ps,
    pr,
    tiebreak,
    key: keyOf(sets, g1, g2, ps, pr, tiebreak),
  };
}

/** What one rally says about itself, read once up front. */
interface RallyEvidence {
  rallyId: number;
  end: CourtEnd | null;
  side: ServeSide | null;
  vendorServer: string;
  vendorGameStart: boolean;
  outcome: RallyOutcome;
  /**
   * Seconds from the previous rally's last stroke to this rally's first.
   * Null on the first rally and wherever either rally has no strokes.
   */
  gapBefore: number | null;
  /** True when this rally and the next may be consumed as one point (`MERGE_*`). */
  mergeableWithNext: boolean;
}

function readEvidence(input: SegmentationInput): RallyEvidence[] {
  const evidence = input.rallies.map((rally, i): RallyEvidence => {
    const serve = rally.strokes[lastServeIndex(rally)] ?? rally.strokes[0];
    const first = rally.strokes[0];
    const previousLast = input.rallies[i - 1]?.strokes.at(-1);
    return {
      rallyId: rally.rallyId,
      end: serveEnd(rally),
      side: serve
        ? serveCourtSide(serve.playerX ?? null, serve.playerY ?? null)
        : null,
      vendorServer: rally.server,
      vendorGameStart: i === 0 || (input.vendorGameStarts[i] ?? false),
      outcome: input.outcomes[i] ?? { won: null, confidence: "low" },
      gapBefore:
        first && previousLast ? first.videoTime - previousLast.videoTime : null,
      mergeableWithNext: false,
    };
  });

  for (let i = 0; i + 1 < evidence.length; i += 1) {
    const here = evidence[i];
    const next = evidence[i + 1];
    const strokes = input.rallies[i].strokes;
    const endsOnServe = strokes.at(-1)?.strokeType === "serve";
    here.mergeableWithNext =
      here.end !== null &&
      here.end === next.end &&
      here.side !== null &&
      here.side === next.side &&
      next.gapBefore !== null &&
      next.gapBefore < MERGE_MAX_GAP_S &&
      (endsOnServe || strokes.length <= MERGE_MAX_STROKES);
  }
  return evidence;
}

/** Everything about the match that does not change rally to rally. */
interface Rules {
  adScoring: boolean;
  bestOf: number;
  score: MatchScore;
  /** Sets the entered score has. */
  setCount: number;
  player1Label: string;
  player2Label: string;
  /** Null when `topAtStart` is neither label — ends are then unknown. */
  ends: { topAtStart: string; bottomAtStart: string } | null;
  firstServer: string;
  /** True: a set must end on the entered score, and the match on its last set. */
  constrained: boolean;
}

/** One DP run's scratch: the rules plus what is interned or memoised for them. */
interface Run {
  rules: Rules;
  start: State;
  /** Finished-set lists by their text, so equal lists share one entry. */
  setsTable: Map<string, SetsEntry>;
  /** `expectedEnd` by (sets, games before in set, server is first server, tiebreak swaps). */
  endCache: Map<number, CourtEnd>;
}

function startRun(rules: Rules): Run {
  const empty: SetsEntry = { id: 0, sets: [], totals: [], gamesTotal: 0 };
  return {
    rules,
    start: stateOf(empty, 0, 0, 0, 0),
    setsTable: new Map([["", empty]]),
    endCache: new Map(),
  };
}

function internSets(run: Run, sets: SetsEntry, g1: number, g2: number) {
  const key = sets.sets.map(([a, b]) => `${a}-${b}|`).join("") + `${g1}-${g2}|`;
  const seen = run.setsTable.get(key);
  if (seen) return seen;
  const entry: SetsEntry = {
    id: run.setsTable.size,
    sets: [...sets.sets, [g1, g2]],
    totals: [...sets.totals, g1 + g2],
    gamesTotal: sets.gamesTotal + g1 + g2,
  };
  run.setsTable.set(key, entry);
  return entry;
}

function otherLabel(rules: Rules, label: string): string {
  return label === rules.player1Label ? rules.player2Label : rules.player1Label;
}

/** Who serves the game in progress: the first server on even game counts. */
function gameServerOf(s: State, rules: Rules): string {
  const played = s.sets.gamesTotal + s.g1 + s.g2;
  return played % 2 === 0
    ? rules.firstServer
    : otherLabel(rules, rules.firstServer);
}

/**
 * Who serves the next point. In a tiebreak the player due to serve game 13
 * serves point 1, then the serve changes every two points (1, 2-2, …); the
 * tiebreak counts as a game, so the next set opens with its first receiver.
 */
function serverOf(s: State, rules: Rules): string {
  const gameServer = gameServerOf(s, rules);
  if (!s.tiebreak) return gameServer;
  const n = s.ps + s.pr;
  return ((n + 1) >> 1) % 2 === 0 ? gameServer : otherLabel(rules, gameServer);
}

/**
 * The end the schedule puts this point's server at, or null when unknown.
 * Memoised: it depends only on the finished sets, the games played in this
 * set, which player serves and (in a tiebreak) how many six-point swaps have
 * passed, and every layer asks the same questions.
 */
function expectedEnd(s: State, run: Run, server: string): CourtEnd | null {
  const { rules } = run;
  if (!rules.ends) return null;
  const before = s.g1 + s.g2;
  const tiebreakPointsBefore = s.tiebreak ? s.ps + s.pr : 0;
  const key =
    ((s.sets.id * 16 + before) * 2 + (server === rules.firstServer ? 0 : 1)) *
      16 +
    (s.tiebreak ? (tiebreakPointsBefore % 12) + 1 : 0);
  const hit = run.endCache.get(key);
  if (hit) return hit;
  const top = playerAtEnd({
    ...rules.ends,
    completedSets: s.sets.totals,
    gamesBeforeInSet: before,
    end: "top",
    tiebreakPointsBefore,
  });
  const end: CourtEnd = top === server ? "top" : "bottom";
  run.endCache.set(key, end);
  return end;
}

function isDecidingPoint(s: State, rules: Rules): boolean {
  return !rules.adScoring && s.ps === 3 && s.pr === 3;
}

/** The side the point count expects; null on a no-ad deciding point and in a tiebreak (v1). */
function expectedSide(s: State, rules: Rules): ServeSide | null {
  if (s.tiebreak || isDecidingPoint(s, rules)) return null;
  return (s.ps + s.pr) % 2 === 0 ? "deuce" : "ad";
}

/**
 * What kind of pause, if any, the rules of tennis put before the next point
 * from this state. A changeover is wherever the ends swap (position.ts): after
 * odd games of a set, at a set break following an odd set, and every six
 * points of a tiebreak. A set break after an even set is a rest without a
 * swap. `plain` is a game boundary with neither; `none` is mid-game.
 */
type Pause = "changeover" | "setBreak" | "plain" | "none";

function pauseBefore(s: State): Pause {
  if (s.ps !== 0 || s.pr !== 0) {
    return s.tiebreak && (s.ps + s.pr) % 6 === 0 ? "changeover" : "none";
  }
  const before = s.g1 + s.g2;
  if (before === 0) {
    if (s.sets.sets.length === 0) return "plain";
    return (s.sets.totals.at(-1) ?? 0) % 2 === 1 ? "changeover" : "setBreak";
  }
  return before % 2 === 1 ? "changeover" : "plain";
}

/** Per-step scratch the DP reads back: the vendor-boundary units the step paid. */
interface StepTally {
  moves: number;
}

/**
 * What consuming `first` — or `first` and `second` as one merged point — as
 * `outcome` from state `s` costs. The end, side, gap and vendor boundary are
 * read off `first`; the outcome off `second` when merging, since the second
 * rally is the one that was played out; a vendor boundary on `second` is a
 * boundary the merge drops. With `breakdown` each row's share is also added
 * to it — the replay's tally.
 */
function stepCost(
  s: State,
  run: Run,
  first: RallyEvidence,
  second: RallyEvidence | null,
  outcome: Outcome,
  tally: StepTally,
  breakdown?: Record<CostRow, number>,
): number {
  const { rules } = run;
  let total = 0;
  tally.moves = 0;
  const pay = (row: CostRow) => {
    total += SEGMENT_COSTS[row];
    if (breakdown) breakdown[row] += SEGMENT_COSTS[row];
  };

  if (first.end !== null) {
    const end = expectedEnd(s, run, serverOf(s, rules));
    if (end !== null && first.end !== end) pay("end");
  }

  if (first.side !== null) {
    const side = expectedSide(s, rules);
    if (side !== null && first.side !== side) pay("side");
  }

  const judged = second ?? first;
  if (judged.outcome.won !== null && judged.outcome.won !== outcome) {
    pay(judged.outcome.confidence === "high" ? "flipHigh" : "flipLow");
  }

  const opensGame = s.ps === 0 && s.pr === 0;
  if (opensGame && !first.vendorGameStart) {
    pay("vendorBoundaryMoved");
    tally.moves += 1;
  }
  if (!opensGame && first.vendorGameStart) {
    pay("vendorBoundaryDropped");
    tally.moves += 1;
  }
  if (second?.vendorGameStart) {
    pay("vendorBoundaryDropped");
    tally.moves += 1;
  }

  if (first.gapBefore !== null) {
    const pause = pauseBefore(s);
    if (pause === "changeover" && first.gapBefore < CHANGEOVER_SHORT_GAP_S) {
      pay("changeoverShortGap");
    }
    if (
      first.gapBefore >= LONG_GAP_S &&
      pause !== "changeover" &&
      pause !== "setBreak"
    ) {
      pay("longGapNotChangeover");
    }
  }

  if (second) pay("merge");

  return total;
}

/** A set ends at 6 with a two-game margin or at 7–5; 6–6 goes to a tiebreak in `advance`. */
function setOver(g1: number, g2: number): boolean {
  return (g1 >= 6 || g2 >= 6) && Math.abs(g1 - g2) >= 2;
}

function setsWon(sets: SetsEntry, who: 1 | 2): number {
  return sets.sets.filter(([a, b]) => (who === 1 ? a > b : b > a)).length;
}

/** The set after the games `g1`/`g2` closed it; null when the entered score forbids it. */
function closeSet(s: State, run: Run, g1: number, g2: number): State | null {
  const { rules } = run;
  const k = s.sets.sets.length;
  if (
    rules.constrained &&
    (g1 !== (rules.score.player1[k] ?? 0) ||
      g2 !== (rules.score.player2[k] ?? 0))
  ) {
    return null;
  }
  return stateOf(internSets(run, s.sets, g1, g2), 0, 0, 0, 0);
}

/**
 * The state after `outcome` on the rally; null when that path is dead — it
 * would play a point after the match ended or, under the end condition,
 * leave the entered score unreachable.
 */
function advance(s: State, run: Run, outcome: Outcome): State | null {
  const { rules } = run;
  const k = s.sets.sets.length;

  // Is a point even allowed here?
  if (rules.constrained) {
    if (k >= rules.setCount) return null;
  } else {
    const majority = Math.ceil(rules.bestOf / 2);
    if (k >= rules.bestOf) return null;
    if (setsWon(s.sets, 1) >= majority || setsWon(s.sets, 2) >= majority) {
      return null;
    }
  }

  const server = serverOf(s, rules);
  const winner = outcome === "server" ? server : otherLabel(rules, server);
  const toPlayer1 = winner === rules.player1Label;

  if (s.tiebreak) {
    // First to 7 by 2; the set then stands 7–6 or 6–7.
    const p1 = s.ps + (toPlayer1 ? 1 : 0);
    const p2 = s.pr + (toPlayer1 ? 0 : 1);
    if (p1 >= TIEBREAK_POINT_CAP || p2 >= TIEBREAK_POINT_CAP) return null;
    if ((p1 >= 7 || p2 >= 7) && Math.abs(p1 - p2) >= 2) {
      return closeSet(s, run, p1 > p2 ? 7 : 6, p1 > p2 ? 6 : 7);
    }
    return stateOf(s.sets, 6, 6, p1, p2, true);
  }

  let ps = s.ps + (outcome === "server" ? 1 : 0);
  let pr = s.pr + (outcome === "receiver" ? 1 : 0);

  const gameWon =
    (!rules.adScoring && (ps === 4 || pr === 4)) ||
    (rules.adScoring && (ps >= 4 || pr >= 4) && Math.abs(ps - pr) >= 2);

  if (!gameWon) {
    // 4–4 is deuce again. The parity of points played is what the side
    // cost reads, and 3–3 keeps it.
    if (ps === 4 && pr === 4) {
      ps = 3;
      pr = 3;
    }
    return stateOf(s.sets, s.g1, s.g2, ps, pr);
  }

  const g1 = s.g1 + (toPlayer1 ? 1 : 0);
  const g2 = s.g2 + (toPlayer1 ? 0 : 1);

  const t1 = rules.score.player1[k] ?? 0;
  const t2 = rules.score.player2[k] ?? 0;
  if (rules.constrained && (g1 > t1 || g2 > t2)) return null;

  if (setOver(g1, g2)) return closeSet(s, run, g1, g2);
  if (g1 === 6 && g2 === 6) return stateOf(s.sets, 6, 6, 0, 0, true);
  return stateOf(s.sets, g1, g2, 0, 0);
}

/**
 * Can the entered score still be reached with `ralliesLeft` rallies? A lower
 * bound — four points a game, seven a tiebreak, one rally a point (a merge
 * only spends more rallies) — so pruning on it is exact. Dead states fall off
 * the layers early, which is what keeps the merge step's branching cheap.
 */
function canStillReach(s: State, rules: Rules, ralliesLeft: number): boolean {
  const k = s.sets.sets.length;
  let need = 0;
  if (k < rules.setCount) {
    if (s.tiebreak) {
      need += Math.max(1, 7 - Math.max(s.ps, s.pr));
    } else {
      const t1 = rules.score.player1[k] ?? 0;
      const t2 = rules.score.player2[k] ?? 0;
      let gamesLeft = t1 - s.g1 + (t2 - s.g2);
      if (s.ps + s.pr > 0) {
        // The open game is one of them, and whoever wins it adds a game.
        if (gamesLeft === 0) return false;
        gamesLeft -= 1;
        need += Math.max(1, 4 - Math.max(s.ps, s.pr));
      }
      need += gamesLeft * 4;
    }
    for (let j = k + 1; j < rules.setCount; j += 1) {
      need +=
        ((rules.score.player1[j] ?? 0) + (rules.score.player2[j] ?? 0)) * 4;
    }
  }
  return need <= ralliesLeft;
}

/** The score a state has reached: finished sets, plus the set in play if any game is. */
function scoreOf(s: State): MatchScore {
  const player1 = s.sets.sets.map(([a]) => a);
  const player2 = s.sets.sets.map(([, b]) => b);
  if (s.g1 + s.g2 > 0) {
    player1.push(s.g1);
    player2.push(s.g2);
  }
  return { player1, player2 };
}

function sameScore(a: MatchScore, b: MatchScore): boolean {
  const n = Math.max(
    a.player1.length,
    a.player2.length,
    b.player1.length,
    b.player2.length,
  );
  for (let i = 0; i < n; i += 1) {
    if ((a.player1[i] ?? 0) !== (b.player1[i] ?? 0)) return false;
    if ((a.player2[i] ?? 0) !== (b.player2[i] ?? 0)) return false;
  }
  return true;
}

/** Does this final state satisfy the end condition? Points must be 0–0. */
function reachesScore(s: State, rules: Rules): boolean {
  return (
    !s.tiebreak &&
    s.ps === 0 &&
    s.pr === 0 &&
    sameScore(scoreOf(s), rules.score)
  );
}

/** One DP step: the rally (or merged pair) at the node's layer, consumed as `outcome`. */
interface Step {
  outcome: Outcome;
  merged: boolean;
}

interface Node {
  state: State;
  cost: number;
  /** Vendor-boundary units paid so far; breaks cost ties toward the cut that moves fewer. */
  moves: number;
  /** Hash of the proposal so far — boundaries, game winners, merges (`mix`). */
  sig: number;
  prev: Node | null;
  step: Step | null;
}

/**
 * Fold an event into a proposal signature. Multiplying by an odd constant
 * modulo 2^32 is a bijection, so two prefixes with different signatures stay
 * different under the same suffix — which is what lets each state keep just
 * its best two ways in and still find the exact runner-up (see `offer`).
 */
function mix(sig: number, event: number): number {
  return (Math.imul(sig, 0x01000193) + event) >>> 0;
}

function better(a: Node, b: Node): boolean {
  return a.cost < b.cost || (a.cost === b.cost && a.moves < b.moves);
}

/**
 * Keep, per state, the cheapest way in and the cheapest way in with a
 * different signature. Any path dropped here has, at the same state, two
 * cheaper paths of distinct signatures; extended by the same suffix at most
 * one of them matches the eventual winner, so the runner-up's cost survives.
 */
function offer(layer: Map<number, Node[]>, node: Node) {
  const slots = layer.get(node.state.key);
  if (!slots) {
    layer.set(node.state.key, [node]);
    return;
  }
  const same = slots.findIndex((n) => n.sig === node.sig);
  if (same >= 0) {
    if (!better(node, slots[same])) return;
    slots[same] = node;
  } else {
    slots.push(node);
  }
  slots.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  if (slots.length > 2) slots.length = 2;
}

interface Path {
  cost: number;
  moves: number;
  sig: number;
  steps: Step[];
  /** The state after the last rally. */
  final: State;
  /** Rallies consumed; short of the input when every path died early. */
  consumed: number;
}

function pathOf(node: Node, consumed: number): Path {
  const steps: Step[] = [];
  for (let n: Node | null = node; n && n.step; n = n.prev)
    steps.unshift(n.step);
  return {
    cost: node.cost,
    moves: node.moves,
    sig: node.sig,
    steps,
    final: node.state,
    consumed,
  };
}

/**
 * The shortest paths within a cost cap. Layer i holds every live state before
 * rally i is consumed, keyed by score, keeping the best two ways in
 * (`offer`). A point step feeds layer i+1, a merge step layer i+2. Returns
 * the accepted final paths cheapest first — under `constrained` only those
 * reaching the entered score, and then the second is the exact runner-up
 * with a different proposal, provided it costs no more than `cap`. Null when
 * no path within the cap reaches the end of the rallies at all.
 *
 * The cap is what keeps this fast: cost only grows along a path, so a node
 * over the cap can be dropped without losing any path under it, and
 * `bestOver` raises the cap until the answer is settled. Without it every
 * legal score is live at every rally — some 3,700 nodes a layer on a clean
 * three-setter — and nearly all of them are paying an end mismatch a rally.
 */
function shortestPaths(
  evidence: RallyEvidence[],
  run: Run,
  cap: number,
): Path[] | null {
  const { rules, start } = run;
  const n = evidence.length;
  const layers: Map<number, Node[]>[] = Array.from(
    { length: n + 1 },
    () => new Map(),
  );
  layers[0].set(start.key, [
    { state: start, cost: 0, moves: 0, sig: 1, prev: null, step: null },
  ]);
  const tally: StepTally = { moves: 0 };

  const extend = (node: Node, i: number, merged: boolean, outcome: Outcome) => {
    const first = evidence[i];
    const second = merged ? evidence[i + 1] : null;
    const to = i + (merged ? 2 : 1);
    const state = advance(node.state, run, outcome);
    if (!state) return;
    if (rules.constrained && !canStillReach(state, rules, n - to)) return;
    const cost =
      node.cost + stepCost(node.state, run, first, second, outcome, tally);
    if (cost > cap) return;
    // The proposal so far: each game's opening rally and server, each
    // game's winner, each merge. With no games the two first-server runs
    // are the same (empty) proposal.
    let sig = node.sig;
    if (node.state.ps === 0 && node.state.pr === 0) {
      const server = serverOf(node.state, rules);
      sig = mix(sig, 0x10000 + i * 2 + (server === rules.player1Label ? 0 : 1));
    }
    if (merged) sig = mix(sig, 0x20000 + i);
    if (state.ps === 0 && state.pr === 0) {
      const server = serverOf(node.state, rules);
      const winner = outcome === "server" ? server : otherLabel(rules, server);
      sig = mix(sig, winner === rules.player1Label ? 3 : 4);
    }
    offer(layers[to], {
      state,
      cost,
      moves: node.moves + tally.moves,
      sig,
      prev: node,
      step: { outcome, merged },
    });
  };

  for (let i = 0; i < n; i += 1) {
    for (const slots of layers[i].values()) {
      for (const node of slots) {
        for (const outcome of OUTCOMES) {
          extend(node, i, false, outcome);
          if (evidence[i].mergeableWithNext) extend(node, i, true, outcome);
        }
      }
    }
  }

  let consumed = n;
  while (consumed > 0 && layers[consumed].size === 0) consumed -= 1;
  if (rules.constrained && consumed < n) return null;

  const finals: Node[] = [];
  for (const slots of layers[consumed].values()) {
    for (const node of slots) {
      if (rules.constrained && !reachesScore(node.state, rules)) continue;
      finals.push(node);
    }
  }
  if (finals.length === 0) return null;
  finals.sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  return finals.map((node) => pathOf(node, consumed));
}

/** The path replayed: its games and merges, its diff against the vendor, and what each row cost. */
function replay(
  path: Path,
  evidence: RallyEvidence[],
  run: Run,
): Pick<SegmentationProposal, "games" | "merges" | "diff" | "costBreakdown"> {
  const { rules } = run;
  const breakdown = Object.fromEntries(
    COST_ROWS.map((row) => [row, 0]),
  ) as Record<CostRow, number>;
  const games: ProposedGame[] = [];
  const merges: Array<[number, number]> = [];
  const differing = new Set<number>();
  let proposedOnly = 0;
  let vendorOnly = 0;
  let serversChanged = 0;
  const tally: StepTally = { moves: 0 };

  const side = (label: string): "player1" | "player2" =>
    label === rules.player1Label ? "player1" : "player2";

  let state = run.start;
  let open: { server: string; firstRallyId: number } | null = null;
  let i = 0;
  for (const step of path.steps) {
    const first = evidence[i];
    const second = step.merged ? evidence[i + 1] : null;
    stepCost(state, run, first, second, step.outcome, tally, breakdown);

    const server = serverOf(state, rules);
    const opensGame = state.ps === 0 && state.pr === 0;
    if (opensGame) open = { server, firstRallyId: first.rallyId };
    if (opensGame !== first.vendorGameStart) {
      if (opensGame) proposedOnly += 1;
      else vendorOnly += 1;
      differing.add(first.rallyId);
    }
    if (server !== first.vendorServer) {
      serversChanged += 1;
      differing.add(first.rallyId);
    }
    if (second) {
      merges.push([first.rallyId, second.rallyId]);
      if (second.vendorGameStart) {
        vendorOnly += 1;
        differing.add(second.rallyId);
      }
      if (server !== second.vendorServer) {
        serversChanged += 1;
        differing.add(second.rallyId);
      }
    }

    const next = advance(state, run, step.outcome);
    if (!next) break;
    const closed = next.ps === 0 && next.pr === 0;
    if (closed && open) {
      const winner =
        step.outcome === "server" ? server : otherLabel(rules, server);
      // The game is counted in the set it was played in, even when it ended that set.
      const game = state.g1 + state.g2 + 1;
      games.push({
        set: state.sets.sets.length + 1,
        game,
        server: side(open.server),
        firstRallyId: open.firstRallyId,
        lastRallyId: (second ?? first).rallyId,
        winner: side(winner),
      });
      open = null;
    }
    state = next;
    i += second ? 2 : 1;
  }
  // A game still in play when the rallies ran out has no winner and is not listed.

  return {
    games,
    merges,
    diff: {
      gamesMoved: Math.max(proposedOnly, vendorOnly),
      serversChanged,
      rallies: [...differing].sort((a, b) => a - b),
    },
    costBreakdown: breakdown,
  };
}

interface Ranked {
  path: Path;
  run: Run;
}

function rank(a: Ranked, b: Ranked): number {
  if (a.path.consumed !== b.path.consumed)
    return b.path.consumed - a.path.consumed;
  if (a.path.cost !== b.path.cost) return a.path.cost - b.path.cost;
  return a.path.moves - b.path.moves;
}

/** No step pays more than every row at once, so no path costs more than this. */
const MAX_STEP_COST = Object.values(SEGMENT_COSTS).reduce((a, b) => a + b, 0);

/** Below one unit of evidence, the runner-up is as good as the winner. */
const AMBIGUITY_MARGIN = 1;

/**
 * Run the paths for each candidate first server and pool them: furthest
 * first (only no_fit paths fall short), then cheapest, then the cut that
 * moves fewer vendor boundaries, then the candidate order — so the vendor's
 * first server keeps a dead tie. Stable sort keeps candidate order on ties.
 *
 * Iterative deepening on the cost cap (0, 1, 2, 4, … then none): each pass
 * is exact for every path under its cap, so the first pass that settles the
 * question is the answer. Under the end condition that means a fit was
 * found and the cap also covers any runner-up close enough to matter
 * (`AMBIGUITY_MARGIN`); without it, a path that plays every rally — or no
 * cap at all, after which the furthest path is the closest.
 */
function bestOver(
  evidence: RallyEvidence[],
  base: Omit<Rules, "firstServer">,
  candidates: readonly string[],
): Ranked[] {
  const uncapped = evidence.length * MAX_STEP_COST + 1;
  for (let cap = 0; ; cap = cap === 0 ? 1 : cap * 2) {
    const effective = cap >= uncapped ? Infinity : cap;
    const pooled: Ranked[] = [];
    for (const firstServer of candidates) {
      const run = startRun({ ...base, firstServer });
      const paths = shortestPaths(evidence, run, effective);
      for (const path of paths ?? []) pooled.push({ path, run });
    }
    pooled.sort(rank);
    const best = pooled[0];
    if (effective === Infinity) return pooled;
    if (
      best &&
      (base.constrained
        ? effective >= best.path.cost + AMBIGUITY_MARGIN
        : best.path.consumed === evidence.length)
    ) {
      return pooled;
    }
  }
}

/** "0-0", "0.0-0.0", "0", null and nan all read as zero; anything with a non-zero number does not. */
function readsZero(score: string | null): boolean {
  if (score === null) return true;
  return score.split("-").every((part) => {
    const value = parseFloat(part);
    return !Number.isFinite(value) || value === 0;
  });
}

/**
 * The DP starts at 0–0 / 0–0. The vendor writes the score standing BEFORE
 * each stroke, so the first stroke's point, game and set readings are all
 * zero on a video that starts with the match (transcript readings are
 * `predPointScore`, `predGameScore`, `predSetScore` on `rallies[0].strokes[0]`).
 */
function startsMidMatch(input: SegmentationInput): boolean {
  const stroke = input.rallies[0]?.strokes[0];
  if (!stroke) return false;
  return !(
    readsZero(stroke.predPointScore) &&
    readsZero(stroke.predGameScore) &&
    readsZero(stroke.predSetScore)
  );
}

function emptyProposal(
  status: SegmentationProposal["status"],
  closestScore: MatchScore | null,
): SegmentationProposal {
  return {
    status,
    version: 1,
    cost: 0,
    runnerUpCost: null,
    games: [],
    merges: [],
    closestScore,
    diff: { gamesMoved: 0, serversChanged: 0, rallies: [] },
    costBreakdown: Object.fromEntries(
      COST_ROWS.map((row) => [row, 0]),
    ) as Record<CostRow, number>,
  };
}

export function proposeSegmentation(
  input: SegmentationInput,
): SegmentationProposal {
  if (startsMidMatch(input)) {
    return { ...emptyProposal("no_fit", null), reason: "starts_mid_match" };
  }

  const evidence = readEvidence(input);
  const { player1Label, player2Label, topAtStart } = input;
  const ends =
    topAtStart === player1Label
      ? { topAtStart, bottomAtStart: player2Label }
      : topAtStart === player2Label
        ? { topAtStart, bottomAtStart: player1Label }
        : null;
  const base: Omit<Rules, "firstServer" | "constrained"> = {
    adScoring: input.adScoring,
    bestOf: input.bestOf,
    score: input.score,
    setCount: Math.max(input.score.player1.length, input.score.player2.length),
    player1Label,
    player2Label,
    ends,
  };

  // The vendor's first server is tried first, so it keeps a tie.
  const vendorFirst = evidence[0]?.vendorServer;
  const candidates = input.firstServer
    ? [input.firstServer]
    : vendorFirst === player2Label
      ? [player2Label, player1Label]
      : [player1Label, player2Label];

  const fits = bestOver(evidence, { ...base, constrained: true }, candidates);
  const fit = fits[0];
  if (fit) {
    // The runner-up is reported only when it is a contender: a clean fit
    // has one at some distant cost (flip everything) and says nothing.
    const runnerUp = fits.find((r) => r.path.sig !== fit.path.sig) ?? null;
    const ambiguous =
      runnerUp !== null &&
      runnerUp.path.cost - fit.path.cost < AMBIGUITY_MARGIN;
    return {
      status: ambiguous ? "ambiguous" : "fit",
      version: 1,
      cost: fit.path.cost,
      runnerUpCost: ambiguous && runnerUp ? runnerUp.path.cost : null,
      closestScore: null,
      ...replay(fit.path, evidence, fit.run),
    };
  }

  // No path reaches the entered score. Report the cheapest path that plays
  // every rally by the rules of tennis alone — or, when even that dies, the
  // one that got furthest — and the score it reached.
  const closest = bestOver(
    evidence,
    { ...base, constrained: false },
    candidates,
  )[0];
  if (!closest) {
    // Unreachable in practice: the unconstrained path always has layer 0.
    return emptyProposal("no_fit", { player1: [], player2: [] });
  }
  return {
    status: "no_fit",
    version: 1,
    cost: closest.path.cost,
    runnerUpCost: null,
    closestScore: scoreOf(closest.path.final),
    ...replay(closest.path, evidence, closest.run),
  };
}
