import type {
  LabelEnding,
  LabelServeSide,
  LabelShotResult,
  LabelSide,
  LabelStroke,
} from "@/lib/services/labels/session";
import { surnameLabels } from "@/lib/data/match-utils";

/**
 * The console's words for the label vocabularies — one table per CHECK list
 * in `20260928180000_label_sessions.sql`, so a value the migration allows can
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
