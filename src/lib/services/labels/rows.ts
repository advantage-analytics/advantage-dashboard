/**
 * `label_points` and `label_shots` as PostgREST hands them back, and the one
 * reading of each into the console's `LabelPoint` / `LabelShot`.
 *
 * Shared by the loader (`lib/data/labels-server.ts`, which reads a whole
 * session) and the writers in this folder that read a row back after an
 * insert — one column list and one mapper, so a column added to the console's
 * row cannot be left out of a writer's answer. Pure: no client, no `next/`.
 */

import { parseLabelPointSeed, parseLabelShotSeed } from "./edit";
import type {
  LabelEnding,
  LabelGameType,
  LabelPoint,
  LabelPointStatus,
  LabelServeSide,
  LabelShot,
  LabelShotResult,
  LabelShotStatus,
  LabelSide,
  LabelSiteRemoval,
  LabelSpin,
  LabelStroke,
} from "./session";

export interface LabelPointRow {
  id: string;
  point_index: number;
  vendor_rally_ids: number[] | null;
  set_number: number | null;
  game_number: number | null;
  server: LabelSide | null;
  serve_side: LabelServeSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  game_type: LabelGameType;
  status: LabelPointStatus;
  status_before_delete: Exclude<LabelPointStatus, "deleted"> | null;
  checked_at: string | null;
  note: string | null;
  dismissed: string[] | null;
  /** jsonb, parsed by `parseLabelPointSeed` before anything trusts it. */
  seed?: unknown;
}

export const LABEL_POINT_COLUMNS =
  "id, point_index, vendor_rally_ids, set_number, game_number, server, serve_side, winner, ending, ended_by, game_type, status, status_before_delete, checked_at, note, dismissed, seed";

/** A point row as the console draws it, with `shots` already in video order. */
export function toLabelPoint(
  row: LabelPointRow,
  shots: LabelShot[] = [],
): LabelPoint {
  return {
    id: row.id,
    pointIndex: row.point_index,
    vendorRallyIds: row.vendor_rally_ids ?? [],
    setNumber: row.set_number,
    gameNumber: row.game_number,
    server: row.server,
    serveSide: row.serve_side ?? null,
    winner: row.winner ?? null,
    ending: row.ending ?? null,
    endedBy: row.ended_by ?? null,
    gameType: row.game_type,
    status: row.status,
    statusBeforeDelete: row.status_before_delete ?? null,
    checkedAt: row.checked_at ?? null,
    note: row.note ?? null,
    dismissed: row.dismissed ?? [],
    seed: parseLabelPointSeed(row.seed ?? null),
    shots,
  };
}

export interface LabelShotRow {
  id: string;
  label_point_id: string;
  event_id: number | null;
  after_event_id: number | null;
  status: LabelShotStatus;
  status_before_delete: Exclude<LabelShotStatus, "deleted"> | null;
  delete_reason: string | null;
  hitter: LabelSide | null;
  stroke: LabelStroke | null;
  result: LabelShotResult | null;
  spin: LabelSpin | null;
  contact_x: number | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
  video_time: number | null;
  site_removal: LabelSiteRemoval | null;
  site_removal_restored_at: string | null;
  /** jsonb, parsed by `parseLabelShotSeed` before anything trusts it. */
  seed?: unknown;
}

export const LABEL_SHOT_COLUMNS =
  "id, label_point_id, event_id, after_event_id, status, status_before_delete, delete_reason, hitter, stroke, result, spin, contact_x, contact_y, landing_x, landing_y, video_time, site_removal, site_removal_restored_at, seed";

export function toLabelShot(row: LabelShotRow): LabelShot {
  return {
    id: row.id,
    labelPointId: row.label_point_id,
    eventId: row.event_id,
    afterEventId: row.after_event_id,
    status: row.status,
    statusBeforeDelete: row.status_before_delete ?? null,
    deleteReason: row.delete_reason,
    hitter: row.hitter,
    stroke: row.stroke,
    result: row.result,
    spin: row.spin,
    contactX: row.contact_x,
    contactY: row.contact_y,
    landingX: row.landing_x,
    landingY: row.landing_y,
    videoTime: row.video_time,
    siteRemoval: row.site_removal ?? null,
    siteRemovalRestoredAt: row.site_removal_restored_at ?? null,
    seed: parseLabelShotSeed(row.seed ?? null),
  };
}
