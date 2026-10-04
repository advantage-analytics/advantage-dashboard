import type { LabelPoint } from "@/lib/services/labels/session";
import { labelFilmStops, type LabelFilmStop } from "./label-film-stops";

/**
 * The span a clicked stroke repeats over: clicking a shot row replays that
 * shot and nothing else, round and round, until the labeller clicks elsewhere
 * or presses Space (`loopShot` in `label-video.tsx` is what runs it).
 *
 * A shot opens at its own contact and closes at the next one — the next live,
 * timed stroke of the same point, in time order. The point's last stroke has
 * no next contact, so it runs {@link SHOT_LOOP_TAIL_SECONDS} — long enough to
 * see the ball land — but never past the point's own stop
 * (`label-film-stops.ts`), which is where the next point's serve begins.
 *
 * Tombstones and strokes without a `videoTime` have no place on the video's
 * clock: asked for one, the answer is `null` and nothing loops; as a
 * neighbour, they are stepped over.
 *
 * ── The floor ───────────────────────────────────────────────────────────────
 * Two strokes labelled 0.1s apart (a volley exchange, or a vendor double
 * detection) would make a window the element cannot honour: `timeupdate`
 * arrives about four times a second and a seek "reaches" its target
 * `REACHED_EPSILON_SECONDS` early, so the playhead would be past the end the
 * moment it landed on the start and the film would seek without ever playing.
 * A window is therefore never shorter than {@link SHOT_LOOP_MIN_SECONDS},
 * even where that runs a little into the next stroke or past the point's end.
 *
 * ── Two clocks ──────────────────────────────────────────────────────────────
 * `videoTime` is on the ANALYSIS clock; the window is in FILE seconds, what
 * `<video>.currentTime` speaks. `offset` is `LabelVideo.startTimeSeconds`,
 * subtracted and clamped at zero exactly as `labelFilmStops` does it.
 */

/** Seconds the point's last stroke plays for before it repeats. */
export const SHOT_LOOP_TAIL_SECONDS = 1.5;

/** The shortest window a shot loops over — see "The floor". */
export const SHOT_LOOP_MIN_SECONDS = 0.5;

/** A loop window in FILE seconds. */
export interface ShotLoopWindow {
  start: number;
  end: number;
}

/**
 * @param stops The session's stops, already on the file clock, when the
 *   caller has them: the point's stop then closes at the next point's first
 *   stroke. Left out, the point is measured on its own.
 */
export function shotLoopWindow(
  point: LabelPoint,
  shotId: string,
  offset: number,
  stops: readonly LabelFilmStop[] = labelFilmStops([point], offset),
): ShotLoopWindow | null {
  const toFile = (time: number) => Math.max(0, time - offset);

  const strokes = point.shots
    .filter(
      (shot): shot is typeof shot & { videoTime: number } =>
        shot.status !== "deleted" &&
        shot.videoTime !== null &&
        Number.isFinite(shot.videoTime),
    )
    .map((shot) => ({ id: shot.id, time: shot.videoTime }))
    .sort((a, b) => a.time - b.time);

  const index = strokes.findIndex((stroke) => stroke.id === shotId);
  if (index === -1) return null;

  const start = toFile(strokes[index].time);
  const next = strokes[index + 1];
  let end: number;
  if (next) {
    end = toFile(next.time);
  } else {
    const pointEnd =
      stops.find((stop) => stop.point.id === point.id)?.end ?? Infinity;
    end = Math.min(
      toFile(strokes[index].time + SHOT_LOOP_TAIL_SECONDS),
      pointEnd,
    );
  }

  return { start, end: Math.max(end, start + SHOT_LOOP_MIN_SECONDS) };
}
