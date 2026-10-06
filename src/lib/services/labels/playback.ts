/**
 * Which row of the labelling console the video is on — the pure lookup
 * behind the table's "playing" highlight.
 *
 * `time` is on the ANALYSIS clock, the same clock as `LabelShot.videoTime`
 * (the player adds the file's start offset back before asking — see
 * `label-video.tsx`).
 *
 * A point spans from its first live, timed stroke to whichever comes first:
 * the next point's first stroke, or {@link POINT_TAIL_SECONDS} after its own
 * last stroke. The tail covers the ball landing and the players pulling up;
 * past it the video is in dead time — a changeover, the walk back to the
 * line — and no row is playing, rather than the last point staying lit
 * through ninety seconds of towels.
 *
 * Inside a point, the playing stroke is the latest one struck at or before
 * `time`. Tombstones (`status: "deleted"`) and anything without a
 * `videoTime` are invisible here: they have no place on the video's clock.
 */

import type { LabelPoint } from "./session";

/** Seconds a point stays "playing" after its last stroke. */
export const POINT_TAIL_SECONDS = 3;

export interface PlayingRow {
  pointId: string;
  shotId: string;
}

/** One live point on the video's clock. */
export interface PlaybackSpan {
  pointId: string;
  /** Live, timed strokes in time order. */
  strokes: { id: string; time: number }[];
}

/**
 * Every live point with a timed stroke, in video order — the table
 * {@link playingRowIn} scans. Built once per change of the rows rather than
 * on every tick of the clock.
 */
export function playbackSpans(points: readonly LabelPoint[]): PlaybackSpan[] {
  const spans: PlaybackSpan[] = [];
  for (const point of points) {
    if (point.status === "deleted") continue;
    const strokes = point.shots
      .filter(
        (shot): shot is typeof shot & { videoTime: number } =>
          shot.status !== "deleted" && shot.videoTime !== null,
      )
      .map((shot) => ({ id: shot.id, time: shot.videoTime }))
      .sort((a, b) => a.time - b.time);
    if (strokes.length > 0) spans.push({ pointId: point.id, strokes });
  }
  return spans.sort((a, b) => a.strokes[0].time - b.strokes[0].time);
}

/** The row playing at `time`, read off {@link playbackSpans}. */
export function playingRowIn(
  spans: readonly PlaybackSpan[],
  time: number | null,
): PlayingRow | null {
  if (time === null || !Number.isFinite(time)) return null;

  for (let i = 0; i < spans.length; i++) {
    const { pointId, strokes } = spans[i];
    const start = strokes[0].time;
    if (time < start) return null;
    const tailEnd = strokes[strokes.length - 1].time + POINT_TAIL_SECONDS;
    const next = spans[i + 1]?.strokes[0].time ?? Infinity;
    if (time >= Math.min(tailEnd, next)) continue;

    let shotId = strokes[0].id;
    for (const stroke of strokes) {
      if (stroke.time > time) break;
      shotId = stroke.id;
    }
    return { pointId, shotId };
  }
  return null;
}

/** {@link playingRowIn} over rows whose spans are not already built. */
export function playingRowAt(
  points: readonly LabelPoint[],
  time: number | null,
): PlayingRow | null {
  return playingRowIn(playbackSpans(points), time);
}
