/**
 * Who hit each stroke, from the end of the court it was struck at.
 *
 * The vendor names the hitter with a player label that swaps for whole points
 * at a time: about 190 whole-point swaps against 12 partial ones across the
 * labelled sessions, 22–26% of strokes on the worst matches. The positions
 * are right; only the names are swapped. A stroke's `playerY` says which end
 * it was struck from (+y = top of frame, as `serveEnd` reads it), and the
 * changeover schedule says who stands at each end in every game
 * (position.ts). So the hitter is the player who owns that end in that game.
 *
 * The games come from the caller — the segmenter's proposal, which fits the
 * entered score — because the schedule counts games and the vendor's own cut
 * is wrong exactly where its labels are. Within a set the top end changes
 * owner after games 1, 3, 5, … and every 6 points of a tiebreak, so a set
 * has two possible orientations; the one the vendor's labels agree with most
 * wins, set by set. That vote needs no `initial_top_player_is_player1` and
 * survives a set break counted wrong, since each set decides on its own.
 *
 * A match tiebreak — a set the proposal plays as one game and the entered
 * score calls 1-0, a 10-point tiebreak in place of a third set — is the
 * exception. The vendor
 * swaps most of that short set, so its own vote comes out inverted (both
 * labelled matches that have one, 9c00c1b4 and d2144c26). It takes the set
 * before it's orientation instead, carried across that set's end changes
 * (`swapsInSet`, as position.ts counts them), and changes ends every 6
 * points like any tiebreak. Found by the label console's own court-end rule
 * (labels/court-end.ts), which measured 211 of 214 swapped points caught with
 * that inheritance.
 *
 * Tiebreak end changes count points, not rallies: a rally the proposal
 * merges into the one before it is the same point.
 *
 * A stroke with no position, or one on the net line, takes the other player
 * from the stroke before it in the same rally (a rally alternates hitters
 * after the serve) when that stroke was placed; a serve with no position, or
 * a stroke after one the rule could not place, keeps the vendor's label.
 * Rallies outside every proposed game keep the vendor's labels too.
 *
 * Pure: no I/O. Measured only (scripts/splitstep-eval.ts --hitters-by-end);
 * nothing published reads it yet.
 */

import { swapsInSet } from "./position";
import type { MatchScore } from "./reconcile";
import type { ProposedGame } from "./segmentation";
import type { SplitStepRally, SplitStepStroke } from "./types";

type End = "top" | "bottom";

export interface HitterRelabel {
  /** Every rally, in the order given, with corrected labels and `server`. */
  rallies: SplitStepRally[];
  /** Strokes whose label changed. */
  changed: number;
  /** Strokes the rule placed (an end, or alternation from one). */
  placed: number;
  /** Strokes in rallies the rule could place at all. */
  covered: number;
}

function endOf(stroke: SplitStepStroke): End | null {
  const y = stroke.playerY;
  if (y === null || y === 0) return null;
  return y > 0 ? "top" : "bottom";
}

/** End changes inside a set before a game: after games 1, 3, 5, … and every 6 tiebreak points. */
function swapsBefore(
  gamesBeforeInSet: number,
  tiebreakPointsBefore: number,
): number {
  return Math.ceil(gamesBeforeInSet / 2) + Math.floor(tiebreakPointsBefore / 6);
}

export interface HitterProposal {
  /** The segmenter's games (`SegmentationProposal.games`). */
  games: readonly ProposedGame[];
  /** Rally pairs it plays as one point; the second never counts as a point. */
  merges?: ReadonlyArray<readonly [number, number]>;
  /**
   * The entered result. A set the proposal plays as one game is a match
   * tiebreak only when this scores it 1-0 or as tiebreak points (10-8);
   * without a score, any one-game set is taken for one.
   */
  score?: MatchScore | null;
}

/**
 * The rallies with each stroke's `playerLabel` set to the player at the end it
 * was struck from, under the proposed games. `labels` are the match's two
 * vendor labels.
 */
export function hittersByCourtEnd(
  rallies: readonly SplitStepRally[],
  { games, merges = [], score = null }: HitterProposal,
  labels: readonly [string, string],
): HitterRelabel {
  const position = new Map(rallies.map((r, i) => [r.rallyId, i]));
  const mergedAway = new Set(merges.map(([, second]) => second));

  // A set the proposal plays as one game, and the score as 1-0, is a match
  // tiebreak. A one-game set the score does not call 1-0 is a video that
  // stopped (or a path that did not fit), not a tiebreak.
  const gamesPerSet = new Map<number, number>();
  for (const game of games) {
    gamesPerSet.set(game.set, (gamesPerSet.get(game.set) ?? 0) + 1);
  }
  // Entered either as 1-0, or as the tiebreak's own points (10-8): no
  // played-out set reaches 10 games.
  const isMatchTiebreak = (set: number) => {
    if (gamesPerSet.get(set) !== 1) return false;
    if (score === null) return true;
    const a = score.player1[set - 1] ?? 0;
    const b = score.player2[set - 1] ?? 0;
    return a + b === 1 || Math.max(a, b) >= 10;
  };

  // Per rally: its set and the end swaps before it inside that set.
  const placeOf = new Map<number, { set: number; swaps: number }>();
  // Per set: the points its closing tiebreak ran to, for `swapsInSet`.
  const tiebreakPoints = new Map<number, number>();
  for (const game of games) {
    const from = position.get(game.firstRallyId);
    const to = position.get(game.lastRallyId);
    if (from === undefined || to === undefined) continue;
    const tiebreak = game.game === 13 || isMatchTiebreak(game.set);
    // Points, not rallies: a merged-away rally is the point before it.
    let pointsBefore = 0;
    for (let i = from; i <= to; i += 1) {
      const rallyId = rallies[i].rallyId;
      const continues = mergedAway.has(rallyId) && i > from;
      if (continues) pointsBefore -= 1;
      placeOf.set(rallyId, {
        set: game.set,
        swaps: swapsBefore(game.game - 1, tiebreak ? pointsBefore : 0),
      });
      pointsBefore += 1;
    }
    if (tiebreak) tiebreakPoints.set(game.set, pointsBefore);
  }

  // Set by set, the orientation the vendor's labels agree with most.
  // orientation[set] = the label at the top when the swap count is even.
  const votes = new Map<number, [number, number]>();
  for (const rally of rallies) {
    const place = placeOf.get(rally.rallyId);
    if (!place) continue;
    const tally = votes.get(place.set) ?? [0, 0];
    for (const stroke of rally.strokes) {
      const end = endOf(stroke);
      if (!end) continue;
      const flipped = (place.swaps % 2 === 1) !== (end === "bottom");
      // Under orientation k the top-at-even-swaps label is labels[k].
      for (const k of [0, 1] as const) {
        const owner = flipped ? labels[1 - k] : labels[k];
        if (owner === stroke.playerLabel) tally[k] += 1;
      }
    }
    votes.set(place.set, tally);
  }
  const topAtEven = new Map<number, string>();
  const other = (label: string) =>
    label === labels[0] ? labels[1] : labels[0];
  for (const set of [...votes.keys()].sort((x, y) => x - y)) {
    const before = topAtEven.get(set - 1);
    if (isMatchTiebreak(set) && before !== undefined) {
      // Carried from the set before: its start, across its end changes.
      const games = gamesPerSet.get(set - 1) ?? 0;
      const closing = tiebreakPoints.get(set - 1);
      const swaps = swapsInSet(
        closing === undefined ? games : { games, tiebreakPoints: closing },
      );
      topAtEven.set(set, swaps % 2 === 1 ? other(before) : before);
      continue;
    }
    const [a, b] = votes.get(set)!;
    topAtEven.set(set, a >= b ? labels[0] : labels[1]);
  }

  let changed = 0;
  let placed = 0;
  let covered = 0;
  const out = rallies.map((rally) => {
    const place = placeOf.get(rally.rallyId);
    const top = place ? topAtEven.get(place.set) : undefined;
    if (!place || top === undefined) return rally;
    const bottom = other(top);
    const swapped = place.swaps % 2 === 1;
    const owner = (end: End) => ((end === "top") !== swapped ? top : bottom);

    const strokes: SplitStepStroke[] = [];
    // Whether the stroke before was placed: a fill from a stroke that kept
    // the vendor's label would carry the vendor's swap forward.
    let beforePlaced = false;
    for (const stroke of rally.strokes) {
      covered += 1;
      const end = endOf(stroke);
      const before = strokes.at(-1);
      let label = stroke.playerLabel;
      if (end) {
        label = owner(end);
        placed += 1;
        beforePlaced = true;
      } else if (before && beforePlaced && stroke.strokeType !== "serve") {
        label = other(before.playerLabel);
        placed += 1;
      } else {
        beforePlaced = false;
      }
      if (label !== stroke.playerLabel) changed += 1;
      strokes.push(
        label === stroke.playerLabel
          ? stroke
          : { ...stroke, playerLabel: label },
      );
    }
    return {
      ...rally,
      strokes,
      server: strokes[0]?.playerLabel ?? rally.server,
      serves: strokes.filter((s) => s.strokeType === "serve"),
    };
  });

  return { rallies: out, changed, placed, covered };
}
