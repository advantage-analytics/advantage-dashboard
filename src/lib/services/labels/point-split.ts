/**
 * Split a point at one of its shots: the vendor ran two real points into one
 * rally. That shot and every shot after it (in video order, tombstones and
 * ghosts included) move into a new point directly below the anchor.
 *
 * The new row is `planInsertedPoint`'s "after" insert, except that its
 * `vendor_rally_ids` are the rallies its moved vendor shots came from (each
 * frozen stroke's `pred_rally_id`), so the derivation's marks still find a
 * label point for every rally; the anchor loses a rally id only when no shot of
 * that rally stays behind. Shot statuses are untouched, but for the serves
 * that open the new point: a point starts on a first serve, so those are
 * renumbered first, then second (`serveRestrokes`) — two serves split apart
 * leave the second one a first serve of its own point. The anchor becomes
 * `edited` (`added` stays `added`), keeps a game lock it held
 * (game-boundary.ts: the earlier half still starts the game), and the menu
 * holds its Reset back while another live point shares one of its rallies
 * (`sharesVendorRally`).
 *
 * Pure: the console runs `applyPointSplit`, `point-split-session.ts` runs
 * `planPointSplit`.
 */

import { applyLabelShotPatch, type LabelPointFields } from "./edit";
import type { Planned } from "./operations";
import {
  applyInsertedPoint,
  planInsertedPoint,
  withdrawInsertedPoint,
  type InsertablePoint,
  type PointShift,
} from "./point-insert";
import {
  isLetServe,
  isServeStroke,
  orderLabelShots,
  type LabelGameType,
  type LabelPoint,
  type LabelShot,
  type LabelShotStatus,
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
} & Partial<Pick<LabelShot, "stroke" | "result">>;

/** A serve of the new point given its number: first, then second. */
export interface ServeRestroke {
  id: string;
  stroke: "first_serve" | "second_serve";
}

/**
 * The serves that open `moved` (the new point's shots, in video order) whose
 * number is not the one their place gives them: the first live serve is a
 * first serve, the one after it a second. A let is replayed, so the serve
 * after it keeps the let's number. Stops at the first live stroke that is
 * not a serve; a point that opens on a rally ball changes nothing.
 */
export function serveRestrokes(
  moved: readonly SplittableShot[],
): ServeRestroke[] {
  const restrokes: ServeRestroke[] = [];
  let next: ServeRestroke["stroke"] = "first_serve";
  for (const shot of moved) {
    if (shot.status === "deleted") continue;
    if (!isServeStroke(shot.stroke)) break;
    if (shot.stroke !== next) restrokes.push({ id: shot.id, stroke: next });
    const replayed = isLetServe({
      stroke: shot.stroke ?? null,
      result: shot.result ?? null,
    });
    if (!replayed) next = "second_serve";
  }
  return restrokes;
}

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
  /** The new point's opening serves that take a new number; often none. */
  serves: ServeRestroke[];
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
      serves: serveRestrokes(moved),
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
    errorKind: null,
    gameType: write.game_type,
    status: "added",
    statusBeforeDelete: null,
    checkedAt: null,
    note: null,
    dismissed: [],
    gameStartLocked: false,
    seed: null,
    shots: [],
  };
}

/**
 * The console's rows after the split: the moved shots leave the anchor for
 * `draft` (their `labelPointId` follows), the anchor takes the plan's status
 * and rally ids, the new point's opening serves take their numbers (and the
 * status that implies), and the draft goes in right after it — every later point
 * renumbered at once (`applyInsertedPoint`). `points` are in `point_index`
 * order and come back that way; the anchor keeps its place, so a caller
 * holding `[anchor]` alone reads the anchor at index 0.
 */
export function applyPointSplit(
  points: readonly LabelPoint[],
  anchorPointId: string,
  draft: LabelPoint,
  plan: Pick<PointSplitPlan, "movedShotIds" | "anchor"> &
    Partial<Pick<PointSplitPlan, "serves">>,
): LabelPoint[] {
  const anchor = points.find((point) => point.id === anchorPointId);
  if (!anchor) return [...points];
  const moving = new Set(plan.movedShotIds);
  const stroke = new Map(plan.serves?.map((s) => [s.id, s.stroke]));
  const moved = anchor.shots
    .filter((shot) => moving.has(shot.id))
    .map((shot) => {
      const next = stroke.get(shot.id);
      const row = next ? applyLabelShotPatch(shot, { stroke: next }) : shot;
      return { ...row, labelPointId: draft.id };
    });
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
 * video order, each as `before.shots` had it when given — a renumbered serve
 * gets its stroke and status back), the anchor gets `before`'s status and rally ids, and the row
 * is withdrawn with the later points renumbered back. What the console does
 * when the write fails; unchanged when no such row is there.
 */
export function withdrawPointSplit(
  points: readonly LabelPoint[],
  before: Pick<LabelPoint, "id" | "status" | "vendorRallyIds"> &
    Partial<Pick<LabelPoint, "shots">>,
  splitPointId: string,
): LabelPoint[] {
  const row = points.find((point) => point.id === splitPointId);
  if (!row) return [...points];
  const was = new Map(before.shots?.map((shot) => [shot.id, shot]));
  const returned = row.shots.map((shot) => ({
    ...(was.get(shot.id) ?? shot),
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

/**
 * What the session file answers with: the saved row and the anchor as written
 * — each with the ending its rows now derive, where the server settled one
 * (`reconcileEnding`, ending-session.ts). The anchor's is absent when its
 * stored ending already said what its remaining strokes do.
 */
export interface PointSplitSaved {
  point: LabelPoint;
  /** The new point's serves as renumbered, each with the status written. */
  serves?: (ServeRestroke & { status: LabelShotStatus })[];
  anchor: { id: string } & SplitAnchorWrite &
    Partial<Pick<LabelPointFields, "winner" | "ending" | "ended_by">>;
}

/**
 * The draft row replaced by the saved one — its id on the row and on every
 * moved shot, its rally ids, its ending, its renumbered serves' statuses —
 * and the anchor confirmed as the
 * server wrote it, ending included when the split moved it. The draft's shots
 * stay: the server moved exactly those rows.
 */
export function settlePointSplit(
  points: readonly LabelPoint[],
  draftId: string,
  saved: PointSplitSaved,
): LabelPoint[] {
  return points.map((point) => {
    if (point.id === draftId) {
      const serves = new Map(saved.serves?.map((s) => [s.id, s]));
      return {
        ...saved.point,
        pointIndex: point.pointIndex,
        shots: point.shots.map((shot) => {
          const serve = serves.get(shot.id);
          return {
            ...shot,
            ...(serve ? { stroke: serve.stroke, status: serve.status } : {}),
            labelPointId: saved.point.id,
          };
        }),
      };
    }
    if (point.id === saved.anchor.id) {
      const { anchor } = saved;
      return {
        ...point,
        status: anchor.status,
        vendorRallyIds: anchor.vendor_rally_ids,
        ...("ending" in anchor ? { ending: anchor.ending ?? null } : {}),
        ...("ended_by" in anchor ? { endedBy: anchor.ended_by ?? null } : {}),
        ...("winner" in anchor ? { winner: anchor.winner ?? null } : {}),
      };
    }
    return point;
  });
}
