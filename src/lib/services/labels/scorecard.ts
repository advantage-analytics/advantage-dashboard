/**
 * A scorecard for the marks: each mark code measured against what the labeller
 * actually did to the point it sat on, from a session's rows (`seed` against
 * the current values) and the marks built for them with the CURRENT derivation
 * code. It is what the tiers in marks.ts (`LABEL_MARK_META`) are decided from;
 * re-run it on every newly labelled match. Pure: the reads live in
 * `scripts/label-scorecard.ts`.
 *
 * What "changed" means, per point, seed against the row now:
 *
 * - winner: a live point whose `winner` is not its seeded one.
 * - ending: a live point whose `ending` or `ended_by` is not its seeded one.
 * - anything: either of those, any other seeded field, or any of its strokes (a
 *   value off its seed, a stroke added or deleted, a site-removed stroke
 *   restored). A deleted point counts here and only here.
 *
 * A point the labeller added has no seed and no mark. A vendor row with no
 * stored seed falls back to its status.
 */

import {
  labelPointFields,
  labelShotValues,
  pointMatchesSeed,
  shotMatchesSeed,
} from "./edit";
import {
  LABEL_MARK_META,
  type LabelMark,
  type LabelMarkCode,
  type LabelMarks,
  type LabelMarkTier,
} from "./marks";
import { MARK_LABEL } from "./marks-copy";
import { withLiveScoreMarks, type ScoreMarkPoint } from "./score-marks";
import type { LabelShotResult } from "./seed";
import {
  compareNullsLast,
  isMissedResult,
  type LabelPoint,
  type LabelShot,
  type LabelSide,
} from "./session";
import { deriveShotResult } from "./shot-derived";

/** What the labeller changed on one point, seed against now. */
export interface PointChange {
  winner: boolean;
  ending: boolean;
  anything: boolean;
}

/** Whether the labeller changed a stroke: its values, or its being there. */
export function shotChangedFromSeed(shot: LabelShot): boolean {
  if (shot.status === "added" || shot.status === "deleted") return true;
  if (shot.siteRemovalRestoredAt !== null) return true;
  if (shot.seed === null) return shot.status === "edited";
  return !shotMatchesSeed(labelShotValues(shot), shot.seed);
}

/** What the labeller changed on `point` (see the file's header). */
export function pointChange(point: LabelPoint): PointChange {
  const shots = point.shots.some(shotChangedFromSeed);
  if (point.status === "deleted") {
    return { winner: false, ending: false, anything: true };
  }
  if (point.seed === null) {
    // Added by the labeller, or a vendor row never backfilled: no seed to
    // hold it against, so its status is all there is.
    return {
      winner: false,
      ending: false,
      anything: point.status !== "unchanged" || shots,
    };
  }
  const seed = point.seed;
  const now = labelPointFields(point);
  const winner = now.winner !== seed.winner;
  const ending = now.ending !== seed.ending || now.ended_by !== seed.ended_by;
  return { winner, ending, anything: shots || !pointMatchesSeed(now, seed) };
}

/**
 * The session's vendor points as they were when it opened: each row's seeded
 * fields, live and unchanged, in rail order, without the points the labeller
 * added — and with the ones they deleted. What the two score marks
 * (score-marks.ts) are read off to say which were SHOWN at the start, rather
 * than which still stand after the labeller fixed the score.
 */
export function seededScorePoints(
  points: readonly LabelPoint[],
): ScoreMarkPoint[] {
  const seeded: ScoreMarkPoint[] = [];
  for (const point of points) {
    if (point.seed === null) continue;
    seeded.push({
      id: point.id,
      pointIndex: seeded.length,
      status: "unchanged",
      setNumber: point.seed.set_number,
      gameNumber: point.seed.game_number,
      server: point.seed.server,
      winner: point.seed.winner,
      ending: point.seed.ending,
      // A seeded point is always an ordinary game (seed.ts).
      gameType: "game",
    });
  }
  return seeded;
}

/**
 * The marks as the session opened: the file's (built with `hidden: true`, so
 * every code is measured) plus the two score marks read off the SEEDED
 * score.
 */
export function openingMarks(
  fileMarks: LabelMarks,
  points: readonly LabelPoint[],
  adScoring: boolean,
): LabelMarks {
  return withLiveScoreMarks(fileMarks, seededScorePoints(points), adScoring);
}

export interface ScorecardRow {
  code: LabelMarkCode;
  label: string;
  /**
   * The tier the code's marks were drawn in. One code can have two
   * (`net_hit_contradicts_height`): it then has a row per tier.
   */
  tier: LabelMarkTier;
  /** Marks of this code and tier — what was shown, or would have been. */
  marks: number;
  /** …on a point whose winner the labeller changed. */
  winnerChanged: number;
  /** …on a point whose ending or ended-by the labeller changed. */
  endingChanged: number;
  /** …on a point the labeller changed in any way. */
  anythingChanged: number;
}

/** A point whose winner changed with no `count` mark on it to say so. */
export interface UnmarkedWinnerChange {
  /** The point as the rail numbers it now (`pointIndex + 1`). */
  number: number;
  from: LabelSide | null;
  to: LabelSide | null;
  /** The quieter marks it did carry, hints and hidden ones. */
  otherCodes: LabelMarkCode[];
}

/** A last stroke seeded In whose seeded coordinates say Out or Net. */
export interface SeededInLastStroke {
  number: number;
  /** What `deriveShotResult` reads off the seeded coordinates. */
  byCoordinates: "out" | "net";
  /** What the labeller left it as; "deleted" when they removed the stroke. */
  labelled: LabelShotResult | "deleted" | null;
}

/** The hand-deleted strokes of one reason. */
export interface DeletedShotRow {
  reason: string;
  deleted: number;
  /**
   * …that directly followed a stroke whose seeded coordinates say Out or
   * Net — a dead ball the coordinates could have named.
   */
  afterOutOrNet: number;
}

export interface Scorecard {
  /** Live points, and how many of them the labeller changed. */
  points: { live: number; added: number; deleted: number; changed: number };
  rows: ScorecardRow[];
  unmarkedWinnerChanges: UnmarkedWinnerChange[];
  seededInLastStrokes: SeededInLastStroke[];
  deletedShots: DeletedShotRow[];
}

/** The two "hit after a dead ball" reasons, read as one. */
export const AFTER_POINT_ENDED = "after the point ended";

/** A stroke's delete reason as the scorecard groups it. */
export function deleteReasonGroup(reason: string | null): string {
  if (reason === "dead_ball_after_fault" || reason === "dead_ball_after_point")
    return AFTER_POINT_ENDED;
  return reason ?? "no reason";
}

/** Out or Net by a stroke's SEEDED coordinates; null for anything else. */
function seededOutOrNet(shot: LabelShot): "out" | "net" | null {
  if (shot.seed === null) return null;
  const derived = deriveShotResult(shot.seed);
  return isMissedResult(derived) ? derived : null;
}

/**
 * The point's vendor strokes in the order they were seeded in: by seeded
 * time, or the row's own where a stroke has no stored seed. A stroke the
 * labeller added is not among them.
 */
function seededOrder(point: LabelPoint): LabelShot[] {
  const time = (shot: LabelShot) =>
    shot.seed ? shot.seed.video_time : shot.videoTime;
  return point.shots
    .filter((shot) => shot.eventId !== null)
    .sort((a, b) => compareNullsLast(time(a), time(b)));
}

const TIER_ORDER: readonly LabelMarkTier[] = ["count", "hint", "hidden"];

/**
 * Build the scorecard.
 *
 * `points` are the session's rows as `getLabelSession` returns them
 * (tombstones included). `marks` are `openingMarks` for those rows: every
 * code, hidden ones too, and the score marks of the seeded score.
 */
export function buildScorecard(
  points: readonly LabelPoint[],
  marks: LabelMarks,
): Scorecard {
  const rows = new Map<string, ScorecardRow>();
  const unmarkedWinnerChanges: UnmarkedWinnerChange[] = [];
  const seededInLastStrokes: SeededInLastStroke[] = [];
  const deleted = new Map<string, DeletedShotRow>();
  const summary = { live: 0, added: 0, deleted: 0, changed: 0 };

  for (const point of points) {
    const change = pointChange(point);
    if (point.status === "deleted") summary.deleted += 1;
    else summary.live += 1;
    if (point.status === "added") summary.added += 1;
    if (change.anything) summary.changed += 1;

    // The point's marks, then its strokes'. A mark whose row is gone is in
    // neither: it has nothing to be measured against.
    const own: LabelMark[] = [
      ...(marks.points[point.id] ?? []),
      ...point.shots.flatMap((shot) => marks.shots[shot.id] ?? []),
    ];
    for (const mark of own) {
      const key = `${mark.code}:${mark.tier}`;
      const row = rows.get(key) ?? {
        code: mark.code,
        label: MARK_LABEL[mark.code],
        tier: mark.tier,
        marks: 0,
        winnerChanged: 0,
        endingChanged: 0,
        anythingChanged: 0,
      };
      row.marks += 1;
      if (change.winner) row.winnerChanged += 1;
      if (change.ending) row.endingChanged += 1;
      if (change.anything) row.anythingChanged += 1;
      rows.set(key, row);
    }
    if (change.winner && !own.some((m) => m.tier === "count")) {
      unmarkedWinnerChanges.push({
        number: point.pointIndex + 1,
        from: point.seed?.winner ?? null,
        to: point.winner,
        otherCodes: [...new Set(own.map((m) => m.code))],
      });
    }

    // The last stroke as it was SEEDED: by seeded time, with a seeded result.
    const seeded = seededOrder(point);
    const last = seeded.findLast(
      (shot) => shot.seed !== null && shot.seed.result !== null,
    );
    if (last?.seed?.result === "in") {
      const byCoordinates = seededOutOrNet(last);
      if (byCoordinates) {
        seededInLastStrokes.push({
          number: point.pointIndex + 1,
          byCoordinates,
          labelled: last.status === "deleted" ? "deleted" : last.result,
        });
      }
    }

    // Hand deletions only: a stroke the site removed is `siteRemoval`, and
    // is a deletion here only if the labeller deleted it themselves.
    seeded.forEach((shot, index) => {
      if (shot.status !== "deleted") return;
      const reason = deleteReasonGroup(shot.deleteReason);
      const row = deleted.get(reason) ?? {
        reason,
        deleted: 0,
        afterOutOrNet: 0,
      };
      row.deleted += 1;
      const before = seeded[index - 1];
      if (before && seededOutOrNet(before)) row.afterOutOrNet += 1;
      deleted.set(reason, row);
    });
  }

  const codeOrder = Object.keys(LABEL_MARK_META);
  return {
    points: summary,
    rows: [...rows.values()].sort(
      (a, b) =>
        TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
        codeOrder.indexOf(a.code) - codeOrder.indexOf(b.code),
    ),
    unmarkedWinnerChanges,
    seededInLastStrokes,
    deletedShots: [...deleted.values()].sort((a, b) => b.deleted - a.deleted),
  };
}

// ── Markdown ────────────────────────────────────────────────────────────────

function table(head: string[], rows: (string | number)[][]): string {
  const line = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return [line(head), line(head.map(() => "---")), ...rows.map(line)].join(
    "\n",
  );
}

/** "9 (64%)" — a count and its share of `of`; a bare count over nothing. */
function share(count: number, of: number): string {
  return of === 0
    ? `${count}`
    : `${count} (${Math.round((count / of) * 100)}%)`;
}

const sideName = (
  side: LabelSide | null,
  names: Record<LabelSide, string>,
): string => (side === null ? "nobody" : names[side]);

/**
 * The scorecard as markdown. `names` are the players', for the winner
 * changes; `title` heads it (the session, by whatever the caller knows).
 */
export function renderScorecard(
  card: Scorecard,
  { title, names }: { title: string; names: Record<LabelSide, string> },
): string {
  const out: string[] = [`# ${title}`, ""];
  const { live, added, deleted, changed } = card.points;
  out.push(
    `${live} live points (${added} added by the labeller), ${deleted} deleted; ${changed} changed in some way.`,
    "",
    "## Marks, against what the labeller changed",
    "",
    "A `count` mark is the amber chip the header counts, a `hint` a word on the open point's quiet line, a `hidden` mark is drawn nowhere. Shares are of the code's own marks.",
    "",
  );
  out.push(
    card.rows.length === 0
      ? "No marks."
      : table(
          [
            "Mark",
            "Code",
            "Tier",
            "Marks",
            "Winner changed",
            "Ending / ended by changed",
            "Anything changed",
          ],
          card.rows.map((row) => [
            row.label,
            `\`${row.code}\``,
            row.tier,
            row.marks,
            share(row.winnerChanged, row.marks),
            share(row.endingChanged, row.marks),
            share(row.anythingChanged, row.marks),
          ]),
        ),
    "",
    "## Winner changed with no `count` mark on the point",
    "",
  );
  out.push(
    card.unmarkedWinnerChanges.length === 0
      ? "None: every winner the labeller changed sat under an amber chip."
      : table(
          ["Point", "Seeded winner", "Labelled winner", "Other marks on it"],
          card.unmarkedWinnerChanges.map((row) => [
            row.number,
            sideName(row.from, names),
            sideName(row.to, names),
            row.otherCodes.length === 0
              ? "none"
              : row.otherCodes.map((code) => `\`${code}\``).join(", "),
          ]),
        ),
    "",
    "## Last strokes seeded In whose coordinates say Out or Net",
    "",
  );
  if (card.seededInLastStrokes.length === 0) {
    out.push("None.");
  } else {
    const total = card.seededInLastStrokes.length;
    const moved = card.seededInLastStrokes.filter((row) =>
      isMissedResult(row.labelled),
    ).length;
    out.push(
      `${total} ${total === 1 ? "stroke" : "strokes"}; the labeller made ${share(moved, total)} Out or Net.`,
      "",
      table(
        ["Point", "Coordinates say", "Labelled"],
        card.seededInLastStrokes.map((row) => [
          row.number,
          row.byCoordinates,
          row.labelled ?? "no result",
        ]),
      ),
    );
  }
  out.push("", "## Strokes the labeller deleted", "");
  out.push(
    card.deletedShots.length === 0
      ? "None."
      : table(
          [
            "Reason",
            "Deleted",
            "Directly after a stroke whose seeded coordinates say Out or Net",
          ],
          card.deletedShots.map((row) => [
            row.reason,
            row.deleted,
            share(row.afterOutOrNet, row.deleted),
          ]),
        ),
    "",
  );
  return out.join("\n");
}
