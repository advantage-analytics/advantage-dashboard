/**
 * A set that is over with games still filed under it: those games are the
 * next set's, and the console moves them there by itself.
 *
 * The vendor's games are cut into sets from the entered score, counting from
 * 0–0. A video that starts mid-set (`LabelStartScore`) has fewer of the first
 * set's games on it than that, so the next set's first games sit under the
 * old set — Rudy v Balciunas started at 2–0 of a 6–3 set and read "Set 1 ends
 * 8–4". A game the labeller splits in two does the same to any set.
 *
 * A set is cut where its labelled games, counted from the start, reach the
 * entered score for that set EXACTLY, every game up to there settled, with
 * more games after it in the same set. The entered score is the rule, so no
 * format is guessed (a pro set to 8 cuts at 8), a wrong winner never cuts
 * early (the tally would not be the entered one), and a set with a game still
 * unfinished waits until it is not. The deciding set the record spells as a
 * match tiebreak is left alone, as the shift and pull slots leave it, and so
 * is a set at 6–6 whose tiebreak is not folded yet (tiebreak-fold.ts).
 *
 * The moved points keep their game number (match-cumulative, so it cannot
 * meet one in the next set), their server and their type: only `set_number`
 * and the `status` that implies change. One set at a time — the console runs
 * it again on the rows it leaves, which is how a cut cascades down a match.
 *
 * The other way round is a join (`setJoin`): a set with FEWER games on the
 * rows than its entered score has, and another set after it. The labeller
 * made two of the vendor's games one, so the set's last game sits at the head
 * of the next set: that set's first game moves back, one game a pass, until
 * the count is the entered one. Counted in games, not winners — a set short
 * of games is short whoever won them — so it runs while the labeller is
 * still putting the set's endings right. Only where a game the set was
 * seeded with is gone from it (`lostSeededGame`): a set short because the
 * video never held one of its games is left alone, since joining there would
 * shift every set after it. Never from a match tiebreak, never
 * into a set waiting on its 6–6 fold, and never for the last set on the
 * rows: with nothing after it, a short set is a video that ends early or a
 * game still to split, and the mismatch slot says so. A cut needs more
 * games than the score and a join fewer, so the two never undo each other.
 *
 * Pure: the console plans it on its rows and game-shift-session.ts on the
 * rows as read.
 */

import { shiftWrite, type GameShiftWrite, type ShiftPoint } from "./game-shift";
import { gameKey, labelScores, type LabelGameBand } from "./score";
import type { LabelStartScore } from "./session";
import { tiebreakFolds } from "./tiebreak-fold";

export interface SetCut {
  /** The set that is over — or, for a join, the set short of games. */
  setNumber: number;
  /**
   * The games after its end, as `gameKey` spells them, in point order; for a
   * join, the next set's first game.
   */
  gameKeys: string[];
  /** A join: `gameKeys` move INTO `setNumber` from the set after it. */
  join?: true;
}

/**
 * The first set, in set order, that reaches its entered score with games
 * left over; null when none does or nothing was entered.
 */
export function setCut(
  points: readonly ShiftPoint[],
  adScoring: boolean,
  /** `enteredScore(finalScore, matchScore)`: `[p1, p2]` per set. */
  entered: readonly (readonly number[])[] | null,
  matchTiebreakSet: number | null,
  start: LabelStartScore | null,
  /** `labelScores(points, adScoring, start).games`, when the caller has it. */
  scored?: readonly LabelGameBand[],
): SetCut | null {
  if (!entered) return null;
  const games = scored ?? labelScores(points, adScoring, start).games;
  if (games.length === 0) return null;
  const opening = games[0].setNumber;
  const sets = [...new Set(games.map((band) => band.setNumber))].sort(
    (a, b) => a - b,
  );
  // A set still to be folded at 6–6 has its tiebreak cut into ordinary games
  // by the vendor: a piece of it can read as the game that makes 7–6.
  // Read only once a set reaches its score: most passes find no cut at all.
  let folding: Set<number> | null = null;
  const toFold = (setNumber: number) => {
    folding ??= new Set(
      tiebreakFolds(points, adScoring, matchTiebreakSet, start).map(
        (fold) => fold.setNumber,
      ),
    );
    return folding.has(setNumber);
  };
  for (const setNumber of sets) {
    if (setNumber === matchTiebreakSet) continue;
    const want = entered[setNumber - 1];
    if (!want) continue;
    const [want1 = 0, want2 = 0] = want;
    if (want1 + want2 === 0) continue;
    const tally: [number, number] =
      start && setNumber === opening
        ? [start.games[0], start.games[1]]
        : [0, 0];
    const bands = games.filter((band) => band.setNumber === setNumber);
    for (const [i, band] of bands.entries()) {
      if (band.outcome.kind === "unfinished") break;
      tally[band.outcome.winner === "p1" ? 0 : 1] += 1;
      if (tally[0] > want1 || tally[1] > want2) break;
      if (tally[0] !== want1 || tally[1] !== want2) continue;
      const after = bands.slice(i + 1);
      if (after.length === 0 || toFold(setNumber)) break;
      return { setNumber, gameKeys: after.map((b) => gameKey(b)) };
    }
  }
  return null;
}

/**
 * The first set, in set order, with fewer games on the rows than its entered
 * score has and a set after it to take one from (see the file comment); null
 * when none is, or nothing was entered.
 */
export function setJoin(
  points: readonly ShiftPoint[],
  adScoring: boolean,
  entered: readonly (readonly number[])[] | null,
  matchTiebreakSet: number | null,
  start: LabelStartScore | null,
  scored?: readonly LabelGameBand[],
): SetCut | null {
  if (!entered) return null;
  const games = scored ?? labelScores(points, adScoring, start).games;
  if (games.length === 0) return null;
  const opening = games[0].setNumber;
  const sets = [...new Set(games.map((band) => band.setNumber))].sort(
    (a, b) => a - b,
  );
  for (const [i, setNumber] of sets.entries()) {
    const next = sets[i + 1];
    if (next === undefined) break;
    if (setNumber === matchTiebreakSet || next === matchTiebreakSet) continue;
    const want = entered[setNumber - 1];
    if (!want) continue;
    const [want1 = 0, want2 = 0] = want;
    const played =
      games.filter((band) => band.setNumber === setNumber).length +
      (start && setNumber === opening ? start.games[0] + start.games[1] : 0);
    if (played >= want1 + want2) continue;
    const first = games.find((band) => band.setNumber === next);
    if (!first || first.gameType !== "game") continue;
    // Only where the rows say why the set is short: a game it was seeded
    // with is gone from it — emptied into its neighbours by the labeller,
    // or handed to the set before by a join. A game the video never had
    // was never seeded, and a set short for that reason is left alone:
    // taking the next set's first game there would shift every set after.
    if (!lostSeededGame(points, setNumber)) continue;
    const folding = tiebreakFolds(points, adScoring, matchTiebreakSet, start);
    if (folding.some((fold) => fold.setNumber === setNumber)) continue;
    return { setNumber, gameKeys: [gameKey(first)], join: true };
  }
  return null;
}

/**
 * Whether set `setNumber` was seeded with a game no live point holds in it
 * any more: its points were moved into other games, or to another set.
 */
function lostSeededGame(
  points: readonly ShiftPoint[],
  setNumber: number,
): boolean {
  const held = new Set<number>();
  for (const point of points) {
    if (point.status === "deleted" || point.setNumber !== setNumber) continue;
    if (point.gameNumber !== null) held.add(point.gameNumber);
  }
  return points.some(
    (point) =>
      point.status !== "deleted" &&
      point.seed?.set_number === setNumber &&
      point.seed.game_number !== null &&
      !held.has(point.seed.game_number),
  );
}

/** What identifies a cut, so the console never runs the same one twice. */
export function setCutKey(cut: SetCut): string {
  return `${cut.setNumber}:${cut.join ? "join:" : ""}${cut.gameKeys[0]}`;
}

export type PlannedSetCut =
  | { ok: true; cut: SetCut; writes: GameShiftWrite[]; shots: [] }
  | { error: string };

export const NO_SET_CUT =
  "No set has reached its entered score with games left over, or is short of games with a set after it.";

/**
 * The cut's writes: every live point of the games after the set's end, to
 * the next set — or, for a join, of the next set's first game, into this one.
 */
export function planSetCut(
  points: readonly ShiftPoint[],
  adScoring: boolean,
  entered: readonly (readonly number[])[] | null,
  matchTiebreakSet: number | null,
  start: LabelStartScore | null,
  scored?: readonly LabelGameBand[],
): PlannedSetCut {
  const args = [
    points,
    adScoring,
    entered,
    matchTiebreakSet,
    start,
    scored,
  ] as const;
  // The earlier set first, as a match is read; a cut needs more games than
  // the score and a join fewer, so one set never has both.
  const over = setCut(...args);
  const short = setJoin(...args);
  const cut =
    over && short
      ? over.setNumber <= short.setNumber
        ? over
        : short
      : (over ?? short);
  if (!cut) return { error: NO_SET_CUT };
  const moved = new Set(cut.gameKeys);
  const writes: GameShiftWrite[] = [];
  for (const point of points) {
    if (point.status === "deleted" || point.gameNumber === null) continue;
    if (!moved.has(gameKey(point))) continue;
    // Its own game, server and type: only the set moves, so nobody swaps.
    writes.push(
      shiftWrite(point, {
        setNumber: cut.join ? cut.setNumber : cut.setNumber + 1,
        gameNumber: point.gameNumber,
        gameType: point.gameType ?? "game",
        server: point.server,
        opened: false,
      }).write,
    );
  }
  return { ok: true, cut, writes, shots: [] };
}
