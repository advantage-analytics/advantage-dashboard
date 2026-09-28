import type {
  LabelEnding,
  LabelServeSide,
  LabelShotResult,
  LabelSide,
  LabelStroke,
} from "@/lib/services/labels/session";
import type { LabelDeleteReason } from "@/lib/services/labels/operations";
import { surnameLabels } from "@/lib/data/match-utils";

/**
 * The console's words for the label vocabularies — one table per CHECK list
 * in `20260928190122_label_sessions.sql`, so a value the migration allows can
 * never render as its raw snake_case.
 */

export const ENDING_LABEL: Record<LabelEnding, string> = {
  ace: "Ace",
  service_winner: "Service winner",
  double_fault: "Double fault",
  winner: "Winner",
  error: "Error",
  let_replayed: "Let, replayed",
  not_a_point: "Not a point",
};

export const STROKE_LABEL: Record<LabelStroke, string> = {
  first_serve: "First serve",
  second_serve: "Second serve",
  forehand: "Forehand",
  backhand: "Backhand",
  forehand_volley: "Forehand volley",
  backhand_volley: "Backhand volley",
  overhead: "Overhead",
};

export const RESULT_LABEL: Record<LabelShotResult, string> = {
  in: "In",
  out: "Out",
  net: "Net",
};

/** Why a stroke was deleted, in the delete dialog's and the ghost row's words. */
export const DELETE_REASON_LABEL: Record<LabelDeleteReason, string> = {
  dead_ball_after_fault: "Dead ball after a fault",
  dead_ball_after_point: "Dead ball after the point",
  not_a_stroke: "Not a stroke",
  duplicate: "Duplicate",
  other: "Other",
};

export const SERVE_SIDE_LABEL: Record<LabelServeSide, string> = {
  deuce: "Deuce",
  ad: "Ad",
};

/** The two sides' cell labels: surnames, initialled only when they clash. */
export type SideNames = Record<LabelSide, string>;

export function sideNames(player1Name: string, player2Name: string): SideNames {
  const [p1, p2] = surnameLabels(player1Name, player2Name);
  return { p1, p2 };
}

/**
 * Seconds on the analysis clock → "41:12.0" (or "1:02:03.4" past the hour).
 * Tenths, because a rally's strokes sit under a second apart and a
 * whole-second clock would print two of them at the same time.
 */
export function formatVideoTime(seconds: number): string {
  const tenths = Math.round(Math.max(0, seconds) * 10);
  const h = Math.floor(tenths / 36000);
  const m = Math.floor((tenths % 36000) / 600);
  const s = Math.floor((tenths % 600) / 10);
  const t = tenths % 10;
  const tail = `${String(s).padStart(2, "0")}.${t}`;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${tail}` : `${m}:${tail}`;
}

/** A stored position → "-0.80, 17.79" (metres, two places), or null. */
export function formatCourtPoint(
  x: number | null,
  y: number | null,
): string | null {
  if (x === null || y === null) return null;
  return `${x.toFixed(2)}, ${y.toFixed(2)}`;
}

/**
 * The time cell's text → seconds, the inverse of {@link formatVideoTime}:
 * "41:12.0", "1:02:03.4" or plain seconds ("2472", "2472.5"). Empty text
 * clears the time (null); anything unreadable is `undefined`, and the cell
 * keeps its editor open rather than writing it.
 */
export function parseVideoTime(text: string): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split(":");
  if (parts.length > 3) return undefined;
  const last = parts[parts.length - 1];
  if (!/^\d+(\.\d+)?$/.test(last)) return undefined;
  const whole = parts.slice(0, -1);
  if (!whole.every((p) => /^\d+$/.test(p))) return undefined;
  // Past the first field, minutes and seconds are clock digits: under 60.
  if (parts.length > 1 && Number(last) >= 60) return undefined;
  if (parts.length === 3 && Number(whole[1]) >= 60) return undefined;
  return (
    whole.reduce((total, p) => total * 60 + Number(p), 0) * 60 + Number(last)
  );
}

/**
 * A position cell's text → metres, the inverse of {@link formatCourtPoint}:
 * "x, y" (a comma, spaces, or both between them). Empty text clears the
 * position (null); anything else unreadable is `undefined`.
 */
export function parseCourtPoint(
  text: string,
): { x: number; y: number } | null | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split(/\s*,\s*|\s+/);
  if (parts.length !== 2) return undefined;
  const [x, y] = parts.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  if (!parts.every((p) => /^-?\d+(\.\d+)?$/.test(p))) return undefined;
  return { x, y };
}
