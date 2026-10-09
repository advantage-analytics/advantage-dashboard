/**
 * Combine two neighbouring points of a game into one: the vendor cut one real
 * point into two rallies. Joins a point with its nearest live neighbour in the
 * same game.
 *
 * The earlier point is kept. Every shot row of the later one (tombstones
 * included) takes its id in one update, statuses untouched. It takes the later
 * point's `winner`, `ending` and `ended_by` and the union of both rows'
 * `vendor_rally_ids`, so the derivation's marks land on it; its status is
 * `edited` (`added` stays `added`). The later point becomes a tombstone
 * (`planPointDelete`) with no shot rows: no Undo is offered
 * (`isCombinedTombstone`), and the way back is "Split point here" on the first
 * moved shot.
 *
 * A fault and its replay cut apart both read as a first serve. So when the
 * combined point's live strokes hold exactly two serves, the first in video
 * order becomes `first_serve` and the second `second_serve` (`retyped`).
 * Three or more (a let among them) are left as they are.
 *
 * Pure: the console runs `applyPointCombine`, `point-combine-session.ts` runs
 * `planPointCombine`.
 */

import {
  planPointDelete,
  type Planned,
  type PointDeleteWrite,
} from "./operations";
import { applyLabelShotPatch } from "./edit";
import {
  isServeStroke,
  orderLabelShots,
  type LabelEnding,
  type LabelPoint,
  type LabelShot,
  type LabelShotStatus,
  type LabelSide,
  type LabelStroke,
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
> & { shots: readonly CombinableShot[] };

/**
 * What the plan reads of a shot: its id, and for the serve retype its stroke,
 * status and place in video order. A `LabelShot` satisfies it.
 */
export type CombinableShot = Pick<LabelShot, "id"> &
  Partial<Pick<LabelShot, "stroke" | "status" | "videoTime" | "eventId">>;

/** A serve the combine relabels first or second. */
export interface CombineRetype {
  shotId: string;
  stroke: Extract<LabelStroke, "first_serve" | "second_serve">;
}

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
  /** Serves whose stroke changes; empty unless exactly two are live. */
  retyped: CombineRetype[];
}

/**
 * The serves of the joined strokes to relabel: when exactly two live serves
 * remain, the first in video order is the first serve and the second the
 * second; only those whose stroke changes are named.
 */
export function combineServeRetypes(
  shots: readonly CombinableShot[],
): CombineRetype[] {
  const serves = orderLabelShots(
    shots
      .filter((shot) => shot.status !== "deleted" && isServeStroke(shot.stroke))
      .map((shot) => ({
        ...shot,
        videoTime: shot.videoTime ?? null,
        eventId: shot.eventId ?? null,
      })),
  );
  if (serves.length !== 2) return [];
  const order = ["first_serve", "second_serve"] as const;
  return serves.flatMap((shot, i) =>
    shot.stroke === order[i] ? [] : [{ shotId: shot.id, stroke: order[i] }],
  );
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
      retyped: combineServeRetypes([...earlier.shots, ...later.shots]),
    },
  };
}

/** A tombstone with no shot rows: what a combine leaves. No Undo. */
export function isCombinedTombstone(
  point: Pick<LabelPoint, "status"> & { shots: readonly unknown[] },
): boolean {
  return point.status === "deleted" && point.shots.length === 0;
}

/**
 * The console's rows after the combine: the later point's shots join the
 * earlier one in video order (their `labelPointId` follows), the earlier
 * takes the plan's fields and its retyped serves (status as an edit would set
 * it), and the later is a tombstone with no shots.
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
        shots: orderLabelShots([...point.shots, ...moved]).map((shot) => {
          const retype = plan.retyped.find((r) => r.shotId === shot.id);
          return retype
            ? applyLabelShotPatch(shot, { stroke: retype.stroke })
            : shot;
        }),
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

/** `applyPointCombine` undone: both rows as they were. */
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
  /** Each retyped serve as written: its new stroke and the status it took. */
  retyped: { id: string; stroke: LabelStroke; status: LabelShotStatus }[];
}

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
        shots: point.shots.map((shot) => {
          const written = saved.retyped.find((r) => r.id === shot.id);
          return written
            ? { ...shot, stroke: written.stroke, status: written.status }
            : shot;
        }),
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
