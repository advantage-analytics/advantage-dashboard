import type { LabelScores } from "@/lib/services/labels/score";
import type { LabelPoint } from "@/lib/services/labels/session";
import { ENDING_LABEL, STROKE_LABEL, type SideNames } from "./label-format";
import type { LabelVideoReadout } from "./label-video";
import { NO_PLACEMENT, type PlacementState } from "./court-placement";

/** What is playing, in the list's numbers, and the transport's words. */

export interface NowPlaying {
  id: string;
  /** The list's point number, 1-based. */
  point: number;
}

/**
 * The transport's title row for the playing point: "Winner · Forehand" (how
 * it ended · its last live stroke), "Set 1 · Game 3 · Lee serves" (the game
 * numbered within its set, as the list's bands number it), and the list's
 * point number over its last. Whatever a point lacks is left out
 * rather than dashed; in dead time there is no point to describe.
 */
export function nowPlayingReadout(
  points: readonly LabelPoint[],
  nowPlaying: NowPlaying | null,
  names: SideNames,
  scores: LabelScores,
): LabelVideoReadout {
  const point = nowPlaying
    ? points.find((p) => p.id === nowPlaying.id)
    : undefined;
  if (!nowPlaying || !point) {
    return { title: "Between points", subtitle: null, position: null };
  }
  const lastStroke = point.shots.findLast(
    (shot) => shot.status !== "deleted" && shot.stroke !== null,
  )?.stroke;
  const title = [
    point.ending ? ENDING_LABEL[point.ending] : null,
    lastStroke ? STROKE_LABEL[lastStroke] : null,
  ].filter((part) => part !== null);
  const game = scores.points.get(point.id)?.gameInSet ?? null;
  const subtitle = [
    point.setNumber !== null ? `Set ${point.setNumber}` : null,
    game !== null ? `Game ${game}` : null,
    point.server ? `${names[point.server]} serves` : null,
  ].filter((part) => part !== null);
  return {
    title: title.length ? title.join(" · ") : `Point ${nowPlaying.point}`,
    subtitle: subtitle.length ? subtitle.join(" · ") : null,
    position: {
      index: nowPlaying.point,
      total: points.reduce((max, p) => Math.max(max, p.pointIndex + 1), 0),
    },
  };
}

/** The playing row as the list numbers it: point N. */
export function nowPlayingOf(
  points: readonly LabelPoint[],
  playing: { pointId: string; shotId: string } | null,
): NowPlaying | null {
  if (!playing) return null;
  const point = points.find((p) => p.id === playing.pointId);
  if (!point) return null;
  return { id: point.id, point: point.pointIndex + 1 };
}

/**
 * Whether a pin still names a point the console can open: one in the rows
 * and not deleted. A point deleted or combined away lets its pin go; nothing
 * the film does ever does.
 */
export function pinLive(
  pinned: string | null,
  points: readonly LabelPoint[],
): boolean {
  return (
    pinned !== null &&
    points.some((p) => p.id === pinned && p.status !== "deleted")
  );
}

/**
 * The console's current point — the one unfolded, on the court and under the
 * stroke keys: the pinned point while its pin holds, else the playing one,
 * else where the film last rested (`rest`). The pin is the held point
 * (`PointFocus`): it holds while the film plays on into other points, and is
 * let go only by the labeller (the follow pill, ← / →, re-clicking the
 * playing row) or by its point going away.
 */
export function currentPointOf({
  pinned,
  playing,
  rest,
  points,
}: {
  pinned: string | null;
  playing: string | null;
  rest: string | null;
  points: readonly LabelPoint[];
}): string | null {
  return pinLive(pinned, points) ? pinned : (playing ?? rest);
}

/**
 * The selection as the current point allows it: a stroke selected in any
 * other point (or with no current point) is let go, so the stroke keys, the
 * court and ↑ / ↓ only ever act on the open point's own strokes.
 */
export function selectionFor(
  placement: PlacementState,
  currentPoint: Pick<LabelPoint, "shots"> | null,
): PlacementState {
  if (placement.shotId === null) return placement;
  const inPoint = currentPoint?.shots.some(
    (shot) => shot.id === placement.shotId,
  );
  return inPoint ? placement : NO_PLACEMENT;
}
