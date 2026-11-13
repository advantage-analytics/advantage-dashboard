/**
 * A new session's rows cut into games the way the score-constrained
 * segmenter proposes (splitstep/derivation/segmentation.ts), in place of the
 * vendor's own cut: each point takes the proposal's set, game and server.
 *
 * Why: the vendor's score stream drifts, so its games split at deuce and
 * carry the wrong server. Scored on 2026-11-11 against the 25 finished
 * hand-label sessions (2,061 checked points), a point sat in the right game
 * on 55% of the vendor's rows and 80% of the proposal's, the server was
 * right on 82% against 86%, and the proposal was as good or better on 23 of
 * the 25. It says nothing better about who won the point.
 *
 * A point whose server changes and whose strokes say the old server served
 * it switches players as a whole — every hitter, the winner and who ended it
 * — as a point moved into the other player's game does (player-swap.ts): the
 * vendor names hitters from the game it thought the point was in.
 *
 * Left as the vendor cut them:
 * - a match with no proposal, or one the segmenter could not fit (`no_fit`);
 * - a match whose entered score spells a match tiebreak (set-scores.ts
 *   `matchTiebreakSet`): the seed already shapes that set, and the one
 *   session the proposal made worse was one of these;
 * - a transcript the proposal does not cover whole.
 * A proposed tiebreak (game 13 of its set) takes the set and game only: its
 * serve rotates, so its one proposed server is not each point's.
 *
 * Proposed merges are not applied: the two rallies stay two rows of the same
 * game, and the rail's "Combine" joins them.
 *
 * The frozen `seed` takes the same values, so the rows read `unchanged` and
 * Reset returns to them. Only seed-session.ts calls this: a practice copy and
 * a seed backfill keep the vendor's cut their sessions were labelled from.
 * Pure.
 */

import {
  proposedPointsOf,
  type SegmentationProposal,
  type Transcript,
} from "@/lib/services/splitstep/derivation";
import type { LabelPointSeed, LabelShotSeed, LabelSide } from "./seed";
import { isServeStroke, opponent } from "./session";

/** The stroke that says who served: the last live serve, else the first hitter. */
function servingShot(shots: readonly LabelShotSeed[]): LabelShotSeed | null {
  const live = shots.filter((shot) => shot.site_removal === null);
  return live.findLast((shot) => isServeStroke(shot.stroke)) ?? live[0] ?? null;
}

/** Every hitter, the winner and who ended it, flipped; in the seed too. */
function switchPlayers(point: LabelPointSeed): LabelPointSeed {
  const flip = (side: LabelSide | null) =>
    side === null ? null : opponent(side);
  const winner = flip(point.winner);
  const ended_by = flip(point.ended_by);
  return {
    ...point,
    winner,
    ended_by,
    seed: { ...point.seed, winner, ended_by },
    shots: point.shots.map((shot) => {
      const hitter = opponent(shot.hitter);
      return { ...shot, hitter, seed: { ...shot.seed, hitter } };
    }),
  };
}

/**
 * Whether a rally sits in a proposed tiebreak: game 13 of its set
 * (`ProposedGame.game`), whose one `server` is only who served first.
 */
export function proposedTiebreakRallies(
  proposal: Pick<SegmentationProposal, "games">,
): (rallyId: number) => boolean {
  const ranges = proposal.games
    .filter((game) => game.game === 13)
    .map((game) => [game.firstRallyId, game.lastRallyId] as const);
  return (rallyId) =>
    ranges.some(([first, last]) => rallyId >= first && rallyId <= last);
}

/**
 * Whether a row was seeded on the proposal's cut for its rally: the same set
 * and game, and — outside a tiebreak — the same server. What keeps "Game cut
 * differs" off a session that already starts from the proposal.
 */
export function seededOnProposal(
  seed: {
    set_number: number | null;
    game_number: number | null;
    server: LabelSide | null;
  } | null,
  proposed: { set: number; game: number; server: "player1" | "player2" },
  tiebreak: boolean,
): boolean {
  if (!seed) return false;
  if (seed.set_number !== proposed.set || seed.game_number !== proposed.game) {
    return false;
  }
  return (
    tiebreak || seed.server === (proposed.server === "player1" ? "p1" : "p2")
  );
}

export interface ProposedCutResult {
  points: LabelPointSeed[];
  /** Whether the proposal was used; false leaves `points` as given. */
  applied: boolean;
}

export function applyProposedCut(
  points: readonly LabelPointSeed[],
  transcript: Pick<Transcript, "segmentation" | "points">,
  /** `matchTiebreakSet(score, bestOf)`: non-null leaves the vendor's cut. */
  matchTiebreakSet: number | null,
): ProposedCutResult {
  const unchanged = { points: [...points], applied: false };
  const proposal = transcript.segmentation;
  if (!proposal || proposal.status === "no_fit") return unchanged;
  if (matchTiebreakSet !== null) return unchanged;
  const proposed = proposedPointsOf(
    proposal,
    transcript.points.map((point) => point.rally_id),
  );
  if (
    points.some((point) =>
      point.vendor_rally_ids.some((rally) => !proposed.has(rally)),
    )
  ) {
    return unchanged;
  }
  const inTiebreak = proposedTiebreakRallies(proposal);

  return {
    applied: true,
    points: points.map((point) => {
      const rally = point.vendor_rally_ids[0];
      const to = rally === undefined ? undefined : proposed.get(rally);
      if (!to) return point;
      const server: LabelSide = inTiebreak(rally)
        ? point.server
        : to.server === "player1"
          ? "p1"
          : "p2";
      const moved: LabelPointSeed = {
        ...point,
        set_number: to.set,
        game_number: to.game,
        server,
        seed: {
          ...point.seed,
          set_number: to.set,
          game_number: to.game,
          server,
        },
      };
      const serve = servingShot(point.shots);
      const contradicts =
        server !== point.server && serve !== null && serve.hitter !== server;
      return contradicts ? switchPlayers(moved) : moved;
    }),
  };
}
