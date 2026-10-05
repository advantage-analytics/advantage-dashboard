/**
 * The labelling console's "move the leftover points to the next game",
 * admin-gated (`game-shift.ts` has the rule).
 *
 * Same shape as point-insert-session.ts: the entry point re-checks
 * `requireAdmin`, runs on the service-role client, refuses a session that is
 * not `labelling` (the same gate every row operation shares, read here with
 * the session's scoring in one go — NOT the marks gate: the leftovers are
 * read off the labeller's own rows, so a session labelled without marks
 * takes the shift too), and decides what to write with the pure plan the
 * console ran for its optimistic rows.
 *
 * The plan needs the session's scoring, which the console reads from
 * `LabelSession.adScoring`: `label_sessions.ad_scoring` as the labeller set
 * it, else the job's `processing_jobs.ad_scoring`, else true — the same
 * `resolveLabelAdScoring` the loader uses (ad-scoring.ts).
 *
 * Its writes are all on `label_points` and nothing else: one UPDATE per
 * destination the plan names, by id list (`groupWrites`), setting
 * `set_number`, `game_number`, `server`, `game_type` and `status`, in the
 * plan's order. Nothing is inserted, nothing removed, no `point_index`
 * moves, and `points` / `shots` / `matches` are never touched.
 * `tests/label-operations.spec.ts` scans this file for a delete.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import { readJobAdScoring, resolveLabelAdScoring } from "./ad-scoring";
import {
  FROZEN,
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import {
  GAME_COLUMNS,
  toGamePoint,
  type GameRow,
} from "./game-operations-session";
import { planGameShift, type GameShiftWrite } from "./game-shift";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";

export type LabelGameShiftResult = LabelOpResult<{
  /** The moved points as they now stand — the console applies them as is. */
  writes: GameShiftWrite[];
}>;

/** What the shift reads of the session row, in one read. */
interface ShiftSessionRow {
  status: string;
  ad_scoring: boolean | null;
  job_id: string | null;
}

/**
 * The plan's writes grouped by what they write — every point moving into
 * one game with one server takes the same values — in the order the plan
 * first names each destination, so one UPDATE by id list serves each group.
 */
function groupWrites(
  writes: readonly GameShiftWrite[],
): { values: Omit<GameShiftWrite, "id">; ids: string[] }[] {
  const groups = new Map<
    string,
    { values: Omit<GameShiftWrite, "id">; ids: string[] }
  >();
  for (const { id, ...values } of writes) {
    const key = JSON.stringify([
      values.set_number,
      values.game_number,
      values.server,
      values.game_type,
      values.status,
    ]);
    const group = groups.get(key);
    if (group) group.ids.push(id);
    else groups.set(key, { values, ids: [id] });
  }
  return [...groups.values()];
}

/**
 * Check the session, read its points and its scoring together, plan the
 * cascade from `fromPointId`, and write each destination's points. Never
 * throws.
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

  // One read of the session: its gate and what its scoring resolves from.
  const { data: session, error: sessionError } = await supabase
    .from("label_sessions")
    .select("status, ad_scoring, job_id")
    .eq("id", sessionId)
    .maybeSingle<ShiftSessionRow>();
  if (sessionError) {
    return { error: `Could not read the session: ${sessionError.message}` };
  }
  if (!session) return { error: "Session not found." };
  if (session.status !== "labelling") return { error: FROZEN };

  const [points, job] = await Promise.all([
    supabase
      .from("label_points")
      .select(GAME_COLUMNS)
      .eq("session_id", sessionId)
      .order("point_index")
      .returns<GameRow[]>(),
    readJobAdScoring(supabase, session),
  ]);
  if (job.error) {
    return { error: `Could not read the job's scoring: ${job.error.message}` };
  }
  if (points.error) {
    return {
      error: `Could not read the session's points: ${points.error.message}`,
    };
  }

  const plan = planGameShift(
    (points.data ?? []).map(toGamePoint),
    resolveLabelAdScoring(session.ad_scoring, job.data?.ad_scoring),
    fromPointId,
  );
  if ("error" in plan) return plan;

  for (const group of groupWrites(plan.writes)) {
    const { error: writeError } = await supabase
      .from("label_points")
      .update(group.values)
      .in("id", group.ids);
    if (writeError) {
      return { error: `Could not move the points: ${writeError.message}` };
    }
  }
  return { ok: true, writes: plan.writes };
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
