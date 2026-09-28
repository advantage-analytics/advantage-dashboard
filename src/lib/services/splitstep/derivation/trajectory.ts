/**
 * The vendor's trajectories file, parsed once for everything that reads it.
 *
 * A flat array of per-frame rows, confirmed by opening a real file (job
 * d3bff342…): `stroke_frame, bounce_frame, frame, ball_x_px, ball_y_px,
 * ball_x_m, ball_y_m, ball_z_m`. Each row belongs to the flight that starts at
 * `stroke_frame`, which equals the stroke's `trimmedFrame`. The `_px` columns
 * are ignored. Metres share the strokes' frame: origin at the net centre, +y
 * toward the top of frame (court.ts).
 *
 * Two readers: ball-paths.ts draws each flight for the film room, and
 * line-calls.ts makes our own in/out and net call from it.
 *
 * Pure: no I/O.
 */

import { orderedBounceFrame } from "./frame-clock";
import { num } from "./parse";

/** One vendor row, as it arrives. Every field is untrusted until `num()`. */
export interface TrajectoryRow {
  stroke_frame?: unknown;
  bounce_frame?: unknown;
  frame?: unknown;
  ball_x_m?: unknown;
  ball_y_m?: unknown;
  ball_z_m?: unknown;
}

/** The rows of one stroke's flight, with its bounce frame resolved. */
export interface TrajectoryFlight {
  strokeFrame: number;
  /** Null when the vendor saw no bounce, or placed it before the contact. */
  bounceFrame: number | null;
  rows: TrajectoryRow[];
}

/**
 * Group the file's rows by the stroke that launched them, keeping only
 * strokes in `strokeFrames` (negative frames are the sentinel and never
 * match). Throws on anything that is not an array, as `parseStrokes` does.
 */
export function groupTrajectories(
  rawTrajectories: unknown,
  strokeFrames: ReadonlySet<number>,
): Map<number, TrajectoryFlight> {
  if (!Array.isArray(rawTrajectories)) {
    throw new Error(
      "SplitStep trajectories must be a JSON array of per-frame row objects",
    );
  }

  const groups = new Map<number, TrajectoryRow[]>();
  for (const entry of rawTrajectories) {
    if (typeof entry !== "object" || entry === null) continue;
    const row = entry as TrajectoryRow;
    const strokeFrame = num(row.stroke_frame);
    if (strokeFrame === null || !strokeFrames.has(strokeFrame)) continue;
    const group = groups.get(strokeFrame);
    if (group) group.push(row);
    else groups.set(strokeFrame, [row]);
  }

  const flights = new Map<number, TrajectoryFlight>();
  for (const [strokeFrame, rows] of groups) {
    let bounceFrame: number | null = null;
    for (const row of rows) {
      const candidate = num(row.bounce_frame);
      if (candidate !== null) {
        bounceFrame = candidate;
        break;
      }
    }
    flights.set(strokeFrame, {
      strokeFrame,
      bounceFrame: orderedBounceFrame(bounceFrame, strokeFrame),
      rows,
    });
  }
  return flights;
}

/** A row with usable ball coordinates. */
export interface BallSample {
  frame: number;
  x: number;
  y: number;
  /** Height in metres; null when the vendor gave none. */
  z: number | null;
}

/** The flight's rows with a frame and finite x/y, in frame order. */
export function flightSamples(flight: TrajectoryFlight): BallSample[] {
  const samples: BallSample[] = [];
  for (const row of flight.rows) {
    const frame = num(row.frame);
    const x = row.ball_x_m;
    const y = row.ball_y_m;
    if (frame === null) continue;
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const z =
      typeof row.ball_z_m === "number" && Number.isFinite(row.ball_z_m)
        ? row.ball_z_m
        : null;
    samples.push({ frame, x, y, z });
  }
  return samples.sort((a, b) => a.frame - b.frame);
}
