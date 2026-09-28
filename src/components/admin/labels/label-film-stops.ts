import type { FilmStop } from "@/components/dashboard/matches/match-detail/film/film-timeline";
import { POINT_TAIL_SECONDS } from "@/lib/services/labels/playback";
import type { LabelPoint } from "@/lib/services/labels/session";

/**
 * The labelling console's points as the film player's stops — what its
 * Previous/Next point glyphs, set-by-set track, Loop and Skip dead time walk.
 *
 * The windows are the console's own playing rule (`playingRowAt` in
 * `lib/services/labels/playback.ts`), not the film tab's padded ones: a point
 * opens on its first live, timed stroke and closes at whichever comes first —
 * the next point's first stroke, or {@link POINT_TAIL_SECONDS} after its own
 * last stroke. So "Next point" lands on the serve the table's row will light
 * up for, Loop repeats exactly the span the row stays lit, and Skip dead time
 * skips exactly the stretch where no row is lit. A 1.5s lead-in like the film
 * tab's would put the playhead on a point the table says has not started.
 *
 * Tombstones and strokes without a `videoTime` have no place on the video's
 * clock and are left out, as they are there; a point with no timed stroke
 * has no stop.
 *
 * ── Two clocks ──────────────────────────────────────────────────────────────
 * A label's `videoTime` is on the ANALYSIS clock; the player's stops are on
 * the FILE's (`<video>.currentTime`). `offset` is `LabelVideo.startTimeSeconds`
 * — seconds to subtract — applied once here and clamped at zero like
 * `toFilmTime`, the same arithmetic `label-video.tsx` does for a row click.
 */

/** What the player's track needs from a label point: its id and its set. */
export interface LabelStopPoint {
  id: string;
  setNumber: number | null;
  /** 0-based, as the table numbers it (`pointIndex + 1`). */
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
