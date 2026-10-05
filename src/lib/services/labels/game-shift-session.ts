/**
 * The labelling console's "move the leftover points to the next game",
 * admin-gated (`game-shift.ts` has the rule).
 *
 * Same shape as point-insert-session.ts: the entry point re-checks
 * `requireAdmin`, runs on the service-role client, refuses a session that is
 * not `labelling` (`checkSessionOpen`, the gate every row operation shares
 * — NOT the marks gate: the leftovers are read off the labeller's own rows,
 * so a session labelled without marks takes the shift too), and decides what
 * to write with the pure plan the console ran for its optimistic rows.
 *
 * The plan needs the session's scoring, which the console reads from
 * `LabelSession.adScoring`: `label_sessions.ad_scoring` as the labeller set
 * it, else the job's `processing_jobs.ad_scoring`, else true — the same
 * `resolveLabelAdScoring` the loader uses, over the same two reads.
 *
 * Its writes are all on `label_points` and nothing else: one UPDATE per
 * moved point, naming `set_number`, `game_number`, `server`, `game_type` and
 * `status`, in the plan's order. Nothing is inserted, nothing removed, no
 * `point_index` moves, and `points` / `shots` / `matches` are never touched.
 * `tests/label-operations.spec.ts` scans this file for a delete.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { resolveLabelAdScoring } from "@/lib/data/labels-server";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import { parseLabelPointSeed } from "./edit";
import {
  planGameShift,
  type GameShiftSummary,
  type GameShiftWrite,
  type ShiftablePoint,
} from "./game-shift";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import type {
  LabelEnding,
  LabelGameType,
  LabelPointStatus,
  LabelServeSide,
  LabelSide,
} from "./session";

export type LabelGameShiftResult = LabelOpResult<{
  /** The moved points as they now stand — the console applies them as is. */
  writes: GameShiftWrite[];
  summary: GameShiftSummary;
}>;

/** What the plan reads of each row of the session. */
interface ShiftRow {
  id: string;
  point_index: number;
  status: LabelPointStatus;
  set_number: number | null;
  game_number: number | null;
  server: LabelSide | null;
  serve_side: LabelServeSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  game_type: LabelGameType;
  seed: unknown;
}

const SHIFT_COLUMNS =
  "id, point_index, status, set_number, game_number, server, serve_side, winner, ending, ended_by, game_type, seed";

function toShiftable(row: ShiftRow): ShiftablePoint {
  return {
    id: row.id,
    pointIndex: row.point_index,
    status: row.status,
    setNumber: row.set_number,
    gameNumber: row.game_number,
    server: row.server,
    serveSide: row.serve_side,
    winner: row.winner,
    ending: row.ending,
    endedBy: row.ended_by,
    gameType: row.game_type ?? "game",
    seed: parseLabelPointSeed(row.seed ?? null),
  };
}

/** The session's scoring, as the loader resolves it. */
async function readAdScoring(
  supabase: AdminClient,
  sessionId: string,
): Promise<{ adScoring: boolean } | { error: string }> {
  const { data: session, error } = await supabase
    .from("label_sessions")
    .select("ad_scoring, job_id")
    .eq("id", sessionId)
    .maybeSingle<{ ad_scoring: boolean | null; job_id: string | null }>();
  if (error) return { error: `Could not read the session: ${error.message}` };
  if (!session) return { error: "Session not found." };
  let jobAdScoring: boolean | null = null;
  if (session.ad_scoring === null && session.job_id) {
    const { data: job, error: jobError } = await supabase
      .from("processing_jobs")
      .select("ad_scoring")
      .eq("id", session.job_id)
      .maybeSingle<{ ad_scoring: boolean | null }>();
    if (jobError) {
      return { error: `Could not read the job's scoring: ${jobError.message}` };
    }
    jobAdScoring = job?.ad_scoring ?? null;
  }
  return { adScoring: resolveLabelAdScoring(session.ad_scoring, jobAdScoring) };
}

/**
 * Check the session, read its scoring and its points, plan the cascade from
 * `fromPointId`, and write each moved point. Never throws.
 */
export async function writeLabelGameShift(params: {
  supabase: AdminClient;
  sessionId: unknown;
  /** A leftover point of the overflowing game. */
  fromPointId: unknown;
}): Promise<LabelGameShiftResult> {
  const { supabase } = params;
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };
  const fromPointId = normaliseId(params.fromPointId);
  if (!fromPointId) return { error: "Invalid point id." };

  const closed = await checkSessionOpen(supabase, sessionId);
  if (closed) return { error: closed };

  const scoring = await readAdScoring(supabase, sessionId);
  if ("error" in scoring) return scoring;

  const { data: rows, error } = await supabase
    .from("label_points")
    .select(SHIFT_COLUMNS)
    .eq("session_id", sessionId)
    .order("point_index")
    .returns<ShiftRow[]>();
  if (error) {
    return { error: `Could not read the session's points: ${error.message}` };
  }

  const plan = planGameShift(
    (rows ?? []).map(toShiftable),
    scoring.adScoring,
    fromPointId,
  );
  if ("error" in plan) return plan;

  for (const write of plan.writes) {
    const { id, ...values } = write;
    const { error: writeError } = await supabase
      .from("label_points")
      .update(values)
      .eq("id", id);
    if (writeError) {
      return { error: `Could not move the points: ${writeError.message}` };
    }
  }
  return { ok: true, writes: plan.writes, summary: plan.summary };
}

/** The admin-gated entry point behind `shiftLabelGameOverflowAction`. */
export function shiftLabelGameOverflow(
  sessionId: unknown,
  fromPointId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelGameShiftResult> {
  return gated(
    deps,
    (supabase) => writeLabelGameShift({ supabase, sessionId, fromPointId }),
    "move the points to the next game",
  );
}
