/**
 * The console's "move the leftover points to the next game" and "pull the
 * next game's points into this one" (`game-shift.ts` has both rules).
 * Admin-gated like edit-session.ts; not the marks gate, since the leftovers
 * and the short games are read off the labeller's own rows.
 *
 * The plan is run twice: once over the points alone to learn whether any moves
 * under a new server, then, only when one does, again with the session's shot
 * rows attached so the players' swap (player-swap.ts) can read them.
 *
 * Writes `label_points` and `label_shots` only: one UPDATE per destination by
 * id list (`groupWrites`), each compare-and-set on the status its points were
 * read with, then the flipped strokes (`writeShotSwaps`). Nothing is inserted
 * or removed and no `point_index` moves.
 */

import { planTiebreakFold, tiebreakFolds } from "./tiebreak-fold";
import { readAllPages } from "@/lib/data/admin-range-read";
import { parseMatchScore, readBestOf } from "@/lib/data/labels-server";
import { matchTiebreakSet } from "./set-scores";
import type { AdminClient } from "@/lib/supabase/admin";
import {
  readJobAdScoring,
  readFormatAdScoring,
  resolveLabelAdScoring,
} from "./ad-scoring";
import {
  FROZEN,
  defaultLabelWriteDependencies,
  racedMessage,
  type LabelWriteDependencies,
} from "./edit-session";
import {
  GAME_COLUMNS,
  toGamePoint,
  type GameRow,
} from "./game-operations-session";
import {
  planGamePull,
  planGameShift,
  planGameSplit,
  type GameShiftWrite,
  type ShiftPoint,
} from "./game-shift";
import {
  gated,
  idChunks,
  normaliseId,
  withShots,
  writeShotSwaps,
  type LabelOpResult,
} from "./operations-session";
import type { ShotSwapWrite } from "./player-swap";
import { LABEL_SHOT_COLUMNS, toLabelShot, type LabelShotRow } from "./rows";
import type { LabelPointStatus, LabelShot } from "./session";

/**
 * Every shot row of the session, as the console's rows. Paged
 * (`readAllPages`, in a stable `id` order) because PostgREST caps one
 * response at 1000 rows and a long match holds more strokes than that.
 */
async function readShotsOfSession(
  supabase: AdminClient,
  sessionId: string,
): Promise<{ shots: LabelShot[] } | { error: string }> {
  try {
    const rows = await readAllPages<LabelShotRow>(
      supabase
        .from("label_shots")
        .select(LABEL_SHOT_COLUMNS)
        .eq("session_id", sessionId)
        .order("id"),
      "Could not read the session's shots",
    );
    return { shots: rows.map(toLabelShot) };
  } catch (cause) {
    return {
      error:
        cause instanceof Error
          ? cause.message
          : "Could not read the session's shots",
    };
  }
}

export type LabelGameShiftResult = LabelOpResult<{
  /** The moved points as they now stand — the console applies them as is. */
  writes: GameShiftWrite[];
  /** The strokes flipped with their points' players; empty when none. */
  shots: ShotSwapWrite[];
}>;

interface ShiftSessionRow {
  status: string;
  ad_scoring: boolean | null;
  job_id: string | null;
  match_id: string | null;
}

/** The match row the fold reads: the entered score and the format. */
interface MatchScoreRow {
  score: unknown;
  format: unknown;
}

/** One UPDATE's worth of moved points: the values, the status they were read with, their ids. */
interface WriteGroup {
  values: Omit<GameShiftWrite, "id">;
  was: LabelPointStatus;
  ids: string[];
}

/**
 * The plan's writes grouped by what they write — every point moving into
 * one game with one server takes the same values — and by the status each
 * point was read with (`statusOf`), in the order the plan first names each
 * destination, so one compare-and-set UPDATE by id list serves each group.
 * A point whose players switch carries its flipped winner and ended by, and
 * groups only with points flipped the same way: a column the write leaves
 * out is keyed apart from one it sets to null (JSON would print both as
 * null), so a swapped point whose winner is blank never nulls the winner of
 * an unswapped one.
 */
function groupWrites(
  writes: readonly GameShiftWrite[],
  statusOf: ReadonlyMap<string, LabelPointStatus>,
): WriteGroup[] {
  const groups = new Map<string, WriteGroup>();
  const presence = (
    name: "winner" | "ended_by",
    values: Omit<GameShiftWrite, "id">,
  ) => (name in values ? ["set", values[name] ?? null] : ["absent"]);
  for (const { id, ...values } of writes) {
    // Every write names a point the plan was handed; the fallback never runs.
    const was = statusOf.get(id) ?? "unchanged";
    const key = JSON.stringify([
      values.set_number,
      values.game_number,
      values.server,
      values.game_type,
      values.status,
      presence("winner", values),
      presence("ended_by", values),
      was,
    ]);
    const group = groups.get(key);
    if (group) group.ids.push(id);
    else groups.set(key, { values, was, ids: [id] });
  }
  return [...groups.values()];
}

/** What either plan hands the writer: the moved points and flipped strokes. */
type GamePlan =
  | { ok: true; writes: GameShiftWrite[]; shots: ShotSwapWrite[] }
  | { error: string };

/**
 * The run every write here shares: the session's gate and scoring in one
 * read, the points, the plan — twice when a point changes server — then the
 * grouped writes and the flipped strokes. `plan` is the pure rule over the
 * rows.
 *
 * The match row is read once, its `score` beside its `format` (`readMatchScore`,
 * in place of the scoring fallback's own read): the format is the scoring's
 * last fallback, and the score hands the plan the deciding set the match
 * record spells as a match tiebreak (set-scores.ts `matchTiebreakSet`) —
 * the same set the console plans with, so the shift and pull leave its
 * vendor-cut games alone as the console's slots do. A session with no match
 * reads nothing and the plan is handed null.
 */
async function runGamePlan(
  supabase: AdminClient,
  sessionId: string,
  plan: (
    points: readonly ShiftPoint[],
    adScoring: boolean,
    matchTiebreakSet: number | null,
  ) => GamePlan,
  failed: string,
): Promise<LabelGameShiftResult> {
  // One read of the session: its gate and what its scoring resolves from.
  const { data: session, error: sessionError } = await supabase
    .from("label_sessions")
    .select("status, ad_scoring, job_id, match_id")
    .eq("id", sessionId)
    .maybeSingle<ShiftSessionRow>();
  if (sessionError) {
    return { error: `Could not read the session: ${sessionError.message}` };
  }
  if (!session) return { error: "Session not found." };
  if (session.status !== "labelling") return { error: FROZEN };

  const [points, job, match] = await Promise.all([
    supabase
      .from("label_points")
      .select(GAME_COLUMNS)
      .eq("session_id", sessionId)
      .order("point_index")
      .returns<GameRow[]>(),
    readJobAdScoring(supabase, session),
    // The match's score and format in one read, beside the job's.
    readMatchScore(supabase, session.match_id),
  ]);
  if (job.error) {
    return { error: `Could not read the job's scoring: ${job.error.message}` };
  }
  if (match.error) {
    return {
      error: `Could not read the match's scoring: ${match.error.message}`,
    };
  }
  if (points.error) {
    return {
      error: `Could not read the session's points: ${points.error.message}`,
    };
  }
  const adScoring = resolveLabelAdScoring(
    session.ad_scoring,
    job.data?.ad_scoring,
    readFormatAdScoring(match.data?.format),
  );
  const tiebreakSet = matchTiebreakSet(
    parseMatchScore(match.data?.score ?? null),
    readBestOf(match.data?.format),
  );

  // The plan with no shots yet says whether any point moves under a new
  // server. Only then are shots read — the whole session's, not the moved
  // points' alone: a flipped winner changes the destination's score, so the
  // cascade can reach points the dry plan did not, and their strokes must
  // be there to read when it does.
  let shiftPoints: ShiftPoint[] = (points.data ?? []).map((row) => ({
    ...toGamePoint(row),
    shots: [],
  }));
  const dry = plan(shiftPoints, adScoring, tiebreakSet);
  if ("error" in dry) return dry;
  const byId = new Map(shiftPoints.map((point) => [point.id, point]));
  const switching = dry.writes.some(
    (write) => write.server !== byId.get(write.id)?.server,
  );
  let planned = dry;
  if (switching) {
    const owned = await readShotsOfSession(supabase, sessionId);
    if ("error" in owned) return owned;
    shiftPoints = withShots(shiftPoints, owned.shots);
    const full = plan(shiftPoints, adScoring, tiebreakSet);
    if ("error" in full) return full;
    planned = full;
  }

  // Each group compare-and-set on the status its points were read with: a
  // group that writes fewer rows than it named hit a point another tab
  // tombstoned or edited since the read, and stops the run with the raced
  // message. The groups before it landed — the partial semantics every
  // status writer here has — and the labeller reloads to see what did.
  const statusOf = new Map(
    shiftPoints.map((point) => [point.id, point.status]),
  );
  for (const group of groupWrites(planned.writes, statusOf)) {
    for (const ids of idChunks(group.ids)) {
      const { data, error: writeError } = await supabase
        .from("label_points")
        .update(group.values)
        .in("id", ids)
        .eq("status", group.was)
        .select("id");
      if (writeError) {
        return { error: `${failed}: ${writeError.message}` };
      }
      if (!data || data.length !== ids.length) {
        return { error: racedMessage("row") };
      }
    }
  }
  const swapFailed = await writeShotSwaps(
    supabase,
    planned.shots,
    "switch the moved points' players",
  );
  if (swapFailed) return { error: swapFailed };
  return { ok: true, writes: planned.writes, shots: planned.shots };
}

/** Plan the cascade from `fromPointId` and write it. Never throws. */
export async function writeLabelGameShift(params: {
  supabase: AdminClient;
  sessionId: unknown;
  /** A leftover point of the overflowing game. */
  fromPointId: unknown;
}): Promise<LabelGameShiftResult> {
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };
  const fromPointId = normaliseId(params.fromPointId);
  if (!fromPointId) return { error: "Invalid point id." };
  return runGamePlan(
    params.supabase,
    sessionId,
    (points, adScoring, tiebreakSet) =>
      planGameShift(points, adScoring, fromPointId, tiebreakSet),
    "Could not move the points",
  );
}

/**
 * Start a new game at `atPointId` (game-shift.ts `planGameSplit`): that
 * point and the rest of its game become a new game. Never throws.
 */
export async function writeLabelGameSplit(params: {
  supabase: AdminClient;
  sessionId: unknown;
  atPointId: unknown;
}): Promise<LabelGameShiftResult> {
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };
  const atPointId = normaliseId(params.atPointId);
  if (!atPointId) return { error: "Invalid point id." };
  return runGamePlan(
    params.supabase,
    sessionId,
    (points) => planGameSplit(points, atPointId),
    "Could not start the new game",
  );
}

/** The match's entered score beside its format, when the session has a match. */
async function readMatchScore(
  supabase: AdminClient,
  matchId: string | null,
): Promise<{ data: MatchScoreRow | null; error: { message: string } | null }> {
  if (!matchId) return { data: null, error: null };
  return supabase
    .from("matches")
    .select("score, format")
    .eq("id", matchId)
    .maybeSingle<MatchScoreRow>();
}

/**
 * Make the game after 6–6 in set `setNumber` a tiebreak — or, where the
 * entered score spells set `setNumber` as a match tiebreak, make its first
 * game that and fold the whole set in — folding the vendor's split games
 * into it (tiebreak-fold.ts), read and planned on the rows as they stand
 * now. Never throws.
 */
export async function writeLabelTiebreakFold(params: {
  supabase: AdminClient;
  sessionId: unknown;
  setNumber: unknown;
}): Promise<LabelGameShiftResult> {
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };
  const { setNumber } = params;
  if (
    typeof setNumber !== "number" ||
    !Number.isInteger(setNumber) ||
    setNumber < 1
  ) {
    return { error: "Invalid set." };
  }
  return runGamePlan(
    params.supabase,
    sessionId,
    (points, adScoring, tiebreakSet) => {
      const fold = tiebreakFolds(points, adScoring, tiebreakSet).find(
        (f) => f.setNumber === setNumber,
      );
      if (!fold) {
        return {
          error:
            "That set is not at 6–6 before an ordinary game, and the entered score does not make it a match tiebreak.",
        };
      }
      return planTiebreakFold(points, fold);
    },
    "Could not make the tiebreak",
  );
}

/** `"{set}·{game}"` with two whole numbers, as `gameKey` spells it. */
const GAME_KEY = /^\d+·\d+$/;

const NO_PULL =
  "That game is more likely missing a point than holding the next game's — add the point instead.";

/**
 * Plan the pull into the short game `gameKey` and write it. Never throws.
 * A plan the rule declines (`add_point`) is refused with `NO_PULL`: the
 * console offers "Add point" there and never asks for this.
 */
export async function writeLabelGamePull(params: {
  supabase: AdminClient;
  sessionId: unknown;
  /** The short game, as `gameKey` spells it. */
  gameKey: unknown;
}): Promise<LabelGameShiftResult> {
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };
  const key = params.gameKey;
  if (typeof key !== "string" || !GAME_KEY.test(key)) {
    return { error: "Invalid game." };
  }
  return runGamePlan(
    params.supabase,
    sessionId,
    (points, adScoring, tiebreakSet) => {
      const plan = planGamePull(points, key, adScoring, tiebreakSet);
      return "kind" in plan ? { error: NO_PULL } : plan;
    },
    "Could not pull the points in",
  );
}

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

export function pullLabelGamePoints(
  sessionId: unknown,
  gameKey: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelGameShiftResult> {
  return gated(
    deps,
    (supabase) => writeLabelGamePull({ supabase, sessionId, gameKey }),
    "pull the points into the game",
  );
}

export function foldLabelTiebreak(
  sessionId: unknown,
  setNumber: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelGameShiftResult> {
  return gated(
    deps,
    (supabase) => writeLabelTiebreakFold({ supabase, sessionId, setNumber }),
    "make the tiebreak",
  );
}

export function splitLabelGame(
  sessionId: unknown,
  atPointId: unknown,
  deps: LabelWriteDependencies = defaultLabelWriteDependencies,
): Promise<LabelGameShiftResult> {
  return gated(
    deps,
    (supabase) => writeLabelGameSplit({ supabase, sessionId, atPointId }),
    "start the new game",
  );
}
