/**
 * Our own line call per stroke, from the ball's flight rather than the
 * vendor's `in` flag.
 *
 * `in` is noise: it reads out on 16–38% of strokes that were played on, and on
 * a hand-labelled match (Ace v Goodman, 87 points, 2026-09-28) it was right on
 * only 21 of 33 balls hit just before a derived winner. The trajectories file
 * carries the flight itself, per frame, with the vendor's own bounce frame. So
 * two numbers per stroke:
 *
 *   - `margin`: metres inside the singles court at the bounce, negative
 *     outside. Singles lines only; a serve is not measured against its box
 *     here (nothing reads one yet).
 *   - `netClearance`: ball height where the flight crosses the net plane
 *     (y = 0), or null when it never does. Measured for study; nothing acts on
 *     it yet.
 *
 * The bounce comes from the trajectory row at `bounce_frame`. When a stroke
 * has no flight, the stroke's own `bounceX/Y` stands in and `source` says so,
 * so a caller can insist on trajectory evidence.
 *
 * Pure: no I/O.
 */

import { BASELINE_M, SINGLES_HALF_WIDTH_M } from "./court";
import {
  flightSamples,
  groupTrajectories,
  type TrajectoryFlight,
} from "./trajectory";
import type { SplitStepStroke } from "./types";

export interface LineCall {
  /** Metres inside the singles lines at the bounce; negative outside. */
  margin: number | null;
  /** Ball height (m) where the flight crosses the net plane; null if never. */
  netClearance: number | null;
  /**
   * Whether this file's flights run on past their bounce, as the vendor's
   * November 2026 ball model draws them, rather than stopping at it. The same
   * for every stroke of a file. Only then does `netClearance` read as a net
   * call (flags.ts `NET_BY_TRAJECTORY`): measured on 10 labelled matches, a
   * low crossing named a net ball the pre-fill missed 71% of the time on the
   * new files and 28% on the same matches' old ones. Absent means false.
   */
  pastBounce?: boolean;
  /** Where `margin` came from; null when neither source had a bounce. */
  source: "trajectory" | "strokes" | null;
}

export type LineCalls = ReadonlyMap<SplitStepStroke, LineCall>;

/** Metres inside the singles court; negative when the point is outside it. */
export function singlesMargin(x: number, y: number): number {
  return Math.min(SINGLES_HALF_WIDTH_M - Math.abs(x), BASELINE_M - Math.abs(y));
}

/**
 * A line call for every stroke, keyed by the stroke object (as transcript.ts
 * keys bounce times). `rawTrajectories` null means no file: every call then
 * falls back to the stroke's own bounce.
 */
export function lineCallsFor(
  strokes: readonly SplitStepStroke[],
  rawTrajectories: unknown | null,
): Map<SplitStepStroke, LineCall> {
  const frames = new Set<number>();
  for (const s of strokes) {
    if (Number.isFinite(s.trimmedFrame) && s.trimmedFrame >= 0) {
      frames.add(s.trimmedFrame);
    }
  }
  const flights =
    rawTrajectories === null
      ? new Map()
      : groupTrajectories(rawTrajectories, frames);

  const pastBounce = flightsRunPastBounce(flights.values());

  const calls = new Map<SplitStepStroke, LineCall>();
  for (const stroke of strokes) {
    const flight = flights.get(stroke.trimmedFrame);
    const samples = flight ? flightSamples(flight) : [];

    let margin: number | null = null;
    let source: LineCall["source"] = null;
    const bounce =
      flight && flight.bounceFrame !== null
        ? samples.find((s) => s.frame === flight.bounceFrame)
        : undefined;
    if (bounce) {
      margin = singlesMargin(bounce.x, bounce.y);
      source = "trajectory";
    } else if (stroke.bounceX !== null && stroke.bounceY !== null) {
      margin = singlesMargin(stroke.bounceX, stroke.bounceY);
      source = "strokes";
    }

    calls.set(stroke, {
      margin: margin === null ? null : round2(margin),
      netClearance: netCrossingHeight(samples),
      // Set only when true, so an old-model file's calls are unchanged.
      ...(pastBounce ? { pastBounce } : {}),
      source,
    });
  }
  return calls;
}

/** Frames past its bounce a flight must reach to count as running on. */
const PAST_BOUNCE_FRAMES = 10;

/**
 * Whether most of a file's flights that bounce carry samples at least
 * `PAST_BOUNCE_FRAMES` past it. Old-model files stop at the bounce (under 3%
 * of flights go on); the November 2026 model runs on to the next contact or
 * about 26 frames on.
 */
function flightsRunPastBounce(flights: Iterable<TrajectoryFlight>): boolean {
  let bounced = 0;
  let runOn = 0;
  for (const flight of flights) {
    if (flight.bounceFrame === null) continue;
    bounced += 1;
    const last = flightSamples(flight).at(-1);
    if (last && last.frame >= flight.bounceFrame + PAST_BOUNCE_FRAMES) {
      runOn += 1;
    }
  }
  return bounced > 0 && runOn * 2 > bounced;
}

/** Height where consecutive samples change side of the net, interpolated. */
function netCrossingHeight(
  samples: ReturnType<typeof flightSamples>,
): number | null {
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a.y === 0 || Math.sign(a.y) === Math.sign(b.y)) continue;
    if (a.z === null || b.z === null) return null;
    const t = a.y / (a.y - b.y);
    return round2(a.z + t * (b.z - a.z));
  }
  return null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100 + 0;
}
