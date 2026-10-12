/**
 * Add a point the vendor never saw: a new `label_points` row beside an anchor
 * point, every point from there on moved up one. "Above" (the suggestion's
 * insert) takes the anchor's index; "below" the index after it. Either way the
 * new point joins the anchor's set, game, server and game type, so a point
 * added below the last point of a game stays in that game.
 *
 * `label_points.point_index` is what the rail numbers rows by and has no unique
 * constraint, so the shift is plain updates on each later row, written highest
 * first by `point-insert-session.ts` so no two rows share an index on the way.
 * This is the one place that touches `point_index`.
 *
 * Pure: the console runs `applyInsertedPoint` and the session file runs
 * `planInsertedPoint`.
 */

import type { Planned } from "./operations";
import type { LabelGameType, LabelPoint, LabelSide } from "./session";

/** Which side of the anchor point the new one goes: "before" is the default. */
export type InsertPosition = "before" | "after";

/** What the new row is seeded with; the labeller fills in the rest. */
export interface InsertedPointWrite {
  /** The anchor's index ("before"), or the one after it ("after"). */
  point_index: number;
  set_number: number | null;
  game_number: number | null;
  server: LabelSide | null;
  game_type: LabelGameType;
  status: "added";
  /** Always empty: no vendor rally stands behind a point the labeller added. */
  vendor_rally_ids: never[];
}

/** One later point and the index it moves to. */
export interface PointShift {
  id: string;
  point_index: number;
}

export interface InsertedPointPlan {
  insert: InsertedPointWrite;
  /**
   * Every point at or after the slot — tombstones included, since they keep
   * their place in the order — highest index first, which is the order the
   * writes go out in.
   */
  shifts: PointShift[];
}

/** What the plan reads of a point. A `LabelPoint` satisfies it. */
export type InsertablePoint = Pick<
  LabelPoint,
  | "id"
  | "pointIndex"
  | "status"
  | "setNumber"
  | "gameNumber"
  | "server"
  | "gameType"
>;

/**
 * Plan a new point beside `anchorPointId`. Before (the default): the new point
 * takes the anchor's index, and the anchor and everything after it move up one.
 * After: it takes the next index, and only what came after the anchor moves.
 * Refused when the anchor is not among `points` or is a tombstone.
 */
export function planInsertedPoint(
  points: readonly InsertablePoint[],
  anchorPointId: string,
  position: InsertPosition = "before",
): Planned<InsertedPointPlan> {
  const anchor = points.find((point) => point.id === anchorPointId);
  if (!anchor) {
    return {
      error: `The point to add ${position} is not a point of this session.`,
    };
  }
  if (anchor.status === "deleted") {
    return {
      error:
        position === "before"
          ? "Restore the point after the slot before adding one."
          : "Restore the point before the slot before adding one.",
    };
  }
  const index =
    position === "before" ? anchor.pointIndex : anchor.pointIndex + 1;
  const shifts = points
    .filter((point) => point.pointIndex >= index)
    .sort((a, b) => b.pointIndex - a.pointIndex)
    .map((point) => ({ id: point.id, point_index: point.pointIndex + 1 }));
  return {
    ok: true,
    write: {
      insert: {
        point_index: index,
        set_number: anchor.setNumber,
        game_number: anchor.gameNumber,
        server: anchor.server,
        game_type: anchor.gameType,
        status: "added",
        vendor_rally_ids: [],
      },
      shifts,
    },
  };
}

/**
 * The planned row as the console draws it before the insert lands: no
 * winner, no ending, no shots, no seed — an added point has nothing to reset
 * to — under a temporary `id` the saved row replaces.
 */
export function draftInsertedPoint(
  write: InsertedPointWrite,
  id: string,
): LabelPoint {
  return {
    id,
    pointIndex: write.point_index,
    vendorRallyIds: [],
    setNumber: write.set_number,
    gameNumber: write.game_number,
    server: write.server,
    serveSide: null,
    winner: null,
    ending: null,
    endedBy: null,
    gameType: write.game_type,
    status: "added",
    statusBeforeDelete: null,
    checkedAt: null,
    note: null,
    dismissed: [],
    seed: null,
    shots: [],
  };
}

/**
 * The console's rows with `row` inserted: every point at or after its index
 * moves up one and the row takes its place, so the rail renumbers at once.
 * `points` are in `point_index` order and come back that way.
 */
export function applyInsertedPoint(
  points: readonly LabelPoint[],
  row: LabelPoint,
): LabelPoint[] {
  const shifted = points.map((point) =>
    point.pointIndex >= row.pointIndex
      ? { ...point, pointIndex: point.pointIndex + 1 }
      : point,
  );
  const at = shifted.findIndex((point) => point.pointIndex > row.pointIndex);
  if (at === -1) return [...shifted, row];
  return [...shifted.slice(0, at), row, ...shifted.slice(at)];
}

/**
 * `applyInsertedPoint` undone: the row with `id` is taken out and every point
 * after it moves back down one. What the console does when the insert
 * fails; unchanged when no such row is there.
 */
export function withdrawInsertedPoint(
  points: readonly LabelPoint[],
  id: string,
): LabelPoint[] {
  const row = points.find((point) => point.id === id);
  if (!row) return [...points];
  return points
    .filter((point) => point.id !== id)
    .map((point) =>
      point.pointIndex > row.pointIndex
        ? { ...point, pointIndex: point.pointIndex - 1 }
        : point,
    );
}
