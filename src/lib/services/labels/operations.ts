/**
 * The labelling console's row operations — delete and Undo, add a stroke,
 * move a point to another game, mark a point checked — as pure rules.
 *
 * Pure and import-free of anything server-side, like edit.ts: the admin-gated
 * services (operations-session.ts) decide what to write with these functions,
 * and the `"use client"` console runs the same ones for its optimistic update,
 * so what the labeller sees the moment they act is what the server is about
 * to write.
 *
 * Nothing here ever removes a row. A deleted point or stroke is a TOMBSTONE —
 * `status: 'deleted'`, with the status it had before kept in
 * `status_before_delete` — because the offline scorer needs to know the
 * labeller rejected a vendor stroke, not merely that it is missing.
 */

import type {
  LabelPoint,
  LabelPointStatus,
  LabelShot,
  LabelShotStatus,
  LabelSide,
} from "./session";

// ── Delete and Undo ─────────────────────────────────────────────────────────

/** Why a stroke was deleted — the migration's `delete_reason` CHECK list. */
export const LABEL_DELETE_REASONS = [
  "dead_ball_after_fault",
  "dead_ball_after_point",
  "not_a_stroke",
  "duplicate",
  "other",
] as const;
export type LabelDeleteReason = (typeof LABEL_DELETE_REASONS)[number];

export function isLabelDeleteReason(
  value: unknown,
): value is LabelDeleteReason {
  return (
    typeof value === "string" &&
    (LABEL_DELETE_REASONS as readonly string[]).includes(value)
  );
}

type LiveShotStatus = Exclude<LabelShotStatus, "deleted">;
type LivePointStatus = Exclude<LabelPointStatus, "deleted">;

/** The columns a shot delete writes. */
export interface ShotDeleteWrite {
  status: "deleted";
  status_before_delete: LiveShotStatus;
  delete_reason: LabelDeleteReason;
}

/** The columns a shot Undo writes: the old status back, the reason cleared. */
export interface ShotRestoreWrite {
  status: LiveShotStatus;
  status_before_delete: null;
  delete_reason: null;
}

export type Planned<T> = { ok: true; write: T } | { error: string };

/**
 * Delete a stroke: `deleted`, remembering what it was. A reason is required —
 * the table refuses a tombstone without one, and "why" is the half of a
 * deletion the scorer actually learns from.
 */
export function planShotDelete(
  current: { status: LabelShotStatus },
  reason: unknown,
): Planned<ShotDeleteWrite> {
  if (current.status === "deleted") {
    return { error: "This shot is already deleted." };
  }
  if (!isLabelDeleteReason(reason)) {
    return { error: "Choose why this shot is being deleted." };
  }
  return {
    ok: true,
    write: {
      status: "deleted",
      status_before_delete: current.status,
      delete_reason: reason,
    },
  };
}

/**
 * Undo a stroke's delete: the status it had before, and no reason — a live
 * stroke has no business carrying one.
 *
 * `status_before_delete` is set on every tombstone (the migration's CHECK
 * pairs it with `status = 'deleted'`). The fallback for a row without it is
 * the one thing that CAN be read off the row: a stroke with no vendor id was
 * added by the labeller; anything else comes back `kept`.
 */
export function planShotRestore(current: {
  status: LabelShotStatus;
  status_before_delete: LiveShotStatus | null;
  event_id: number | null;
}): Planned<ShotRestoreWrite> {
  if (current.status !== "deleted") {
    return { error: "This shot is not deleted." };
  }
  return {
    ok: true,
    write: {
      status: shotStatusBeforeDelete(current),
      status_before_delete: null,
      delete_reason: null,
    },
  };
}

function shotStatusBeforeDelete(current: {
  status_before_delete: LiveShotStatus | null;
  event_id: number | null;
}): LiveShotStatus {
  if (current.status_before_delete) return current.status_before_delete;
  return current.event_id === null ? "added" : "kept";
}

/** The columns a point delete writes. Points carry no delete reason. */
export interface PointDeleteWrite {
  status: "deleted";
  status_before_delete: LivePointStatus;
}
export interface PointRestoreWrite {
  status: LivePointStatus;
  status_before_delete: null;
}

export function planPointDelete(current: {
  status: LabelPointStatus;
}): Planned<PointDeleteWrite> {
  if (current.status === "deleted") {
    return { error: "This point is already deleted." };
  }
  return {
    ok: true,
    write: { status: "deleted", status_before_delete: current.status },
  };
}

/**
 * Undo a point's delete: the status it had before. Without a remembered
 * status (unreachable while the migration's CHECK pairs the two) it comes
 * back as seeded, `unchanged` — the same fallback as a vendor stroke's `kept`.
 */
export function planPointRestore(current: {
  status: LabelPointStatus;
  status_before_delete: LivePointStatus | null;
}): Planned<PointRestoreWrite> {
  if (current.status !== "deleted") {
    return { error: "This point is not deleted." };
  }
  return {
    ok: true,
    write: {
      status: current.status_before_delete ?? "unchanged",
      status_before_delete: null,
    },
  };
}

// ── The console's camelCase rows ────────────────────────────────────────────

export function applyShotDelete(
  shot: LabelShot,
  reason: LabelDeleteReason,
): LabelShot {
  if (shot.status === "deleted") return shot;
  return {
    ...shot,
    status: "deleted",
    statusBeforeDelete: shot.status,
    deleteReason: reason,
  };
}

export function applyShotRestore(shot: LabelShot): LabelShot {
  if (shot.status !== "deleted") return shot;
  return {
    ...shot,
    status: shotStatusBeforeDelete({
      status_before_delete: shot.statusBeforeDelete,
      event_id: shot.eventId,
    }),
    statusBeforeDelete: null,
    deleteReason: null,
  };
}

export function applyPointDelete(point: LabelPoint): LabelPoint {
  if (point.status === "deleted") return point;
  return { ...point, status: "deleted", statusBeforeDelete: point.status };
}

export function applyPointRestore(point: LabelPoint): LabelPoint {
  if (point.status !== "deleted") return point;
  return {
    ...point,
    status: point.statusBeforeDelete ?? "unchanged",
    statusBeforeDelete: null,
  };
}

// ── Add a stroke ────────────────────────────────────────────────────────────

/** What an added stroke is seeded with; the labeller fills in the rest. */
export interface AddedShotPlan {
  /** Always null: only a labeller-added stroke lacks a vendor id. */
  event_id: null;
  after_event_id: number | null;
  status: "added";
  hitter: LabelSide | null;
  video_time: number | null;
}

type PlanShot = Pick<
  LabelShot,
  "id" | "eventId" | "afterEventId" | "status" | "hitter" | "videoTime"
>;

/**
 * A new stroke for a point, placed after `afterShotId` — or, when that is
 * null, after the rally's last live stroke (the end of the rally).
 *
 * `shots` must be in video order (`orderLabelShots`), as the loader and the
 * console keep them.
 *
 * ── after_event_id ──────────────────────────────────────────────────────────
 * The vendor stroke id the new stroke follows, so the scorer can say where in
 * the vendor's rally the missed stroke belonged. When the stroke it follows
 * was itself ADDED (no vendor id), it inherits THAT stroke's
 * `after_event_id` — the nearest preceding vendor stroke — so two strokes the
 * vendor missed in a row both point at the last stroke it did see. Null means
 * no vendor stroke precedes it (an empty rally, or one that opens with added
 * strokes).
 *
 * ── Seeded values ───────────────────────────────────────────────────────────
 *   hitter      the opponent of the stroke it follows (rallies alternate); the
 *               point's server when it is the rally's first; null when the
 *               stroke it follows has no hitter.
 *   video_time  the midpoint of its two live neighbours when both are timed,
 *               so it sorts between them at once. Otherwise null — a stroke
 *               with no time sorts after every timed one (`orderLabelShots`),
 *               which is exactly right at the end of a rally, and the
 *               labeller sets the time from the video.
 */
export function planAddedShot(
  point: Pick<LabelPoint, "server" | "status"> & {
    shots: readonly PlanShot[];
  },
  afterShotId: string | null,
): Planned<AddedShotPlan> {
  if (point.status === "deleted") {
    return { error: "Restore this point before adding a shot to it." };
  }
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  let index: number;
  if (afterShotId === null) {
    index = live.length - 1;
  } else {
    index = live.findIndex((shot) => shot.id === afterShotId);
    if (index === -1) {
      return {
        error: "The shot to add after is not a live shot of this point.",
      };
    }
  }
  const before = index >= 0 ? live[index] : null;
  const after = live[index + 1] ?? null;

  const hitter = before
    ? before.hitter === null
      ? null
      : opponent(before.hitter)
    : point.server;

  const videoTime =
    before?.videoTime != null && after?.videoTime != null
      ? round2((before.videoTime + after.videoTime) / 2)
      : null;

  return {
    ok: true,
    write: {
      event_id: null,
      after_event_id: before ? (before.eventId ?? before.afterEventId) : null,
      status: "added",
      hitter,
      video_time: videoTime,
    },
  };
}

function opponent(side: LabelSide): LabelSide {
  return side === "p1" ? "p2" : "p1";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ── Move a point to another game ────────────────────────────────────────────

export interface LabelGame {
  setNumber: number;
  gameNumber: number;
}

export function isLabelGame(value: unknown): value is LabelGame {
  if (typeof value !== "object" || value === null) return false;
  const { setNumber, gameNumber } = value as Record<string, unknown>;
  return (
    Number.isInteger(setNumber) &&
    Number.isInteger(gameNumber) &&
    (setNumber as number) >= 1 &&
    (gameNumber as number) >= 1
  );
}

/**
 * Who serves a game, read off its other live points: their `server`. When
 * those disagree (a mis-seeded point already sits there) the majority wins,
 * and a tie goes to the game's earliest point. Null when the game has no
 * other live point with a server — then there is no one to disagree with.
 */
export function gameServer(
  others: readonly {
    server: LabelSide | null;
    pointIndex: number;
  }[],
): LabelSide | null {
  const counts = { p1: 0, p2: 0 };
  let first: { side: LabelSide; index: number } | null = null;
  for (const point of others) {
    if (!point.server) continue;
    counts[point.server] += 1;
    if (!first || point.pointIndex < first.index) {
      first = { side: point.server, index: point.pointIndex };
    }
  }
  if (counts.p1 === counts.p2) return first?.side ?? null;
  return counts.p1 > counts.p2 ? "p1" : "p2";
}

export interface PointMoveWrite {
  set_number: number;
  game_number: number;
  status: LivePointStatus;
  /** Present only when the move switches the point's server. */
  server?: LabelSide;
}

/**
 * Move a point into another game.
 *
 * The destination's server is `destinationServer` (see {@link gameServer}).
 * When it differs from the point's own, the move is REFUSED unless
 * `switchServer` is true — the console asks "<player> is serving this game,
 * switch players?" first, so a server only changes on a yes. A same-server
 * move (or a move into a game nobody else is in yet) needs no question and
 * leaves `server` alone.
 *
 * Moving is a labelled change: an `unchanged` point becomes `edited`.
 */
export function planPointMove(
  point: Pick<LabelPoint, "status" | "server" | "setNumber" | "gameNumber">,
  to: LabelGame,
  destinationServer: LabelSide | null,
  switchServer: boolean,
): Planned<PointMoveWrite> {
  if (point.status === "deleted") {
    return { error: "Restore this point before moving it." };
  }
  if (!isLabelGame(to)) {
    return { error: "A game is a set and a game number, both 1 or more." };
  }
  if (point.setNumber === to.setNumber && point.gameNumber === to.gameNumber) {
    return { error: "The point is already in that game." };
  }
  const write: PointMoveWrite = {
    set_number: to.setNumber,
    game_number: to.gameNumber,
    status: point.status === "unchanged" ? "edited" : point.status,
  };
  if (destinationServer !== null && destinationServer !== point.server) {
    if (!switchServer) {
      return {
        error:
          "Someone else serves that game. Confirm switching the server to move this point there.",
      };
    }
    write.server = destinationServer;
  }
  return { ok: true, write };
}

/** Whether moving `point` to `to` would change its server — the dialog's cue. */
export function moveNeedsServerSwitch(
  point: Pick<LabelPoint, "server">,
  destinationServer: LabelSide | null,
): boolean {
  return destinationServer !== null && destinationServer !== point.server;
}

/**
 * The server of game `to` as the console's rows have it — every live point
 * in that game except the one moving.
 */
export function destinationServerIn(
  points: readonly Pick<
    LabelPoint,
    "id" | "status" | "server" | "pointIndex" | "setNumber" | "gameNumber"
  >[],
  movingPointId: string,
  to: LabelGame,
): LabelSide | null {
  return gameServer(
    points.filter(
      (p) =>
        p.id !== movingPointId &&
        p.status !== "deleted" &&
        p.setNumber === to.setNumber &&
        p.gameNumber === to.gameNumber,
    ),
  );
}

/**
 * The games a point can move to from the console: the game of the nearest
 * live point before it and after it in `point_index` order, when that game
 * is not its own. Adjacent only, so a moved point never lands in a game
 * whose other points it does not sit beside.
 */
export function neighbourGames(
  points: readonly Pick<
    LabelPoint,
    "id" | "status" | "setNumber" | "gameNumber"
  >[],
  pointId: string,
): LabelGame[] {
  const live = points.filter((p) => p.status !== "deleted");
  const index = live.findIndex((p) => p.id === pointId);
  if (index === -1) return [];
  const self = live[index];
  const games: LabelGame[] = [];
  const seen = new Set<string>([`${self.setNumber}·${self.gameNumber}`]);
  for (const neighbour of [live[index - 1], live[index + 1]]) {
    if (
      !neighbour ||
      neighbour.setNumber === null ||
      neighbour.gameNumber === null
    ) {
      continue;
    }
    const key = `${neighbour.setNumber}·${neighbour.gameNumber}`;
    if (seen.has(key)) continue;
    seen.add(key);
    games.push({
      setNumber: neighbour.setNumber,
      gameNumber: neighbour.gameNumber,
    });
  }
  return games;
}

/** `point` after a move, as the console shows it. */
export function applyPointMove(
  point: LabelPoint,
  write: PointMoveWrite,
): LabelPoint {
  return {
    ...point,
    setNumber: write.set_number,
    gameNumber: write.game_number,
    status: write.status,
    server: write.server ?? point.server,
  };
}

// ── Checked ─────────────────────────────────────────────────────────────────

/** Mark a point checked (at `now`) or clear it. A tombstone is never checked. */
export function planPointChecked(
  current: { status: LabelPointStatus },
  checked: boolean,
  now: Date,
): Planned<{ checked_at: string | null }> {
  if (current.status === "deleted") {
    return { error: "Restore this point before checking it." };
  }
  return {
    ok: true,
    write: { checked_at: checked ? now.toISOString() : null },
  };
}
