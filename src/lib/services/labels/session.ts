/**
 * One hand-labelling session as the console reads it — the shapes
 * `getLabelSession` (`lib/data/labels-server.ts`) returns and the components
 * under `components/admin/labels/` render, plus the one ordering rule both
 * sides depend on.
 *
 * Pure and import-free of anything server-side, so a `"use client"` console
 * can take these types and `orderLabelShots` without dragging the
 * service-role loader into its bundle.
 *
 * There is deliberately no `flags` field anywhere here: the label tables carry
 * none, and a session in `labelling` must not show the derivation's flags to
 * the person labelling (see the migration's `status` comment).
 */

import type {
  LabelEnding,
  LabelShotResult,
  LabelSide,
  LabelStroke,
} from "./seed";

export type { LabelEnding, LabelShotResult, LabelSide, LabelStroke };

export type LabelPointStatus = "unchanged" | "edited" | "added" | "deleted";
export type LabelShotStatus = "kept" | "edited" | "added" | "deleted";
export type LabelServeSide = "deuce" | "ad";

/** One `label_shots` row. Coordinates are metres, near baseline at y = 0. */
export interface LabelShot {
  id: string;
  labelPointId: string;
  /** The vendor stroke id; null for a stroke the labeller added. */
  eventId: number | null;
  /** Where an added stroke sits in the rally. */
  afterEventId: number | null;
  status: LabelShotStatus;
  deleteReason: string | null;
  hitter: LabelSide | null;
  stroke: LabelStroke | null;
  result: LabelShotResult | null;
  contactX: number | null;
  contactY: number | null;
  landingX: number | null;
  landingY: number | null;
  /** Seconds on the analysis clock — the same clock as `shots.video_time`. */
  videoTime: number | null;
}

/** One `label_points` row with its strokes, already in video order. */
export interface LabelPoint {
  id: string;
  pointIndex: number;
  setNumber: number | null;
  gameNumber: number | null;
  server: LabelSide | null;
  serveSide: LabelServeSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  endedBy: LabelSide | null;
  status: LabelPointStatus;
  checkedAt: string | null;
  shots: LabelShot[];
}

export interface LabelSession {
  id: string;
  jobId: string;
  matchId: string;
  status: "labelling" | "complete";
  derivationVersion: string;
  /** `matches.player1_name` — the p1 side every label row means. */
  player1Name: string;
  player2Name: string;
  /** In `point_index` order. */
  points: LabelPoint[];
}

/** The session's video, signed for this render. */
export interface LabelVideo {
  url: string;
  /**
   * Seconds to SUBTRACT from a label's `videoTime` to seek in this file —
   * `MatchVideo.startTimeSeconds`'s rule for the provider-job lineage: 0 for
   * our own upload, the job's `start_time_seconds` for the vendor's re-encode.
   */
  startTimeSeconds: number;
}

/**
 * Strokes in the order they happened on the video: `videoTime` ascending,
 * a stroke without one after every timed stroke, then the vendor `eventId`
 * (an added stroke, which has none, last), then the row id so two calls
 * always agree.
 *
 * Never `shot_number`: the label tables have no such column, and the one the
 * derivation writes is renumbered after phantom strokes are dropped, so it is
 * exactly the thing a labeller is here to check.
 */
export function orderLabelShots<
  T extends Pick<LabelShot, "id" | "videoTime" | "eventId">,
>(shots: readonly T[]): T[] {
  return [...shots].sort(
    (a, b) =>
      compareNullsLast(a.videoTime, b.videoTime) ||
      compareNullsLast(a.eventId, b.eventId) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

function compareNullsLast(a: number | null, b: number | null): number {
  if (a === null || b === null) {
    if (a === b) return 0;
    return a === null ? 1 : -1;
  }
  return a - b;
}

/** "N of M points checked": tombstones count in neither. */
export function labelProgress(points: readonly LabelPoint[]): {
  checked: number;
  total: number;
} {
  let checked = 0;
  let total = 0;
  for (const point of points) {
    if (point.status === "deleted") continue;
    total += 1;
    if (point.checkedAt) checked += 1;
  }
  return { checked, total };
}
