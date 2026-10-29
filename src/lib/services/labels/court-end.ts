/**
 * Players the wrong way round for their end of the court: the vendor names
 * the two players by a label it can swap, while the positions it measures are
 * right, and a swap flips a whole point at once (about 190 whole-point flips
 * against 12 partial across the labels, 2026-10-23). Who is at which end is
 * not a guess, though: players change ends after the first game of a set and
 * every two games after, and every six points of a tiebreak. So once a set's
 * games are right, each stroke's end names its hitter.
 *
 * Measured 2026-10-28 on 16 complete sessions, 11,194 vendor strokes: with
 * the labelled games the end names the labelled hitter on 97.2% (100% on 12
 * of the 16); with the seeded games, 91.9% — no better than the vendor's own
 * 91.2%, because a wrong game boundary flips the ends of every game after it.
 * That is why this is a console slot and not a derivation rule: it is offered
 * only on games the labeller has vouched for — a game whose start they locked
 * (`gameStartLocked`), or any game of a set whose labelled games already make
 * the entered score (`settledSets`, from set-scores.ts).
 *
 * Per set, which player owns which end is read from the rows themselves: the
 * majority of the set's strokes, each one's end turned by the changeovers
 * before it. A set with fewer than `MIN_SET_STROKES` placed strokes, or a
 * level vote, says nothing. A match tiebreak inherits the set before's ends
 * instead, carried through that set's end changes (position.ts `swapsInSet`:
 * after its odd games, so `ceil(games / 2)`, and inside a closing tiebreak). A point is the wrong way round when more of its
 * live strokes are hit from the other player's end than from their own. A
 * point the labeller has already given a hitter of their own (any stroke's
 * hitter off its seed, or an added stroke) is theirs and never offered, as a
 * labeller's own server stands in game-serve-order.ts.
 *
 * The fix is "Switch players" (player-swap.ts `planPlayerSwitch`) on each
 * point — winner and ended-by flip with the strokes, `server` stays — run as
 * one action, so ⌘Z takes the whole game back at once.
 *
 * Pure: the rail draws the slot, the console runs the fix.
 */

import { BASELINE_M } from "@/lib/services/splitstep/derivation/court";
import { swapsInSet } from "@/lib/services/splitstep/derivation/position";
import type { SwapShot } from "./player-swap";
import type { LabelGame } from "./operations";
import type { LabelGameBand, ScorablePoint } from "./score";
import {
  isLiveShot,
  type LabelPoint,
  type LabelShot,
  type LabelSide,
  type LabelStartScore,
  type MatchScore,
} from "./session";
import { enteredScore, labelSetScores } from "./set-scores";

/** The fewest placed strokes a set needs before its ends are read. */
export const MIN_SET_STROKES = 12;

/**
 * A contact this close to the net (metres) names no end: a volley struck over
 * the net, or a coordinate the placement left on the line.
 */
export const NET_DEAD_ZONE_M = 0.3;

/** Points of a tiebreak between changes of end. */
const TIEBREAK_CHANGE_EVERY = 6;

export type CourtEndPoint = Pick<
  LabelPoint,
  | "id"
  | "pointIndex"
  | "status"
  | "setNumber"
  | "gameNumber"
  | "gameType"
  | "gameStartLocked"
> & { shots: readonly CourtEndShot[] };

export type CourtEndShot = Pick<
  SwapShot,
  "id" | "eventId" | "status" | "hitter" | "contactY" | "seed"
> &
  Pick<LabelShot, "siteRemoval" | "siteRemovalRestoredAt">;

export interface CourtEndSwap {
  game: LabelGame;
  /** The game's place in its set, as the rail counts it. */
  gameInSet: number;
  /** Every point of the game to switch, in point order. */
  pointIds: string[];
  /** The first of them — where the rail draws the slot. */
  pointId: string;
  /** As the rail numbers that point: `pointIndex + 1`. */
  pointNumber: number;
  /** How many of the game's live points there are. */
  gamePoints: number;
}

/** Every game with points to switch, in point order. */
export function courtEndSwaps(
  points: readonly CourtEndPoint[],
  options: {
    /** Sets whose labelled games make the entered score. */
    settledSets: ReadonlySet<number>;
    /** Where the video starts in the match; null at the beginning. */
    startScore?: LabelStartScore | null;
  },
): CourtEndSwap[] {
  const sets = new Map<number, Map<number, CourtEndPoint[]>>();
  for (const point of [...points].sort((a, b) => a.pointIndex - b.pointIndex)) {
    if (point.status === "deleted") continue;
    if (point.setNumber === null || point.gameNumber === null) continue;
    const games = sets.get(point.setNumber) ?? new Map();
    sets.set(point.setNumber, games);
    const rows = games.get(point.gameNumber);
    if (rows) rows.push(point);
    else games.set(point.gameNumber, [point]);
  }
  const firstSet = sets.keys().next().value;

  const swaps: CourtEndSwap[] = [];
  // The set before, as the next set inherits its ends from it.
  let previous = null as {
    setNumber: number;
    p1OwnsKey: boolean;
    /** End changes the whole set made, its set break included. */
    swaps: number;
  } | null;
  for (const [setNumber, byNumber] of sets) {
    const start = setNumber === firstSet ? (options.startScore ?? null) : null;
    const gamesBefore = start ? start.games[0] + start.games[1] : 0;
    // Each live point's strokes, with the changeovers before it counted.
    const games = [...byNumber.entries()].map(([gameNumber, live], i) => {
      const gameInSet = i + 1;
      const tiebreak = live[0].gameType !== "game";
      const pointsBefore =
        tiebreak && i === 0 && start ? start.points[0] + start.points[1] : 0;
      const changes = Math.floor((gamesBefore + gameInSet) / 2);
      return {
        game: { setNumber, gameNumber },
        gameInSet,
        live,
        turned: live.map((_, k) =>
          tiebreak
            ? changes + Math.floor((pointsBefore + k) / TIEBREAK_CHANGE_EVERY)
            : changes,
        ),
      };
    });

    // Does p1 own the far end when the ends are as they started the set?
    let vote = 0;
    let placed = 0;
    for (const { live, turned } of games) {
      live.forEach((point, k) => {
        for (const shot of point.shots) {
          const key = endKey(shot, turned[k]);
          if (key === null || shot.hitter === null) continue;
          placed += 1;
          vote += key === (shot.hitter === "p1") ? 1 : -1;
        }
      });
    }
    // A match tiebreak is too short to outvote a vendor that swapped most of
    // it (both match-tiebreak sessions measured came out fully inverted on
    // their own vote): it takes its ends from the set before, carried
    // through that set's end changes as position.ts counts them — after its
    // odd games, the set break, and inside a tiebreak that closed it.
    const inherited: boolean | null =
      games[0]?.live[0].gameType === "match_tiebreak" &&
      previous?.setNumber === setNumber - 1
        ? previous.p1OwnsKey !== (previous.swaps % 2 === 1)
        : null;
    const own = placed >= MIN_SET_STROKES && vote !== 0 ? vote > 0 : null;
    const p1OwnsKey: boolean | null = inherited ?? own;
    const last = games[games.length - 1];
    const setGames = gamesBefore + games.length;
    previous =
      p1OwnsKey === null
        ? null
        : {
            setNumber,
            p1OwnsKey,
            swaps: swapsInSet(
              last.live[0].gameType === "tiebreak"
                ? {
                    games: setGames,
                    tiebreakPoints:
                      last.live.length +
                      (games.length === 1 && start
                        ? start.points[0] + start.points[1]
                        : 0),
                  }
                : setGames,
            ),
          };
    if (p1OwnsKey === null) continue;

    const settled = options.settledSets.has(setNumber);
    for (const { game, gameInSet, live, turned } of games) {
      if (!settled && !live[0].gameStartLocked) continue;
      const wrong = live.filter((point, k) =>
        pointIsTurned(point, turned[k], p1OwnsKey),
      );
      if (wrong.length === 0) continue;
      swaps.push({
        game,
        gameInSet,
        pointIds: wrong.map((point) => point.id),
        pointId: wrong[0].id,
        pointNumber: wrong[0].pointIndex + 1,
        gamePoints: live.length,
      });
    }
  }
  return swaps.sort((a, b) => a.pointNumber - b.pointNumber);
}

/**
 * Whether the far end at this point is the end the set started at for the
 * far player: true when the stroke is hit from the far half after an even
 * number of changes, or from the near half after an odd one. Null when the
 * stroke is not live — deleted, or a ghost the site removed, which the rail
 * does not draw — or names no end.
 */
function endKey(shot: CourtEndShot, turned: number): boolean | null {
  if (!isLiveShot(shot) || shot.contactY === null) return null;
  const fromNet = shot.contactY - BASELINE_M;
  if (Math.abs(fromNet) <= NET_DEAD_ZONE_M) return null;
  return fromNet > 0 !== (turned % 2 === 1);
}

/** More of the point's strokes from the other player's end than its own, untouched by the labeller. */
function pointIsTurned(
  point: CourtEndPoint,
  turned: number,
  p1OwnsKey: boolean,
): boolean {
  let against = 0;
  let with_ = 0;
  for (const shot of point.shots) {
    if (!isLiveShot(shot)) continue;
    // A hitter the labeller gave is theirs: the whole point stands.
    if (shot.eventId === null || shot.seed === null) return false;
    if (shot.hitter !== shot.seed.hitter) return false;
    const key = endKey(shot, turned);
    if (key === null || shot.hitter === null) continue;
    const owner: LabelSide = key === p1OwnsKey ? "p1" : "p2";
    if (owner === shot.hitter) with_ += 1;
    else against += 1;
  }
  return against > with_;
}

/** Each swap, keyed by its first point to switch — where the rail draws it. */
export function courtEndSwapBeforePoints(
  swaps: readonly CourtEndSwap[],
): ReadonlyMap<string, CourtEndSwap> {
  return new Map(swaps.map((swap) => [swap.pointId, swap]));
}

/** "3 of 5 points in game 4 have Lee hitting from Kim's end" — the slot's reason. */
export function courtEndSwapReason(swap: CourtEndSwap): string {
  const n = swap.pointIds.length;
  const all = n === swap.gamePoints;
  const count = all
    ? n === 1
      ? "The point"
      : `All ${n} points`
    : `${n} of ${swap.gamePoints} points`;
  return `${count} in game ${swap.gameInSet} ${
    n === 1 ? "has" : "have"
  } the players at each other’s end`;
}

/**
 * The session's swaps as the rail and `]` both read them: the sets that are
 * settled are those whose labelled games make the entered score, none once
 * the labeller has said the video ends early.
 */
export function sessionCourtEndSwaps(input: {
  points: readonly (CourtEndPoint & ScorablePoint)[];
  /** `labelScores(points, adScoring, startScore).games`. */
  games: readonly LabelGameBand[];
  finalScore: readonly (readonly number[])[] | null;
  matchScore: MatchScore | null;
  videoEndsEarly: boolean | null;
  startScore: LabelStartScore | null;
}): CourtEndSwap[] {
  const settledSets = settledSetNumbers(
    labelSetScores(input.points, input.games, input.startScore),
    input.videoEndsEarly === true
      ? null
      : enteredScore(input.finalScore, input.matchScore),
  );
  return courtEndSwaps(input.points, {
    settledSets,
    startScore: input.startScore,
  });
}

/** The sets whose labelled games make the entered score, from set-scores.ts. */
export function settledSetNumbers(
  labelled: readonly { setNumber: number; games: readonly number[] }[],
  entered: readonly (readonly number[])[] | null,
): ReadonlySet<number> {
  const settled = new Set<number>();
  if (entered === null) return settled;
  for (const set of labelled) {
    const want = entered[set.setNumber - 1];
    if (!want) continue;
    if (set.games[0] === want[0] && set.games[1] === want[1]) {
      settled.add(set.setNumber);
    }
  }
  return settled;
}
