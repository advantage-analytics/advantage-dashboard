/**
 * The labelling console's game operations, admin-gated: set who serves a game,
 * set what kind of game it is.
 *
 * Same shape as operations-session.ts: every entry point re-checks
 * `requireAdmin`, runs on the service-role client, refuses a `complete`
 * session, and decides what to write with the pure rules in
 * game-operations.ts — the ones the console ran for its optimistic update.
 *
 * Every write is an UPDATE on `label_points`, one per live point of the game,
 * naming only `server`, `game_type` and `status`. Nothing is inserted, nothing
 * removed, and `points` / `shots` / `matches` are never touched
 * (`tests/label-game-operations.spec.ts` scans this file).
 *
 * A game is several rows, and there is no transaction across them. Each row
 * is written compare-and-set on the `updated_at` it was read with (the touch
 * trigger moves it on every update), as a point edit is; a row that changed
 * under the plan makes the whole game re-read and re-planned from scratch, up
 * to {@link MAX_GAME_ATTEMPTS} times. Rows already written on the earlier
 * attempt are simply written again with the same values — the plan is a
 * function of the game as read, so a retry converges rather than piling up.
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
  type PlannedGameWrites,
} from "./game-operations";
import { isLabelGame, type LabelGame } from "./operations";
import { gated, normaliseId, type LabelOpResult } from "./operations-session";
import {
  isLabelGameType,
  type LabelEnding,
  type LabelGameType,
  type LabelPointStatus,
  type LabelServeSide,
  type LabelSide,
} from "./session";

/** One point of the game as it now stands. */
export interface LabelGamePointResult {
  id: string;
  server: LabelSide;
  gameType: LabelGameType;
  status: LabelPointStatus;
}
export type LabelGameWriteResult = LabelOpResult<{
  points: LabelGamePointResult[];
}>;

const BUSY = "This game changed while it was saving. Try again.";
const INVALID_GAME = "A game is a set and a game number, both 1 or more.";

/** How many times a game is re-read and re-planned when a row changed under it. */
const MAX_GAME_ATTEMPTS = 3;

interface GameRow {
  id: string;
  point_index: number;
  updated_at: string;
  status: Exclude<LabelPointStatus, "deleted">;
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

const GAME_COLUMNS =
  "id, point_index, updated_at, status, server, set_number, game_number, serve_side, winner, ending, ended_by, game_type, seed";

function toGamePoint(row: GameRow): GamePoint {
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

/** The game's live rows, as stored. */
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
 * Read the game, plan with `plan`, and write every row compare-and-set on
 * its `updated_at`; start over when one changed under the plan. The session
 * is checked once, before the first read.
 */
async function writeGame(
  supabase: AdminClient,
  sessionId: string,
  game: LabelGame,
  plan: (points: readonly GamePoint[]) => PlannedGameWrites,
  what: string,
): Promise<LabelGameWriteResult> {
  const closed = await checkSessionOpen(supabase, sessionId);
  if (closed) return { error: closed };

  for (let attempt = 0; attempt < MAX_GAME_ATTEMPTS; attempt += 1) {
    const read = await readGame(supabase, sessionId, game);
    if ("error" in read) return read;
    const planned = plan(read.rows.map(toGamePoint));
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
      return {
        ok: true,
        points: planned.writes.map((write) => toResult(write, byId)),
      };
    }
  }
  return { error: BUSY };
}

function toResult(
  write: GamePointWrite,
  rows: ReadonlyMap<string, GameRow>,
): LabelGamePointResult {
  return {
    id: write.id,
    server: write.server,
    gameType: write.game_type ?? rows.get(write.id)?.game_type ?? "game",
    status: write.status,
  };
}

function isLabelSide(value: unknown): value is LabelSide {
  return (
    typeof value === "string" &&
    (LABEL_SIDES as readonly string[]).includes(value)
  );
}

/** Give a game its server: every live point, the rotation in a tiebreak. */
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
