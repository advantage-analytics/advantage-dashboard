/**
 * Reset: put an edited shot or point back to the values it was seeded with.
 * Pure: reset-session.ts writes what these plan and the console runs the same
 * ones.
 *
 * The values come from the row's frozen `seed`. A row without one cannot be
 * reset: an added row never had seeded values, and a vendor row seeded before
 * the column existed waits for scripts/label-backfill-seed.ts.
 *
 * A reset leaves alone a shot's `unclear` list and a point's note. A shot
 * reset clears its point's checked mark (reset-session.ts); a point reset of
 * the point's own fields alone keeps it. Of a point's strokes it restores one thing: each one's `hitter`, back
 * to the stroke's own seed — the players' swap (player-swap.ts) flips every
 * hitter along with the point's winner and ended by, so a point reset that
 * put back the winner alone would leave the point contradicting its rows. A
 * stroke with no seed (one the labeller added) keeps its hitter, and the
 * strokes' other values are not touched.
 */

import { letResultError } from "./edit";
import type { Planned } from "./operations";
import {
  applyShotSwaps,
  moveSwapsPlayers,
  planShotHitter,
  type ShotSwapWrite,
  type SwapShot,
} from "./player-swap";
import {
  isWithdrawnAdd,
  opponent,
  type LabelPoint,
  type LabelPointSeedValues,
  type LabelPointStatus,
  type LabelShot,
  type LabelShotSeedValues,
  type LabelShotStatus,
} from "./session";

/**
 * The columns a shot reset writes: its seed, `kept`, and the call handed back
 * to the vendor (`result_called` false).
 */
export type ShotResetWrite = LabelShotSeedValues & {
  status: "kept";
  result_called: false;
};

/**
 * The columns a point reset writes: its seed (less the game type), and
 * `unchanged` — or, for a point that sits in another game than it was seeded
 * in, the game it sits in now and `edited` (see `planPointReset`).
 */
export type PointResetWrite = Omit<LabelPointSeedValues, "game_type"> & {
  status: "unchanged" | "edited";
};

/** The whole point reset: its own columns, and each stroke whose hitter goes back. */
export type PlannedPointReset =
  | { ok: true; write: PointResetWrite; shots: ShotSwapWrite[] }
  | { error: string };

/**
 * Reset a shot to its seed. Refused for a tombstone (Undo it first), an added
 * stroke (nothing was seeded), a vendor stroke with no stored seed, and a
 * seed whose `result`/`stroke` would leave a let on a stroke that is not a
 * serve (`letResultError`).
 */
export function planShotReset(current: {
  status: LabelShotStatus;
  seed: LabelShotSeedValues | null;
}): Planned<ShotResetWrite> {
  if (current.status === "deleted") {
    return { error: "Restore this shot before resetting it." };
  }
  if (current.status === "added") {
    return { error: "An added shot has no original values to reset to." };
  }
  if (current.seed === null) {
    return {
      error:
        "This shot's original values were not stored, so it cannot be reset.",
    };
  }
  // A seed never holds a let (`labelShotResult` cannot produce one), but the
  // write puts back its stroke and result together: refused rather than
  // leaving a let on a stroke that is not a serve.
  const letError = letResultError(current.seed);
  if (letError) return { error: letError };
  return {
    ok: true,
    write: { ...current.seed, status: "kept", result_called: false },
  };
}

/**
 * Reset a point's own fields to its seed — see {@link planShotReset} — less
 * its place in the match when it has been moved to another game — and
 * each of its strokes' hitter to the stroke's seed. A stroke already hit by
 * its seeded hitter, or with no seed, gets no write; one that goes back
 * takes the status a hitter patch gives it (`planShotHitter`), a tombstone
 * keeping `deleted` with its `status_before_delete` recomputed.
 */
export function planPointReset(current: {
  status: LabelPointStatus;
  seed: LabelPointSeedValues | null;
  shots: readonly SwapShot[];
  /**
   * Where the point sits now. A point moved to another game than its seed's
   * — a boundary dragged, games combined, a set cut or joined — stays there.
   */
  setNumber?: number | null;
  gameNumber?: number | null;
  server?: LabelPointSeedValues["server"];
}): PlannedPointReset {
  if (current.status === "deleted") {
    return { error: "Restore this point before resetting it." };
  }
  if (current.status === "added") {
    return { error: "An added point has no original values to reset to." };
  }
  if (current.seed === null) {
    return {
      error:
        "This point's original values were not stored, so it cannot be reset.",
    };
  }
  const { game_type: _gameType, ...values } = current.seed;
  const { setNumber, gameNumber } = current;
  const moved =
    setNumber != null &&
    gameNumber != null &&
    (setNumber !== values.set_number || gameNumber !== values.game_number);
  const server = moved ? (current.server ?? values.server) : values.server;
  // A moved point keeps its game's server. Where that is not the server it
  // was seeded under and the seeded serve is the other player's, the seeded
  // rows are the wrong way round for the game: the players switch, as a move
  // into that game switches them (player-swap.ts `moveSwapsPlayers`).
  const seeded: SwapShot[] = current.shots.map((shot) =>
    shot.seed === null ? shot : { ...shot, hitter: shot.seed.hitter },
  );
  const switched =
    moved &&
    moveSwapsPlayers(
      {
        server: values.server,
        winner: values.winner,
        endedBy: values.ended_by,
        shots: seeded,
      },
      server,
    );
  const side = (hitter: SwapShot["hitter"]) =>
    switched && hitter !== null ? opponent(hitter) : hitter;
  const shots: ShotSwapWrite[] = [];
  for (const shot of current.shots) {
    if (shot.seed === null) continue;
    const hitter = side(shot.seed.hitter);
    if (hitter === shot.hitter) continue;
    shots.push(planShotHitter(shot, hitter));
  }
  // The seeded game type is for the opening scorecard, never a value Reset
  // puts back: a game's type is set for the whole game by its own operation.
  // Which game a point belongs to is the game's to say, not the point's:
  // the labeller moved it there with a game operation, and putting its
  // seeded set and game back would lift it out of the game its neighbours
  // are in — one row scored against a game elsewhere in the match. So a
  // moved point keeps its set, its game and that game's server, and is
  // still `edited`: it differs from its seed by where it sits.
  if (moved) {
    return {
      ok: true,
      write: {
        ...values,
        set_number: setNumber,
        game_number: gameNumber,
        server,
        winner: side(values.winner),
        ended_by: side(values.ended_by),
        status: "edited",
      },
      shots,
    };
  }
  return { ok: true, write: { ...values, status: "unchanged" }, shots };
}

/** Whether the console offers Reset on a shot: edited, with a seed. */
export function canResetShot(
  shot: Pick<LabelShot, "status" | "seed">,
): boolean {
  return shot.status === "edited" && shot.seed !== null;
}

/** Whether the console offers Reset on a point: edited, with a seed. */
export function canResetPoint(
  point: Pick<LabelPoint, "status" | "seed">,
): boolean {
  return point.status === "edited" && point.seed !== null;
}

/**
 * What a point's Reset puts back: the point as the vendor gave it. Its own
 * fields, every edited stroke, the strokes the labeller deleted brought back,
 * and the strokes the labeller added taken away again.
 */
export interface PointResetScope {
  /** The point's own fields go back (`canResetPoint`, and not a split half). */
  fields: boolean;
  /**
   * The strokes reset to their seed (`canResetShot`) — and a deleted stroke
   * that was edited before its delete, once `deletedIds` has brought it back.
   */
  shotIds: string[];
  /** The labeller's deletes, restored. A stroke added and then deleted stays gone. */
  deletedIds: string[];
  /** The labeller's live added strokes, deleted again. */
  addedIds: string[];
}

/**
 * The point's Reset: everything the labeller changed on it, as one step —
 * its own fields when they changed (held back on a point that shares a
 * vendor rally, `sharesVendorRally`: a split's halves), every edited stroke
 * with a seed, every stroke they deleted, and every stroke they added. A
 * site removal is the site's, not the labeller's, and stays as it is. Null on
 * a point the labeller added or deleted, or with nothing to put back.
 *
 * Widened 2026-10-26 from edited fields and strokes alone: "reset the whole
 * point" should leave it exactly as the vendor gave it.
 */
export function pointResetScope(
  point: Pick<LabelPoint, "status" | "seed"> & {
    shots: readonly Pick<
      LabelShot,
      "id" | "status" | "seed" | "statusBeforeDelete"
    >[];
  },
  sharesRally = false,
): PointResetScope | null {
  if (point.status === "deleted" || point.status === "added") return null;
  const fields = canResetPoint(point) && !sharesRally;
  const deleted = point.shots.filter(
    (shot) => shot.status === "deleted" && !isWithdrawnAdd(shot),
  );
  const shotIds = [
    ...point.shots.filter(canResetShot),
    ...deleted.filter(
      (shot) => shot.statusBeforeDelete === "edited" && shot.seed !== null,
    ),
  ].map((shot) => shot.id);
  const deletedIds = deleted.map((shot) => shot.id);
  const addedIds = point.shots
    .filter((shot) => shot.status === "added")
    .map((shot) => shot.id);
  return fields || shotIds.length + deletedIds.length + addedIds.length > 0
    ? { fields, shotIds, deletedIds, addedIds }
    : null;
}

// ── The console's camelCase rows ────────────────────────────────────────────

/** `shot` reset to its seed, as the console shows it. Unchanged if refused. */
export function applyShotReset(shot: LabelShot): LabelShot {
  const plan = planShotReset(shot);
  if ("error" in plan) return shot;
  const { write } = plan;
  return {
    ...shot,
    status: write.status,
    hitter: write.hitter,
    stroke: write.stroke,
    result: write.result,
    resultCalled: write.result_called,
    spin: write.spin,
    contactX: write.contact_x,
    contactY: write.contact_y,
    landingX: write.landing_x,
    landingY: write.landing_y,
    videoTime: write.video_time,
  };
}

/**
 * `point` reset to its seed, its strokes' hitters with it; its note and
 * checked mark are untouched, and so is `shots` itself when no hitter moves.
 */
export function applyPointReset(point: LabelPoint): LabelPoint {
  const plan = planPointReset(point);
  if ("error" in plan) return point;
  const { write } = plan;
  const reset: LabelPoint = {
    ...point,
    status: write.status,
    setNumber: write.set_number,
    gameNumber: write.game_number,
    server: write.server,
    serveSide: write.serve_side,
    winner: write.winner,
    ending: write.ending,
    endedBy: write.ended_by,
  };
  return applyShotSwaps([reset], plan.shots)[0];
}
