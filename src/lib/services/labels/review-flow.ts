/**
 * The flag flow's pure parts: where a step's end-of-point replay starts and
 * stops on the film, what identifies a step so the console can tell it has
 * been resolved, and whether an answer moves the court panel on to the
 * point's next open item.
 *
 * The console does the moving (label-console.tsx `landOnStep`); nothing here
 * touches the player or the rows. Times are on the analysis clock, as a
 * stroke's `videoTime` is.
 */

import type { ReviewItem } from "./marks-state";
import type { ReviewReplay, ReviewStep } from "./review-step";
import { liveShotsInOrder, type LabelPoint } from "./session";

// ── Replay ──────────────────────────────────────────────────────────────────

/** How far before the replay's first stroke the film starts. */
export const REPLAY_LEAD_SECONDS = 0.5;
/** How long after the last stroke the film runs before it pauses. */
export const REPLAY_TAIL_SECONDS = 1;

export interface ReplayWindow {
  /** Where the film starts, never before zero. */
  start: number;
  /** Where it pauses. */
  stop: number;
}

/**
 * The first timed live stroke after `time` in any live point, or null: a
 * replay never runs into the next ball.
 */
export function nextStrokeTimeAfter(
  points: readonly LabelPoint[],
  time: number,
  ghosts: boolean,
): number | null {
  let next: number | null = null;
  for (const point of points) {
    if (point.status === "deleted") continue;
    for (const shot of liveShotsInOrder(point, ghosts)) {
      const at = shot.videoTime;
      if (at === null || at <= time) continue;
      if (next === null || at < next) next = at;
    }
  }
  return next;
}

/**
 * The stretch of film a step's replay plays: `REPLAY_LEAD_SECONDS` before
 * the `fromShotId` stroke, through the `toShotId` stroke, pausing
 * `REPLAY_TAIL_SECONDS` after it — or at the next timed stroke anywhere in
 * the match when that comes sooner, so the next point's serve is never
 * shown as this point's. Null when either stroke has no time.
 */
export function replayWindow(
  point: LabelPoint,
  replay: ReviewReplay,
  points: readonly LabelPoint[],
  ghosts: boolean,
): ReplayWindow | null {
  const from = point.shots.find((shot) => shot.id === replay.fromShotId);
  const to = point.shots.find((shot) => shot.id === replay.toShotId);
  if (from?.videoTime == null || to?.videoTime == null) return null;
  const start = Math.max(0, from.videoTime - REPLAY_LEAD_SECONDS);
  const next = nextStrokeTimeAfter(points, to.videoTime, ghosts);
  const tail = to.videoTime + REPLAY_TAIL_SECONDS;
  const stop = next === null ? tail : Math.min(tail, next);
  return { start, stop: Math.max(stop, start) };
}

/** A tick that moved by more than this is a seek, not playback. */
export const REPLAY_SEEK_JUMP_SECONDS = 2;
/** A tick that went back by more than this is a seek too. */
export const REPLAY_SEEK_BACK_SECONDS = 0.25;

/**
 * What a replay does with a tick of the clock: carry on, pause (the stop
 * reached), or let go (the labeller moved the film themselves — a scrub, a
 * step, a jump back). `last` is the previous tick, null before the first.
 */
export function replayTick(
  window: ReplayWindow,
  last: number | null,
  now: number,
): "run" | "stop" | "cancel" {
  if (
    last !== null &&
    (now < last - REPLAY_SEEK_BACK_SECONDS ||
      now > last + REPLAY_SEEK_JUMP_SECONDS)
  ) {
    return "cancel";
  }
  // A tick before the window (the seek has not landed yet) is still a run.
  return now >= window.stop ? "stop" : "run";
}

// ── Auto-advance ────────────────────────────────────────────────────────────

/**
 * What identifies a step: its point, its item and the item's open members
 * (their code and the stroke each is about). Two steps with one key ask the
 * same thing; a different key is another question, so the console lands on
 * it.
 */
export function stepKey(pointId: string, item: ReviewItem): string {
  const open = item.members
    .filter((member) => member.state === "open")
    .map((member) => {
      const params = member.mark.params as { shotId?: string };
      return `${member.mark.code}@${params.shotId ?? ""}`;
    })
    .sort();
  return `${pointId}/${item.id}:${open.join(",")}`;
}

/** The step's key, or "" with no step. */
export function stepKeyOf(
  pointId: string,
  step: Pick<ReviewStep, "item"> | null,
): string {
  return step ? stepKey(pointId, step.item) : "";
}

/**
 * Where the console goes once an answer, a placement, an added stroke or a
 * dismiss made here has changed the rows: `"advance"` when the point's step
 * is another one — the item answered is closed (or asks something else)
 * and the point still has one open — `"done"` when the point has nothing
 * open any more (the next flagged point is `]`'s to reach, never the
 * console's own), `"stay"` while the step is the same one. `before` and
 * `after` are `stepKeyOf` on the same point. A refresh the labeller did not
 * cause never gets here: the console asks only after its own write.
 */
export function advanceAfterAnswer(
  before: string,
  after: string,
): "advance" | "done" | "stay" {
  if (after === before) return "stay";
  return after === "" ? "done" : "advance";
}
