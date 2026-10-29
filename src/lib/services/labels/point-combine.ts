/**
 * Combine two neighbouring points into one: the vendor cut one real point into
 * two rallies. Joins a point with its nearest live neighbour in the same set —
 * in its own game, or the neighbouring one where the cut also opened a game.
 *
 * Across a game the later part was tagged as the other player's service game,
 * so every moved stroke's hitter is swapped, and so is who ended it. When the
 * earlier part's rally was in play — a serve in with strokes after it — the
 * later part's leading "serve" was a stroke of that rally the vendor read as a
 * serve: it becomes an overhead, by whoever's turn it was. A fault with one or
 * two swings at the dead ball after it is not a rally in play: the later serve
 * stays a serve (and becomes the second serve, below).
 *
 * The earlier point is kept. Every shot row of the later one (tombstones
 * included) takes its id in one update, statuses untouched. It takes the later
 * point's `winner`, `ending` and `ended_by` and the union of both rows'
 * `vendor_rally_ids`, so the derivation's marks land on it; its status is
 * `edited` (`added` stays `added`), and it holds the game's lock
 * (game-boundary.ts) when either part did. The later point becomes a tombstone
 * (`planPointDelete`) with no shot rows: no Undo is offered
 * (`isCombinedTombstone`), and the way back is "Split point here" on the first
 * moved shot.
 *
 * The joined serves are then relabelled (`combineServeRetypes`, answered as
 * `retyped`). A replayed serve cut apart leaves a serve called in with the
 * same server's serve right after it: that earlier serve is a let
 * (`result: "let"`, `isLetServe`), which clears "Serve after a serve in
 * play". A fault and its replay cut apart both read as a first serve: when
 * exactly two serves that are not lets remain, the first in video order
 * becomes `first_serve` and the second `second_serve`. Any other count is
 * left as it is.
 *
 * Then every live stroke that is not a serve, sitting between a fault or a
 * let and the same server's next serve, is deleted as `dead_ball_after_fault`
 * (`deadBetweenServes`, answered as `cleared`): nothing is in play between a
 * fault and the second serve, or between a let and its replay. Measured on
 * every combined point labelled by 2026-10-28: after a serve out, in the net
 * or a let, labellers deleted 31 of the 33 strokes before the next serve
 * (the other 2 were ghosts); after a serve called in they kept 16 of 28, so
 * a serve called in clears nothing. The seed removes those swings
 * inside one vendor rally (`hit_after_fault`), but a combine joins two
 * rallies after it, so the swings at the fault end up live. A ghost — a
 * stroke the site already removed — is left as it is.
 *
 * Pure: the console runs `applyPointCombine`, `point-combine-session.ts` runs
 * `planPointCombine`.
 */

import {
  planPointDelete,
  type LabelDeleteReason,
  type Planned,
  type PointDeleteWrite,
  type ShotDeleteWrite,
} from "./operations";
import { applyLabelShotPatch, letResultError } from "./edit";
import type { LabelShotResult } from "./seed";
import {
  isLiveShot,
  isServeStroke,
  orderLabelShots,
  type LabelEnding,
  type LabelPoint,
  type LabelShot,
  type LabelShotStatus,
  type LabelSide,
  type LabelStroke,
} from "./session";
import { strokeDismissals } from "./suggestions";

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
  | "gameStartLocked"
> &
  Partial<Pick<LabelPoint, "dismissed">> & {
    shots: readonly CombinableShot[];
  };

/**
 * What the plan reads of a shot: its id, and for the serve retype its stroke,
 * status and place in video order. A `LabelShot` satisfies it.
 */
export type CombinableShot = Pick<LabelShot, "id"> &
  Partial<
    Pick<
      LabelShot,
      | "stroke"
      | "status"
      | "videoTime"
      | "eventId"
      | "hitter"
      | "result"
      | "siteRemoval"
      | "siteRemovalRestoredAt"
    >
  >;

/**
 * A stroke the combine relabels: a serve as first or second, or a let; a
 * misread serve as an overhead; a moved stroke's hitter, swapped.
 */
export interface CombineRetype {
  shotId: string;
  patch: {
    stroke?: Extract<LabelStroke, "first_serve" | "second_serve" | "overhead">;
    result?: "let";
    hitter?: LabelSide | null;
  };
}

export interface CombineKeptWrite {
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  vendor_rally_ids: number[];
  status: "edited" | "added";
  /**
   * True when either part held its game's lock (game-boundary.ts): the
   * joined point still starts that game.
   */
  game_start_locked: boolean;
  /**
   * The earlier point's dismissals, then the later one's of its own strokes'
   * suggestions (`strokeDismissals`), which move with those strokes.
   */
  dismissed: string[];
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
  /** Serves relabelled (`combineServeRetypes`), in video order. */
  retyped: CombineRetype[];
  /**
   * Strokes between two serves by one server, deleted as
   * `dead_ball_after_fault` (`deadBetweenServes`), in video order.
   */
  cleared: string[];
}

/**
 * The live strokes that are not serves between a serve called out, in the
 * net or a let and the same server's next serve, in video order: swings at
 * a fault, or at a let, before the serve that followed. A ghost is not
 * live. A serve with no hitter pairs with any; a serve called in, or not
 * called, clears nothing.
 */
const DEAD_AFTER: ReadonlySet<LabelShotResult | null> = new Set([
  "out",
  "net",
  "let",
]);

export function deadBetweenServes(shots: readonly CombinableShot[]): string[] {
  const live = orderLabelShots(
    shots
      .filter((shot) =>
        isLiveShot({
          status: shot.status ?? "kept",
          siteRemoval: shot.siteRemoval ?? null,
          siteRemovalRestoredAt: shot.siteRemovalRestoredAt ?? null,
        }),
      )
      .map((shot) => ({
        ...shot,
        videoTime: shot.videoTime ?? null,
        eventId: shot.eventId ?? null,
      })),
  );
  const dead: string[] = [];
  let serve: CombinableShot | null = null;
  let between: string[] = [];
  for (const shot of live) {
    if (!isServeStroke(shot.stroke)) {
      if (serve) between.push(shot.id);
      continue;
    }
    const replayed =
      serve !== null &&
      DEAD_AFTER.has(serve.result ?? null) &&
      (serve.hitter == null ||
        shot.hitter == null ||
        serve.hitter === shot.hitter);
    if (replayed) dead.push(...between);
    serve = shot;
    between = [];
  }
  return dead;
}

/**
 * The serves of the joined strokes to relabel, in video order, each named
 * only when something changes:
 *
 * - a live serve called `in` whose next live stroke is a serve by the same
 *   hitter was replayed: it becomes a let (`result: "let"`) — what "Serve
 *   after a serve in play" reads;
 * - then, when exactly two live serves that are not lets remain, the first
 *   is the first serve and the second the second.
 */
export function combineServeRetypes(
  shots: readonly CombinableShot[],
): CombineRetype[] {
  const live = orderLabelShots(
    shots
      .filter((shot) => shot.status !== "deleted")
      .map((shot) => ({
        ...shot,
        videoTime: shot.videoTime ?? null,
        eventId: shot.eventId ?? null,
      })),
  );
  const patches = new Map<string, CombineRetype["patch"]>();
  live.forEach((shot, i) => {
    const next = live[i + 1];
    if (
      isServeStroke(shot.stroke) &&
      shot.result === "in" &&
      next &&
      isServeStroke(next.stroke) &&
      next.hitter === shot.hitter
    ) {
      patches.set(shot.id, { result: "let" });
    }
  });
  const serves = live.filter(
    (shot) =>
      isServeStroke(shot.stroke) &&
      shot.result !== "let" &&
      !patches.has(shot.id),
  );
  if (serves.length === 2) {
    const order = ["first_serve", "second_serve"] as const;
    serves.forEach((shot, i) => {
      if (shot.stroke !== order[i]) patches.set(shot.id, { stroke: order[i] });
    });
  }
  return live.flatMap((shot) => {
    const patch = patches.get(shot.id);
    return patch ? [{ shotId: shot.id, patch }] : [];
  });
}

/**
 * Why the combine may not write `retyped`, or null when it may: each retype
 * judged with `letResultError` as it would leave its row (`shots`, the rows
 * as read). `combineServeRetypes` only ever sets a let on a serve, so this
 * never refuses today; it keeps that true however the retypes change, ahead
 * of the `label_shots_let_serve_only` check that would otherwise refuse the
 * write after the shots had moved.
 */
export function combineRetypeError(
  retyped: readonly CombineRetype[],
  shots: readonly CombinableShot[],
): string | null {
  for (const { shotId, patch } of retyped) {
    const shot = shots.find((s) => s.id === shotId);
    const error = letResultError(patch, {
      stroke: shot?.stroke ?? null,
      result: shot?.result ?? null,
    });
    if (error) return error;
  }
  return null;
}

/**
 * The live neighbour `direction` of `pointId` — the nearest live point
 * before or after it in `point_index` order — when it is in the same set: in
 * the same game, or the neighbouring one (`crossesGame`). Null otherwise: a
 * tombstone is not a neighbour, and a point of another set is not one to
 * combine with.
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
  if (neighbour.setNumber !== self.setNumber) return null;
  return neighbour;
}

/** Whether the two points sit in different games: the later part's frame flips. */
export function crossesGame(
  a: Pick<LabelPoint, "setNumber" | "gameNumber">,
  b: Pick<LabelPoint, "setNumber" | "gameNumber">,
): boolean {
  return a.setNumber !== b.setNumber || a.gameNumber !== b.gameNumber;
}

const other = (side: LabelSide | null | undefined): LabelSide | null =>
  side === "p1" ? "p2" : side === "p2" ? "p1" : null;

/** The live strokes of a part, lets set aside, in video order. */
function liveStrokes(shots: readonly CombinableShot[]): CombinableShot[] {
  return orderLabelShots(
    shots
      .filter((shot) => shot.status !== "deleted" && shot.result !== "let")
      .map((shot) => ({
        ...shot,
        videoTime: shot.videoTime ?? null,
        eventId: shot.eventId ?? null,
      })),
  );
}

/**
 * Whether the part's rally was in play when it was cut: its last serve was
 * called in, at least one stroke that is not a serve follows it, and the last of
 * them did not miss. A fault with dead-ball swings after it is not, nor is a
 * rally that ended on a ball out or in the net.
 */
export function rallyInPlay(shots: readonly CombinableShot[]): boolean {
  const live = liveStrokes(shots);
  const lastServe = live.findLastIndex((shot) => isServeStroke(shot.stroke));
  if (lastServe === -1) return false;
  const serve = live[lastServe];
  // Only a serve called in starts a rally; one not called yet says nothing.
  if (serve.result !== "in") return false;
  const after = live.slice(lastServe + 1);
  if (!after.some((shot) => !isServeStroke(shot.stroke))) return false;
  // A rally whose last ball missed was already over: what follows is a serve.
  const last = after.at(-1);
  return last?.result !== "out" && last?.result !== "net";
}

/**
 * The later part's strokes as they join the earlier: across a game each
 * hitter swapped; after a rally in play, its leading serve an overhead by the
 * player whose turn it was. Each change keyed by stroke id.
 */
export function combineCarryOver(
  earlier: readonly CombinableShot[],
  later: readonly CombinableShot[],
  acrossGame: boolean,
): Map<string, CombineRetype["patch"]> {
  const patches = new Map<string, CombineRetype["patch"]>();
  if (acrossGame) {
    for (const shot of later) {
      if (shot.hitter === undefined || shot.hitter === null) continue;
      patches.set(shot.id, { hitter: other(shot.hitter) });
    }
  }
  const lead = liveStrokes(later)[0];
  if (lead && isServeStroke(lead.stroke) && rallyInPlay(earlier)) {
    const last = liveStrokes(earlier).at(-1);
    const turn = other(last?.hitter);
    patches.set(lead.id, {
      ...patches.get(lead.id),
      stroke: "overhead",
      ...(turn ? { hitter: turn } : {}),
    });
  }
  return patches;
}

/**
 * Plan the combine of `pointId` with its neighbour `direction`. Refused when
 * the point is not a live point of `points`, when it has no live neighbour
 * that way in its own game, and when a serve retype would leave a let on a
 * stroke that is not a serve (`combineRetypeError`).
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
          ? "There is no point of this set above it to combine with."
          : "There is no point of this set below it to combine with.",
    };
  }
  const [earlier, later] =
    neighbour.pointIndex < point.pointIndex
      ? [neighbour, point]
      : [point, neighbour];
  const removed = planPointDelete(later);
  if ("error" in removed) return removed;
  const acrossGame = crossesGame(earlier, later);
  const carried = combineCarryOver(earlier.shots, later.shots, acrossGame);
  const asCarried = (shot: CombinableShot): CombinableShot => {
    const patch = carried.get(shot.id);
    return patch ? { ...shot, ...patch } : shot;
  };
  const joined = [...earlier.shots, ...later.shots.map(asCarried)];
  const serves = new Map(
    combineServeRetypes(joined).map((r) => [r.shotId, r.patch]),
  );
  // One patch per stroke, in video order: what the carry-over set, then the
  // serve's own relabel on top.
  const retyped: CombineRetype[] = orderLabelShots(
    joined.map((shot) => ({
      ...shot,
      videoTime: shot.videoTime ?? null,
      eventId: shot.eventId ?? null,
    })),
  ).flatMap((shot) => {
    const patch = { ...carried.get(shot.id), ...serves.get(shot.id) };
    return Object.keys(patch).length > 0 ? [{ shotId: shot.id, patch }] : [];
  });
  const retypeError = combineRetypeError(retyped, joined);
  if (retypeError) return { error: retypeError };
  const retypedById = new Map(retyped.map((r) => [r.shotId, r.patch]));
  const cleared = deadBetweenServes(
    joined.map((shot) => ({ ...shot, ...retypedById.get(shot.id) })),
  );
  return {
    ok: true,
    write: {
      keptId: earlier.id,
      removedId: later.id,
      movedShotIds: later.shots.map((shot) => shot.id),
      kept: {
        winner: later.winner,
        ending: later.ending,
        // Who ended it is read off the hitters, which a game boundary swaps.
        ended_by: acrossGame ? other(later.endedBy) : later.endedBy,
        vendor_rally_ids: [
          ...new Set([...earlier.vendorRallyIds, ...later.vendorRallyIds]),
        ],
        status: earlier.status === "added" ? "added" : "edited",
        game_start_locked: earlier.gameStartLocked || later.gameStartLocked,
        dismissed: [
          ...new Set([
            ...(earlier.dismissed ?? []),
            ...strokeDismissals(later.dismissed ?? [], later.shots),
          ]),
        ],
      },
      removed: removed.write,
      retyped,
      cleared,
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
        gameStartLocked: plan.kept.game_start_locked,
        dismissed: plan.kept.dismissed,
        shots: orderLabelShots([...point.shots, ...moved]).map((shot) => {
          const retype = plan.retyped.find((r) => r.shotId === shot.id);
          const next = retype ? applyLabelShotPatch(shot, retype.patch) : shot;
          return plan.cleared.includes(shot.id) && next.status !== "deleted"
            ? {
                ...next,
                status: "deleted" as const,
                statusBeforeDelete: next.status,
                deleteReason: CLEARED_REASON,
              }
            : next;
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
  /** Each relabelled stroke as written: its stroke, result, hitter and status. */
  retyped: {
    id: string;
    stroke: LabelStroke | null;
    result: LabelShotResult | null;
    hitter: LabelSide | null;
    status: LabelShotStatus;
  }[];
  /** Each stroke deleted between two serves, as written. */
  cleared: ({ id: string } & ShotDeleteWrite)[];
}

/** Why a combine deletes a stroke between two serves. */
export const CLEARED_REASON =
  "dead_ball_after_fault" satisfies LabelDeleteReason;

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
        gameStartLocked: saved.kept.game_start_locked,
        dismissed: saved.kept.dismissed,
        shots: point.shots.map((shot) => {
          const written = saved.retyped.find((r) => r.id === shot.id);
          const next = written
            ? {
                ...shot,
                stroke: written.stroke,
                result: written.result,
                hitter: written.hitter,
                status: written.status,
              }
            : shot;
          const gone = saved.cleared.find((c) => c.id === shot.id);
          return gone
            ? {
                ...next,
                status: gone.status,
                statusBeforeDelete: gone.status_before_delete,
                deleteReason: gone.delete_reason,
              }
            : next;
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
