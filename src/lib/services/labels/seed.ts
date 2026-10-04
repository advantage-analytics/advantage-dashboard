/**
 * The seed for a hand-labelling session: a job's derived transcript turned
 * into `label_points` / `label_shots`-shaped rows, with every vendor stroke
 * frozen beside the label it seeds.
 *
 * Pure. It reads a transcript and the raw results array and returns rows; the
 * writes live in seed-session.ts. Every value here is a PREFILL — the labeller
 * overwrites whatever the video contradicts, and the scoring script compares
 * the two joined on the vendor `event_id` (see
 * supabase/migrations/20260928190122_label_sessions.sql).
 *
 * Every row also carries `seed`: its own value fields, frozen as written, so
 * the console can reset an edited row and see an edit set back
 * (edit.ts `labelShotStatusAfterPatch`). A row the labeller adds has none.
 *
 * Sides are 'p1'/'p2', p1 = matches.player1_id, exactly as the transcript's
 * `is_player1` / `server_is_player1` / `won_by_player1` already mean.
 * Coordinates are copied from the transcript unchanged: they are already in
 * the `shots` frame (metres, near baseline at y = 0).
 */

import {
  metersToCourtFrame,
  parseStrokes,
  type DerivedShot,
  type RawSplitStepStroke,
  type SplitStepStroke,
  type Transcript,
} from "@/lib/services/splitstep/derivation";

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
  contact_x: number | null;
  contact_y: number | null;
  landing_x: number | null;
  landing_y: number | null;
  video_time: number | null;
  unclear: string[];
  /** The eight value fields above, frozen — what Reset writes back. */
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
  status: "unchanged";
  /** The point's fields above (serve_side null), frozen for Reset. */
  seed: LabelPointSeedValues;
  /** In video order. Not a column — seed-session.ts attaches the point id. */
  shots: LabelShotSeed[];
}

export interface LabelSeed {
  points: LabelPointSeed[];
}

const side = (isPlayer1: boolean): LabelSide => (isPlayer1 ? "p1" : "p2");

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
 * Who struck the ball that ended the point: the last stroke, in video order,
 * that the derivation gave a result. Phantom swings at a dead ball carry no
 * result and are skipped; a point whose winner never resolved has no results
 * at all and yields null.
 */
export function endedBy(
  shots: ReadonlyArray<Pick<DerivedShot, "result" | "is_player1">>,
): LabelSide | null {
  for (let i = shots.length - 1; i >= 0; i -= 1) {
    if (shots[i].result !== null) return side(shots[i].is_player1);
  }
  return null;
}

/** Stable sort by video_time; a stroke without one keeps its place at the end. */
function inVideoOrder<T extends { video_time: number | null }>(
  items: readonly T[],
): T[] {
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => {
      const at = a.item.video_time;
      const bt = b.item.video_time;
      if (at === null || bt === null) {
        if (at === bt) return a.i - b.i;
        return at === null ? 1 : -1;
      }
      return at - bt || a.i - b.i;
    })
    .map(({ item }) => item);
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

/**
 * The strokes the derivation removed before building the transcript (phantom
 * swings between serves — played.ts), per rally, shaped like the shots it kept.
 *
 * The labeller judges that removal, so the console has to show what was
 * removed: the seed is one row per vendor stroke, not per cleaned shot. They
 * carry no result and no landing — the derivation never gave them either.
 *
 * The transcript's own shots supply the two things a raw stroke does not say:
 * which vendor label is player 1, and the trim offset on `video_time`.
 */
function droppedShotsByRally(
  transcript: Transcript,
  rawStrokes: readonly RawSplitStepStroke[],
): Map<number, SeedableShot[]> {
  const parsed = new Map<number, SplitStepStroke>();
  for (const stroke of parseStrokes([...rawStrokes]).strokes) {
    parsed.set(stroke.eventId, stroke);
  }

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
    const list = dropped.get(stroke.rallyId) ?? [];
    list.push({
      event_id: stroke.eventId,
      is_player1: hitter,
      shot_type: droppedShotType(stroke),
      result: null,
      contact_x: contact?.x ?? null,
      contact_y: contact?.y ?? null,
      landing_x: null,
      landing_y: null,
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
 * Build the seed rows for one transcript.
 *
 * One label point per transcript point and one label shot per vendor stroke
 * in that point's rally — the transcript's shots plus the strokes the
 * derivation removed (`droppedShotsByRally`), so no auto-fix is already
 * applied to what the labeller sees. A stroke the parse layer dropped as
 * unusable is in neither and has nothing to label against. Throws when a
 * shot has no raw stroke, because that means the transcript and the file
 * were not built from the same payload.
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

  const dropped = droppedShotsByRally(transcript, rawStrokes);

  const points = transcript.points.map((point, index): LabelPointSeed => {
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
      const values = {
        hitter: side(shot.is_player1),
        stroke: labelStroke(shot.shot_type, vendor.stroke_side),
        result: labelShotResult(shot.result),
        contact_x: shot.contact_x,
        contact_y: shot.contact_y,
        landing_x: shot.landing_x,
        landing_y: shot.landing_y,
        video_time: shot.video_time,
      };
      return {
        event_id: shot.event_id,
        vendor,
        status: "kept",
        ...values,
        unclear: [],
        seed: { ...values },
      };
    });

    const row = {
      set_number: point.set_number,
      game_number: point.game_number,
      server: side(point.server_is_player1),
      winner: resolved.get(point.rally_id) ? side(point.won_by_player1) : null,
      ending: labelEnding(point.result_type),
      ended_by: endedBy(ordered),
    };
    return {
      point_index: index,
      vendor_rally_ids: [point.rally_id],
      ...row,
      status: "unchanged",
      // serve_side is never seeded (the column stays null), but the frozen
      // seed names it so Reset clears a serve side the labeller set.
      seed: { ...row, serve_side: null },
      shots,
    };
  });

  return { points };
}
