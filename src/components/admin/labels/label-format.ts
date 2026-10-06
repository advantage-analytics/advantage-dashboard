import { shotSpinLabel } from "@/components/dashboard/matches/match-detail/film/film-shots";
import {
  LABEL_NOTE_MAX,
  LABEL_STROKES,
  labelShotValues,
  type LabelShotPatch,
} from "@/lib/services/labels/edit";
import {
  LABEL_SPINS,
  isServeStroke,
  type LabelEnding,
  type LabelPoint,
  type LabelShot,
  type LabelShotResult,
  type LabelSide,
  type LabelSpin,
  type LabelStroke,
} from "@/lib/services/labels/session";
import { deriveShotResult } from "@/lib/services/labels/shot-derived";
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

/**
 * A stroke's spin in the words the match Video tab prints for the same vendor
 * value — `shotSpinLabel` (`film-shots.ts`), the Current point table's own
 * source, handed the stroke the way that table's rows carry it. So a serve's
 * topspin is a "Kick" and its sidespin a "Slice", and a rally shot's prints
 * as recorded ("Topspin", "Backspin"); null when there is no spin.
 */
export function spinLabel(
  stroke: LabelStroke | null,
  spin: LabelSpin | null,
): string | null {
  return shotSpinLabel({
    shotType: stroke ? STROKE_LABEL[stroke] : null,
    spinType: spin,
  });
}

/** The Spin dropdown's rows for a stroke: every vendor value, in its words. */
export function spinOptions(
  stroke: LabelStroke | null,
): { value: LabelSpin; label: string }[] {
  return LABEL_SPINS.map((value) => ({
    value,
    label: spinLabel(stroke, value) ?? value,
  }));
}

/** Why a stroke was deleted, in the delete dialog's and the ghost row's words. */
export const DELETE_REASON_LABEL: Record<LabelDeleteReason, string> = {
  dead_ball_after_fault: "Hit after a fault",
  dead_ball_after_point: "Hit after the point ended",
  not_a_stroke: "Not a shot",
  duplicate: "Counted twice",
  other: "Something else",
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

/** The Player dropdown's rows: the two sides, by name. */
export function sideOptions(
  names: SideNames,
): { value: LabelSide; label: string }[] {
  return [
    { value: "p1", label: names.p1 },
    { value: "p2", label: names.p2 },
  ];
}

/** The Stroke dropdown's rows. */
export const STROKE_OPTIONS: { value: LabelStroke; label: string }[] =
  LABEL_STROKES.map((value) => ({ value, label: STROKE_LABEL[value] }));

/** A serve that did not go in: part of the point, not of the rally. */
export function isFault(shot: Pick<LabelShot, "stroke" | "result">): boolean {
  return (
    isServeStroke(shot.stroke) &&
    (shot.result === "out" || shot.result === "net")
  );
}

/**
 * The patch a typed position sends: the two coordinates of that end AND the
 * result the row's values derive once they are in — one write, so In / Out /
 * Net never lags the position it follows. Clearing an end (or typing one
 * while the other is still missing) leaves nothing to derive from:
 * `deriveShotResult` answers null, the patch carries no `result` key, and the
 * row keeps its stored value — `nextPlacement`'s rule for a court click.
 */
export function positionPatch(
  shot: LabelShot,
  end: "contact" | "landing",
  point: { x: number; y: number } | null,
): LabelShotPatch {
  const x = point?.x ?? null;
  const y = point?.y ?? null;
  const placed: LabelShotPatch =
    end === "contact"
      ? { contact_x: x, contact_y: y }
      : { landing_x: x, landing_y: y };
  const result = deriveShotResult({ ...labelShotValues(shot), ...placed });
  return result === null ? placed : { ...placed, result };
}

/**
 * What a point row reads off its strokes. Tombstones never count: the row
 * says what the rally is now, not what the vendor first reported.
 *   · `time` — the first live stroke that has a time;
 *   · `lastShot` — the last live stroke's name;
 *   · `rally` — the live strokes from the LAST serve on, that serve included,
 *     so a fault, a second serve and two groundstrokes is a rally of 3. A
 *     point with no serve labelled counts every live stroke.
 */
export function pointSummary(point: Pick<LabelPoint, "shots">): {
  time: string | null;
  lastShot: string | null;
  rally: number;
} {
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  const timed = live.find((shot) => shot.videoTime !== null);
  const last = live.at(-1);
  const serve = live.findLastIndex((shot) => isServeStroke(shot.stroke));
  return {
    time:
      timed && timed.videoTime !== null
        ? formatVideoTime(timed.videoTime)
        : null,
    lastShot: last?.stroke ? STROKE_LABEL[last.stroke] : null,
    rally: live.length - Math.max(serve, 0),
  };
}

/** Typed text → the note to store: null when cleared, undefined when too long. */
export function parseNote(text: string): string | null | undefined {
  const note = text.trim();
  if (note === "") return null;
  return note.length > LABEL_NOTE_MAX ? undefined : note;
}
