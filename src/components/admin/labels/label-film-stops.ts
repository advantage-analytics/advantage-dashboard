import type { FilmStop } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import { POINT_TAIL_SECONDS } from "@/lib/services/labels/playback";
import type { LabelPoint } from "@/lib/services/labels/session";

/**
 * The labelling console's points as the film player's stops: what Previous/Next
 * point, the set-by-set track, Loop and Skip dead time walk.
 *
 * The windows are the console's own playing rule (`playingRowAt`, playback.ts),
 * not the film tab's padded ones: a point opens on its first live, timed stroke
 * and closes at the next point's first stroke or {@link POINT_TAIL_SECONDS}
 * after its own last, whichever comes first. So the stops are exactly the spans
 * the rail lights. A point with no timed stroke has no stop.
 *
 * Stops are on the file's clock: `offset` (`LabelVideo.startTimeSeconds`) is
 * subtracted here and clamped at zero (see video-clock.ts).
 */

/** What the player's track needs from a label point: its id and its set. */
export interface LabelStopPoint {
  id: string;
  setNumber: number | null;
  /** 0-based; the rail numbers it `pointIndex + 1`. */
  pointIndex: number;
}

export type LabelFilmStop = FilmStop<LabelStopPoint>;

export function labelFilmStops(
  points: readonly LabelPoint[],
  offset: number,
): LabelFilmStop[] {
  const toFile = (time: number) => Math.max(0, time - offset);

  const spans: { point: LabelStopPoint; first: number; last: number }[] = [];
  for (const point of points) {
    if (point.status === "deleted") continue;
    let first = Infinity;
    let last = -Infinity;
    for (const shot of point.shots) {
      if (shot.status === "deleted" || shot.videoTime === null) continue;
      if (!Number.isFinite(shot.videoTime)) continue;
      first = Math.min(first, shot.videoTime);
      last = Math.max(last, shot.videoTime);
    }
    if (first === Infinity) continue;
    spans.push({
      point: {
        id: point.id,
        setNumber: point.setNumber,
        pointIndex: point.pointIndex,
      },
      first,
      last,
    });
  }
  spans.sort((a, b) => a.first - b.first);

  return spans.map((span, i) => {
    const serve = toFile(span.first);
    const next = spans[i + 1];
    const end = Math.min(
      toFile(span.last + POINT_TAIL_SECONDS),
      next ? toFile(next.first) : Infinity,
    );
    return {
      point: span.point,
      start: serve,
      serve,
      end: Math.max(end, serve),
    };
  });
}
