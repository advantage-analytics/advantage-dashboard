/**
 * Combine two neighbouring points of a game into one: the vendor cut one
 * real point into two rallies (a let it took for a serve, a rally it lost
 * the ball in and picked up again), so two `label_points` rows hold the
 * strokes of one. The ⋯ menu's "Combine with point above" / "Combine with
 * point below" joins this point with its nearest live neighbour, when that
 * neighbour is in the SAME game. Three or more are combined by repeating.
 *
 * The EARLIER point is kept. Every shot row of the later one — tombstones
 * included, so no row is left on a point that is gone — takes the earlier
 * point's id in ONE update; statuses are untouched (a moved vendor shot is
 * still `kept`, the comparison joins on `event_id`). The earlier point takes
 * the LATER point's `winner`, `ending` and `ended_by` — the rally really
 * ended where the later one did — and the union of both rows'
 * `vendor_rally_ids`, so the derivation's marks (`buildLabelMarks`, which
 * reads every id) land on the kept point; its status is `edited` (an `added`
 * point stays `added`). The later point becomes a tombstone through the
 * ordinary delete rule (`planPointDelete`), keeping its row.
 *
 * That tombstone has no shot rows of its own, and restoring it would bring
 * back an EMPTY point: the console draws it as "Combined into the point
 * above" with no Undo (`isCombinedTombstone`), the restore service refuses
 * it, and the way back is "Split point here" on the first moved shot.
 *
 * Pure, and importable from the client bundle: the console runs
 * `applyPointCombine` for its optimistic rows and `point-combine-session.ts`
 * runs `planPointCombine` before its writes.
 */

import {
  planPointDelete,
  type Planned,
  type PointDeleteWrite,
} from "./operations";
import {
  orderLabelShots,
  type LabelEnding,
  type LabelPoint,
  type LabelSide,
} from "./session";

export type CombineDirection = "above" | "below";

export function isCombineDirection(value: unknown): value is CombineDirection {
  return value === "above" || value === "below";
}

/** What the plan reads of a point. A `LabelPoint` satisfies it. */
export type CombinablePoint = Pick<
  LabelPoint,
  | "id"
  | "pointIndex"
  | "status"
  | "setNumber"
  | "gameNumber"
  | "winner"
  | "ending"
  | "endedBy"
  | "vendorRallyIds"
> & { shots: readonly Pick<LabelPoint["shots"][number], "id">[] };

/** The kept point's columns after the combine. */
export interface CombineKeptWrite {
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  vendor_rally_ids: number[];
  status: "edited" | "added";
}

export interface PointCombinePlan {
  /** The earlier point, which stays. */
  keptId: string;
  /** The later point, which becomes a tombstone. */
  removedId: string;
  /** Every shot row of the later point. */
  movedShotIds: string[];
  kept: CombineKeptWrite;
  removed: PointDeleteWrite;
}

/**
 * The live neighbour `direction` of `pointId` — the nearest live point
 * before or after it in `point_index` order — when it is in the same game.
 * Null otherwise: a tombstone is not a neighbour, and a point of another
 * game is not one to combine with.
 */
export function combineNeighbour<
  T extends Pick<LabelPoint, "id" | "status" | "setNumber" | "gameNumber">,
>(
  points: readonly T[],
  pointId: string,
  direction: CombineDirection,
): T | null {
  const live = points.filter((point) => point.status !== "deleted");
  const at = live.findIndex((point) => point.id === pointId);
  if (at === -1) return null;
  const neighbour = live[direction === "above" ? at - 1 : at + 1];
  if (!neighbour) return null;
  const self = live[at];
  if (
    neighbour.setNumber !== self.setNumber ||
    neighbour.gameNumber !== self.gameNumber
  ) {
    return null;
  }
  return neighbour;
}

/**
 * Plan the combine of `pointId` with its neighbour `direction`. Refused when
 * the point is not a live point of `points`, and when it has no live
 * neighbour that way in its own game.
 */
export function planPointCombine(
  points: readonly CombinablePoint[],
  pointId: string,
  direction: CombineDirection,
): Planned<PointCombinePlan> {
  const point = points.find((p) => p.id === pointId);
  if (!point) {
    return { error: "The point to combine is not a point of this session." };
  }
  if (point.status === "deleted") {
    return { error: "Restore this point before combining it." };
  }
  const neighbour = combineNeighbour(points, pointId, direction);
  if (!neighbour) {
    return {
      error:
        direction === "above"
          ? "There is no point of this game above it to combine with."
          : "There is no point of this game below it to combine with.",
    };
  }
  const [earlier, later] =
    neighbour.pointIndex < point.pointIndex
      ? [neighbour, point]
      : [point, neighbour];
  const removed = planPointDelete(later);
  if ("error" in removed) return removed;
  return {
    ok: true,
    write: {
      keptId: earlier.id,
      removedId: later.id,
      movedShotIds: later.shots.map((shot) => shot.id),
      kept: {
        winner: later.winner,
        ending: later.ending,
        ended_by: later.endedBy,
        vendor_rally_ids: [
          ...new Set([...earlier.vendorRallyIds, ...later.vendorRallyIds]),
        ],
        status: earlier.status === "added" ? "added" : "edited",
      },
      removed: removed.write,
    },
  };
}

/**
 * A tombstone with no shot rows of its own: what a combine leaves behind.
 * Undo is not offered on it — restoring would bring back an empty point.
 */
export function isCombinedTombstone(
  point: Pick<LabelPoint, "status"> & { shots: readonly unknown[] },
): boolean {
  return point.status === "deleted" && point.shots.length === 0;
}

/**
 * The console's rows after the combine: the later point's shots join the
 * earlier one in video order (their `labelPointId` follows), the earlier
 * takes the plan's fields, and the later is a tombstone with no shots.
 * `points` keep their order; nothing renumbers.
 */
export function applyPointCombine(
  points: readonly LabelPoint[],
  plan: PointCombinePlan,
): LabelPoint[] {
  const later = points.find((point) => point.id === plan.removedId);
  if (!later) return [...points];
  const moved = later.shots.map((shot) => ({
    ...shot,
    labelPointId: plan.keptId,
  }));
  return points.map((point) => {
    if (point.id === plan.keptId) {
      return {
        ...point,
        winner: plan.kept.winner,
        ending: plan.kept.ending,
        endedBy: plan.kept.ended_by,
        vendorRallyIds: plan.kept.vendor_rally_ids,
        status: plan.kept.status,
        shots: orderLabelShots([...point.shots, ...moved]),
      };
    }
    if (point.id === plan.removedId) {
      return {
        ...point,
        status: plan.removed.status,
        statusBeforeDelete: plan.removed.status_before_delete,
        shots: [],
      };
    }
    return point;
  });
}

/**
 * `applyPointCombine` undone: both rows exactly as they were before. What
 * the console does when the write fails.
 */
export function withdrawPointCombine(
  points: readonly LabelPoint[],
  kept: LabelPoint,
  removed: LabelPoint,
): LabelPoint[] {
  return points.map((point) =>
    point.id === kept.id ? kept : point.id === removed.id ? removed : point,
  );
}

/** What the session file answers with: both rows as written. */
export interface PointCombineSaved {
  kept: { id: string } & CombineKeptWrite;
  removed: { id: string } & PointDeleteWrite;
}

/** The two rows confirmed as the server wrote them. */
export function settlePointCombine(
  points: readonly LabelPoint[],
  saved: PointCombineSaved,
): LabelPoint[] {
  return points.map((point) => {
    if (point.id === saved.kept.id) {
      return {
        ...point,
        winner: saved.kept.winner,
        ending: saved.kept.ending,
        endedBy: saved.kept.ended_by,
        vendorRallyIds: saved.kept.vendor_rally_ids,
        status: saved.kept.status,
      };
    }
    if (point.id === saved.removed.id) {
      return {
        ...point,
        status: saved.removed.status,
        statusBeforeDelete: saved.removed.status_before_delete,
      };
    }
    return point;
  });
}
