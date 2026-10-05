/**
 * Split a point at one of its shots: the vendor ran two real points into one
 * rally (a serve hit while the last ball was still being picked up, a score
 * stream that skipped a point), so one `label_points` row holds the strokes
 * of two. "Split point here" on a shot moves THAT shot and every shot after
 * it — in the point's video order, tombstones and ghosts included, so no
 * row is left pointing at a rally it was never part of — into a NEW point
 * directly below the anchor.
 *
 * The new row is `planInsertedPoint`'s "after" insert (point-insert.ts): the
 * anchor's set, game, server and game type, `status: "added"`, every later
 * point moved up one index, highest first. Two things differ from an empty
 * "Add point below": the new point's `vendor_rally_ids` are the rallies its
 * moved vendor shots came from — read off each frozen `label_shots.vendor`
 * stroke's `pred_rally_id` by the session file, so the derivation's marks
 * (`buildLabelMarks`) still find a label point for every rally — and the
 * anchor loses a rally id only when NO shot of that rally stays behind.
 * Shot statuses are untouched: a moved vendor shot is still `kept`, since the
 * comparison joins on `event_id`, not on the point.
 *
 * The anchor becomes `edited` (an `added` anchor stays `added`). Its `seed`
 * is kept, so Reset stays defined: it puts the anchor's OWN fields back to
 * the seed and leaves the shots where they are, as a point reset always has.
 * The menu does not offer that Reset while another live point shares one of
 * the anchor's rallies (`sharesVendorRally`) — "unchanged" would then claim
 * the vendor's rally was whole, which is the one thing a split says it was
 * not.
 *
 * Pure, and importable from the client bundle: the console runs
 * `applyPointSplit` for its optimistic rows and `point-split-session.ts`
 * runs `planPointSplit` before its writes.
 */

import type { Planned } from "./operations";
import {
  applyInsertedPoint,
  planInsertedPoint,
  withdrawInsertedPoint,
  type InsertablePoint,
  type PointShift,
} from "./point-insert";
import {
  orderLabelShots,
  type LabelGameType,
  type LabelPoint,
  type LabelShot,
  type LabelSide,
} from "./session";

/** What the plan reads of a shot. A `LabelShot` satisfies it. */
export type SplittableShot = Pick<
  LabelShot,
  "id" | "videoTime" | "eventId" | "status"
> & {
  /**
   * The vendor rally the frozen stroke belongs to, when the caller has it
   * (the session file reads `vendor->>pred_rally_id`); absent or null on a
   * labeller-added stroke and in the console, which never loads `vendor`.
   */
  vendorRallyId?: number | null;
};

/** What the plan reads of a point. A `LabelPoint` satisfies it. */
export type SplittablePoint = InsertablePoint &
  Pick<LabelPoint, "vendorRallyIds"> & { shots: readonly SplittableShot[] };

/** The new row's columns; the labeller sets its winner next. */
export interface SplitPointWrite {
  point_index: number;
  set_number: number | null;
  game_number: number | null;
  server: LabelSide | null;
  game_type: LabelGameType;
  status: "added";
  /** The distinct rallies of the moved vendor shots; `[]` when none is known. */
  vendor_rally_ids: number[];
}

/** The anchor's columns after the split. */
export interface SplitAnchorWrite {
  status: "edited" | "added";
  vendor_rally_ids: number[];
}

export interface PointSplitPlan {
  insert: SplitPointWrite;
  /** Every later point and its new index, highest first (point-insert.ts). */
  shifts: PointShift[];
  /** The shot rows moving to the new point, in video order. */
  movedShotIds: string[];
  anchor: SplitAnchorWrite;
}

/**
 * Plan the split of `anchorPointId` at `shotId`. Refused when the anchor is
 * not a live point of `points`, when the shot is not a live shot of it, and
 * when no live shot would stay behind (the point's first live shot — there
 * would be nothing left to be the anchor).
 */
export function planPointSplit(
  points: readonly SplittablePoint[],
  anchorPointId: string,
  shotId: string,
): Planned<PointSplitPlan> {
  const anchor = points.find((point) => point.id === anchorPointId);
  if (!anchor) {
    return { error: "The point to split is not a point of this session." };
  }
  if (anchor.status === "deleted") {
    return { error: "Restore this point before splitting it." };
  }
  const ordered = orderLabelShots(anchor.shots);
  const at = ordered.findIndex((shot) => shot.id === shotId);
  if (at === -1) {
    return { error: "The shot to split at is not a shot of this point." };
  }
  if (ordered[at].status === "deleted") {
    return { error: "Restore this shot before splitting the point at it." };
  }
  if (!ordered.slice(0, at).some((shot) => shot.status !== "deleted")) {
    return {
      error:
        "This is the point's first shot: splitting here would leave nothing behind.",
    };
  }
  const inserted = planInsertedPoint(points, anchorPointId, "after");
  if ("error" in inserted) return inserted;

  const moved = ordered.slice(at);
  const staying = ordered.slice(0, at);
  const movedRallies = new Set(ralliesOf(moved));
  const stayingRallies = new Set(ralliesOf(staying));
  return {
    ok: true,
    write: {
      insert: {
        ...inserted.write.insert,
        vendor_rally_ids: [...movedRallies],
      },
      shifts: inserted.write.shifts,
      movedShotIds: moved.map((shot) => shot.id),
      anchor: {
        status: anchor.status === "added" ? "added" : "edited",
        vendor_rally_ids: anchor.vendorRallyIds.filter(
          (id) => !movedRallies.has(id) || stayingRallies.has(id),
        ),
      },
    },
  };
}

function ralliesOf(shots: readonly SplittableShot[]): number[] {
  return shots
    .map((shot) => shot.vendorRallyId)
    .filter((id): id is number => typeof id === "number");
}

/**
 * Whether the console offers "Split point here" on `shotId`: a live shot of
 * a live point, with a live shot before it in video order. Mirrors the
 * plan's refusals, without building one.
 */
export function canSplitAtShot(
  point: Pick<LabelPoint, "status"> & { shots: readonly SplittableShot[] },
  shotId: string,
): boolean {
  if (point.status === "deleted") return false;
  const ordered = orderLabelShots(point.shots);
  const at = ordered.findIndex((shot) => shot.id === shotId);
  if (at === -1 || ordered[at].status === "deleted") return false;
  return ordered.slice(0, at).some((shot) => shot.status !== "deleted");
}

/**
 * Whether another live point of the session was built from one of `point`'s
 * vendor rallies — the trace a split leaves on both halves. The menu holds
 * Reset back on such a point.
 */
export function sharesVendorRally(
  point: Pick<LabelPoint, "id" | "vendorRallyIds">,
  points: readonly Pick<LabelPoint, "id" | "status" | "vendorRallyIds">[],
): boolean {
  if (point.vendorRallyIds.length === 0) return false;
  const own = new Set(point.vendorRallyIds);
  return points.some(
    (other) =>
      other.id !== point.id &&
      other.status !== "deleted" &&
      other.vendorRallyIds.some((id) => own.has(id)),
  );
}

/**
 * The new point as the console draws it before the split lands: an added
 * point with no winner, no ending and no seed, under a temporary `id` the
 * saved row replaces. Its shots arrive through `applyPointSplit`.
 */
export function draftSplitPoint(
  write: SplitPointWrite,
  id: string,
): LabelPoint {
  return {
    id,
    pointIndex: write.point_index,
    vendorRallyIds: write.vendor_rally_ids,
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
 * The console's rows after the split: the moved shots leave the anchor for
 * `draft` (their `labelPointId` follows), the anchor takes the plan's status
 * and rally ids, and the draft goes in right after it — every later point
 * renumbered at once (`applyInsertedPoint`). `points` are in `point_index`
 * order and come back that way; the anchor keeps its place, so a caller
 * holding `[anchor]` alone reads the anchor at index 0.
 */
export function applyPointSplit(
  points: readonly LabelPoint[],
  anchorPointId: string,
  draft: LabelPoint,
  plan: Pick<PointSplitPlan, "movedShotIds" | "anchor">,
): LabelPoint[] {
  const anchor = points.find((point) => point.id === anchorPointId);
  if (!anchor) return [...points];
  const moving = new Set(plan.movedShotIds);
  const moved = anchor.shots
    .filter((shot) => moving.has(shot.id))
    .map((shot) => ({ ...shot, labelPointId: draft.id }));
  const row: LabelPoint = { ...draft, shots: orderLabelShots(moved) };
  const split = points.map((point) =>
    point.id === anchorPointId
      ? {
          ...point,
          status: plan.anchor.status,
          vendorRallyIds: plan.anchor.vendor_rally_ids,
          shots: point.shots.filter((shot) => !moving.has(shot.id)),
        }
      : point,
  );
  return applyInsertedPoint(split, row);
}

/**
 * `applyPointSplit` undone: the split row's shots go back to the anchor (in
 * video order), the anchor gets `before`'s status and rally ids, and the row
 * is withdrawn with the later points renumbered back. What the console does
 * when the write fails; unchanged when no such row is there.
 */
export function withdrawPointSplit(
  points: readonly LabelPoint[],
  before: Pick<LabelPoint, "id" | "status" | "vendorRallyIds">,
  splitPointId: string,
): LabelPoint[] {
  const row = points.find((point) => point.id === splitPointId);
  if (!row) return [...points];
  const returned = row.shots.map((shot) => ({
    ...shot,
    labelPointId: before.id,
  }));
  return withdrawInsertedPoint(points, splitPointId).map((point) =>
    point.id === before.id
      ? {
          ...point,
          status: before.status,
          vendorRallyIds: before.vendorRallyIds,
          shots: orderLabelShots([...point.shots, ...returned]),
        }
      : point,
  );
}

/** What the session file answers with: the saved row and the anchor as written. */
export interface PointSplitSaved {
  point: LabelPoint;
  anchor: { id: string } & SplitAnchorWrite;
}

/**
 * The draft row replaced by the saved one — its id on the row and on every
 * moved shot, its rally ids — and the anchor confirmed as the server wrote
 * it. The draft's shots stay: the server moved exactly those rows.
 */
export function settlePointSplit(
  points: readonly LabelPoint[],
  draftId: string,
  saved: PointSplitSaved,
): LabelPoint[] {
  return points.map((point) => {
    if (point.id === draftId) {
      return {
        ...saved.point,
        pointIndex: point.pointIndex,
        shots: point.shots.map((shot) => ({
          ...shot,
          labelPointId: saved.point.id,
        })),
      };
    }
    if (point.id === saved.anchor.id) {
      return {
        ...point,
        status: saved.anchor.status,
        vendorRallyIds: saved.anchor.vendor_rally_ids,
      };
    }
    return point;
  });
}
