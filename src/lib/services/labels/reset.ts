/**
 * Reset: put an edited shot or point back to the values it was seeded with.
 *
 * Pure and import-free of anything server-side, like edit.ts and
 * operations.ts: the admin-gated writes (reset-session.ts) decide what to
 * write with these functions, and the `"use client"` console runs the same
 * ones for its optimistic update.
 *
 * The values come from the row's frozen `seed`
 * (supabase/migrations/20260928190425_label_rows_seed.sql). A row without
 * one cannot be reset: an added row never had seeded values, and a vendor
 * row seeded before the column existed waits for
 * scripts/label-backfill-seed.ts.
 *
 * What a reset leaves alone: a shot's `unclear` list (not part of the seed),
 * and a point's strokes, note and checked mark — a point reset restores only
 * the point's own fields.
 */

import type { Planned } from "./operations";
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

/**
 * Reset a shot to its seed. Refused for a tombstone (Undo it first), an added
 * stroke (nothing was seeded) and a vendor stroke with no stored seed.
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
  return { ok: true, write: { ...current.seed, status: "kept" } };
}

/** Reset a point's own fields to its seed — see {@link planShotReset}. */
export function planPointReset(current: {
  status: LabelPointStatus;
  seed: LabelPointSeedValues | null;
}): Planned<PointResetWrite> {
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
  return { ok: true, write: { ...current.seed, status: "unchanged" } };
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

/** `point` reset to its seed; its strokes and checked mark are untouched. */
export function applyPointReset(point: LabelPoint): LabelPoint {
  const plan = planPointReset(point);
  if ("error" in plan) return point;
  const { write } = plan;
  return {
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
}
