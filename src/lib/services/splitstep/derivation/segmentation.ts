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
 * (set, games in the set, points in the game capped at deuce equivalence);
 * each step consumes one rally as one point, won by the server or by the
 * receiver; a step pays for every piece of evidence it contradicts; and the
 * final state must equal the entered score, set by set. The cheapest path is
 * the proposal. Who serves each game follows from the first server and the
 * game count alone, so the path is run once per candidate first server and
 * the cheaper run wins.
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
 *
 * TODO(T5): the rally-pair merge step, the runner-up cost and `ambiguous`,
 * tiebreaks at 6–6, the two gap costs, and a video that starts mid-match.
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
  /** 1-based within the set, not match-cumulative (`points.game_number` is). */
  game: number;
  server: "player1" | "player2";
  firstRallyId: number;
  lastRallyId: number;
  winner: "player1" | "player2";
}

export interface SegmentationProposal {
  /** TODO(T5): `ambiguous`. */
  status: "fit" | "ambiguous" | "no_fit";
  version: 1;
  cost: number;
  /** Cost of the best path with any different game assignment. TODO(T5): always null. */
  runnerUpCost: number | null;
  /** Fit only, or the closest reachable on no_fit. */
  games: ProposedGame[];
  /** Rally pairs consumed as one point. TODO(T5): always empty. */
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
 * The weights, from the design table. First guesses against three labelled
 * matches; T9 tunes them HERE and nowhere else — no other line may carry a
 * weight. End outranks everything because the schedule named the server on
 * every labelled game; a vendor boundary is worth one unit, so the cheapest
 * fit is also the one that moves the fewest of them.
 */
export const SEGMENT_COSTS = {
  /** Serve end is not the end the schedule puts this game's server at. */
  end: 5,
  /** Serve side is not the side the point count expects (free on a no-ad deciding point). */
  side: 2,
  /** Outcome flipped against a high-confidence winner. */
  flipHigh: 4,
  /** Outcome flipped against a low-confidence winner. */
  flipLow: 1,
  /** A proposed game boundary where the vendor's game key did not change. */
  vendorBoundaryMoved: 1,
  /** A vendor game boundary the proposal does not keep. */
  vendorBoundaryDropped: 1,
} as const;

export type CostRow = keyof typeof SEGMENT_COSTS;

const COST_ROWS = Object.keys(SEGMENT_COSTS) as CostRow[];

type Outcome = "server" | "receiver";
const OUTCOMES: readonly Outcome[] = ["server", "receiver"];

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
  /** Points in the current game, capped at deuce equivalence (3–3, 4–3, 3–4). */
  ps: number;
  pr: number;
  /** Unique per score; the layer map's key. */
  key: number;
}

/** g1, g2 < 8 and ps, pr < 5 once capped, so this never collides. */
function keyOf(
  sets: SetsEntry,
  g1: number,
  g2: number,
  ps: number,
  pr: number,
) {
  return (((sets.id * 8 + g1) * 8 + g2) * 5 + ps) * 5 + pr;
}

function stateOf(
  sets: SetsEntry,
  g1: number,
  g2: number,
  ps: number,
  pr: number,
): State {
  return { sets, g1, g2, ps, pr, key: keyOf(sets, g1, g2, ps, pr) };
}

/** What one rally says about itself, read once up front. */
interface RallyEvidence {
  rallyId: number;
  end: CourtEnd | null;
  side: ServeSide | null;
  vendorServer: string;
  vendorGameStart: boolean;
  outcome: RallyOutcome;
}

function readEvidence(input: SegmentationInput): RallyEvidence[] {
  return input.rallies.map((rally, i) => {
    const serve = rally.strokes[lastServeIndex(rally)] ?? rally.strokes[0];
    return {
      rallyId: rally.rallyId,
      end: serveEnd(rally),
      side: serve
        ? serveCourtSide(serve.playerX ?? null, serve.playerY ?? null)
        : null,
      vendorServer: rally.server,
      vendorGameStart: i === 0 || (input.vendorGameStarts[i] ?? false),
      outcome: input.outcomes[i] ?? { won: null, confidence: "low" },
    };
  });
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
  /** `expectedEnd` by (sets, games before in set, server is first server). */
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
function serverOf(s: State, rules: Rules): string {
  const played = s.sets.gamesTotal + s.g1 + s.g2;
  return played % 2 === 0
    ? rules.firstServer
    : otherLabel(rules, rules.firstServer);
}

/**
 * The end the schedule puts this game's server at, or null when unknown.
 * Memoised: it depends only on the finished sets, the games played in this
 * set and which player serves, and every layer asks the same questions.
 */
function expectedEnd(s: State, run: Run, server: string): CourtEnd | null {
  const { rules } = run;
  if (!rules.ends) return null;
  const before = s.g1 + s.g2;
  const key =
    (s.sets.id * 16 + before) * 2 + (server === rules.firstServer ? 0 : 1);
  const hit = run.endCache.get(key);
  if (hit) return hit;
  const top = playerAtEnd({
    ...rules.ends,
    completedSets: s.sets.totals,
    gamesBeforeInSet: before,
    end: "top",
  });
  const end: CourtEnd = top === server ? "top" : "bottom";
  run.endCache.set(key, end);
  return end;
}

function isDecidingPoint(s: State, rules: Rules): boolean {
  return !rules.adScoring && s.ps === 3 && s.pr === 3;
}

/** The side the point count expects; null on a no-ad deciding point. */
function expectedSide(s: State, rules: Rules): ServeSide | null {
  if (isDecidingPoint(s, rules)) return null;
  return (s.ps + s.pr) % 2 === 0 ? "deuce" : "ad";
}

/**
 * What consuming `rally` as `outcome` from state `s` costs. With `breakdown`
 * each row's share is also added to it — the replay's tally.
 */
function stepCost(
  s: State,
  rally: RallyEvidence,
  run: Run,
  outcome: Outcome,
  breakdown?: Record<CostRow, number>,
): number {
  const { rules } = run;
  let total = 0;
  const pay = (row: CostRow) => {
    total += SEGMENT_COSTS[row];
    if (breakdown) breakdown[row] += SEGMENT_COSTS[row];
  };

  if (rally.end !== null) {
    const end = expectedEnd(s, run, serverOf(s, rules));
    if (end !== null && rally.end !== end) pay("end");
  }

  if (rally.side !== null) {
    const side = expectedSide(s, rules);
    if (side !== null && rally.side !== side) pay("side");
  }

  if (rally.outcome.won !== null && rally.outcome.won !== outcome) {
    pay(rally.outcome.confidence === "high" ? "flipHigh" : "flipLow");
  }

  const opensGame = s.ps === 0 && s.pr === 0;
  if (opensGame && !rally.vendorGameStart) pay("vendorBoundaryMoved");
  if (!opensGame && rally.vendorGameStart) pay("vendorBoundaryDropped");

  return total;
}

/** A set ends at 6 with a two-game margin or at 7–5. TODO(T5): 6–6 → tiebreak. */
function setOver(g1: number, g2: number): boolean {
  return (g1 >= 6 || g2 >= 6) && Math.abs(g1 - g2) >= 2;
}

function setsWon(sets: SetsEntry, who: 1 | 2): number {
  return sets.sets.filter(([a, b]) => (who === 1 ? a > b : b > a)).length;
}

/**
 * The state after `outcome` on the rally; null when that path is dead — it
 * would play a point after the match ended, reach 6–6 (no tiebreak yet), or,
 * under the end condition, leave the entered score unreachable.
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

  const server = serverOf(s, rules);
  const winner = outcome === "server" ? server : otherLabel(rules, server);
  const g1 = s.g1 + (winner === rules.player1Label ? 1 : 0);
  const g2 = s.g2 + (winner === rules.player1Label ? 0 : 1);

  const t1 = rules.score.player1[k] ?? 0;
  const t2 = rules.score.player2[k] ?? 0;
  if (rules.constrained && (g1 > t1 || g2 > t2)) return null;

  if (setOver(g1, g2)) {
    if (rules.constrained && (g1 !== t1 || g2 !== t2)) return null;
    return stateOf(internSets(run, s.sets, g1, g2), 0, 0, 0, 0);
  }
  if (g1 === 6 && g2 === 6) return null; // TODO(T5): tiebreak
  return stateOf(s.sets, g1, g2, 0, 0);
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
  return s.ps === 0 && s.pr === 0 && sameScore(scoreOf(s), rules.score);
}

interface Node {
  state: State;
  cost: number;
  /** Key of the state this one was reached from, in the previous layer. */
  prev: number | null;
  outcome: Outcome | null;
}

interface Path {
  cost: number;
  outcomes: Outcome[];
  /** The state after the last rally. */
  final: State;
  /** Rallies consumed; short of the input when every path died early. */
  consumed: number;
}

/**
 * The shortest path. Layer i holds every live state before rally i is
 * consumed, keyed by score, keeping the cheapest way in. Returns the cheapest
 * accepted final state, and under `constrained` only one that reaches the
 * entered score. Null when no path reaches the end of the rallies at all.
 */
function shortestPath(evidence: RallyEvidence[], run: Run): Path | null {
  const { rules, start } = run;
  const layers: Map<number, Node>[] = [
    new Map([
      [start.key, { state: start, cost: 0, prev: null, outcome: null }],
    ]),
  ];

  for (let i = 0; i < evidence.length; i += 1) {
    const next = new Map<number, Node>();
    for (const node of layers[i].values()) {
      for (const outcome of OUTCOMES) {
        const state = advance(node.state, run, outcome);
        if (!state) continue;
        const cost =
          node.cost + stepCost(node.state, evidence[i], run, outcome);
        const seen = next.get(state.key);
        if (!seen || cost < seen.cost) {
          next.set(state.key, { state, cost, prev: node.state.key, outcome });
        }
      }
    }
    if (next.size === 0) break;
    layers.push(next);
  }

  const consumed = layers.length - 1;
  let best: Node | null = null;
  for (const node of layers[consumed].values()) {
    if (
      consumed === evidence.length &&
      rules.constrained &&
      !reachesScore(node.state, rules)
    ) {
      continue;
    }
    if (!best || node.cost < best.cost) best = node;
  }
  if (!best) return null;
  if (rules.constrained && consumed < evidence.length) return null;

  const outcomes: Outcome[] = [];
  let node: Node | null = best;
  for (let i = consumed; i > 0 && node; i -= 1) {
    if (node.outcome) outcomes.unshift(node.outcome);
    node = node.prev === null ? null : (layers[i - 1].get(node.prev) ?? null);
  }
  return { cost: best.cost, outcomes, final: best.state, consumed };
}

/** The path replayed: its games, its diff against the vendor, and what each row cost. */
function replay(
  path: Path,
  evidence: RallyEvidence[],
  run: Run,
): Pick<SegmentationProposal, "games" | "diff" | "costBreakdown"> {
  const { rules } = run;
  const breakdown = Object.fromEntries(
    COST_ROWS.map((row) => [row, 0]),
  ) as Record<CostRow, number>;
  const games: ProposedGame[] = [];
  const differing = new Set<number>();
  let proposedOnly = 0;
  let vendorOnly = 0;
  let serversChanged = 0;

  const side = (label: string): "player1" | "player2" =>
    label === rules.player1Label ? "player1" : "player2";

  let state = run.start;
  let open: { server: string; firstRallyId: number } | null = null;
  for (let i = 0; i < path.outcomes.length; i += 1) {
    const rally = evidence[i];
    const outcome = path.outcomes[i];
    stepCost(state, rally, run, outcome, breakdown);

    const server = serverOf(state, rules);
    const opensGame = state.ps === 0 && state.pr === 0;
    if (opensGame) open = { server, firstRallyId: rally.rallyId };
    if (opensGame !== rally.vendorGameStart) {
      if (opensGame) proposedOnly += 1;
      else vendorOnly += 1;
      differing.add(rally.rallyId);
    }
    if (server !== rally.vendorServer) {
      serversChanged += 1;
      differing.add(rally.rallyId);
    }

    const next = advance(state, run, outcome);
    if (!next) break;
    const closed = next.ps === 0 && next.pr === 0;
    if (closed && open) {
      const winner = outcome === "server" ? server : otherLabel(rules, server);
      // The game is counted in the set it was played in, even when it ended that set.
      const game = state.g1 + state.g2 + 1;
      games.push({
        set: state.sets.sets.length + 1,
        game,
        server: side(server),
        firstRallyId: open.firstRallyId,
        lastRallyId: rally.rallyId,
        winner: side(winner),
      });
      open = null;
    }
    state = next;
  }
  // A game still in play when the rallies ran out has no winner and is not listed.

  return {
    games,
    diff: {
      gamesMoved: Math.max(proposedOnly, vendorOnly),
      serversChanged,
      rallies: [...differing].sort((a, b) => a - b),
    },
    costBreakdown: breakdown,
  };
}

/** Run the path for each candidate first server; the cheaper wins, first in on a tie. */
function bestOver(
  evidence: RallyEvidence[],
  base: Omit<Rules, "firstServer">,
  candidates: readonly string[],
): { path: Path; run: Run } | null {
  let best: { path: Path; run: Run } | null = null;
  for (const firstServer of candidates) {
    const run = startRun({ ...base, firstServer });
    const path = shortestPath(evidence, run);
    if (!path) continue;
    // On no_fit, the path that got furthest is the closest, then the cheapest.
    if (
      !best ||
      path.consumed > best.path.consumed ||
      (path.consumed === best.path.consumed && path.cost < best.path.cost)
    ) {
      best = { path, run };
    }
  }
  return best;
}

export function proposeSegmentation(
  input: SegmentationInput,
): SegmentationProposal {
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

  const fit = bestOver(evidence, { ...base, constrained: true }, candidates);
  if (fit) {
    return {
      status: "fit",
      version: 1,
      cost: fit.path.cost,
      runnerUpCost: null,
      merges: [],
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
  );
  if (!closest) {
    // Unreachable in practice: the unconstrained path always has layer 0.
    return {
      status: "no_fit",
      version: 1,
      cost: 0,
      runnerUpCost: null,
      games: [],
      merges: [],
      closestScore: { player1: [], player2: [] },
      diff: { gamesMoved: 0, serversChanged: 0, rallies: [] },
      costBreakdown: Object.fromEntries(
        COST_ROWS.map((row) => [row, 0]),
      ) as Record<CostRow, number>,
    };
  }
  return {
    status: "no_fit",
    version: 1,
    cost: closest.path.cost,
    runnerUpCost: null,
    merges: [],
    closestScore: scoreOf(closest.path.final),
    ...replay(closest.path, evidence, closest.run),
  };
}
