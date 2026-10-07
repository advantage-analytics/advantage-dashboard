/**
 * The labelling console's game operations: set who serves a game, set what kind
 * of game it is. Admin-gated like edit-session.ts, planned by
 * game-operations.ts.
 *
 * Every write is an UPDATE on `label_points`, one per live point of the game,
 * naming only `server`, `game_type` and `status` — and, on a point whose
 * players switch with its server, `winner` and `ended_by`, with its flipped
 * strokes then written on `label_shots` (`writeShotSwaps`, grouped by value
 * tuple as a move's are). The shots are read only once a dry plan moves some
 * point's server, the same way the move reads them only when the server
 * switches.
 *
 * A game is several rows with no transaction across them. Each row is written
 * compare-and-set on the `updated_at` it was read with; a row that changed
 * under the plan makes the whole game re-read and re-planned, up to {@link
 * MAX_GAME_ATTEMPTS} times. The plan is a function of the game as read, so a
 * retry converges.
 */

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkSessionOpen,
  defaultLabelWriteDependencies,
  type LabelWriteDependencies,
} from "./edit-session";
import { LABEL_SIDES, parseLabelPointSeed } from "./edit";
import {
  planGameServer,
  planGameType,
  type GamePoint,
  type GamePointWrite,
  type GameServerPoint,
  type PlannedGameWrites,
} from "./game-operations";
import { isLabelGame, type LabelGame } from "./operations";
import {
  gated,
  normaliseId,
  readShotsOfPoints,
  writeShotSwaps,
  type LabelOpResult,
} from "./operations-session";
import type { ShotSwapWrite } from "./player-swap";
import {
  isLabelGameType,
  type LabelEnding,
  type LabelGameType,
  type LabelPointStatus,
  type LabelServeSide,
  type LabelSide,
} from "./session";

/** One point as it now stands: the winner and ended by are the row's own unless they flipped. */
export interface LabelGamePointResult {
  id: string;
  server: LabelSide;
  gameType: LabelGameType;
  status: LabelPointStatus;
  winner: LabelSide | null;
  endedBy: LabelSide | null;
}
export type LabelGameWriteResult = LabelOpResult<{
  points: LabelGamePointResult[];
  /** The strokes flipped with their points' players (player-swap.ts); empty when none. */
  shots: ShotSwapWrite[];
}>;

const BUSY = "This game changed while it was saving. Try again.";
const INVALID_GAME = "A game is a set and a game number, both 1 or more.";

/** How many times a game is re-read and re-planned when a row changed under it. */
const MAX_GAME_ATTEMPTS = 3;

/** A `label_points` row as the game operations and the game shift read it. */
export interface GameRow {
  id: string;
  point_index: number;
  updated_at: string;
  status: LabelPointStatus;
  server: LabelSide | null;
  set_number: number | null;
  game_number: number | null;
  serve_side: LabelServeSide | null;
  winner: LabelSide | null;
  ending: LabelEnding | null;
  ended_by: LabelSide | null;
  game_type: LabelGameType;
  seed: unknown;
}

export const GAME_COLUMNS =
  "id, point_index, updated_at, status, server, set_number, game_number, serve_side, winner, ending, ended_by, game_type, seed";

export function toGamePoint(row: GameRow): GamePoint {
  return {
    id: row.id,
    pointIndex: row.point_index,
    status: row.status,
    server: row.server,
    setNumber: row.set_number,
    gameNumber: row.game_number,
    serveSide: row.serve_side,
    winner: row.winner,
    ending: row.ending,
    endedBy: row.ended_by,
    gameType: row.game_type,
    seed: parseLabelPointSeed(row.seed ?? null),
  };
}

async function readGame(
  supabase: AdminClient,
  sessionId: string,
  game: LabelGame,
): Promise<{ rows: GameRow[] } | { error: string }> {
  const { data, error } = await supabase
    .from("label_points")
    .select(GAME_COLUMNS)
    .eq("session_id", sessionId)
    .eq("set_number", game.setNumber)
    .eq("game_number", game.gameNumber)
    .neq("status", "deleted")
    .returns<GameRow[]>();
  if (error) return { error: `Could not read that game: ${error.message}` };
  return { rows: data ?? [] };
}

/**
 * Plan the game as read, with its strokes only when they can matter: a dry
 * plan over strokeless points says whether any server moves, and only then
 * are the game's shots read and the plan run again over them.
 */
async function planGame(
  supabase: AdminClient,
  rows: readonly GameRow[],
  plan: (points: readonly GameServerPoint[]) => PlannedGameWrites,
  readsShots: boolean,
): Promise<PlannedGameWrites> {
  const points: GameServerPoint[] = rows.map((row) => ({
    ...toGamePoint(row),
    shots: [],
  }));
  const dry = plan(points);
  if ("error" in dry || !readsShots) return dry;
  const serverOf = new Map(rows.map((row) => [row.id, row.server]));
  const moves = dry.writes.some(
    (write) => write.server !== serverOf.get(write.id),
  );
  if (!moves) return dry;

  const owned = await readShotsOfPoints(
    supabase,
    rows.map((row) => row.id),
  );
  if ("error" in owned) return owned;
  const shotsOf = new Map<string, GameServerPoint["shots"][number][]>();
  for (const shot of owned.shots) {
    const list = shotsOf.get(shot.labelPointId) ?? [];
    list.push(shot);
    shotsOf.set(shot.labelPointId, list);
  }
  return plan(
    points.map((point) => ({ ...point, shots: shotsOf.get(point.id) ?? [] })),
  );
}

/**
 * Read the game, plan with `plan`, and write every row compare-and-set on
 * its `updated_at`; start over when one changed under the plan. The flipped
 * strokes, if any, are written once every point row is. The session is
 * checked once, before the first read.
 */
async function writeGame(
  supabase: AdminClient,
  sessionId: string,
  game: LabelGame,
  plan: (points: readonly GameServerPoint[]) => PlannedGameWrites,
  what: string,
  /** Whether `plan` swaps players, and so needs the game's strokes. */
  readsShots: boolean,
): Promise<LabelGameWriteResult> {
  const closed = await checkSessionOpen(supabase, sessionId);
  if (closed) return { error: closed };

  for (let attempt = 0; attempt < MAX_GAME_ATTEMPTS; attempt += 1) {
    const read = await readGame(supabase, sessionId, game);
    if ("error" in read) return read;
    const planned = await planGame(supabase, read.rows, plan, readsShots);
    if ("error" in planned) return planned;

    const byId = new Map(read.rows.map((row) => [row.id, row]));
    let raced = false;
    for (const write of planned.writes) {
      const row = byId.get(write.id);
      if (!row) {
        raced = true;
        break;
      }
      const { id, ...values } = write;
      const { data, error } = await supabase
        .from("label_points")
        .update(values)
        .eq("id", id)
        .eq("updated_at", row.updated_at)
        .select("id");
      if (error) return { error: `Could not ${what}: ${error.message}` };
      if (!data || data.length === 0) {
        raced = true;
        break;
      }
    }
    if (!raced) {
      const swapFailed = await writeShotSwaps(
        supabase,
        planned.shots,
        "switch the points' players",
      );
      if (swapFailed) return { error: swapFailed };
      return {
        ok: true,
        points: planned.writes.map((write) => toResult(write, byId)),
        shots: planned.shots,
      };
    }
  }
  return { error: BUSY };
}

function toResult(
  write: GamePointWrite,
  rows: ReadonlyMap<string, GameRow>,
): LabelGamePointResult {
  const row = rows.get(write.id);
  return {
    id: write.id,
    server: write.server,
    gameType: write.game_type ?? row?.game_type ?? "game",
    status: write.status,
    winner: "winner" in write ? (write.winner ?? null) : (row?.winner ?? null),
    endedBy:
      "ended_by" in write ? (write.ended_by ?? null) : (row?.ended_by ?? null),
  };
}

function isLabelSide(value: unknown): value is LabelSide {
  return (
    typeof value === "string" &&
    (LABEL_SIDES as readonly string[]).includes(value)
  );
}

/**
 * Give a game its server: every live point, the rotation in a tiebreak, and
 * the players' swap on each point whose strokes contradict its new server.
 */
export async function writeLabelGameServer(params: {
  supabase: AdminClient;
  sessionId: unknown;
  game: unknown;
  server: unknown;
}): Promise<LabelGameWriteResult> {
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };
  if (!isLabelGame(params.game)) return { error: INVALID_GAME };
  if (!isLabelSide(params.server)) return { error: "Choose who serves." };
  const { server } = params;
  const game: LabelGame = {
    setNumber: params.game.setNumber,
    gameNumber: params.game.gameNumber,
  };
  return writeGame(
    params.supabase,
    sessionId,
    game,
    (points) => planGameServer(points, game, server),
    "set the game's server",
    true,
  );
}

/** Make a game a `type`, and re-rotate its servers to match. */
export async function writeLabelGameType(params: {
  supabase: AdminClient;
  sessionId: unknown;
  game: unknown;
  type: unknown;
}): Promise<LabelGameWriteResult> {
  const sessionId = normaliseId(params.sessionId);
  if (!sessionId) return { error: "Invalid session id." };
  if (!isLabelGame(params.game)) return { error: INVALID_GAME };
  if (!isLabelGameType(params.type)) {
    return { error: "Choose a game, a tiebreak or a match tiebreak." };
  }
  const { type } = params;
  const game: LabelGame = {
    setNumber: params.game.setNumber,
    gameNumber: params.game.gameNumber,
  };
  return writeGame(
    params.supabase,
    sessionId,
    game,
    (points) => planGameType(points, game, type),
    "set the game's type",
    false,
  );
}

// ── The admin-gated entry points behind the server actions ─────────────────

const defaults = defaultLabelWriteDependencies;

export function setLabelGameServer(
  sessionId: unknown,
  game: unknown,
  server: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelGameWriteResult> {
  return gated(
    deps,
    (supabase) => writeLabelGameServer({ supabase, sessionId, game, server }),
    "set the game's server",
  );
}

export function setLabelGameType(
  sessionId: unknown,
  game: unknown,
  type: unknown,
  deps: LabelWriteDependencies = defaults,
): Promise<LabelGameWriteResult> {
  return gated(
    deps,
    (supabase) => writeLabelGameType({ supabase, sessionId, game, type }),
    "set the game's type",
  );
}
