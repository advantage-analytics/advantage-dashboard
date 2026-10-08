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
 *
 * The later sections read the rows themselves rather than the marks: the
 * games that do not add up (score.ts's rule), the winner flips by direction,
 * what became of the last live stroke's result and landing, the vendor's
 * out-call tails and the serve counts. "Live" is `isLiveShot`: not deleted
 * and, with the session's marks on, not a ghost. The vendor's own calls come
 * from the stroke frozen on each row (`VendorStrokeFacts`), which the caller
 * reads and hands in; without it those sections read nothing.
 */

import { MAX_DEAD_TAIL } from "../splitstep/derivation/flags";
import { isPlausibleCourtPosition } from "../splitstep/derivation/court";
import { NUMERIC_SENTINEL, num } from "../splitstep/derivation/parse";
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
import { serveAfterServeIn } from "./marks-state";
import { gameKey, labelScores, ordinaryGameScore } from "./score";
import { withLiveScoreMarks, type ScoreMarkPoint } from "./score-marks";
import type { LabelEnding, LabelShotResult } from "./seed";
import {
  compareNullsLast,
  isGhostShot,
  isLiveShot,
  isMissedResult,
  isServeStroke,
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

/** One field's seeded value and its labelled one. */
export interface FieldChange<T> {
  from: T;
  to: T;
}

/**
 * A live vendor point the labeller changed with no `count` mark on it to say
 * so: its winner, ending, ended-by, server or game, or any of its strokes.
 */
export interface UnmarkedChange {
  /** The point as the rail numbers it now (`pointIndex + 1`). */
  number: number;
  winner: FieldChange<LabelSide | null> | null;
  ending: FieldChange<LabelEnding | null> | null;
  endedBy: FieldChange<LabelSide | null> | null;
  server: FieldChange<LabelSide | null> | null;
  /** `"{set}·{game}"` as `gameKey` writes it. */
  game: FieldChange<string> | null;
  shots: { edited: number; deleted: number; added: number };
  /** The quieter marks it did carry. */
  hints: LabelMarkCode[];
  hidden: LabelMarkCode[];
}

/** One game the scorecard calls out, named the way the console names it. */
export interface GameRow {
  set: number;
  gameInSet: number;
  /** The rows' `game_number`, match-cumulative in the vendor's data. */
  gameNumber: number;
  /** The first and last point concerned, as the rail numbers them. */
  from: number;
  to: number;
  /** The game's score after its last point, server first: "30–40", "Game–30". */
  score: string;
  /** The game's first server; null when no point names one. */
  server: LabelSide | null;
}

/** Points whose winner moved one way. */
export interface WinnerFlipRow {
  from: LabelSide | null;
  to: LabelSide | null;
  points: number;
}

/** Last live strokes whose result moved one way. */
export interface LastResultChangeRow {
  from: LabelShotResult | null;
  to: LabelShotResult | null;
  points: number;
  /** …where the vendor's own call on the stroke was already `in: false`. */
  vendorOut: number;
}

/** Points whose last live stroke was seeded with no landing. */
export interface LastLandings {
  points: number;
  /** A stroke can sit in more than one of these four. */
  vendorBounce: number;
  vendorPlaceholder: number;
  netHits: number;
  added: number;
  /** …and what the labeller did: placed the landing, or left it empty. */
  placed: number;
  remaining: { in: number; outOrNet: number; noResult: number };
}

export type TailOutcome = "removed" | "partly" | "kept";

/**
 * A checked point where the vendor's last non-serve stroke called `in: false`
 * is followed by one or two more strokes.
 */
export interface OutCallTailRow {
  number: number;
  tail: number;
  outcome: TailOutcome;
}

/** The serve counts that cannot be right. */
export interface ServeFindings {
  /** Points with three or more serves, in the live rows or the vendor's. */
  threeOrMore: number[];
  /** Points where a serve follows a serve the labeller called in. */
  serveAfterIn: number[];
}

/**
 * What the scorecard reads of a raw vendor stroke (`label_shots.vendor`),
 * built by `vendorStrokeFacts`. Null fields are ones the stroke did not carry.
 */
export interface VendorStrokeFacts {
  /** The vendor's own in/out call. */
  in: boolean | null;
  netHit: boolean | null;
  /** The bounce, metres from the net, when it sits inside the enclosure. */
  bounce: { x: number; y: number } | null;
  /** True when the vendor wrote its -9999 placeholder for the bounce. */
  bouncePlaceholder: boolean;
  isServe: boolean;
}

/** Read a raw vendor stroke; null for anything that is not an object. */
export function vendorStrokeFacts(raw: unknown): VendorStrokeFacts | null {
  if (!raw || typeof raw !== "object") return null;
  const stroke = raw as Record<string, unknown>;
  const bool = (value: unknown) => (typeof value === "boolean" ? value : null);
  const placeholder = (value: unknown) =>
    typeof value === "number" && Math.abs(value - NUMERIC_SENTINEL) < 1;
  const x = num(stroke.bounce_x_m);
  const y = num(stroke.bounce_y_m);
  return {
    in: bool(stroke.in),
    netHit: bool(stroke.net_hit),
    bounce:
      x !== null && y !== null && isPlausibleCourtPosition(x, y)
        ? { x, y }
        : null,
    bouncePlaceholder:
      placeholder(stroke.bounce_x_m) || placeholder(stroke.bounce_y_m),
    isServe:
      typeof stroke.stroke_type === "string" &&
      stroke.stroke_type.trim().toLowerCase() === "serve",
  };
}

export interface ScorecardOptions {
  /** The session's scoring, for the games section. */
  adScoring?: boolean;
  /**
   * Whether a site-removed stroke is a ghost rather than a row — true with
   * the session's marks on, as `isLiveShot` reads it.
   */
  ghosts?: boolean;
  /** The vendor's strokes by label shot id; a shot not here has none. */
  vendor?: ReadonlyMap<string, VendorStrokeFacts>;
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
  unmarkedChanges: UnmarkedChange[];
  seededInLastStrokes: SeededInLastStroke[];
  deletedShots: DeletedShotRow[];
  games: { undecided: GameRow[]; overflow: GameRow[] };
  winnerFlips: WinnerFlipRow[];
  lastResultChanges: LastResultChangeRow[];
  lastLandings: LastLandings;
  outCallTails: OutCallTailRow[];
  serves: ServeFindings;
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

/** `from`/`to` when they differ, else null. */
function changed<T>(from: T, to: T): FieldChange<T> | null {
  return from === to ? null : { from, to };
}

/**
 * The point's changes field by field, for the unmarked list; null when
 * nothing changed. Only a live vendor point has a seed to be read against.
 */
function fieldChanges(
  point: LabelPoint,
): Omit<UnmarkedChange, "number" | "hints" | "hidden"> | null {
  if (point.status === "deleted" || point.seed === null) return null;
  const seed = point.seed;
  const now = labelPointFields(point);
  const shots = { edited: 0, deleted: 0, added: 0 };
  for (const shot of point.shots) {
    if (shot.status === "added") shots.added += 1;
    else if (shot.status === "deleted") shots.deleted += 1;
    else if (shotChangedFromSeed(shot)) shots.edited += 1;
  }
  const change = {
    winner: changed(seed.winner, now.winner),
    ending: changed(seed.ending, now.ending),
    endedBy: changed(seed.ended_by, now.ended_by),
    server: changed(seed.server, now.server),
    game: changed(
      gameKey({ setNumber: seed.set_number, gameNumber: seed.game_number }),
      gameKey({ setNumber: now.set_number, gameNumber: now.game_number }),
    ),
    shots,
  };
  const any =
    change.winner ||
    change.ending ||
    change.endedBy ||
    change.server ||
    change.game ||
    shots.edited + shots.deleted + shots.added > 0;
  return any ? change : null;
}

/**
 * The ordinary games that end undecided, and the ones with live points after
 * the point that decided them — the same reading as the scoreboard's
 * "Game–30" and game-shift.ts, by the session's scoring. The band says which
 * games; the walk only names the points concerned.
 */
function gameFindings(
  points: readonly LabelPoint[],
  adScoring: boolean,
): Scorecard["games"] {
  const members = new Map<string, LabelPoint[]>();
  for (const point of points) {
    if (point.status === "deleted") continue;
    if (point.setNumber === null || point.gameNumber === null) continue;
    const key = gameKey(point);
    const list = members.get(key);
    if (list) list.push(point);
    else members.set(key, [point]);
  }
  const undecided: GameRow[] = [];
  const overflow: GameRow[] = [];
  for (const band of labelScores(points, adScoring).games) {
    if (band.gameType !== "game") continue;
    const game = members.get(gameKey(band)) ?? [];
    const server = game[0]?.server ?? null;
    const row = (concerned: LabelPoint[]): GameRow => ({
      set: band.setNumber,
      gameInSet: band.gameInSet,
      gameNumber: band.gameNumber,
      from: concerned[0].pointIndex + 1,
      to: concerned[concerned.length - 1].pointIndex + 1,
      score: ordinaryGameScore(band.points, band.decidedBy, server ?? "p1"),
      server,
    });
    if (band.decidedBy === null) undecided.push(row(game));
    // The live rows past the settling one are the game's last `extra`.
    if (band.outcome.kind === "overflow") {
      overflow.push(row(game.slice(-band.outcome.extra)));
    }
  }
  return { undecided, overflow };
}

/** `"p1→p2"`, the one key a direction goes by. */
const direction = (from: unknown, to: unknown) => `${from}→${to}`;

/** The last stroke still in the rally, in the order the rows hold now. */
function lastLiveShot(point: LabelPoint, ghosts: boolean): LabelShot | null {
  return point.shots.findLast((shot) => isLiveShot(shot, ghosts)) ?? null;
}

/**
 * The checked point's out-call tail: how many vendor strokes of `rally` (its
 * `seededOrder`) follow the vendor's last non-serve stroke called `in: false`,
 * and whether the labeller removed them. Null when there is no such stroke or
 * the tail is not 1–2.
 */
function outCallTail(
  rally: readonly LabelShot[],
  vendor: ReadonlyMap<string, VendorStrokeFacts>,
): Omit<OutCallTailRow, "number"> | null {
  const outCall = rally.findLastIndex((shot) => {
    const facts = vendor.get(shot.id);
    return facts !== undefined && !facts.isServe && facts.in === false;
  });
  if (outCall < 0) return null;
  const tail = rally.slice(outCall + 1);
  if (tail.length < 1 || tail.length > MAX_DEAD_TAIL) return null;
  const removed = tail.filter(
    (shot) => shot.status === "deleted" || isGhostShot(shot),
  ).length;
  return {
    tail: tail.length,
    outcome:
      removed === tail.length ? "removed" : removed === 0 ? "kept" : "partly",
  };
}

/** Whether a stroke is a serve by the vendor's word, else by its seed. */
function isVendorServe(
  shot: LabelShot,
  vendor: ReadonlyMap<string, VendorStrokeFacts>,
): boolean {
  const facts = vendor.get(shot.id);
  if (facts) return facts.isServe;
  return isServeStroke(shot.seed ? shot.seed.stroke : shot.stroke);
}

/**
 * Build the scorecard.
 *
 * `points` are the session's rows as `getLabelSession` returns them
 * (tombstones included). `marks` are `openingMarks` for those rows: every
 * code, hidden ones too, and the score marks of the seeded score. `options`
 * carry the session's scoring and the vendor's strokes; without them the
 * games read ad scoring and the vendor sections read nothing.
 */
export function buildScorecard(
  points: readonly LabelPoint[],
  marks: LabelMarks,
  options: ScorecardOptions = {},
): Scorecard {
  const { adScoring = true, ghosts = true, vendor = new Map() } = options;
  const rows = new Map<string, ScorecardRow>();
  const unmarkedChanges: UnmarkedChange[] = [];
  const seededInLastStrokes: SeededInLastStroke[] = [];
  const deleted = new Map<string, DeletedShotRow>();
  const summary = { live: 0, added: 0, deleted: 0, changed: 0 };
  const flips = new Map<string, WinnerFlipRow>();
  const resultChanges = new Map<string, LastResultChangeRow>();
  const lastLandings: LastLandings = {
    points: 0,
    vendorBounce: 0,
    vendorPlaceholder: 0,
    netHits: 0,
    added: 0,
    placed: 0,
    remaining: { in: 0, outOrNet: 0, noResult: 0 },
  };
  const outCallTails: OutCallTailRow[] = [];
  const serves: ServeFindings = { threeOrMore: [], serveAfterIn: [] };

  for (const point of points) {
    const change = pointChange(point);
    const number = point.pointIndex + 1;
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
    const fields = fieldChanges(point);
    if (fields && !own.some((m) => m.tier === "count")) {
      const codes = (tier: LabelMarkTier) => [
        ...new Set(own.filter((m) => m.tier === tier).map((m) => m.code)),
      ];
      unmarkedChanges.push({
        number,
        ...fields,
        hints: codes("hint"),
        hidden: codes("hidden"),
      });
    }
    if (change.winner && point.seed) {
      const key = direction(point.seed.winner, point.winner);
      const row = flips.get(key) ?? {
        from: point.seed.winner,
        to: point.winner,
        points: 0,
      };
      row.points += 1;
      flips.set(key, row);
    }

    // The last stroke still in the rally: its result against its seed, and
    // its landing when the seed had none.
    const last =
      point.status === "deleted" ? null : lastLiveShot(point, ghosts);
    if (last) {
      const facts = vendor.get(last.id);
      if (last.seed && last.seed.result !== last.result) {
        const key = direction(last.seed.result, last.result);
        const row = resultChanges.get(key) ?? {
          from: last.seed.result,
          to: last.result,
          points: 0,
          vendorOut: 0,
        };
        row.points += 1;
        if (facts?.in === false) row.vendorOut += 1;
        resultChanges.set(key, row);
      }
      const added = last.status === "added";
      const unseeded =
        last.seed !== null &&
        (last.seed.landing_x === null || last.seed.landing_y === null);
      if (added || unseeded) {
        lastLandings.points += 1;
        if (added) lastLandings.added += 1;
        if (facts?.bounce) lastLandings.vendorBounce += 1;
        if (facts?.bouncePlaceholder) lastLandings.vendorPlaceholder += 1;
        if (facts?.netHit) lastLandings.netHits += 1;
        if (last.landingX !== null && last.landingY !== null) {
          lastLandings.placed += 1;
        } else if (last.result === "in") {
          lastLandings.remaining.in += 1;
        } else if (isMissedResult(last.result)) {
          lastLandings.remaining.outOrNet += 1;
        } else {
          lastLandings.remaining.noResult += 1;
        }
      }
    }

    const seeded = seededOrder(point);
    if (point.status !== "deleted" && point.checkedAt !== null) {
      const tail = outCallTail(seeded, vendor);
      if (tail) outCallTails.push({ number, ...tail });
    }

    if (point.status !== "deleted") {
      const live = point.shots.filter((shot) => isLiveShot(shot, ghosts));
      const liveServes = live.filter((shot) =>
        isServeStroke(shot.stroke),
      ).length;
      const vendorServes = point.shots.filter(
        (shot) => shot.eventId !== null && isVendorServe(shot, vendor),
      ).length;
      if (liveServes >= 3 || vendorServes >= 3) serves.threeOrMore.push(number);
      if (serveAfterServeIn(point, ghosts)) serves.serveAfterIn.push(number);
    }

    // The last stroke as it was SEEDED: by seeded time, with a seeded result.
    const seededLast = seeded.findLast(
      (shot) => shot.seed !== null && shot.seed.result !== null,
    );
    if (seededLast?.seed?.result === "in") {
      const byCoordinates = seededOutOrNet(seededLast);
      if (byCoordinates) {
        seededInLastStrokes.push({
          number,
          byCoordinates,
          labelled:
            seededLast.status === "deleted" ? "deleted" : seededLast.result,
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
  const byPoints = <T extends { points: number }>(list: T[]) =>
    list.sort((a, b) => b.points - a.points);
  return {
    points: summary,
    rows: [...rows.values()].sort(
      (a, b) =>
        TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier) ||
        codeOrder.indexOf(a.code) - codeOrder.indexOf(b.code),
    ),
    unmarkedChanges,
    seededInLastStrokes,
    deletedShots: [...deleted.values()].sort((a, b) => b.deleted - a.deleted),
    games: gameFindings(points, adScoring),
    winnerFlips: byPoints([...flips.values()]),
    lastResultChanges: byPoints([...resultChanges.values()]),
    lastLandings,
    outCallTails,
    serves,
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

const codeList = (codes: readonly LabelMarkCode[]): string =>
  codes.length === 0 ? "none" : codes.map((code) => `\`${code}\``).join(", ");

const pointList = (numbers: readonly number[]): string =>
  numbers.length === 0 ? "none" : numbers.join(", ");

/** "winner Kim→Quan; ending winner→error; 2 shots edited, 1 deleted". */
function describeChange(
  change: UnmarkedChange,
  names: Record<LabelSide, string>,
): string {
  const parts: string[] = [];
  const arrow = <T>(
    label: string,
    field: FieldChange<T> | null,
    show: (v: T) => string,
  ) => {
    if (field) parts.push(`${label} ${show(field.from)}→${show(field.to)}`);
  };
  const side = (v: LabelSide | null) => sideName(v, names);
  arrow("winner", change.winner, side);
  arrow("ending", change.ending, (v) => v ?? "none");
  arrow("ended by", change.endedBy, side);
  arrow("server", change.server, side);
  arrow("game", change.game, (v) => v);
  const shots: string[] = [];
  const { edited, deleted, added } = change.shots;
  if (edited) shots.push(`${edited} edited`);
  if (deleted) shots.push(`${deleted} deleted`);
  if (added) shots.push(`${added} added`);
  if (shots.length) {
    const total = edited + deleted + added;
    parts.push(`${total === 1 ? "shot" : "shots"}: ${shots.join(", ")}`);
  }
  return parts.join("; ");
}

/** "79–83", or "79" when the range is one point. */
const pointRange = (row: GameRow): string =>
  row.from === row.to ? `${row.from}` : `${row.from}–${row.to}`;

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
    "## Changed with no `count` mark on the point",
    "",
    "A vendor point whose winner, ending, ended-by, server or game the labeller changed, or any of whose strokes they edited, deleted or added, with no amber chip on it.",
    "",
  );
  out.push(
    card.unmarkedChanges.length === 0
      ? "None: every change sat under an amber chip."
      : table(
          ["Point", "What changed", "Hints on it", "Hidden marks on it"],
          card.unmarkedChanges.map((row) => [
            row.number,
            describeChange(row, names),
            codeList(row.hints),
            codeList(row.hidden),
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

  // ── Games ──
  const gameTable = (rows: GameRow[]) =>
    table(
      ["Set", "Game", "Match game", "Points", "Score (server first)", "Server"],
      rows.map((row) => [
        row.set,
        row.gameInSet,
        row.gameNumber,
        pointRange(row),
        row.score,
        sideName(row.server, names),
      ]),
    );
  const gameLines = (lead: string, rows: GameRow[]) =>
    rows.length === 0
      ? [`${lead}: none.`, ""]
      : [lead, "", gameTable(rows), ""];
  out.push(
    "## Games",
    "",
    "Read off the labelled rows by the session's scoring: a game is in the set's order, its match game number is the vendor's. Tiebreaks are not read.",
    "",
    ...gameLines(
      "**Games undecided after their last point**",
      card.games.undecided,
    ),
    ...gameLines(
      "**Games with points after the one that decided them** (the points listed are the ones past it)",
      card.games.overflow,
    ),
  );

  // ── Winner flips ──
  out.push("## Winner flips by direction", "");
  const flipped = card.winnerFlips.reduce((sum, row) => sum + row.points, 0);
  out.push(
    card.winnerFlips.length === 0
      ? "None."
      : `${flipped} ${flipped === 1 ? "point" : "points"}.`,
  );
  if (card.winnerFlips.length) {
    out.push(
      "",
      table(
        ["Seeded winner", "Labelled winner", "Points"],
        card.winnerFlips.map((row) => [
          sideName(row.from, names),
          sideName(row.to, names),
          row.points,
        ]),
      ),
    );
  }

  // ── Last-stroke result changes ──
  out.push("", "## Last-stroke result changes", "");
  const resultChanged = card.lastResultChanges.reduce(
    (sum, row) => sum + row.points,
    0,
  );
  if (resultChanged === 0) {
    out.push("None: every last live stroke keeps its seeded result.");
  } else {
    const inToMissed = card.lastResultChanges.filter(
      (row) => row.from === "in" && isMissedResult(row.to),
    );
    const moved = inToMissed.reduce((sum, row) => sum + row.points, 0);
    const vendorOut = inToMissed.reduce((sum, row) => sum + row.vendorOut, 0);
    out.push(
      `${resultChanged} points whose last live stroke has a result other than its seeded one; ${share(moved, resultChanged)} went in→out or net, and the vendor's own call on ${share(vendorOut, moved)} of those was already out.`,
      "",
      table(
        ["Seeded", "Labelled", "Points", "Vendor already said out"],
        card.lastResultChanges.map((row) => [
          row.from ?? "no result",
          row.to ?? "no result",
          row.points,
          share(row.vendorOut, row.points),
        ]),
      ),
    );
  }

  // ── Last landings ──
  const landings = card.lastLandings;
  out.push("", "## Last landings", "");
  if (landings.points === 0) {
    out.push("None: every last live stroke was seeded with a landing.");
  } else {
    const n = landings.points;
    out.push(
      `${n} points whose last live stroke was seeded with no landing. A stroke can sit in more than one row of the first table.`,
      "",
      table(
        ["Where the seed's landing went", "Points"],
        [
          [
            "Vendor had a bounce inside the enclosure",
            share(landings.vendorBounce, n),
          ],
          [
            "Vendor wrote its placeholder",
            share(landings.vendorPlaceholder, n),
          ],
          ["Vendor called it a net hit", share(landings.netHits, n)],
          ["Stroke added by the labeller", share(landings.added, n)],
        ],
      ),
      "",
      table(
        ["What the labeller did", "Points"],
        [
          ["Placed the landing", share(landings.placed, n)],
          ["Left it empty, result in", share(landings.remaining.in, n)],
          [
            "Left it empty, result out or net",
            share(landings.remaining.outOrNet, n),
          ],
          ["Left it empty, no result", share(landings.remaining.noResult, n)],
        ],
      ),
    );
  }

  // ── Out-call tails ──
  out.push("", "## Out-call tails", "");
  if (card.outCallTails.length === 0) {
    out.push(
      "None: no checked point has one or two vendor strokes after the vendor's last out call.",
    );
  } else {
    const count = (outcome: TailOutcome) =>
      card.outCallTails.filter((row) => row.outcome === outcome).length;
    const n = card.outCallTails.length;
    out.push(
      `${n} checked points where the vendor's last non-serve stroke called out is followed by one or two more strokes. The labeller removed the whole tail on ${share(count("removed"), n)}, part of it on ${share(count("partly"), n)}, and kept it on ${share(count("kept"), n)}.`,
      "",
      table(
        ["Point", "Strokes after the out call", "Labeller"],
        card.outCallTails.map((row) => [row.number, row.tail, row.outcome]),
      ),
    );
  }

  // ── Serves ──
  out.push(
    "",
    "## Serves",
    "",
    `Points with three or more serves, in the live rows or the vendor's: ${pointList(card.serves.threeOrMore)}.`,
    "",
    `Points where a serve follows a serve the labeller called in: ${pointList(card.serves.serveAfterIn)}.`,
    "",
  );
  return out.join("\n");
}
