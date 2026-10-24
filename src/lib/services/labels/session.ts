/**
 * One hand-labelling session as the console reads it — the shapes
 * `getLabelSession` (`lib/data/labels-server.ts`) returns and the components
 * under `components/admin/labels/` render, plus the one ordering rule both
 * sides depend on.
 *
 * Pure and import-free of anything server-side, so a `"use client"` console
 * can take these types and `orderLabelShots` without dragging the
 * service-role loader into its bundle.
 *
 * There is deliberately no `flags` field anywhere here: the label tables carry
 * none. The marks the black rail draws are computed from the raw vendor file
 * per render, gated by `marksEnabled`, and never stored on a row.
 */

import type { MatchScore as FoldedMatchScore } from "@/lib/services/splitstep/derivation";
import type {
  LabelEnding,
  LabelPointSeedValues,
  LabelServeSide,
  LabelShotResult,
  LabelShotSeedValues,
  LabelSide,
  LabelStroke,
} from "./seed";

export type {
  LabelEnding,
  LabelPointSeedValues,
  LabelServeSide,
  LabelShotResult,
  LabelShotSeedValues,
  LabelSide,
  LabelStroke,
};

/**
 * `matches.score` as the labels read it: the derivation's games per set
 * (`player1` / `player2`), plus the tiebreak points the wizard stores beside
 * them when it has them — one entry per set, null for a set with no
 * tiebreak. The wizard spells a deciding-set match tiebreak as a set of 1–0
 * / 0–1 games with its points in these arrays (ScoreBlock.tsx
 * `isTiebreakSet`), and set-scores.ts `matchTiebreakSet` needs both halves:
 * a 1–0 deciding set with no tiebreak points is a retirement, not a tiebreak.
 */
export interface MatchScore extends FoldedMatchScore {
  player1_tiebreaks?: (number | null)[];
  player2_tiebreaks?: (number | null)[];
}

/**
 * Where the video starts in the match (`label_sessions.start_score`), for a
 * recording that begins after the first point. Every pair is p1 first.
 * `sets` are the sets already won before the first set on the video, `games`
 * the games already won in that set, `points` the counts already played in
 * the first game on the video — 0–3 for 0/15/30/40 in an ordinary game, any
 * count when that game is a tiebreak — and `server` who serves that game.
 * Null on the session means the video starts at the beginning of the match,
 * and every reader counts exactly as it did before the column existed.
 */
export interface LabelStartScore {
  sets: [number, number];
  games: [number, number];
  points: [number, number];
  server: LabelSide;
}

export type LabelPointStatus = "unchanged" | "edited" | "added" | "deleted";
export type LabelShotStatus = "kept" | "edited" | "added" | "deleted";

/**
 * `label_points.game_type`, the CHECK vocabulary. A game-level annotation
 * stored per point, like `server`: not seeded, not in the `unchanged`
 * comparison, never touched by Reset. Declared here because score.ts imports
 * from this file and nothing may import back.
 */
export const LABEL_GAME_TYPES = ["game", "tiebreak", "match_tiebreak"] as const;
export type LabelGameType = (typeof LABEL_GAME_TYPES)[number];

export function isLabelGameType(value: unknown): value is LabelGameType {
  return (
    typeof value === "string" &&
    (LABEL_GAME_TYPES as readonly string[]).includes(value)
  );
}

/**
 * `label_shots.spin`, the CHECK vocabulary: the vendor's `spin_type`,
 * lower-cased. A value field like `stroke`. Declared here because seed.ts
 * imports from this file and the console must reach the list without the
 * derivation.
 */
export const LABEL_SPINS = ["topspin", "flat", "backspin", "sidespin"] as const;
export type LabelSpin = (typeof LABEL_SPINS)[number];

/**
 * A serve's spins, in the Spin menu's order: Flat, Slice, Kick. Stored in
 * the vendor's rotation words — a slice serve is sidespin, a kick topspin —
 * so a labelled serve reads as the stats read one (match-filters/spin.ts
 * `normalizeServeSpin`). A backspin serve is not a serve spin.
 */
export const SERVE_SPINS = [
  "flat",
  "sidespin",
  "topspin",
] as const satisfies readonly LabelSpin[];

export function isLabelSpin(value: unknown): value is LabelSpin {
  return (
    typeof value === "string" &&
    (LABEL_SPINS as readonly string[]).includes(value)
  );
}

/**
 * A stroke the labeller added and then deleted: its tombstone records nothing
 * the scorer needs (no vendor stroke was rejected), so the console draws no
 * row for it and does not count it as a change.
 */
export function isWithdrawnAdd(
  shot: Pick<LabelShot, "status"> &
    Partial<Pick<LabelShot, "statusBeforeDelete">>,
): boolean {
  return shot.status === "deleted" && shot.statusBeforeDelete === "added";
}

/**
 * A point the labeller added and then deleted before it held a stroke: the
 * same case as `isWithdrawnAdd`, for a point. It never stood for anything on
 * the video, so the console draws no marker for it — neither "Deleted point"
 * nor the "Combined into the point above" its empty row would otherwise read
 * as (`isCombinedTombstone`).
 */
export function isWithdrawnPointAdd(
  point: Pick<LabelPoint, "status" | "statusBeforeDelete"> & {
    shots: readonly unknown[];
  },
): boolean {
  return (
    point.status === "deleted" &&
    point.statusBeforeDelete === "added" &&
    point.shots.length === 0
  );
}

/** Whether a stroke is a serve — a first or a second. */
export function isServeStroke(stroke: LabelStroke | null | undefined): boolean {
  return stroke === "first_serve" || stroke === "second_serve";
}

/**
 * Whether a stroke out or in the net ends the point: any rally ball, and a
 * second serve (a double fault). A first serve's fault ends nothing.
 */
export function endsPointWhenMissed(
  stroke: LabelStroke | null | undefined,
): boolean {
  return !isServeStroke(stroke) || stroke === "second_serve";
}

/**
 * Whether an ending says the point was not played out — a replayed let or a
 * non-point: the score stands, the server's turn does not move, and no stroke
 * rewrites it.
 */
export function isNonPointEnding(ending: LabelEnding | null): boolean {
  return ending === "let_replayed" || ending === "not_a_point";
}

/** Whether a result is a missed ball: out, or in the net. */
export function isMissedResult(result: unknown): result is "out" | "net" {
  return result === "out" || result === "net";
}

/**
 * A let: a serve the labeller marked replayed. The one test every reader
 * uses, so a stray `result: "let"` on a rally stroke is never skipped as one.
 */
export function isLetServe(shot: {
  stroke: LabelStroke | null;
  result: string | null;
}): boolean {
  return isServeStroke(shot.stroke) && shot.result === "let";
}

export function opponent(side: LabelSide): LabelSide {
  return side === "p1" ? "p2" : "p1";
}

/** The side a vendor `is_player1` boolean names. */
export function labelSideOf(isPlayer1: boolean): LabelSide {
  return isPlayer1 ? "p1" : "p2";
}

/**
 * `label_shots.site_removal`, the CHECK vocabulary
 * (supabase/migrations/..._label_marks_and_site_removals.sql): why the SITE
 * removed a vendor stroke before the transcript was built. One reason so far —
 * played.ts's phantom rule, a non-serve stroke before the point's last serve.
 * Written by the seed and the backfill only; never by an edit.
 */
export type LabelSiteRemoval = "hit_after_fault";

/** One `label_shots` row. Coordinates are metres, near baseline at y = 0. */
export interface LabelShot {
  id: string;
  labelPointId: string;
  /** The vendor stroke id; null for a stroke the labeller added. */
  eventId: number | null;
  /** Where an added stroke sits in the rally. */
  afterEventId: number | null;
  status: LabelShotStatus;
  /** A tombstone's status before it was deleted — what Undo restores. */
  statusBeforeDelete: Exclude<LabelShotStatus, "deleted"> | null;
  deleteReason: string | null;
  hitter: LabelSide | null;
  stroke: LabelStroke | null;
  result: LabelShotResult | null;
  /** The ball's spin as the vendor read it, lower-cased; null for `None`. */
  spin: LabelSpin | null;
  contactX: number | null;
  contactY: number | null;
  landingX: number | null;
  landingY: number | null;
  /** Seconds on the analysis clock — the same clock as `shots.video_time`. */
  videoTime: number | null;
  /**
   * The value columns the video cannot settle (`label_shots.unclear`): names
   * from edit.ts `LABEL_SHOT_VALUE_FIELDS`, such as `landing_x`. Excluded from
   * scoring, and a landing named here is not asked for again.
   */
  unclear: string[];
  /**
   * Set when the site removed this vendor stroke before the transcript was
   * built ({@link LabelSiteRemoval}); null for a stroke the derivation kept
   * and for one the labeller added. A labeller's own removal is
   * `status: "deleted"` instead, so the two are never confused.
   */
  siteRemoval: LabelSiteRemoval | null;
  /** When the labeller put a site-removed stroke back; null until then. */
  siteRemovalRestoredAt: string | null;
  /**
   * The value fields as the seed wrote them — what Reset restores and what
   * `kept` is measured against. Null for an added stroke, and for a vendor
   * stroke seeded before the column existed and not yet backfilled.
   */
  seed: LabelShotSeedValues | null;
}

/**
 * A ghost: a stroke the site removed that the labeller has neither restored
 * nor deleted themselves. The black rail draws it as a quiet line, not a row,
 * and the rally count skips it.
 */
export function isGhostShot(
  shot: Pick<LabelShot, "siteRemoval" | "siteRemovalRestoredAt" | "status">,
): boolean {
  return (
    shot.siteRemoval !== null &&
    shot.siteRemovalRestoredAt === null &&
    shot.status !== "deleted"
  );
}

/** Still in the rally: not deleted and — unless `ghosts` is off — not a ghost. */
export function isLiveShot(
  shot: Pick<LabelShot, "siteRemoval" | "siteRemovalRestoredAt" | "status">,
  ghosts = true,
): boolean {
  return shot.status !== "deleted" && !(ghosts && isGhostShot(shot));
}

/** What `liveShotsInOrder` reads of a stroke: whether it is live, and its order. */
export type LiveOrderableShot = Pick<
  LabelShot,
  | "id"
  | "videoTime"
  | "eventId"
  | "siteRemoval"
  | "siteRemovalRestoredAt"
  | "status"
>;

/** The point's live strokes (`isLiveShot`) in video order. */
export function liveShotsInOrder<T extends LiveOrderableShot>(
  point: { shots: readonly T[] },
  ghosts: boolean,
): T[] {
  return orderLabelShots(
    point.shots.filter((shot) => isLiveShot(shot, ghosts)),
  );
}

/** One `label_points` row with its strokes, already in video order. */
export interface LabelPoint {
  id: string;
  pointIndex: number;
  /**
   * The vendor rallies the point was built from (`label_points.vendor_rally_ids`)
   * — the join key from a derived point's `rally_id` back to this row. Empty
   * for a point the labeller added.
   */
  vendorRallyIds: number[];
  setNumber: number | null;
  gameNumber: number | null;
  server: LabelSide | null;
  serveSide: LabelServeSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  endedBy: LabelSide | null;
  /**
   * What kind of game the point sits in — the same value on every point of
   * the game. Not part of `seed`: a seeded point is always `game`.
   */
  gameType: LabelGameType;
  status: LabelPointStatus;
  /** A tombstone's status before it was deleted — what Undo restores. */
  statusBeforeDelete: Exclude<LabelPointStatus, "deleted"> | null;
  checkedAt: string | null;
  /** The labeller's free-text note on the point (`label_points.note`). */
  note: string | null;
  /**
   * Suggestion keys the labeller dismissed (`label_points.dismissed`):
   * `missing_shot:<afterEventId>`, `missing_point` or
   * `point_ended:<shotId>`. The one stored piece of
   * a mark's life-cycle; the rest is derived from the row's status.
   */
  dismissed: string[];
  /**
   * Whether the labeller fixed the game's start at this point by dragging
   * its header here (`label_points.game_start_locked`, game-boundary.ts).
   * Read only on a game's first live point (`lockedGames`): a locked game is
   * the labeller's word, so no slot offers to move a point across its start,
   * and its points not won by its last point's winner are flagged instead
   * (`lockedGameImbalance`). Not part of `seed`; a seeded point is unlocked.
   */
  gameStartLocked: boolean;
  /**
   * The point's own fields as seeded (set, game, server, serve side, won by,
   * ending, ended by) — what Reset restores and what `unchanged` is measured
   * against. Null for an added point, or one not yet backfilled.
   */
  seed: LabelPointSeedValues | null;
  shots: LabelShot[];
}

export interface LabelSession {
  id: string;
  /** Null once the job row is gone; the labels outlive it. */
  jobId: string | null;
  matchId: string;
  status: "labelling" | "complete";
  derivationVersion: string;
  /** `matches.player1_name` — the p1 side every label row means. */
  player1Name: string;
  player2Name: string;
  /**
   * Whether the match was played with advantage scoring, for the scoreboard:
   * `label_sessions.ad_scoring` as the labeller set it, else the job's
   * `processing_jobs.ad_scoring`, else the match's `matches.format.ad_scoring`,
   * else true (`resolveLabelAdScoring`,
   * ad-scoring.ts).
   */
  adScoring: boolean;
  /**
   * Whether the console computes the derivation's marks for this session
   * (`label_sessions.marks_enabled`). False on the ground-truth session,
   * whose labels were made blind to the derivation and must stay that way.
   */
  marksEnabled: boolean;
  /**
   * Whether a let serve is played on in this match (`matches.format
   * .play_on_lets`): true only when the column holds a literal `true`, so a
   * null or missing format reads as false — lets replayed, the default. Only
   * when false does a serve's result menu offer `Let`.
   */
  playOnLets: boolean;
  /**
   * The match's final score as the labeller read it off the video
   * (`label_sessions.final_score`): one `[p1, p2]` games pair per set. Null
   * until the labeller sets it. What the "Score doesn't add up" chip holds
   * the labelled points against.
   */
  finalScore: number[][] | null;
  /**
   * Whether the video stops before the match does
   * (`label_sessions.video_ends_early`); null until the labeller says.
   */
  videoEndsEarly: boolean | null;
  /**
   * Where the video starts in the match (`label_sessions.start_score`); null
   * when it starts at the beginning. The scoreboard, the set tallies, the
   * shift and pull slots and the publish all count from it.
   */
  startScore: LabelStartScore | null;
  /**
   * The score the match record carries (`matches.score`) — the one the
   * derivation folded the vendor's stream under. Null when the record has
   * none. Read-only here: labels code never writes `matches`.
   */
  matchScore: MatchScore | null;
  /**
   * `matches.format.best_of`, else 3 — which set is the deciding one, for
   * set-scores.ts `matchTiebreakSet` to read a 1–0 deciding set as the
   * 10-point match tiebreak the wizard stores it as.
   */
  bestOf: number;
  /** In `point_index` order. */
  points: LabelPoint[];
}

/** The session's video, signed for this render. */
export interface LabelVideo {
  url: string;
  /**
   * Seconds to SUBTRACT from a label's `videoTime` to seek in this file —
   * `MatchVideo.startTimeSeconds`'s rule for the provider-job lineage: 0 for
   * our own upload, the job's `start_time_seconds` for the vendor's re-encode.
   */
  startTimeSeconds: number;
}

/**
 * Strokes in the order they happened on the video: `videoTime` ascending,
 * a stroke without one after every timed stroke, then the vendor `eventId`
 * (an added stroke, which has none, last), then the row id so two calls
 * always agree.
 *
 * Never `shot_number`: the label tables have no such column, and the one the
 * derivation writes is renumbered after phantom strokes are dropped, so it is
 * exactly the thing a labeller is here to check.
 */
export function orderLabelShots<
  T extends Pick<LabelShot, "id" | "videoTime" | "eventId">,
>(shots: readonly T[]): T[] {
  return [...shots].sort(
    (a, b) =>
      compareNullsLast(a.videoTime, b.videoTime) ||
      compareNullsLast(a.eventId, b.eventId) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

export function compareNullsLast(a: number | null, b: number | null): number {
  if (a === null || b === null) {
    if (a === b) return 0;
    return a === null ? 1 : -1;
  }
  return a - b;
}

/** "N of M points checked": tombstones count in neither. */
export function labelProgress(points: readonly LabelPoint[]): {
  checked: number;
  total: number;
} {
  let checked = 0;
  let total = 0;
  for (const point of points) {
    if (point.status === "deleted") continue;
    total += 1;
    if (point.checkedAt) checked += 1;
  }
  return { checked, total };
}
