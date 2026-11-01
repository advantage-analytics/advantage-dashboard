/**
 * A mark's life-cycle and what the point row shows of its marks. Derived, never
 * stored; the one stored piece is `label_points.dismissed`.
 *
 * Only a `count` mark (marks.ts `LabelMarkTier`) has a life: `open` until the
 * labeller changes the point (`settled`), confirms it unchanged
 * (`checked-as-is`), does both (`checked`) or dismisses the suggestion it
 * opened (`dismissed`). Unchecking a point reopens every mark the labeller did
 * not settle. A `hint` has no state; a `hidden` mark is dropped.
 *
 * The live marks (score-marks.ts) are read off the labelled rows on every
 * render, so one that no longer holds is simply not there — as are the hints
 * read off the rows (`pointEndedEarly`, `endingStale`, `secondServeAsFirst`,
 * `lastLandingMissing`, `serveAfterServeIn`).
 */

import { landingTakesContact } from "./volley-link";
import { deriveEnding, winnerContradicted } from "./ending-derived";
import {
  isDataMark,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarks,
  type LabelSuggestion,
} from "./marks";
import {
  lastCallQuestion,
  MARK_LABEL,
  markHover,
  REVIEW_ITEM_QUESTION,
  type MarkNames,
} from "./marks-copy";
import {
  endsPointWhenMissed,
  isLiveShot,
  isMissedResult,
  isNonPointEnding,
  isLetServe,
  isServeStroke,
  isWithdrawnAdd,
  liveShotsInOrder,
  orderLabelShots,
  type LabelPoint,
  type LabelShot,
} from "./session";
import {
  effectiveShotResult,
  inServeLandingMiss,
  type ResultReadableShot,
} from "./shot-derived";
import {
  addedPointBetween,
  hintDismissKey,
  placementKey,
  pointEndedKey,
  suggestionState,
  type SuggestionNeighbour,
} from "./suggestions";

export type MarkState =
  "open" | "settled" | "checked" | "checked-as-is" | "dismissed";

/**
 * `afterEventId` is read for "Missing shot?" alone — the added stroke that
 * answers its slot — and may be left out where the mark is not in question.
 */
export type MarkStateShot = Pick<
  LabelShot,
  "status" | "siteRemovalRestoredAt"
> &
  Partial<
    Pick<
      LabelShot,
      | "id"
      | "afterEventId"
      | "eventId"
      | "videoTime"
      | "siteRemoval"
      | "statusBeforeDelete"
    >
  > &
  ResultReadableShot;

export type MarkStatePoint = Pick<
  LabelPoint,
  "id" | "status" | "checkedAt" | "dismissed"
> & {
  shots: readonly MarkStateShot[];
  /** A stored double fault ends the point for its slots (`doubleFaultAt`). */
  ending?: LabelPoint["ending"];
};

/**
 * Whether the labeller changed the point or any of its shots — a shot they
 * edited, added or removed, or a ghost they put back. What settles a mark,
 * and what draws the row's pencil.
 */
export function pointChanged(point: MarkStatePoint): boolean {
  if (point.status === "edited" || point.status === "added") return true;
  return point.shots.some(
    (shot) =>
      !isWithdrawnAdd(shot) &&
      (shot.siteRemovalRestoredAt !== null ||
        shot.status === "edited" ||
        shot.status === "deleted" ||
        shot.status === "added"),
  );
}

/**
 * Whether the `missing_point` suggestion on `point` was answered with "Add
 * point": a live added point now sits between the two served from one side
 * (`addedPointBetween`). Needs the session's `suggestions` and `points`; false
 * without either. The one change that settles a mark from outside the point.
 */
export function missingPointAdded(
  point: Pick<MarkStatePoint, "id">,
  suggestions?: readonly LabelSuggestion[],
  points?: readonly SuggestionNeighbour[],
): boolean {
  if (!suggestions || !points) return false;
  return suggestions.some(
    (s) =>
      s.kind === "missing_point" &&
      s.pointId === point.id &&
      addedPointBetween(points, s.beforePointId, s.pointId),
  );
}

/**
 * The states of the `missing_shot` slots a "Missing shot?" mark opened on
 * `point` (`suggestionState`); empty without the session's `suggestions`.
 */
function missingShotStates(
  point: MarkStatePoint,
  suggestions?: readonly LabelSuggestion[],
): ReturnType<typeof suggestionState>[] {
  const mine = suggestions?.filter(
    (s) => s.kind === "missing_shot" && s.pointId === point.id,
  );
  if (!mine?.length) return [];
  // The rows a rule may have been handed without them read as a stroke with
  // no id, time or site removal: live, in row order.
  const shots = point.shots.map((shot) => ({
    ...shot,
    id: shot.id ?? "",
    afterEventId: shot.afterEventId ?? null,
    eventId: shot.eventId ?? null,
    videoTime: shot.videoTime ?? null,
    siteRemoval: shot.siteRemoval ?? null,
  }));
  return mine.map((s) =>
    suggestionState(s, {
      dismissed: point.dismissed,
      ending: point.ending,
      shots,
    }),
  );
}

/**
 * Where a `count` mark is in its life. `points` — the session's rows in rail
 * order — lets a "Same side twice" question read settled once a point was
 * added between the two (`missingPointAdded`); without them that answer is
 * not seen. "Missing shot?" reads its slots the same way: open while any slot
 * is open, settled once none is and one was answered with "Add shot" (or the
 * point ended on the pair's first stroke), dismissed once every one is
 * dismissed.
 */
export function markState(
  mark: LabelMark,
  point: MarkStatePoint,
  suggestions?: readonly LabelSuggestion[],
  points?: readonly SuggestionNeighbour[],
): MarkState {
  const checked = point.checkedAt !== null;

  // Answered outranks dismissed, as it does for the suggestion itself: the
  // point is there either way.
  if (
    mark.code === "service_court_repeat" &&
    missingPointAdded(point, suggestions, points)
  ) {
    return checked ? "checked" : "settled";
  }

  // "Same side twice" opens the missing-point slot; "Dismiss" on it stores
  // `missing_point`.
  if (
    mark.code === "service_court_repeat" &&
    point.dismissed.includes("missing_point")
  ) {
    return "dismissed";
  }

  // "Missing shot?" is as open as its slots. A point with several gaps (one
  // player hitting three or four strokes in a row) opens a slot per gap, and
  // answering one of them answers nothing about the others — so the mark
  // settles only once no slot is open: settled when one was answered with
  // "Add shot" or the point ended on the pair's first stroke, dismissed when
  // every one was waved away. While a slot is still open an unchecked point
  // keeps the mark open even if the labeller edited it elsewhere: an edit
  // that leaves the gap in place has not answered the gap. Once the point is
  // checked the general reading below applies (`checked` for an edited point,
  // `checked-as-is` otherwise), as it does for every other count mark.
  if (mark.code === "same_player_consecutive") {
    const slots = missingShotStates(point, suggestions);
    if (slots.length > 0 && !slots.includes("open")) {
      if (slots.includes("done")) return checked ? "checked" : "settled";
      return "dismissed";
    }
    if (slots.includes("open") && !checked) return "open";
  }

  // A counted mark whose question the well asks ("Was the last ball in?")
  // and the labeller waved away there.
  if (point.dismissed.includes(hintDismissKey(mark.code))) return "dismissed";

  // Read off the rows as they stand, so while it is there it is still true:
  // an edit that leaves the point stopping on a missed first serve has not
  // settled it.
  if (mark.code === "first_serve_fault_alone") {
    return checked ? "checked-as-is" : "open";
  }

  if (pointChanged(point)) return checked ? "checked" : "settled";
  return checked ? "checked-as-is" : "open";
}

/** A hover in the dark tooltip's two lines: the name, then what it means. */
export interface MarkHoverParts {
  /** The mark's short name, with its state once it is no longer open. */
  name: string;
  /** The sentence under it; null when the name says everything. */
  detail: string | null;
}

/**
 * A mark's hover in a state, in two parts. `sentence` is the point as the rail
 * reads it now, passed as a string so `lib/` never imports from `components/`.
 *
 * An open mark is named by its label over its own line. Every other state is
 * "{label} · {state}" over what the labeller did; nothing under a dismissal. A
 * "Same side twice" settled by "Add point" (`pointAdded`) says that instead:
 * the marked point's ending never changed.
 */
export function stateHoverParts(
  mark: LabelMark,
  state: MarkState,
  names: MarkNames,
  sentence: string,
  pointAdded = false,
): MarkHoverParts {
  const label = MARK_LABEL[mark.code];
  switch (state) {
    case "open":
      return { name: label, detail: markHover(mark, names) };
    case "settled":
    case "checked":
      return {
        name: `${label} · settled`,
        detail:
          pointAdded && mark.code === "service_court_repeat"
            ? "You added the missing point."
            : `You changed the ending to ${sentence}.`,
      };
    case "checked-as-is":
      return {
        name: `${label} · checked as is`,
        detail: "You confirmed the point without changing it.",
      };
    case "dismissed":
      return { name: `${label} · dismissed`, detail: null };
  }
}

/** A hover's two parts as one line: the chip's accessible name. */
export function hoverLine({ name, detail }: MarkHoverParts): string {
  const stop = /[.?!]$/.test(name) ? "" : ".";
  return detail ? `${name}${stop} ${detail}` : `${name}${stop}`;
}

/** What the roll-up reads off a label point. A `LabelPoint` satisfies it. */
export type MarkListPoint = Pick<LabelPoint, "id"> & {
  shots: readonly Pick<
    LabelShot,
    "id" | "status" | "siteRemoval" | "siteRemovalRestoredAt"
  >[];
};

/** What a point shows of the session's marks, by tier. */
export interface PointRowMarkList {
  /** The amber chip's marks, which the header counts. */
  count: LabelMark[];
  /** The open point's quiet line. Never on a closed row, never counted. */
  hints: LabelMark[];
}

/**
 * The marks a point stands for, by tier: the one roll-up the row, the well and
 * the header all read.
 *
 * `count` is the point's own count marks and those of its live strokes. `hints`
 * is the point's own hints, then those of its last live stroke only
 * (`isLiveShot`): a hint on a stroke is about how the point ended. Each hint
 * code is listed once. A `hidden` mark is in neither list.
 */
export function pointRowMarkList(
  point: MarkListPoint,
  marks: LabelMarks,
): PointRowMarkList {
  const own = marks.points[point.id] ?? [];
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  const last = point.shots.findLast((shot) => isLiveShot(shot));
  const hints: LabelMark[] = [];
  for (const mark of [...own, ...(last ? (marks.shots[last.id] ?? []) : [])]) {
    if (mark.tier !== "hint") continue;
    if (hints.some((seen) => seen.code === mark.code)) continue;
    hints.push(mark);
  }
  return {
    count: [
      ...own,
      ...live.flatMap((shot) => marks.shots[shot.id] ?? []),
    ].filter((mark) => mark.tier === "count"),
    hints,
  };
}

/**
 * Whether the session draws the site's removed strokes as ghosts — the
 * `ghosts` every reading of a point's rows takes (`isLiveShot`). The marks
 * are built for a session labelled with marks on and not otherwise, so the
 * marks' presence is the answer.
 */
export function drawsGhosts(marks: LabelMarks | null | undefined): boolean {
  return !!marks;
}

/**
 * "Point ended here": the point's second-to-last live stroke, when it is not a
 * first serve and its ball reads out — a rally ball, or a second serve's
 * double fault (`endsPointWhenMissed`). The one stroke after it was hit after
 * the point ended, so the hint offers to remove it or to split there. Live
 * means not deleted and, with `ghosts` on, not a ghost. Not once the labeller
 * has settled it or anything after it.
 *
 * Only at the end, and never a net call. Measured 2026-10-10 over every
 * checked label point: a stroke read missed from the vendor's bounce with a
 * whole rally after it was a ball in play on 247 of 251 strokes in Andy
 * Nguyen v Shaurya Bharadwaj alone. That bounce is often the wrong bounce,
 * the incoming one on the hitter's own side, which reads as a net ball. Held to
 * the second-to-last stroke, an out read ended the point 25 times in 47, and
 * a net read 6 times in 40.
 */
export function pointEndedEarly(
  point: Pick<LabelPoint, "shots"> & Partial<Pick<LabelPoint, "dismissed">>,
  ghosts: boolean,
): Extract<LabelMark, { code: "shot_after_point_end" }> | null {
  const live = liveShotsInOrder(point, ghosts);
  if (live.length < 2) return null;
  const i = live.length - 2;
  const shot = live[i];
  if (!endsPointWhenMissed(shot.stroke)) return null;
  if (effectiveShotResult(shot) !== "out") return null;
  // Met in the air where it reads out: played on, not a point over.
  if (landingTakesContact(shot, live[i + 1], false)) return null;
  // Settled once the labeller has looked at this stroke or one after it:
  // dismissed the question there, or edited, added or deleted a stroke
  // after it.
  const ordered = orderLabelShots(point.shots);
  const dismissed = new Set(point.dismissed ?? []);
  const at = ordered.findIndex((s) => s.id === shot.id);
  const settled =
    dismissed.has(pointEndedKey(shot.id)) ||
    ordered.slice(at + 1).some(
      (s) =>
        dismissed.has(pointEndedKey(s.id)) ||
        s.status === "edited" ||
        s.status === "added" ||
        // A stroke added and deleted by mistake was never looked at.
        (s.status === "deleted" && !isWithdrawnAdd(s)),
    );
  if (settled) return null;
  return {
    code: "shot_after_point_end",
    tier: "hint",
    scope: "point",
    params: {
      shotId: shot.id,
      after: live.slice(i + 1).map((s) => s.id),
    },
  };
}

/** A stroke with no landing placed, the labeller not having called it unclear. */
function landingMissingOn(shot: LabelShot): boolean {
  if (shot.landingX !== null && shot.landingY !== null) return false;
  return !shot.unclear.some((f) => f === "landing_x" || f === "landing_y");
}

/** A contact the labeller has neither placed nor called unclear. */
export function contactMissingOn(shot: LabelShot): boolean {
  if (shot.contactX !== null && shot.contactY !== null) return false;
  return !shot.unclear.some((f) => f === "contact_x" || f === "contact_y");
}

/**
 * "No landing on the last shot": the point's last live stroke has no landing
 * placed and the labeller has not marked it unclear. The result is derived
 * from the coordinates, so until the bounce is placed the ending stays
 * whatever was stored.
 */
export function lastLandingMissing(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "last_landing_missing" }> | null {
  const last = liveShotsInOrder(point, ghosts).at(-1);
  if (!last || !landingMissingOn(last)) return null;
  return {
    code: "last_landing_missing",
    tier: "hint",
    scope: "point",
    params: {},
  };
}

/**
 * "Ending can't be read": the last live stroke is missing its landing
 * (`lastLandingMissing`) and has no stored result either, so nothing says how
 * the point ended. A `count` mark, raised live by score-marks.ts; gone once a
 * landing or a result is set.
 */
export function lastShotUnresolved(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "last_shot_unresolved" }> | null {
  // Cheap exit before the sort: some stroke must have neither.
  if (
    !point.shots.some(
      (shot) =>
        shot.result === null &&
        (shot.landingX === null || shot.landingY === null),
    )
  ) {
    return null;
  }
  const last = liveShotsInOrder(point, ghosts).at(-1);
  if (!last || last.result !== null || !landingMissingOn(last)) return null;
  return {
    code: "last_shot_unresolved",
    tier: "count",
    scope: "point",
    params: {},
  };
}

/**
 * "Fault, no second serve": the point's last live stroke is a first serve
 * stored out or in the net (by its landing, with nothing stored), so the rows stop
 * where a point cannot — a second serve followed, or the serve was in and a
 * rally did. A `count` mark, raised live by score-marks.ts; gone once a
 * stroke follows it or its call changes. Never on a replayed let or a
 * non-point, whose ending says the rows do not decide it, nor on the serve
 * "Second serve?" already asks about.
 */
export function firstServeFaultAlone(
  point: Pick<LabelPoint, "shots"> & Partial<Pick<LabelPoint, "ending">>,
  ghosts: boolean,
): Extract<LabelMark, { code: "first_serve_fault_alone" }> | null {
  if (isNonPointEnding(point.ending ?? null)) return null;
  // Cheap exit before the sort: some stroke must be a first serve.
  if (!point.shots.some((shot) => shot.stroke === "first_serve")) return null;
  const last = liveShotsInOrder(point, ghosts).at(-1);
  if (!last || last.stroke !== "first_serve") return null;
  // The result the row shows and the publish writes: the stored one. A serve
  // stored in with a landing outside the box is "Serve in, landing outside
  // the box" (`serveInLandingOut`), not a fault.
  if (!isMissedResult(last.result ?? effectiveShotResult(last))) return null;
  // After an earlier fault it is the second serve under the wrong name:
  // "Second serve?" asks that, and retyping it makes a double fault.
  if (secondServeAsFirst(point, ghosts)?.params.shotId === last.id) {
    return null;
  }
  return {
    code: "first_serve_fault_alone",
    tier: "count",
    scope: "point",
    params: {},
  };
}

/**
 * "Serve in, landing outside the box": a live serve stored `in` whose own
 * coordinates read out or net (`deriveShotResult`). The seed stores a first
 * serve as in when a rally follows it with no second serve — it must have
 * been — but keeps the vendor's bounce, which is often the wrong one; the
 * publish writes such a serve as in with no landing and no placement
 * (apply.ts) until the bounce is placed in the box. Measured 2026-10-11 over the checked points of six
 * hand-labelled sessions: 60 such serves, the landing re-placed on 5. A
 * quiet hint, never counted: the score is right either way. The first such
 * serve in video order; a let is replayed and not read.
 */
export function serveInLandingOut(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "serve_in_landing_out" }> | null {
  // Cheap exit before the sort: some serve must be stored in.
  if (
    !point.shots.some(
      (shot) => shot.result === "in" && isServeStroke(shot.stroke),
    )
  ) {
    return null;
  }
  for (const shot of liveShotsInOrder(point, ghosts)) {
    const landing = inServeLandingMiss(shot);
    if (landing === null) continue;
    return {
      code: "serve_in_landing_out",
      tier: "hint",
      scope: "shot",
      params: { shotId: shot.id, landing },
    };
  }
  return null;
}

/** How many strokes from the start of a point must carry their coordinates. */
export const PLACED_FIRST_STROKES = 4;

/** How many strokes from the end of a point must carry their coordinates. */
export const PLACED_LAST_STROKES = 2;

/**
 * "Shot placement": the first four strokes and the last two must carry their
 * coordinates, so how a point opened and ended can be read in full. A serve's
 * zone is read off its landing and a return's off its contact and landing
 * (apply.ts), which is all `calculate_match_stats` counts; the rest of these
 * strokes feed the court views and filters. The first gap in video order.
 *
 * Not asked, because there is no landing to place: a faulted serve, and a ball
 * volleyed or smashed back, which never bounced. Nor a last stroke's landing,
 * which is "No landing on the last shot". A contact is asked on any of them. A
 * stroke dismissed is passed over for the next gap: the labeller said the video
 * doesn't show that one.
 *
 * Measured 2026-10-31 over 42 matches: this flags 33% of points, about 7 more
 * per 100 than the serve and return alone plus the last-shot hint, where taking
 * every gap in these strokes would add about 14 and every stroke of the rally
 * more still. Over the checked points of 19 complete sessions, unprompted,
 * labellers placed 31 of 104 serves in, 34 of 102 returns and 88 of 165
 * second-last balls. Winner changed on 36.5% of those serves' points against
 * 32.5% of the rest, so a quiet hint, never counted.
 */
export function placementMissing(
  point: Pick<LabelPoint, "shots"> &
    Partial<Pick<LabelPoint, "ending" | "dismissed">>,
  ghosts: boolean,
): Extract<LabelMark, { code: "placement_missing" }> | null {
  if (isNonPointEnding(point.ending ?? null)) return null;
  // Cheap exit before the sort: most points have every coordinate.
  if (
    point.shots.every(
      (shot) =>
        shot.contactX !== null &&
        shot.contactY !== null &&
        shot.landingX !== null &&
        shot.landingY !== null,
    )
  ) {
    return null;
  }
  const inOrder = liveShotsInOrder(point, ghosts);
  const last = inOrder.at(-1);
  const live = inOrder.filter((s) => !isLetServe(s));
  const serveAt = live.findLastIndex((shot) => isServeStroke(shot.stroke));
  for (const [i, shot] of live.entries()) {
    if (i >= PLACED_FIRST_STROKES && i < live.length - PLACED_LAST_STROKES) {
      continue;
    }
    if (point.dismissed?.includes(placementKey(shot.id))) continue;
    const next = live[i + 1]?.stroke;
    const noLanding =
      // A let after it means this is not what "the last shot" reads.
      shot === last ||
      next === "forehand_volley" ||
      next === "backhand_volley" ||
      next === "overhead" ||
      (i <= serveAt && isMissedResult(shot.result));
    const landing = !noLanding && landingMissingOn(shot);
    if (!landing && !contactMissingOn(shot)) continue;
    return {
      code: "placement_missing",
      tier: "hint",
      scope: "shot",
      params: {
        shotId: shot.id,
        stroke:
          i === serveAt && landing
            ? "serve"
            : serveAt !== -1 && i === serveAt + 1
              ? "return"
              : "shot",
      },
    };
  }
  return null;
}

/** The share of seeded serves in play with no landing that reads as thin. */
export const THIN_TRACKING_SHARE = 0.2;

/** Fewer serves than this are too few to call the tracking thin. */
export const THIN_TRACKING_MIN_SERVES = 20;

/**
 * Whether the vendor's tracking lost a big share of this match's serves: the
 * serve in play of each live point, read off its seed so that placing them does
 * not take the note away halfway. Null when the share is ordinary. Measured
 * 2026-10-31 over 42 matches with 20 or more serves in play: median 7%, 90th
 * percentile 28%, top 46%, and 8 of them at this share or above: on those the
 * gap is the match, not a point. Added strokes have no seed and are not counted.
 */
export function thinTracking(
  points: readonly LabelPoint[],
  ghosts: boolean,
): { missing: number; serves: number } | null {
  let serves = 0;
  let missing = 0;
  for (const point of points) {
    if (point.status === "deleted" || isNonPointEnding(point.ending)) continue;
    const live = liveShotsInOrder(point, ghosts).filter((s) => !isLetServe(s));
    const seed = live.findLast((shot) => isServeStroke(shot.stroke))?.seed;
    if (!seed || seed.result !== "in") continue;
    serves += 1;
    if (seed.landing_x === null || seed.landing_y === null) missing += 1;
  }
  return serves >= THIN_TRACKING_MIN_SERVES &&
    missing / serves >= THIN_TRACKING_SHARE
    ? { missing, serves }
    : null;
}

/**
 * "Serve after a serve in play": a live serve whose previous live stroke is a
 * serve with a stored result of `in` — a let that was played on, or two points
 * the vendor ran into one rally. The first such serve in video order; the
 * action splits the point there.
 */
export function serveAfterServeIn(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "serve_after_serve_in" }> | null {
  const live = liveShotsInOrder(point, ghosts);
  for (let i = 1; i < live.length; i += 1) {
    const before = live[i - 1];
    if (!isServeStroke(live[i].stroke)) continue;
    if (!isServeStroke(before.stroke) || before.result !== "in") continue;
    return {
      code: "serve_after_serve_in",
      tier: "hint",
      scope: "shot",
      params: { shotId: live[i].id },
    };
  }
  return null;
}

/**
 * "Different ending?": the point's stored ending is not what its strokes
 * derive (`deriveEnding`) — the ending or the ended-by differ, none is
 * stored at all, or the two agree but the point's winner is the player the
 * strokes say lost (`winnerContradicted`; until 2026-10-13 that last case
 * raised nothing, and "error by Quan" sat under Quan as the winner). How a point whose ending was left behind (a stroke edited
 * before the server kept the two in step, a point added by hand) gets fixed:
 * on a click of "Make it …", never on load. Nothing for a let or a non-point,
 * whose ending says the rows do not decide it, and nothing while the rows
 * say nothing. `ghosts` is whether a site-removed stroke is still a ghost.
 */
export function endingStale(
  point: Pick<LabelPoint, "ending" | "endedBy" | "winner" | "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "ending_stale" }> | null {
  if (isNonPointEnding(point.ending)) return null;
  const derived = deriveEnding(point, ghosts);
  if (!derived) return null;
  if (
    point.ending !== null &&
    point.ending === derived.ending &&
    point.endedBy === derived.endedBy &&
    !winnerContradicted(point, derived)
  ) {
    return null;
  }
  return {
    code: "ending_stale",
    tier: "hint",
    scope: "point",
    params: {
      ending: derived.ending,
      endedBy: derived.endedBy,
      winner: derived.winner,
    },
  };
}

/**
 * "Was the last ball in?"'s answer: the point's `last_call_overruled` count
 * mark, and the stroke it was built for (`eventId`) to write the vendor's call
 * onto — only while that stroke is still the point's last live stroke with a
 * result, and still carries its seeded result. Null once the labeller has
 * deleted it, added a stroke after it or changed its result, and with no such
 * mark. Trailing strokes with no result (a phantom swing at a dead ball) do
 * not count as after it. Offered on a click, never applied on load: across
 * the checked points of three hand-labelled matches the vendor's call was
 * right 41 times in 52, too few to overrule the landing unseen.
 */
export function lastCallAnswer(
  point: Pick<LabelPoint, "shots">,
  countMarks: readonly LabelMark[],
  ghosts: boolean,
): {
  mark: Extract<LabelMark, { code: "last_call_overruled" }>;
  shotId: string;
} | null {
  const mark = countMarks.find(
    (m): m is Extract<LabelMark, { code: "last_call_overruled" }> =>
      m.code === "last_call_overruled",
  );
  if (!mark) return null;
  const last = liveShotsInOrder(point, ghosts).findLast(
    (shot) => shot.result !== null,
  );
  if (!last || last.eventId !== mark.params.eventId || !last.seed) return null;
  if (last.result !== last.seed.result) return null;
  if (last.result === mark.params.vendorCall) return null;
  return { mark, shotId: last.id };
}

/**
 * "Second serve?": a live serve typed `first_serve` that follows an earlier
 * live serve of the point whose ball missed — by structure the second serve,
 * however the vendor typed it. A let between them is replayed and changes
 * nothing: it neither faults nor clears an earlier fault, and a first serve
 * after a let alone is a first serve. The first such serve in video order;
 * the action retypes it (`{ stroke: "second_serve" }`).
 */
export function secondServeAsFirst(
  point: Pick<LabelPoint, "shots">,
  ghosts: boolean,
): Extract<LabelMark, { code: "second_serve_as_first" }> | null {
  const live = liveShotsInOrder(point, ghosts);
  let faulted = false;
  for (const shot of live) {
    if (!isServeStroke(shot.stroke) || isLetServe(shot)) continue;
    if (faulted && shot.stroke === "first_serve") {
      return {
        code: "second_serve_as_first",
        tier: "hint",
        scope: "shot",
        params: { shotId: shot.id },
      };
    }
    faulted = isMissedResult(shot.result);
  }
  return null;
}

/** What the rail header counts across the match. */
export interface MarkSummary {
  /** `count` marks still open — what is left to check. */
  open: number;
  /** Live points carrying at least one open mark. */
  openPoints: number;
}

/**
 * The match's total, over every live point — marks, not points, counted
 * exactly as the rows roll them up (`pointRowMarkList`, `markStates`). Hints
 * and hidden marks are not in it.
 */
export function markSummary(
  points: readonly LabelPoint[],
  marks: LabelMarks,
): MarkSummary {
  const summary: MarkSummary = { open: 0, openPoints: 0 };
  for (const point of points) {
    if (point.status === "deleted") continue;
    const { count } = pointRowMarkList(point, marks);
    const states = markStates(count, point, marks.suggestions, points);
    const open = states.filter((state) => state === "open").length;
    summary.open += open;
    if (open > 0) summary.openPoints += 1;
  }
  return summary;
}

/** One state per `count` mark, in order: what `reviewFlag` folds into items. */
export function markStates(
  countMarks: readonly LabelMark[],
  point: MarkStatePoint,
  suggestions?: readonly LabelSuggestion[],
  points?: readonly SuggestionNeighbour[],
): MarkState[] {
  return countMarks.map((mark) => markState(mark, point, suggestions, points));
}

/**
 * The hints still open on a point, as the well lists them (`pointHints`,
 * label-black-mark.tsx): the marks' own, then the ones read off the rows,
 * less any the labeller dismissed. "Was the last ball in?" is not among them:
 * it is a counted mark. What the header's grey count and the `]` / `[` jumps
 * read, so a grey chip on a row is a flag in the list too.
 */
export function openHintMarks(
  point: LabelPoint,
  marks: LabelMarks,
): LabelMark[] {
  const ghosts = drawsGhosts(marks);
  const { hints: own, count } = pointRowMarkList(point, marks);
  const lastCall = lastCallAnswer(point, count, ghosts);
  const live: (LabelMark | null)[] = [
    pointEndedEarly(point, ghosts),
    endingStale(point, ghosts),
    secondServeAsFirst(point, ghosts),
    lastLandingMissing(point, ghosts),
    serveAfterServeIn(point, ghosts),
    serveInLandingOut(point, ghosts),
    placementMissing(point, ghosts),
  ];
  return [
    ...(lastCall
      ? own.filter((mark) => mark.code !== "net_hit_contradicts_height")
      : own),
    ...live.filter((mark): mark is LabelMark => mark !== null),
  ].filter((mark) => {
    // `placementMissing` has already passed over a dismissed stroke.
    const key = strokeHintKey(mark) ?? hintDismissKey(mark.code);
    return !point.dismissed.includes(key);
  });
}

/**
 * The derivation's hints about how the vendor's last ball ended: "Close to
 * the line", "Winner or error?", "Net or out?" and "Ending unknown". They
 * describe the ball as the vendor sent it, so once the labeller has answered
 * that ball (`lastBallAnswered`) they settle, as a counted mark settles on
 * any edit. The row-read hints under the same question ("Different
 * ending?", "No landing on the last shot") are not here: they are read off
 * the rows as they stand, so while they are drawn they are still true.
 *
 * Measured 2026-10-23 over 14 completed sessions, read unticked: "How did the
 * last ball end?" stayed open on 191 points whose last ball the labeller had
 * edited, added or cut a dead-ball tail after, every one on hints alone —
 * 101 "Close to the line", 42 "Net or out?", 34 "Winner or error?", 12
 * "Ending unknown".
 */
const LAST_BALL_HINT_CODES: ReadonlySet<LabelMarkCode> = new Set([
  "ending_suspect_line",
  "winner_to_error_by_bounce",
  "net_hit_contradicts_height",
  "result_type_unknown",
]);

/**
 * Whether the labeller has answered the point's last ball: its ending,
 * ended-by or winner is off its seed, the last live stroke is one they added
 * or edited, or a stroke after it was removed (a dead-ball tail cut, so the
 * vendor's last ball is gone). Live means not deleted and, with `ghosts` on,
 * not a ghost.
 */
export function lastBallAnswered(point: LabelPoint, ghosts: boolean): boolean {
  const seed = point.seed;
  if (
    seed &&
    (point.ending !== seed.ending ||
      point.endedBy !== seed.ended_by ||
      point.winner !== seed.winner)
  ) {
    return true;
  }
  const live = liveShotsInOrder(point, ghosts);
  const last = live[live.length - 1];
  if (!last) return false;
  if (last.status === "added" || last.status === "edited") return true;
  const after = last.videoTime ?? -Infinity;
  return point.shots.some(
    (shot) =>
      shot.status === "deleted" &&
      !isWithdrawnAdd(shot) &&
      (shot.videoTime ?? -Infinity) > after,
  );
}

/**
 * Whether the point's winner is the player its strokes say lost. The one
 * hint that is not about the data: it is the score, so its chip is amber and
 * stays on a checked point until it is put right.
 */
export function pointWinnerContradicted(
  point: Pick<LabelPoint, "ending" | "winner" | "shots">,
  marks: LabelMarks,
): boolean {
  if (isNonPointEnding(point.ending)) return false;
  return winnerContradicted(point, deriveEnding(point, drawsGhosts(marks)));
}

/**
 * A missing stroke this close to the end of the rally decides who hit the
 * last ball: at most this many live strokes after the gap.
 */
export const MISSING_SHOT_NEAR_END = 2;

/**
 * Whether a mark can move the score (`score`, amber) or is about the data
 * (`data`, grey). `isDataMark` by code, and one mark by where it sits:
 * "Missing shot?" is data in the middle of a rally — a stroke the vendor
 * never saw, with the same players hitting before and after — but a stroke
 * missing among the rally's last three changes who hit the last ball, and so
 * who won. Without the session's `suggestions` its place is not known, and it
 * reads as data.
 */
export function markTone(
  mark: LabelMark,
  point: Pick<MarkStatePoint, "id"> & {
    shots: readonly { id: string; status: string }[];
  },
  suggestions?: readonly LabelSuggestion[],
): MarkTone {
  if (!isDataMark(mark)) return "score";
  if (mark.code !== "same_player_consecutive") return "data";
  const live = point.shots.filter((shot) => shot.status !== "deleted");
  const nearEnd = (suggestions ?? []).some((s) => {
    if (s.kind !== "missing_shot" || s.pointId !== point.id) return false;
    const at = live.findIndex((shot) => shot.id === s.afterShotId);
    return at !== -1 && live.length - 1 - at <= MISSING_SHOT_NEAR_END;
  });
  return nearEnd ? "score" : "data";
}

/** Amber (`score`) when a mark can move the score, grey (`data`) when it is about the data. */
export type MarkTone = "score" | "data";

/** Most open first: a chip is as open as its most open member. */
const OPENNESS: readonly MarkState[] = [
  "open",
  "settled",
  "dismissed",
  "checked-as-is",
  "checked",
];

export function mostOpen(states: readonly MarkState[]): MarkState {
  return OPENNESS.find((state) => states.includes(state)) ?? "checked";
}

// ── The review flag ─────────────────────────────────────────────────────────

/** The seven questions a point's review flag can ask, by id (`REVIEW_ITEMS`). */
export type ReviewItemId = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** "Shot placement": never the score, so never the amber list's or chip's. */
export const PLACEMENT_ITEM: ReviewItemId = 7;

/** One row of `REVIEW_ITEMS`: an item, its question and the codes it absorbs. */
export interface ReviewItemDef {
  id: ReviewItemId;
  question: string;
  codes: readonly LabelMarkCode[];
}

/**
 * The flag's items in the order they are answered, each with the mark codes
 * it absorbs. Strokes first, then the last ball, its ending, the winner, the
 * game: each item reads what the ones above decide — a stroke change moves
 * the last ball, the last ball's call derives the ending, the winner drives
 * the labelled score, and `score_side_mismatch` / `service_court_repeat` are
 * read live off it. Placement comes last: it moves no score. Every `count`
 * and `hint` code in `LABEL_MARK_META` is named by exactly one item; a
 * `hidden` code by none, and it is never a member. Item 4 is put as the vendor called it (`lastCallQuestion`) where
 * `last_call_overruled` is a member, and `ending_stale` is its "Then:"
 * consequence line, never a question of its own.
 */
export const REVIEW_ITEMS: readonly ReviewItemDef[] = [
  {
    id: 1,
    question: REVIEW_ITEM_QUESTION[1],
    codes: ["same_player_consecutive"],
  },
  {
    id: 2,
    question: REVIEW_ITEM_QUESTION[2],
    codes: ["shot_after_point_end", "serve_after_serve_in", "reserve_after_in"],
  },
  {
    id: 3,
    question: REVIEW_ITEM_QUESTION[3],
    codes: [
      "second_serve_as_first",
      "first_serve_fault_alone",
      "second_serve_called_out",
      "serve_in_landing_out",
    ],
  },
  {
    id: 4,
    question: REVIEW_ITEM_QUESTION[4],
    codes: [
      "last_call_overruled",
      "winner_disputed",
      "net_hit_contradicts_height",
      "ending_suspect_line",
      "winner_to_error_by_bounce",
      "ending_stale",
      "last_landing_missing",
      "last_shot_unresolved",
      "result_type_unknown",
    ],
  },
  {
    id: 5,
    question: REVIEW_ITEM_QUESTION[5],
    codes: ["pick_winner", "winner_guessed"],
  },
  {
    id: 6,
    question: REVIEW_ITEM_QUESTION[6],
    codes: [
      "score_side_mismatch",
      "service_court_repeat",
      "tiebreak_score_off_six_all",
      "segment_proposal_differs",
    ],
  },
  {
    id: 7,
    question: REVIEW_ITEM_QUESTION[7],
    codes: ["placement_missing"],
  },
];

/**
 * One mark under an item, with where it is in its life and the `dismissed`
 * key a per-item Dismiss stores for it — `pointEndedKey` for "Did the point
 * end here?", `missing_point` for "Same side twice" (what its slot's Dismiss
 * stores), `hintDismissKey` for the rest. "Missing shot?" has none: its
 * dismissal lives on its `missing_shot` slots.
 */
export interface ReviewMember {
  mark: LabelMark;
  state: MarkState;
  dismissKey?: string;
}

/** One item of a point's flag: the question and the marks that raised it. */
export interface ReviewItem {
  id: ReviewItemId;
  question: string;
  /** Amber when the item can move the score, grey when it is about the data. */
  tone: MarkTone;
  /** `mostOpen` of its members' states. */
  state: MarkState;
  /** In the order the marks were gathered: count marks first, then hints. */
  members: ReviewMember[];
}

/**
 * A point's one flag: its items in id order (an item with no members is
 * absent), amber if an open item is (any item, once none is open), as open
 * as its most open item.
 *
 * `demoted` marks the grey flag the design note leaves off the row and out of
 * the counts — one whose only open item is item 4 and whose open members
 * there are exactly {`net_hit_contradicts_height`}, {`ending_suspect_line`}
 * or {`ending_suspect_line`, `winner_to_error_by_bounce`}. On the 8 complete
 * sessions those were 99 of 907 points, changed on 36–46% against a 52%
 * base. It is a boolean rather than a null so the open point can still draw
 * the evidence lines.
 */
export interface ReviewFlag {
  tone: MarkTone;
  state: MarkState;
  items: ReviewItem[];
  demoted: boolean;
}

/** The `dismissed` key of a hint about one stroke: by that stroke, not its code. */
export function strokeHintKey(mark: LabelMark): string | undefined {
  switch (mark.code) {
    case "shot_after_point_end":
      return pointEndedKey(mark.params.shotId);
    case "placement_missing":
      return placementKey(mark.params.shotId);
    default:
      return undefined;
  }
}

/** The `dismissed` key a per-item Dismiss stores for `mark`, if it has one. */
function memberDismissKey(mark: LabelMark): string | undefined {
  const byStroke = strokeHintKey(mark);
  if (byStroke) return byStroke;
  switch (mark.code) {
    case "service_court_repeat":
      return "missing_point";
    case "same_player_consecutive":
      return undefined;
    default:
      return hintDismissKey(mark.code);
  }
}

/** The open item-4 member sets a grey flag is demoted for. */
const DEMOTED_SIGNATURES: readonly (readonly LabelMarkCode[])[] = [
  ["net_hit_contradicts_height"],
  ["ending_suspect_line"],
  ["ending_suspect_line", "winner_to_error_by_bounce"],
];

/**
 * Whether a flag is demoted (`ReviewFlag.demoted`): grey, open on item 4
 * alone, and the codes open there one of `DEMOTED_SIGNATURES`.
 */
function isDemoted(tone: MarkTone, items: readonly ReviewItem[]): boolean {
  if (tone !== "data") return false;
  const open = items.filter((item) => item.state === "open");
  if (open.length !== 1 || open[0].id !== 4) return false;
  const codes = [
    ...new Set(
      open[0].members
        .filter((member) => member.state === "open")
        .map((member) => member.mark.code),
    ),
  ].sort();
  return DEMOTED_SIGNATURES.some(
    (signature) =>
      signature.length === codes.length &&
      [...signature].sort().every((code, i) => code === codes[i]),
  );
}

/**
 * An item's tone from its members. Item 1 is `markTone`'s call (a missing
 * stroke near the end of the rally decides who hit the last ball); item 2 is
 * amber only for a serve replayed after one in; item 3 only for a double
 * fault in question or a point stopping on a faulted first serve; item 4
 * when a counted mark sits under it or the point's winner is the player its
 * strokes say lost; items 5 and 6 are always the score, item 7 never. Like the
 * flag (`foldReviewItems`), an item speaks for its open members while any is
 * open, and for all of them once none is: a settled "Check the ending" does
 * not keep the grey hints still open beside it amber.
 * `contradicted` is `pointWinnerContradicted`, when the caller has it.
 */
function reviewItemTone(
  id: ReviewItemId,
  all: readonly ReviewMember[],
  point: LabelPoint,
  marks: LabelMarks,
  contradicted?: boolean,
): MarkTone {
  const members = openOrAll(all, (member) => member.state);
  const has = (...codes: LabelMarkCode[]) =>
    members.some((member) => codes.includes(member.mark.code));
  switch (id) {
    case 1:
      return members.some(
        (member) => markTone(member.mark, point, marks.suggestions) === "score",
      )
        ? "score"
        : "data";
    case 2:
      return has("reserve_after_in") ? "score" : "data";
    case 3:
      return has("second_serve_called_out", "first_serve_fault_alone")
        ? "score"
        : "data";
    case 4:
      return members.some((member) => member.mark.tier === "count") ||
        (contradicted ?? pointWinnerContradicted(point, marks))
        ? "score"
        : "data";
    case 5:
    case 6:
      return "score";
    case 7:
      return "data";
  }
}

/**
 * The point's review flag, or null for a deleted point or one with nothing
 * to ask. Members are gathered exactly as the row reads them today: the
 * `count` marks via `pointRowMarkList` with `markStates` (`points` lets
 * "Same side twice" read settled by an added point), then the hints and the
 * live row-read marks via `openHintMarks` — so a dismissed hint is not a
 * member, and "Net or out?" is dropped while "Was the last ball in?" still
 * has its answer. On a checked point a hint member reads `checked-as-is`,
 * except "Different ending?" with the winner contradicted, which stays
 * `open`: the score, as `openFlags` has always read it.
 */
export function reviewFlag(
  point: LabelPoint,
  marks: LabelMarks,
  points: readonly LabelPoint[],
): ReviewFlag | null {
  if (point.status === "deleted") return null;
  const { count } = pointRowMarkList(point, marks);
  const states = markStates(count, point, marks.suggestions, points);
  const checked = point.checkedAt !== null;
  const contradicted = pointWinnerContradicted(point, marks);
  const answered = lastBallAnswered(point, drawsGhosts(marks));
  const hintState = (mark: LabelMark): MarkState => {
    if (checked) {
      return contradicted && mark.code === "ending_stale"
        ? "open"
        : "checked-as-is";
    }
    return answered && LAST_BALL_HINT_CODES.has(mark.code) ? "settled" : "open";
  };
  const members: ReviewMember[] = [
    ...count.map((mark, i) => ({
      mark,
      state: states[i],
      dismissKey: memberDismissKey(mark),
    })),
    ...openHintMarks(point, marks).map((mark) => ({
      mark,
      state: hintState(mark),
      dismissKey: memberDismissKey(mark),
    })),
  ];
  return foldReviewItems(members, point, marks, contradicted);
}

/**
 * The members (or items) a tone speaks for: the open ones while any is open,
 * every one once none is — as the row's chip always read its marks.
 */
function openOrAll<T>(
  list: readonly T[],
  state: (entry: T) => MarkState,
): readonly T[] {
  const open = list.filter((entry) => state(entry) === "open");
  return open.length > 0 ? open : list;
}

/**
 * Fold `members` into a point's flag: each item with at least one member, in
 * id order, its tone and state, then the flag's own. Null when no item has a
 * member. What `reviewFlag` and the scorecard's opening reading share, so the
 * tone and demotion rules live in one place.
 */
export function foldReviewItems(
  members: readonly ReviewMember[],
  point: LabelPoint,
  marks: LabelMarks,
  /** `pointWinnerContradicted`, when the caller has already read it. */
  contradicted?: boolean,
): ReviewFlag | null {
  const items: ReviewItem[] = [];
  for (const def of REVIEW_ITEMS) {
    const mine = members.filter((member) =>
      def.codes.includes(member.mark.code),
    );
    if (mine.length === 0) continue;
    items.push({
      id: def.id,
      question: def.question,
      tone: reviewItemTone(def.id, mine, point, marks, contradicted),
      state: mostOpen(mine.map((member) => member.state)),
      members: mine,
    });
  }
  if (items.length === 0) return null;
  // Amber while an open item can move the score, or, with none open, while
  // any item could: a point whose amber question is answered and whose grey
  // one is still open is a data point to review, not a score one.
  const tone = openOrAll(items, (item) => item.state).some(
    (item) => item.tone === "score",
  )
    ? "score"
    : "data";
  return {
    tone,
    state: mostOpen(items.map((item) => item.state)),
    items,
    demoted: isDemoted(tone, items),
  };
}

/**
 * The words an item is asked in: its question, but item 4 as the vendor
 * called the last ball ("Was the last ball out?") where `last_call_overruled`
 * is one of its members.
 */
export function reviewItemQuestion(
  item: Pick<ReviewItem, "id" | "question" | "members">,
): string {
  if (item.id === 4) {
    for (const { mark } of item.members) {
      if (mark.code === "last_call_overruled") {
        return lastCallQuestion(mark.params.vendorCall);
      }
    }
  }
  return item.question;
}

/** The point row's one chip, as `reviewChip` reads it off the flag. */
export interface ReviewChip {
  /** The words, or null for the quiet outline that has none. */
  text: string | null;
  /** The flag's items, open or not. */
  count: number;
  state: MarkState;
  tone: MarkTone;
  /** The items still open, in id order: what the words and hover speak for. */
  open: ReviewItem[];
}

/**
 * What the point row draws of its flag: null for a demoted flag, which the
 * row leaves off as the header leaves it out (the open point still asks it).
 * One open item is its own question (`reviewItemQuestion`), two or more are
 * "Review · N", and with none open the chip is the quiet outline, no words —
 * but only where a `count` mark is among the members, as the row drew it
 * before the flag: a flag of hints alone leaves no trace once answered, so a
 * finished match is not strewn with outlines. Every demoted signature is
 * hints alone, so a flag that would be demoted once checked draws nothing
 * either. Tone and state are the flag's. An amber chip does not speak for
 * "Shot placement" (`PLACEMENT_ITEM`): a gap beside a question that can move
 * the score stays the grey list's (`openFlags`).
 */
export function reviewChip(flag: ReviewFlag): ReviewChip | null {
  if (flag.demoted) return null;
  const open = flag.items.filter(
    (item) =>
      item.state === "open" &&
      (flag.tone !== "score" || item.id !== PLACEMENT_ITEM),
  );
  if (
    open.length === 0 &&
    !flag.items.some((item) =>
      item.members.some((member) => member.mark.tier === "count"),
    )
  ) {
    return null;
  }
  return {
    text:
      open.length === 0
        ? null
        : open.length === 1
          ? reviewItemQuestion(open[0])
          : `Review · ${open.length}`,
    count: flag.items.length,
    state: flag.state,
    tone: flag.tone,
    open,
  };
}
