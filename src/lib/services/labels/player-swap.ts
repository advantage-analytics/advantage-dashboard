/**
 * When a point moves into a game the other player serves, its players switch as
 * a whole, not just `server`: the vendor assigns hitters from the game it
 * thought the point was in. The one rule both moves call (`planPointMove`,
 * `planGameShift`); "Switch players" (`planPlayerSwitch`) is the same flip by
 * hand. Pure.
 *
 * A swap applies only when the move changes the point's `server` and its own
 * rows contradict the new one: its last live serve stroke (with no serve, its
 * first live stroke that names a hitter) is hit by someone else. Then every
 * stroke of the point, tombstones and ghosts included, gets `hitter` flipped,
 * and `winner` and `ended_by` flip; `ending` is unchanged and null stays null.
 *
 * Each flipped stroke's status is what a hitter patch gives it
 * (`labelShotStatusAfterPatch`). A tombstone keeps `deleted` and its
 * `status_before_delete` is recomputed as if the stroke were live: the one
 * place a tombstone's values change.
 */

import {
  labelPointFields,
  labelPointStatusAfterChange,
  labelShotStatusAfterPatch,
  type LabelShotValues,
} from "./edit";
import {
  isServeStroke,
  opponent,
  orderLabelShots,
  type LabelPoint,
  type LabelPointStatus,
  type LabelShot,
  type LabelShotStatus,
  type LabelSide,
} from "./session";

type LiveShotStatus = Exclude<LabelShotStatus, "deleted">;

/** What the rule reads of a stroke: the status rule's inputs, plus its order. */
export type SwapShot = Pick<
  LabelShot,
  | "id"
  | "eventId"
  | "status"
  | "statusBeforeDelete"
  | "seed"
  | "hitter"
  | "stroke"
  | "result"
  | "spin"
  | "contactX"
  | "contactY"
  | "landingX"
  | "landingY"
  | "videoTime"
>;

export type SwappablePoint = Pick<
  LabelPoint,
  "server" | "winner" | "endedBy"
> & {
  shots: readonly SwapShot[];
};

/** The `label_shots` columns one flipped stroke is written with. */
export interface ShotSwapWrite {
  id: string;
  hitter: LabelSide | null;
  status: LabelShotStatus;
  /** Recomputed on a tombstone; null on a live stroke, as the CHECK pairs it. */
  status_before_delete: LiveShotStatus | null;
}

/** The whole swap: the point's two flipped columns, and every stroke's. */
export interface PlayerSwap {
  point: { winner: LabelSide | null; ended_by: LabelSide | null };
  shots: ShotSwapWrite[];
}

/**
 * The stroke that says who served the point: its last live serve in video
 * order, else its first live stroke with a hitter. Null when it has neither.
 */
export function servingShot<T extends SwapShot>(shots: readonly T[]): T | null {
  const live = orderLabelShots(shots).filter(
    (shot) => shot.status !== "deleted",
  );
  let serve: T | null = null;
  for (const shot of live) {
    if (isServeStroke(shot.stroke)) {
      serve = shot;
    }
  }
  if (serve) return serve;
  return live.find((shot) => shot.hitter !== null) ?? null;
}

/** Whether moving `point` under `newServer` switches its players. */
export function moveSwapsPlayers(
  point: SwappablePoint,
  newServer: LabelSide | null,
): boolean {
  if (newServer === null || newServer === point.server) return false;
  const serve = servingShot(point.shots);
  return serve !== null && serve.hitter !== null && serve.hitter !== newServer;
}

/**
 * The whole-point flip, unconditionally: every stroke's hitter p1 ↔ p2
 * (null stays null), the winner and ended by flipped. `server` is not
 * touched — it is the caller's (a move sets it; "Switch players" leaves it).
 * Strokes come back in the order they were given.
 */
export function planPlayerFlip(point: SwappablePoint): PlayerSwap {
  return {
    point: {
      winner: flip(point.winner),
      ended_by: flip(point.endedBy),
    },
    shots: point.shots.map(flipShot),
  };
}

/** The swap a move to `newServer` makes of `point`, or null for none. */
export function planPlayerSwap(
  point: SwappablePoint,
  newServer: LabelSide | null,
): PlayerSwap | null {
  if (!moveSwapsPlayers(point, newServer)) return null;
  return planPlayerFlip(point);
}

// ── "Switch players", by hand ───────────────────────────────────────────────

export type SwitchablePoint = SwappablePoint &
  Pick<
    LabelPoint,
    "status" | "setNumber" | "gameNumber" | "serveSide" | "ending" | "seed"
  >;

/** The `label_points` columns the manual switch writes. Never `server`. */
export interface PlayerSwitchWrite {
  winner: LabelSide | null;
  ended_by: LabelSide | null;
  status: Exclude<LabelPointStatus, "deleted">;
}

export type PlannedPlayerSwitch =
  | { ok: true; write: PlayerSwitchWrite; shots: ShotSwapWrite[] }
  | { error: string };

/** Whether "Switch players" is offered: a live point with a named hitter. */
export function canSwitchPlayers(
  point: Pick<SwitchablePoint, "status" | "shots">,
): boolean {
  return (
    point.status !== "deleted" &&
    point.shots.some((shot) => shot.hitter !== null)
  );
}

/**
 * Whether the point's rows contradict its own `server`: its serving stroke
 * ({@link servingShot}) is hit by the other side. True of a point moved
 * into another player's game before the swap rule existed — its server
 * changed, its strokes and winner did not — which is what the menu's
 * "Switch players" is first offered for.
 */
export function rowsContradictServer(
  point: Pick<SwappablePoint, "server" | "shots">,
): boolean {
  if (point.server === null) return false;
  const serve = servingShot(point.shots);
  return (
    serve !== null && serve.hitter !== null && serve.hitter !== point.server
  );
}

/**
 * The manual switch: {@link planPlayerFlip} regardless of what the rows say,
 * with the point's status measured over the flipped winner and ended by
 * (edit.ts `labelPointStatusAfterChange`) — set, game and server unchanged.
 * Refused on a tombstone and on a point with no stroke that names a hitter.
 */
export function planPlayerSwitch(point: SwitchablePoint): PlannedPlayerSwitch {
  if (point.status === "deleted") {
    return { error: "Restore this point before switching its players." };
  }
  if (!canSwitchPlayers(point)) {
    return { error: "This point has no shot with a player to switch." };
  }
  const flip = planPlayerFlip(point);
  const status = labelPointStatusAfterChange(
    { ...labelPointFields(point), status: point.status, seed: point.seed },
    flip.point,
  );
  return {
    ok: true,
    // Only a live point gets here, so the rule never hands back `deleted`.
    write: { ...flip.point, status: status as PlayerSwitchWrite["status"] },
    shots: flip.shots,
  };
}

/** `point` after the manual switch, as the console shows it — its own columns. */
export function applyPlayerSwitch(
  point: LabelPoint,
  write: PlayerSwitchWrite,
): LabelPoint {
  return {
    ...point,
    winner: write.winner,
    endedBy: write.ended_by,
    status: write.status,
  };
}

function flip(side: LabelSide | null): LabelSide | null {
  return side === null ? null : opponent(side);
}

function flipShot(shot: SwapShot): ShotSwapWrite {
  return planShotHitter(shot, flip(shot.hitter));
}

/**
 * One stroke given `hitter`, as a swap writes it: the status a hitter patch
 * gives a live stroke, and on a tombstone `deleted` kept with its
 * `status_before_delete` recomputed. The flip is one case of this; a point
 * reset (reset.ts) is the other, handing back the seeded hitter.
 */
export function planShotHitter(
  shot: SwapShot,
  hitter: LabelSide | null,
): ShotSwapWrite {
  const patch = { hitter };
  const values = valuesOf(shot);
  if (shot.status === "deleted") {
    // Undo's answer, recomputed: the status the stroke would take if it
    // were live and had its hitter flipped.
    const before = labelShotStatusAfterPatch(
      {
        ...values,
        status: shot.statusBeforeDelete ?? liveStatusOf(shot),
        seed: shot.seed,
      },
      patch,
    ) as LiveShotStatus;
    return {
      id: shot.id,
      hitter,
      status: "deleted",
      status_before_delete: before,
    };
  }
  return {
    id: shot.id,
    hitter,
    status: labelShotStatusAfterPatch(
      { ...values, status: shot.status, seed: shot.seed },
      patch,
    ),
    status_before_delete: null,
  };
}

/** operations.ts's fallback for a tombstone without a remembered status. */
function liveStatusOf(shot: Pick<SwapShot, "eventId">): LiveShotStatus {
  return shot.eventId === null ? "added" : "kept";
}

/** The stroke's value fields keyed by column — edit.ts `labelShotValues`, for a `SwapShot`. */
function valuesOf(shot: SwapShot): LabelShotValues {
  return {
    hitter: shot.hitter,
    stroke: shot.stroke,
    result: shot.result,
    spin: shot.spin,
    contact_x: shot.contactX,
    contact_y: shot.contactY,
    landing_x: shot.landingX,
    landing_y: shot.landingY,
    video_time: shot.videoTime,
  };
}

// ── The console's camelCase rows ────────────────────────────────────────────

/**
 * `points` with `shots`' hitters and statuses taken on, wherever each shot
 * sits — the optimistic step of a swap, and (handed the rows' OLD values)
 * its revert. A row no write names is returned as it is.
 */
export function applyShotSwaps(
  points: readonly LabelPoint[],
  shots: readonly ShotSwapWrite[],
): LabelPoint[] {
  if (shots.length === 0) return [...points];
  const byId = new Map(shots.map((shot) => [shot.id, shot]));
  return points.map((point) => {
    if (!point.shots.some((shot) => byId.has(shot.id))) return point;
    return {
      ...point,
      shots: point.shots.map((shot) => {
        const write = byId.get(shot.id);
        if (!write) return shot;
        return {
          ...shot,
          hitter: write.hitter,
          status: write.status,
          statusBeforeDelete: write.status_before_delete,
        };
      }),
    };
  });
}

/** The console's shots as they stand, as writes — what a revert hands back. */
export function shotSwapsOf(shots: readonly LabelShot[]): ShotSwapWrite[] {
  return shots.map((shot) => ({
    id: shot.id,
    hitter: shot.hitter,
    status: shot.status,
    status_before_delete: shot.statusBeforeDelete,
  }));
}
