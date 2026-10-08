/**
 * The seed for a hand-labelling session: a job's derived transcript turned into
 * `label_points` / `label_shots`-shaped rows, with every vendor stroke frozen
 * beside the label it seeds.
 *
 * Pure; the writes live in seed-session.ts. Every value is a prefill the
 * labeller overwrites, and the scoring script compares the two joined on the
 * vendor `event_id`. Every row also carries `seed`: its own value fields frozen
 * as written, so the console can reset an edited row and see an edit set back.
 * A row the labeller adds has none.
 *
 * Sides are 'p1'/'p2', p1 = matches.player1_id. Coordinates are copied from the
 * transcript unchanged (metres, near baseline at y = 0).
 */

import {
  metersToCourtFrame,
  parseStrokes,
  type DerivedShot,
  type RawSplitStepStroke,
  type SplitStepStroke,
  type Transcript,
} from "@/lib/services/splitstep/derivation";
import {
  compareNullsLast,
  isLabelSpin,
  labelSideOf,
  type LabelSiteRemoval,
  type LabelSpin,
} from "./session";

export type LabelSide = "p1" | "p2";

/** `label_points.ending`, the full CHECK vocabulary. */
export type LabelEnding =
  | "ace"
  | "service_winner"
  | "double_fault"
  | "winner"
  | "error"
  | "let_replayed"
  | "not_a_point";

/** `label_shots.stroke`, the full CHECK vocabulary. */
export type LabelStroke =
  | "first_serve"
  | "second_serve"
  | "forehand"
  | "backhand"
  | "forehand_volley"
  | "backhand_volley"
  | "overhead";

/** `label_shots.result`. */
export type LabelShotResult = "in" | "out" | "net";

/** `label_points.serve_side`. Never seeded — the labeller sets it. */
export type LabelServeSide = "deuce" | "ad";

/**
 * `label_shots.seed`: a shot's value fields exactly as the seed wrote them,
 * frozen, so the console can tell an edit set back from a real change and
 * reset an edited shot (supabase/migrations/20260928190425_label_rows_seed.sql).
 * `unclear` is not a value and is not in it.
 */
export interface LabelShotSeedValues {
  hitter: LabelSide | null;
  stroke: LabelStroke | null;
  result: LabelShotResult | null;
  /**
   * The vendor's `spin_type`, lower-cased ({@link labelSpin}). Added after
   * the other keys: a stored seed without it reads as null
   * (edit.ts `parseLabelShotSeed`), never as no seed.
   */
  spin: LabelSpin | null;
  contact_x: number | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
  video_time: number | null;
}

/** `label_points.seed`: the point's own labelled fields, as seeded. */
export interface LabelPointSeedValues {
  set_number: number | null;
  game_number: number | null;
  server: LabelSide | null;
  serve_side: LabelServeSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
}

/** One `label_shots` row before it has a session or a point id. */
export interface LabelShotSeed {
  event_id: number;
  /** The raw vendor stroke with this event_id, verbatim. */
  vendor: RawSplitStepStroke;
  status: "kept";
  hitter: LabelSide;
  stroke: LabelStroke | null;
  result: LabelShotResult | null;
  spin: LabelSpin | null;
  contact_x: number | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
  video_time: number | null;
  unclear: string[];
  /**
   * `hit_after_fault` on a stroke the derivation removed before building the
   * transcript (`droppedShotsByRally`), null on every transcript shot. Not a
   * value field: it is not in `seed`, not measured for `kept`, and no edit
   * can reach it (edit.ts `LABEL_SHOT_EDIT_FIELDS`).
   */
  site_removal: LabelSiteRemoval | null;
  /** The nine value fields above, frozen — what Reset writes back. */
  seed: LabelShotSeedValues;
}

/** One `label_points` row before it has a session id, plus its strokes. */
export interface LabelPointSeed {
  point_index: number;
  vendor_rally_ids: number[];
  set_number: number;
  game_number: number;
  server: LabelSide;
  /** Null when the derivation could not settle who won the point. */
  winner: LabelSide | null;
  ending: LabelEnding | null;
  /** Who struck the last ball; null when no stroke carries a result. */
  ended_by: LabelSide | null;
  /**
   * Always an ordinary game: the vendor's data cannot tell a tiebreak apart,
   * so the labeller marks those by hand. Not in `seed` — a game-level
   * annotation the `unchanged` comparison and Reset leave alone.
   */
  game_type: "game";
  status: "unchanged";
  /** The point's fields above (serve_side null), frozen for Reset. */
  seed: LabelPointSeedValues;
  /** In video order. Not a column — seed-session.ts attaches the point id. */
  shots: LabelShotSeed[];
}

export interface LabelSeed {
  points: LabelPointSeed[];
}

/**
 * `points.result_type` → `label_points.ending`.
 *
 * The derivation never emits `Ace` (an ace cannot be told from a service
 * winner in the payload — see result-type.ts), so an ace only ever enters the
 * labels by hand. It also folds forced errors into `Unforced Error`, which is
 * why every error collapses to the one `error` ending.
 */
export function labelEnding(resultType: string | null): LabelEnding | null {
  if (resultType === null) return null;
  if (resultType === "Ace") return "ace";
  if (resultType === "Service Winner") return "service_winner";
  if (resultType === "Double Fault") return "double_fault";
  if (/winner$/i.test(resultType)) return "winner";
  if (/error$/i.test(resultType)) return "error";
  return null;
}

/**
 * `shots.shot_type` → `label_shots.stroke`.
 *
 * The derivation files every volley as a bare `Volley` (transcript.ts's
 * `strokeShotType`), so the side comes from the vendor stroke itself. An
 * overhead-side volley is a smash, which the label vocabulary calls overhead.
 */
export function labelStroke(
  shotType: string | null,
  vendorStrokeSide: unknown,
): LabelStroke | null {
  switch (shotType) {
    case "First Serve":
      return "first_serve";
    case "Second Serve":
      return "second_serve";
    case "Forehand":
      return "forehand";
    case "Backhand":
      return "backhand";
    case "Overhead":
      return "overhead";
    case "Volley": {
      const vendorSide =
        typeof vendorStrokeSide === "string"
          ? vendorStrokeSide.trim().toLowerCase()
          : null;
      if (vendorSide === "forehand") return "forehand_volley";
      if (vendorSide === "backhand") return "backhand_volley";
      if (vendorSide === "overhead") return "overhead";
      return null;
    }
    default:
      return null;
  }
}

/** `shots.result` ('In' / 'Out' / 'Net') → `label_shots.result`. */
export function labelShotResult(result: string | null): LabelShotResult | null {
  if (result === "In") return "in";
  if (result === "Out") return "out";
  if (result === "Net") return "net";
  return null;
}

/**
 * The vendor stroke's `spin_type` → `label_shots.spin`: lower-cased, and
 * null for anything outside the four the column accepts (the vendor's
 * `None`, or a value it has not used yet). No auto-fix — the seed copies what
 * the vendor said; the labeller corrects it from the video.
 */
export function labelSpin(spinType: unknown): LabelSpin | null {
  if (typeof spinType !== "string") return null;
  const lowered = spinType.trim().toLowerCase();
  return isLabelSpin(lowered) ? lowered : null;
}

/**
 * Who struck the ball that ended the point: the last stroke, in video order,
 * that the derivation gave a result. Phantom swings at a dead ball carry no
 * result and are skipped; a point whose winner never resolved has no results
 * at all and yields null.
 */
export function endedBy(
  shots: ReadonlyArray<Pick<DerivedShot, "result" | "is_player1">>,
): LabelSide | null {
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    if (shots[i].result !== null) return labelSideOf(shots[i].is_player1);
  }
  return null;
}

/** Stable sort by video_time; a stroke without one keeps its place at the end. */
function inVideoOrder<T extends { video_time: number | null }>(
  items: readonly T[],
): T[] {
  return [...items].sort((a, b) =>
    compareNullsLast(a.video_time, b.video_time),
  );
}

/** What the seed reads off a shot, whether the transcript kept it or not. */
type SeedableShot = Pick<
  DerivedShot,
  | "event_id"
  | "is_player1"
  | "shot_type"
  | "result"
  | "contact_x"
  | "contact_y"
  | "landing_x"
  | "landing_y"
  | "video_time"
>;

/** The parsed vendor strokes by `event_id`; one the parse layer dropped is absent. */
function parsedById(
  rawStrokes: readonly RawSplitStepStroke[],
): Map<number, SplitStepStroke> {
  const parsed = new Map<number, SplitStepStroke>();
  for (const stroke of parseStrokes([...rawStrokes]).strokes) {
    parsed.set(stroke.eventId, stroke);
  }
  return parsed;
}

/**
 * The vendor's bounce in the court frame, when the parse layer kept it. The
 * transcript nulls a landing it would not count for stats (a rally ball more
 * than 6 m wide or 14 m long, transcript.ts `rallyLandingUsable`); the labeller
 * judges those balls, so the seed keeps the bounce and only the parse layer's
 * enclosure guard leaves a landing empty.
 */
function parsedLanding(
  stroke: SplitStepStroke | undefined,
): { x: number; y: number } | null {
  if (!stroke || stroke.bounceX === null || stroke.bounceY === null) {
    return null;
  }
  return metersToCourtFrame(stroke.bounceX, stroke.bounceY);
}

/**
 * The strokes the derivation removed before building the transcript (phantom
 * swings between serves, played.ts), per rally, shaped like the shots it kept:
 * the labeller judges that removal, so the seed is one row per vendor stroke.
 * They carry no result; their landing is the vendor's bounce, for the day one
 * is restored.
 *
 * The transcript's own shots supply which vendor label is player 1 and the trim
 * offset on `video_time`.
 */
function droppedShotsByRally(
  transcript: Transcript,
  parsed: ReadonlyMap<number, SplitStepStroke>,
): Map<number, SeedableShot[]> {
  const kept = new Set<number>();
  const isPlayer1 = new Map<string, boolean>();
  let offset: number | null = null;
  for (const point of transcript.points) {
    for (const shot of point.shots) {
      kept.add(shot.event_id);
      const stroke = parsed.get(shot.event_id);
      if (!stroke) continue;
      isPlayer1.set(stroke.playerLabel, shot.is_player1);
      if (offset === null && shot.video_time !== null) {
        offset = shot.video_time - stroke.videoTime;
      }
    }
  }

  const rallies = new Set(transcript.points.map((p) => p.rally_id));
  const dropped = new Map<number, SeedableShot[]>();
  for (const stroke of parsed.values()) {
    if (kept.has(stroke.eventId) || !rallies.has(stroke.rallyId)) continue;
    const hitter = isPlayer1.get(stroke.playerLabel);
    if (hitter === undefined) continue;
    const contact =
      stroke.playerX !== null && stroke.playerY !== null
        ? metersToCourtFrame(stroke.playerX, stroke.playerY)
        : null;
    const landing = parsedLanding(stroke);
    const list = dropped.get(stroke.rallyId) ?? [];
    list.push({
      event_id: stroke.eventId,
      is_player1: hitter,
      shot_type: droppedShotType(stroke),
      result: null,
      contact_x: contact?.x ?? null,
      contact_y: contact?.y ?? null,
      landing_x: landing?.x ?? null,
      landing_y: landing?.y ?? null,
      video_time: stroke.videoTime + (offset ?? 0),
    });
    dropped.set(stroke.rallyId, list);
  }
  return dropped;
}

/** transcript.ts's `strokeShotType`, which a dropped stroke never went through. */
function droppedShotType(stroke: SplitStepStroke): string | null {
  if (stroke.strokeType === "serve") return null;
  if (stroke.strokeType === "volley") return "Volley";
  if (stroke.strokeSide === "forehand") return "Forehand";
  if (stroke.strokeSide === "backhand") return "Backhand";
  if (stroke.strokeSide === "overhead") return "Overhead";
  return null;
}

/**
 * Build the seed rows for one transcript: one label point per transcript point
 * and one label shot per vendor stroke in that point's rally, the transcript's
 * shots plus the strokes the derivation removed (`droppedShotsByRally`). A
 * stroke the parse layer dropped as unusable is in neither. Throws when a shot
 * has no raw stroke: the transcript and the file were not built from the same
 * payload.
 */
export function buildLabelSeed(
  transcript: Transcript,
  rawStrokes: readonly RawSplitStepStroke[],
): LabelSeed {
  const rawById = new Map<number, RawSplitStepStroke>();
  for (const raw of rawStrokes) {
    if (raw && typeof raw === "object") rawById.set(raw.event_id, raw);
  }

  // `won_by_player1` reads false for a point whose winner never resolved
  // (`winner === player1` with a null winner), so the fold's own record is the
  // only way to tell "player2 won" from "nobody knows". Unknown seeds null
  // rather than a confident p2.
  const resolved = new Map<number, boolean>();
  for (const settled of transcript.reconciliation.settledWinners) {
    resolved.set(settled.rallyId, settled.winner !== null);
  }

  const parsed = parsedById(rawStrokes);
  const dropped = droppedShotsByRally(transcript, parsed);

  const points = transcript.points.map((point, index): LabelPointSeed => {
    // Written unconditionally: a new session defaults to `marks_enabled`, and
    // the mark is what lets the console tell the site's removal from the
    // labeller's own (`status = 'deleted'`).
    const removed = new Set(
      (dropped.get(point.rally_id) ?? []).map((shot) => shot.event_id),
    );
    const ordered = inVideoOrder<SeedableShot>([
      ...point.shots,
      ...(dropped.get(point.rally_id) ?? []),
    ]);
    const shots = ordered.map((shot): LabelShotSeed => {
      const vendor = rawById.get(shot.event_id);
      if (!vendor) {
        throw new Error(
          `results file has no stroke with event_id ${shot.event_id}`,
        );
      }
      // The transcript's landing when it kept one, else the vendor's bounce.
      const landing =
        shot.landing_x !== null && shot.landing_y !== null
          ? { x: shot.landing_x, y: shot.landing_y }
          : parsedLanding(parsed.get(shot.event_id));
      const values = {
        hitter: labelSideOf(shot.is_player1),
        stroke: labelStroke(shot.shot_type, vendor.stroke_side),
        result: labelShotResult(shot.result),
        // Off the raw stroke, so a transcript shot and a dropped stroke read
        // it the same way (the transcript's `spin_type` is the same string).
        spin: labelSpin(vendor.spin_type),
        contact_x: shot.contact_x,
        contact_y: shot.contact_y,
        landing_x: landing?.x ?? null,
        landing_y: landing?.y ?? null,
        video_time: shot.video_time,
      };
      return {
        event_id: shot.event_id,
        vendor,
        status: "kept",
        ...values,
        unclear: [],
        site_removal: removed.has(shot.event_id) ? "hit_after_fault" : null,
        seed: { ...values },
      };
    });

    const row = {
      set_number: point.set_number,
      game_number: point.game_number,
      server: labelSideOf(point.server_is_player1),
      winner: resolved.get(point.rally_id)
        ? labelSideOf(point.won_by_player1)
        : null,
      ending: labelEnding(point.result_type),
      ended_by: endedBy(ordered),
    };
    return {
      point_index: index,
      vendor_rally_ids: [point.rally_id],
      ...row,
      game_type: "game",
      status: "unchanged",
      // serve_side is never seeded (the column stays null), but the frozen
      // seed names it so Reset clears a serve side the labeller set.
      seed: { ...row, serve_side: null },
      shots,
    };
  });

  return { points };
}
