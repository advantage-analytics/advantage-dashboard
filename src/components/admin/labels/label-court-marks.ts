import {
  bounceEventTime,
  markOpacity,
  type TimedShot,
} from "@/components/dashboard/matches/match-detail/film/film-court";
import type { LabelShot } from "@/lib/services/labels/session";

/**
 * Which of the open point's marks the labelling court draws right now, and
 * how strongly — the Video tab's rule (`film-court.ts`), applied to label
 * strokes. Pure, no React.
 *
 * A mark's opacity is a function of FILM TIME alone: a contact reaches full
 * strength at its stroke's `videoTime`, the landing at the moment the ball is
 * estimated to come down (`bounceEventTime`: 0.6 of the way to the next
 * contact, 0.75 s after the last), each holds `MARK_HOLD_SECONDS`, fades over
 * `MARK_FADE_SECONDS` and is then omitted. So the court shows the rally one
 * stroke at a time as it happens, pausing freezes it, and seeking back
 * un-draws what has not happened yet.
 *
 * Both clocks are the ANALYSIS clock — `LabelShot.videoTime` and the
 * console's `VideoClock` (`video-clock.ts`) — so no offset is applied here.
 * Nothing about position: `LabelCourt` projects the coordinates itself with
 * its own metres → percent conversions (`court-geometry.ts`), never the Video
 * tab's `toCourtPercent`, whose frame and orientation are different.
 */

export interface CourtMarkOpacity {
  shotId: string;
  /** `markOpacity` of the film time against the stroke's own `videoTime`. */
  contactOpacity: number;
  /** The same against the estimated landing time. */
  landingOpacity: number;
}

/** `bounceEventTime` reads only the two times; a label stroke has no shot. */
const timedAt = (contactTime: number) => ({ contactTime }) as TimedShot;

/**
 * The marks on show at `filmTime`, one entry per live, timed stroke of the
 * open point in `videoTime` order — a stroke with both ends at 0 is left
 * out, as are tombstones and strokes without a time. `null` (the video has
 * not moved yet) draws nothing.
 */
export function courtMarksAt(
  shots: readonly LabelShot[],
  filmTime: number | null,
): CourtMarkOpacity[] {
  if (filmTime === null || !Number.isFinite(filmTime)) return [];
  const timed = shots
    .filter(
      (shot): shot is LabelShot & { videoTime: number } =>
        shot.status !== "deleted" && shot.videoTime !== null,
    )
    .sort((a, b) => a.videoTime - b.videoTime);

  const out: CourtMarkOpacity[] = [];
  timed.forEach((shot, i) => {
    const next = timed[i + 1]?.videoTime ?? null;
    const contactOpacity = markOpacity(filmTime, shot.videoTime);
    const landingOpacity = markOpacity(
      filmTime,
      bounceEventTime(timedAt(shot.videoTime), next),
    );
    if (contactOpacity === 0 && landingOpacity === 0) return;
    out.push({ shotId: shot.id, contactOpacity, landingOpacity });
  });
  return out;
}

/**
 * A string snapshot of the marks, for `useSyncExternalStore`: two renders of
 * the same marks compare equal with `===`, so the court card re-renders only
 * when an opacity steps (`MARK_OPACITY_STEP`), not on every clock tick.
 * {@link parseCourtMarksKey} is its inverse.
 */
export function courtMarksKey(marks: readonly CourtMarkOpacity[]): string {
  return marks
    .map((m) => `${m.shotId}\t${m.contactOpacity}\t${m.landingOpacity}`)
    .join("\n");
}

export function parseCourtMarksKey(key: string): CourtMarkOpacity[] {
  if (!key) return [];
  return key.split("\n").map((line) => {
    const [shotId, contact, landing] = line.split("\t");
    return {
      shotId,
      contactOpacity: Number(contact),
      landingOpacity: Number(landing),
    };
  });
}
