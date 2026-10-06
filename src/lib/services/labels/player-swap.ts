/**
 * When a point moves into a game the OTHER player serves, its players switch
 * — as a whole, not just the `server` column. The same whole-point flip is
 * the ⋯ menu's "Switch players" (`planPlayerSwitch`), by hand and
 * unconditionally, for points moved before this rule existed.
 *
 * The vendor assigns hitters from the game it thought the point was in. So a
 * point that lands in the wrong game has every stroke's `hitter` the wrong
 * way round, and its `winner` and `ended_by` name the wrong sides: changing
 * `server` alone (what a move used to do) answered "switch players?" with
 * nothing visibly switching. This module is the one rule both moves call —
 * the point menu's "Move to game…" (operations.ts `planPointMove`) and the
 * cascade "Move to game N+1" (game-shift.ts `planGameShift`) — pure, so the
 * console's optimistic rows and the server's writes come from one place.
 *
 * ── The rule ────────────────────────────────────────────────────────────────
 * A swap applies only when the move changes the point's `server` AND the
 * point's own rows contradict the new server: its last live serve stroke
 * (`first_serve` / `second_serve`, in video order; with no serve, its first
 * live stroke that names a hitter) is hit by someone other than the new
 * server. Then, as one change:
 *   - every stroke of the point — live, ghost and tombstone alike, so a
 *     later Undo is consistent — gets `hitter` flipped p1 ↔ p2 (null stays
 *     null);
 *   - `winner` and `ended_by` flip (null stays null); `ending` is unchanged;
 *   - `server` becomes the destination's (the move's own doing).
 * When the rows already agree with the new server, or the move does not
 * change it, or the point has no stroke to read, nothing but `server` moves.
 *
 * ── Statuses ────────────────────────────────────────────────────────────────
 * Each flipped stroke's status is what a hitter patch gives it
 * (edit.ts `labelShotStatusAfterPatch`): a vendor stroke whose hitter now
 * differs from its seed is `edited`, one flipped back to its seed is `kept`
 * again, `added` stays `added`. A tombstone keeps `deleted`, and its
 * `status_before_delete` — what Undo restores — is recomputed by that same
 * rule as if the stroke were live, so a flipped tombstone undone later reads
 * `edited`, and one flipped back then undone reads `kept`. (No existing
 * helper patches a tombstone's values: edit-session.ts refuses to edit one
 * at all, so this is the one place a tombstone's values ever change.) The
 * point's status is the move's to compute, with the flipped winner and
 * ended_by in the change — so a point moved away and back reads `unchanged`
 * with every stroke `kept` again.
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

/** What the rule reads of a point. */
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

/**
 * Whether moving `point` under `newServer` switches its players: the server
 * changes, and the point's serving stroke is hit by someone else.
 */
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

/**
 * The swap a move to `newServer` makes of `point`, or null when none applies
 * (see the file comment): {@link planPlayerFlip} behind the move's gate.
 */
export function planPlayerSwap(
  point: SwappablePoint,
  newServer: LabelSide | null,
): PlayerSwap | null {
  if (!moveSwapsPlayers(point, newServer)) return null;
  return planPlayerFlip(point);
}

// ── "Switch players", by hand ───────────────────────────────────────────────

/** What the manual switch reads of a point. */
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

/**
 * Whether the ⋯ menu offers "Switch players" on `point`: a live point with
 * at least one stroke row (any status) that names a hitter.
 */
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
  const hitter = flip(shot.hitter);
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
