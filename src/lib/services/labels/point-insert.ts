/**
 * Add a point the vendor never saw (board 08m §5): two points of a game were
 * served from the same side, so a point between them is probably missing. The
 * labeller's "Add point" makes room for it — a new `label_points` row at the
 * second point's index, every point from there on moved up one — and the
 * labeller then sets who won and adds its shots.
 *
 * Nothing re-indexes on its own: `label_points.point_index` is what the rail
 * numbers rows by and has no unique constraint, so the shift is plain updates
 * on each later row, written highest first by `point-insert-session.ts` so no
 * two rows ever share an index on the way. The move operation
 * (`planPointMove`) never touches `point_index`; this is the one place that
 * does, and only to insert.
 *
 * Pure, and importable from the client bundle: the console runs
 * `applyInsertedPoint` for its optimistic rows and the session file runs
 * `planInsertedPoint` before its writes.
 */

import type { Planned } from "./operations";
import type { LabelGameType, LabelPoint, LabelSide } from "./session";

/** What the new row is seeded with; the labeller fills in the rest. */
export interface InsertedPointWrite {
  /** The flagged point's index — the new point takes its place. */
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
 * Plan a new point BEFORE `beforePointId` — the flagged point, the second of
 * the two served from one side. The new point takes that point's index and
 * its set, game, server and game type (a point between two of a game is a
 * point of that game, served by the same player), and the flagged point and
 * everything after it move up one. Refused when the flagged point is not
 * among `points` or is a tombstone: nothing goes in front of a deleted row.
 */
export function planInsertedPoint(
  points: readonly InsertablePoint[],
  beforePointId: string,
): Planned<InsertedPointPlan> {
  const before = points.find((point) => point.id === beforePointId);
  if (!before) {
    return { error: "The point to add before is not a point of this session." };
  }
  if (before.status === "deleted") {
    return { error: "Restore the point after the slot before adding one." };
  }
  const index = before.pointIndex;
  const shifts = points
    .filter((point) => point.pointIndex >= index)
    .sort((a, b) => b.pointIndex - a.pointIndex)
    .map((point) => ({ id: point.id, point_index: point.pointIndex + 1 }));
  return {
    ok: true,
    write: {
      insert: {
        point_index: index,
        set_number: before.setNumber,
        game_number: before.gameNumber,
        server: before.server,
        game_type: before.gameType,
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
