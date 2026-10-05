import { labelShotValues } from "@/lib/services/labels/edit";
import {
  isGhostShot,
  type LabelPoint,
  type LabelShot,
  type LabelSide,
} from "@/lib/services/labels/session";
import { shotPlacement } from "@/lib/services/labels/shot-derived";
import { formatClock } from "@/components/dashboard/matches/match-detail/format-clock";
import {
  ENDING_LABEL,
  STROKE_LABEL,
  spinLabel,
  type SideNames,
} from "./label-format";
import { pointSummary } from "./label-point-row";

/**
 * The black full-screen view's two lines for a point (board 08l's `.bk-t` and
 * `.bk-d`) — the points rail's sentence and detail, read off the LABELS rather
 * than the derived match: "Forehand error by Goodman" over
 * "Flat Down the Line · 12:45 · 7 shot rally".
 *
 * Pure: the row (`label-black-point-row.tsx`) prints these, and a spec reads
 * them without rendering.
 */

type SentencePoint = Pick<
  LabelPoint,
  "pointIndex" | "ending" | "endedBy" | "server" | "shots"
>;

/** The strokes the rally is made of now: no tombstones. */
function liveShots(point: Pick<LabelPoint, "shots">): LabelShot[] {
  return point.shots.filter((shot) => shot.status !== "deleted");
}

/**
 * The point without its ghosts — the strokes the site removed that the
 * labeller has neither restored nor deleted (`isGhostShot`) — for every
 * reading the black view makes while it DRAWS them as ghosts: the sentence,
 * the detail line's deciding stroke and rally count, the marks' hover
 * sentence and the shot numbering all skip a ghost then, and only then. With
 * the session's marks off, or none built, a ghost is an ordinary stroke and
 * the point is handed over as it is — the same object, so nothing downstream
 * re-computes for a point that has no ghost either.
 */
export function withoutGhosts<T extends Pick<LabelPoint, "shots">>(
  point: T,
): T {
  if (!point.shots.some(isGhostShot)) return point;
  return { ...point, shots: point.shots.filter((shot) => !isGhostShot(shot)) };
}

function isServe(shot: Pick<LabelShot, "stroke">): boolean {
  return shot.stroke === "first_serve" || shot.stroke === "second_serve";
}

/** " by Goodman", or nothing when nobody is named. */
function by(side: LabelSide | null, names: SideNames): string {
  return side ? ` by ${names[side]}` : "";
}

/**
 * How the point ended, as a sentence:
 *   · "{Stroke} winner by {name}" / "{Stroke} error by {name}" — the last live
 *     stroke's name and who `endedBy` says ended it ("Winner by …" when the
 *     point has no stroke named);
 *   · "Ace by {name}", "Service winner by {name}", "Double fault by {name}" —
 *     `endedBy`, or the server when it is not set, since only the server can;
 *   · "Let, replayed", "Not a point";
 *   · "Point N" when the ending is not labelled yet.
 */
export function pointSentence(point: SentencePoint, names: SideNames): string {
  const { ending } = point;
  switch (ending) {
    case null:
      return `Point ${point.pointIndex + 1}`;
    case "ace":
    case "service_winner":
    case "double_fault":
      return `${ENDING_LABEL[ending]}${by(point.endedBy ?? point.server, names)}`;
    case "let_replayed":
    case "not_a_point":
      return ENDING_LABEL[ending];
    case "winner":
    case "error": {
      const last = liveShots(point).at(-1);
      const stroke = last?.stroke ? STROKE_LABEL[last.stroke] : null;
      const how = stroke ? `${stroke} ${ending}` : ENDING_LABEL[ending];
      return `${how}${by(point.endedBy, names)}`;
    }
  }
}

/**
 * Seconds → the rail's clock: "12:45", or "1:02:03" past the hour. Whole
 * seconds, no tenths — the second the stroke falls in, as a player's clock
 * shows it. (`formatVideoTime` keeps the tenths, for the strokes' own cells.)
 * The match page's `formatClock`, under the name the rail knows it by.
 */
export const formatClockTime = (seconds: number): string =>
  formatClock(seconds);

/** "Second serve" → "Second Serve", as the rail's detail line spells a serve. */
function titleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * The second line: "{spin} {placement} · {m:ss} · {n} shot rally".
 *   · spin and placement are the LAST live stroke's — the shot that decided
 *     the point — in the shot row's own words (`spinLabel`, `shotPlacement`);
 *     a serve is named before its placement ("Kick Second Serve T");
 *   · the time is the first live stroke's that has one, where the point
 *     starts on the film;
 *   · the rally is `pointSummary`'s count, which includes the serve — so a
 *     point of the serve alone (an ace, a double fault) says "serve only", as
 *     does one with no stroke in its rally at all.
 * A part with nothing to say is left out, with its middot.
 */
export function pointDetail(point: Pick<LabelPoint, "shots">): string {
  const live = liveShots(point);
  const last = live.at(-1);
  const parts: string[] = [];

  if (last) {
    const shot = [
      spinLabel(last.stroke, last.spin),
      isServe(last) && last.stroke
        ? titleCase(STROKE_LABEL[last.stroke])
        : null,
      shotPlacement(labelShotValues(last)),
    ].filter(Boolean);
    if (shot.length > 0) parts.push(shot.join(" "));
  }

  const timed = live.find((shot) => shot.videoTime !== null);
  if (timed && timed.videoTime !== null) {
    parts.push(formatClockTime(timed.videoTime));
  }

  const { rally } = pointSummary(point);
  const serveOnly = rally === 0 || (rally === 1 && !!last && isServe(last));
  parts.push(serveOnly ? "serve only" : `${rally} shot rally`);

  return parts.join(" · ");
}

/**
 * A stored position as the well's two numbers — ["-0.31", "-1.82"], metres to
 * two places — or null when either half is missing. Two strings, not
 * `formatCourtPoint`'s one, because the well right-aligns each in its own
 * slot so the decimal points of every row sit in one line.
 */
export function courtPair(
  x: number | null,
  y: number | null,
): readonly [string, string] | null {
  if (x === null || y === null) return null;
  return [x.toFixed(2), y.toFixed(2)];
}
