import { sameShotValue, type LabelShotPatch } from "@/lib/services/labels/edit";
import { spinRows } from "./label-format";
import {
  LABEL_SPINS,
  isLetServe,
  isServeStroke,
  liveShotsInOrder,
  type LabelShot,
  type LabelStroke,
} from "@/lib/services/labels/session";

/**
 * One key sets the selected stroke's Stroke or Spin, so a rally is labelled
 * without opening a menu per cell. Pure: the console reads the key and writes
 * the patch through its usual shot edit.
 *
 * - F forehand · B backhand · O overhead.
 * - V makes the stroke a volley on its side (a forehand volley from a
 *   forehand), or a groundstroke again from a volley. With no side yet it is
 *   a forehand volley.
 * - S is a serve: a second serve when the point already has a serve before
 *   this stroke (`hasEarlierServe`; a let does not count, it is replayed),
 *   else a first serve. Pressed on the serve it would make, it switches
 *   first ↔ second.
 * - 1–4 are the Spin menu's rows in order (`spinRows`): topspin, flat,
 *   backspin, sidespin; on a serve 1–3, Flat, Slice, Kick (`SERVE_SPINS`).
 *
 * The answer is the change asked for; the console writes a stroke through
 * `strokeChangePatch`, as the Stroke menu does, so a let keeps its rule. A key
 * that would write what the stroke already holds answers null.
 */
export const STROKE_KEY_HINTS: readonly { key: string; label: string }[] = [
  { key: "F", label: "forehand" },
  { key: "B", label: "backhand" },
  { key: "V", label: "volley" },
  { key: "O", label: "overhead" },
  { key: "S", label: "serve" },
  { key: "1–4", label: "spin" },
  // The console's own keys, not the stroke's (label-console.tsx).
  { key: "C", label: "contact / landing" },
  { key: "X", label: "flip side" },
  { key: "T", label: "time = frame" },
  { key: "A", label: "add shot" },
  { key: "⇧A", label: "add before" },
  { key: "R", label: "reset shot" },
  { key: "⇧R", label: "reset point" },
  { key: "⌫", label: "delete shot" },
];

const VOLLEY_OF: Partial<Record<LabelStroke, LabelStroke>> = {
  forehand: "forehand_volley",
  backhand: "backhand_volley",
  forehand_volley: "forehand",
  backhand_volley: "backhand",
};

function strokeFor(
  key: string,
  current: LabelStroke | null,
  earlierServe: boolean,
) {
  switch (key) {
    case "f":
      return "forehand";
    case "b":
      return "backhand";
    case "o":
      return "overhead";
    case "v":
      return (current && VOLLEY_OF[current]) ?? "forehand_volley";
    case "s": {
      const serve = earlierServe ? "second_serve" : "first_serve";
      if (current !== serve) return serve;
      return serve === "first_serve" ? "second_serve" : "first_serve";
    }
    default:
      return null;
  }
}

export type StrokeKeyChange =
  { stroke: LabelStroke } | { spin: (typeof LABEL_SPINS)[number] };

/** The change a key asks for on `shot`, or null when it asks for nothing new. */
export function strokeKeyChange(
  key: string,
  shot: Pick<LabelShot, "stroke" | "spin">,
  earlierServe = false,
): StrokeKeyChange | null {
  const lower = key.toLowerCase();
  const spinIndex = "1234".indexOf(lower);
  if (spinIndex !== -1) {
    const spin = spinRows(shot.stroke)[spinIndex];
    return spin === undefined || shot.spin === spin ? null : { spin };
  }
  const stroke = strokeFor(lower, shot.stroke, earlierServe);
  if (stroke === null || stroke === shot.stroke) return null;
  return { stroke };
}

/** Whether a key is one of the stroke keys at all. */
export function isStrokeKey(key: string): boolean {
  return /^[fbvos1-4]$/i.test(key);
}

/**
 * Whether a live serve comes before `shotId` in its point, a let aside: the
 * serve S makes there is the second. `ghosts` is the console's own flag.
 */
export function hasEarlierServe(
  point: { shots: readonly LabelShot[] },
  shotId: string,
  ghosts: boolean,
): boolean {
  return earlierServe(point, shotId, ghosts) !== null;
}

/** The first live serve before `shotId` in its point, a let aside. */
function earlierServe(
  point: { shots: readonly LabelShot[] },
  shotId: string,
  ghosts: boolean,
): LabelShot | null {
  for (const shot of liveShotsInOrder(point, ghosts)) {
    if (shot.id === shotId) return null;
    if (isServeStroke(shot.stroke) && !isLetServe(shot)) return shot;
  }
  return null;
}

/**
 * A stroke made a serve after an earlier serve in its point (a second serve
 * after a fault) is hit by the same player: the patch takes that serve's
 * hitter along, when the stroke's own differs. One server per point, so an
 * added stroke — seeded as the opponent of the one before it — never needs
 * a second edit. A patch that names its own hitter keeps it.
 */
export function withServeHitter(
  point: { shots: readonly LabelShot[] },
  shotId: string,
  patch: LabelShotPatch,
  ghosts: boolean,
): LabelShotPatch {
  if (!("stroke" in patch) || "hitter" in patch) return patch;
  if (!isServeStroke(patch.stroke ?? null)) return patch;
  const shot = point.shots.find((s) => s.id === shotId);
  const hitter = earlierServe(point, shotId, ghosts)?.hitter ?? null;
  if (!shot || hitter === null || shot.hitter === hitter) return patch;
  return { ...patch, hitter };
}

/**
 * T: the selected stroke's time set to the frame the film stands on.
 * `fileTime` is the player's position on the FILE's clock; `label_shots.
 * video_time` is on the analysis clock, so the offset is added back — the
 * inverse of `fileSeconds`, as `parseFileTime` does for typed text — and the
 * result is rounded to milliseconds the same way. Null when there is no frame
 * to read, or the stroke already holds that time (within
 * `VIDEO_TIME_TOLERANCE_S`): a key that changes nothing writes nothing.
 */
export function frameTimePatch(
  shot: Pick<LabelShot, "videoTime">,
  fileTime: number | null,
  offset = 0,
): LabelShotPatch | null {
  if (fileTime === null || !Number.isFinite(fileTime)) return null;
  const videoTime = Math.round((fileTime + offset) * 1000) / 1000;
  if (sameShotValue("video_time", shot.videoTime, videoTime)) return null;
  return { video_time: videoTime };
}
