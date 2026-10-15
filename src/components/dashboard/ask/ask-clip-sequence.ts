import {
  POINT_BUFFER_SECONDS,
  REACHED_EPSILON_SECONDS,
  toFilmTime,
  type FilmClock,
} from "@/components/dashboard/matches/match-detail/film/film-timeline";
import type { AskShowPoint } from "@/lib/services/ask/show-response";

/**
 * The inline clip strip's timeline (roadmap 6.1): the answer's points as
 * windows on the film's clock, and how playback walks them.
 *
 * The same arithmetic the film room uses (`film-timeline.ts`): one
 * conversion through `toFilmTime` — which is where the trim offset is
 * applied — then the point's own duration padded by the room's buffer, or
 * the room's assumed length when the source timed starts but not lengths.
 * A window ends no later than the next one's padded start, as the room's do.
 * Pure, so `tests/ask-clip-strip.spec.ts` pins it without a `<video>`.
 */

/** The room's own assumed rally length for an untimed point (`ASSUMED_POINT_SECONDS`). */
const ASSUMED_SECONDS = 10;

export interface ClipWindow {
  pointNumber: number;
  /** Film seconds, lead-in included. */
  start: number;
  /** Film seconds, run-out included; never before `start`. */
  end: number;
}

/**
 * The points that have a place on the film, in match order, each with its
 * padded window. Untimed points are left out: they have nowhere to seek to.
 */
export function clipWindows(
  points: readonly AskShowPoint[],
  clock: FilmClock,
): ClipWindow[] {
  const limit = clock.duration ?? Infinity;
  const timed = points
    .filter(
      (point): point is AskShowPoint & { videoTime: number } =>
        point.videoTime !== null,
    )
    .sort((a, b) => a.videoTime - b.videoTime);
  // One conversion per point, reused as the bound of the window before it.
  const starts = timed.map((point) =>
    Math.max(0, toFilmTime(point.videoTime, clock) - POINT_BUFFER_SECONDS),
  );
  return timed.map((point, i) => {
    const serve = toFilmTime(point.videoTime, clock);
    const start = starts[i];
    const length =
      point.duration && point.duration > 0 ? point.duration : ASSUMED_SECONDS;
    // As `filmStops` clamps: never past the next window's padded start, so
    // windows never overlap and advancing never seeks backwards. An untimed
    // length is only assumed, so the next serve cuts it too.
    const nextStart = starts[i + 1] ?? Infinity;
    const end = Math.min(
      serve + length + POINT_BUFFER_SECONDS,
      nextStart,
      limit,
    );
    return {
      pointNumber: point.pointNumber,
      start,
      end: Math.max(end, start),
    };
  });
}

/**
 * What a playhead report at `filmTime` while window `index` plays means:
 * `null` to keep playing, the next index to jump to once this window has run
 * out, or `"end"` after the last one. The epsilon is the room's: a `<video>`
 * reports a frame a few milliseconds short of the second asked for.
 */
export function clipAdvance(
  windows: readonly ClipWindow[],
  index: number,
  filmTime: number,
): number | "end" | null {
  const current = windows[index];
  if (!current) return "end";
  if (filmTime < current.end - REACHED_EPSILON_SECONDS) return null;
  return index + 1 < windows.length ? index + 1 : "end";
}

/** "Point 3 of 8" — the strip's counter. */
export function clipPositionLabel(index: number, total: number): string {
  return `Point ${index + 1} of ${total}`;
}
