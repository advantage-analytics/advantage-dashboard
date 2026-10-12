/**
 * Reset: put an edited shot or point back to the values it was seeded with.
 * Pure: reset-session.ts writes what these plan and the console runs the same
 * ones.
 *
 * The values come from the row's frozen `seed`. A row without one cannot be
 * reset: an added row never had seeded values, and a vendor row seeded before
 * the column existed waits for scripts/label-backfill-seed.ts.
 *
 * A reset leaves alone a shot's `unclear` list and a point's note and checked
 * mark. Of a point's strokes it restores one thing: each one's `hitter`, back
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
  planShotHitter,
  type ShotSwapWrite,
  type SwapShot,
} from "./player-swap";
import type {
  LabelPoint,
  LabelPointSeedValues,
  LabelPointStatus,
  LabelShot,
  LabelShotSeedValues,
  LabelShotStatus,
} from "./session";

/** The columns a shot reset writes: its seed, and `kept`. */
export type ShotResetWrite = LabelShotSeedValues & { status: "kept" };

/** The columns a point reset writes: its seed, and `unchanged`. */
export type PointResetWrite = LabelPointSeedValues & { status: "unchanged" };

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
  return { ok: true, write: { ...current.seed, status: "kept" } };
}

/**
 * Reset a point's own fields to its seed — see {@link planShotReset} — and
 * each of its strokes' hitter to the stroke's seed. A stroke already hit by
 * its seeded hitter, or with no seed, gets no write; one that goes back
 * takes the status a hitter patch gives it (`planShotHitter`), a tombstone
 * keeping `deleted` with its `status_before_delete` recomputed.
 */
export function planPointReset(current: {
  status: LabelPointStatus;
  seed: LabelPointSeedValues | null;
  shots: readonly SwapShot[];
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
  const shots: ShotSwapWrite[] = [];
  for (const shot of current.shots) {
    if (shot.seed === null || shot.seed.hitter === shot.hitter) continue;
    shots.push(planShotHitter(shot, shot.seed.hitter));
  }
  return { ok: true, write: { ...current.seed, status: "unchanged" }, shots };
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

/** What a point's Reset puts back: its own fields, and its edited strokes. */
export interface PointResetScope {
  /** The point's own fields go back (`canResetPoint`, and not a split half). */
  fields: boolean;
  /** The edited strokes with a seed, each reset as a shot is (`canResetShot`). */
  shotIds: string[];
}

/**
 * The point's Reset: its own fields when they changed — held back on a point
 * that shares a vendor rally (a split's halves, `sharesVendorRally`) — and
 * every edited stroke with a seed. Strokes the labeller added or deleted stay
 * as they are. Null when there is nothing to put back.
 */
export function pointResetScope(
  point: Pick<LabelPoint, "status" | "seed"> & {
    shots: readonly Pick<LabelShot, "id" | "status" | "seed">[];
  },
  sharesRally = false,
): PointResetScope | null {
  const fields = canResetPoint(point) && !sharesRally;
  const shotIds =
    point.status === "deleted"
      ? []
      : point.shots.filter(canResetShot).map((shot) => shot.id);
  return fields || shotIds.length > 0 ? { fields, shotIds } : null;
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
