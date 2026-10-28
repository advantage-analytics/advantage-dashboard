import type { MatchPoint } from "@/lib/data/match-points-server";
import { resultTypeOf, type PointReading } from "@/lib/data/self-review";

/**
 * What a save moves, said back to the player afterwards ("Winners 12 → 13").
 *
 * The rules are `calculate_match_stats`' own for the rows a fix can move —
 * a winner is any `result_type` ending "Winner" on the side that won, an
 * unforced error one ending "Unforced Error" on the side that lost, an ace
 * the winner's, a double fault the server's — read for the viewer's side
 * only (`youIsPlayer1`, from `useMatchSides`, guardrails §4). The database
 * recomputes the real figures; this only names the ones that changed.
 */
export function statsMoved(
  points: MatchPoint[],
  drafts: ReadonlyMap<string, PointReading>,
  youIsPlayer1: boolean,
  storedFor: (point: MatchPoint) => PointReading,
): { moved: string[]; scoreMayNotAddUp: boolean } {
  const before = tally(points, youIsPlayer1, storedFor);
  const after = tally(
    points,
    youIsPlayer1,
    (point) => drafts.get(point.id) ?? storedFor(point),
  );
  const moved = ROWS.flatMap(([label, key]) =>
    before[key] === after[key]
      ? []
      : [`${label} ${before[key]} → ${after[key]}`],
  );
  return { moved, scoreMayNotAddUp: flipsAGame(points, drafts, storedFor) };
}

type Key = "won" | "winners" | "unforced" | "aces" | "doubleFaults";

const ROWS: [string, Key][] = [
  ["Points won", "won"],
  ["Winners", "winners"],
  ["Unforced errors", "unforced"],
  ["Aces", "aces"],
  ["Double faults", "doubleFaults"],
];

function tally(
  points: MatchPoint[],
  youIsPlayer1: boolean,
  readingFor: (point: MatchPoint) => PointReading,
): Record<Key, number> {
  const out: Record<Key, number> = {
    won: 0,
    winners: 0,
    unforced: 0,
    aces: 0,
    doubleFaults: 0,
  };
  const you = youIsPlayer1 ? "p1" : "p2";
  for (const point of points) {
    const reading = readingFor(point);
    const rt = resultTypeOf(reading) ?? point.resultType ?? "";
    const youWon = reading.winner === you;
    const youServed = point.serverIsPlayer1 === youIsPlayer1;
    if (youWon) out.won += 1;
    if (youWon && /Winner/.test(rt)) out.winners += 1;
    if (!youWon && /Unforced Error/.test(rt)) out.unforced += 1;
    if (youWon && rt === "Ace") out.aces += 1;
    if (youServed && rt === "Double Fault") out.doubleFaults += 1;
  }
  return out;
}

/** Does a fix change who won the last point of any game? */
function flipsAGame(
  points: MatchPoint[],
  drafts: ReadonlyMap<string, PointReading>,
  storedFor: (point: MatchPoint) => PointReading,
): boolean {
  const last = new Map<string, MatchPoint>();
  for (const point of points) {
    const key = `${point.setNumber}-${point.gameNumber}`;
    const seen = last.get(key);
    if (!seen || point.pointNumber > seen.pointNumber) last.set(key, point);
  }
  for (const point of last.values()) {
    const draft = drafts.get(point.id);
    if (draft && draft.winner !== storedFor(point).winner) return true;
  }
  return false;
}
