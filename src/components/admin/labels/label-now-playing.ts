import type { LabelScores } from "@/lib/services/labels/score";
import type { LabelPoint } from "@/lib/services/labels/session";
import { ENDING_LABEL, STROKE_LABEL, type SideNames } from "./label-format";
import type { LabelVideoReadout } from "./label-video";

/**
 * What is playing, in the list's own numbers, and the words the player's
 * transport shows for it. Pure.
 */

export interface NowPlaying {
  /** The playing point's id. */
  id: string;
  /** The list's point number, 1-based. */
  point: number;
  /** The stroke's number among the point's live strokes, 1-based. */
  shot: number | null;
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

/** The playing row as the list numbers it: point N, and its stroke M. */
export function nowPlayingOf(
  points: readonly LabelPoint[],
  playing: { pointId: string; shotId: string } | null,
): NowPlaying | null {
  if (!playing) return null;
  const point = points.find((p) => p.id === playing.pointId);
  if (!point) return null;
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  const index = live.findIndex((shot) => shot.id === playing.shotId);
  return {
    id: point.id,
    point: point.pointIndex + 1,
    shot: index === -1 ? null : index + 1,
  };
}
