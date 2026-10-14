/**
 * Ask's pattern query and the Video filter, run over the same match: every
 * pattern must select the same points both ways, or a "Watch these points"
 * link opens a different list than the answer counted.
 *
 *   npx tsx scripts/ask-pattern-parity.ts --match <uuid> --viewer <uuid> \
 *     [--program <uuid>]
 *
 * --viewer is the account Ask answers for (its side of the match is "mine");
 * --program a team match's program. Ask's side runs through the real
 * server-only function (ask_run_query / ask_run_team_query) with the service
 * key, exactly as /api/ask does; the Video side loads the match's points the
 * way match-points-server.ts does and applies `applyMatchFilters()` with the
 * context `buildFilterContext()` builds. Prints counts and the point numbers
 * that differ, nothing else — no names, no statistics.
 *
 * Exits 1 on any mismatch.
 */
import { createClient } from "@supabase/supabase-js";
import {
  applyMatchFilters,
  buildFilterContext,
} from "../src/components/dashboard/matches/match-detail/match-filters/model";
import type { MatchPoint } from "../src/lib/data/match-points-server";
import {
  pickReturnShot,
  pickServeShot,
} from "../src/lib/data/serve-return-shots";
import type { Match } from "../src/lib/data/types";
import {
  type AskPattern,
  patternPointsSql,
} from "../src/lib/services/ask/pattern";
import { patternMatchFilters } from "../src/lib/services/ask/pattern-video";
import { loadEnvLocal } from "./lib/env";

loadEnvLocal();

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const matchId = arg("match");
const viewer = arg("viewer");
const programId = arg("program") ?? null;
if (!matchId || !viewer) {
  console.error("Usage: --match <uuid> --viewer <uuid> [--program <uuid>]");
  process.exit(2);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false } });

/** Patterns that between them use every field the form has. */
const PATTERNS: Record<string, AskPattern> = {
  "serve wide, then my next shot down the line": {
    serve: { server: "mine", zones: ["Wide"], type: null },
    returnShot: null,
    shots: [
      { player: "mine", strokes: [], directions: ["Down the Line"], within: 3 },
    ],
  },
  "forehand crosscourt then down the line within seven": {
    serve: null,
    returnShot: null,
    shots: [
      {
        player: "mine",
        strokes: ["Forehand"],
        directions: ["Crosscourt"],
        within: 7,
      },
      {
        player: "mine",
        strokes: [],
        directions: ["Down the Line"],
        within: 7,
      },
    ],
  },
  "their second serve, my backhand return down the line": {
    serve: { server: "opponent", zones: [], type: "second" },
    returnShot: { strokes: ["Backhand"], zones: ["Down the Line"] },
    shots: [],
  },
  "my inside-out forehand, then their volley": {
    serve: null,
    returnShot: null,
    shots: [
      {
        player: "mine",
        strokes: ["Forehand"],
        directions: ["Inside Out"],
        within: null,
      },
      { player: "opponent", strokes: ["Volley"], directions: [], within: null },
    ],
  },
  "first serve to the T, return crosscourt, overhead or inside in": {
    serve: { server: null, zones: ["T"], type: "first" },
    returnShot: { strokes: [], zones: ["Crosscourt"] },
    shots: [
      {
        player: null,
        strokes: ["Overhead", "Backhand"],
        directions: ["Inside In", "Crosscourt"],
        within: 9,
      },
    ],
  },
};

async function askPoints(pattern: AskPattern): Promise<number[]> {
  const scope = `select match_id from ask.matches where match_id = '${matchId}'`;
  const sql = patternPointsSql(pattern);
  const { data, error } = programId
    ? await db.rpc("ask_run_team_query", {
        p_viewer: viewer,
        p_program_id: programId,
        scope_sql: scope,
        sql,
      })
    : await db.rpc("ask_run_query", {
        p_viewer: viewer,
        scope_sql: scope,
        sql,
      });
  if (error) throw new Error(`Ask query failed: ${error.message}`);
  const rows = (data as { rows: { point_number: number }[] }).rows;
  return rows.map((row) => row.point_number).sort((a, b) => a - b);
}

/** The match's points as match-points-server.ts builds them, the fields the filters read. */
async function videoPoints(): Promise<MatchPoint[]> {
  const { data: points, error } = await db
    .from("points")
    .select(
      "id, point_number, set_number, game_number, set_score, server_is_player1, won_by_player1, result_type, rally_length, point_score, game_score, is_break_point, is_set_point, is_match_point",
    )
    .eq("match_id", matchId)
    .order("point_number");
  if (error) throw new Error(error.message);
  const ids = (points ?? []).map((point) => point.id);
  const shots: Record<string, unknown>[] = [];
  // 25 points at a time: a request answers at most 1,000 rows, and a long
  // point holds 30 shots or more.
  for (let i = 0; i < ids.length; i += 25) {
    const { data, error: shotError } = await db
      .from("shots")
      .select(
        "point_id, shot_number, is_player1, shot_type, spin_type, zone, result, contact_x, contact_y, landing_x, landing_y",
      )
      .in("point_id", ids.slice(i, i + 25))
      .order("shot_number");
    if (shotError) throw new Error(shotError.message);
    shots.push(...(data ?? []));
  }
  const byPoint = new Map<string, Record<string, unknown>[]>();
  for (const shot of shots) {
    const list = byPoint.get(shot.point_id as string) ?? [];
    list.push(shot);
    byPoint.set(shot.point_id as string, list);
  }
  return (points ?? []).map((point) => {
    const rows = (byPoint.get(point.id) ?? []) as {
      shot_number: number;
      is_player1: boolean;
      shot_type: string | null;
      spin_type: string | null;
      zone: string | null;
      result: string | null;
      contact_x: number | null;
      contact_y: number | null;
      landing_x: number | null;
      landing_y: number | null;
    }[];
    const serve = pickServeShot(rows);
    const ret = pickReturnShot(rows);
    return {
      id: point.id,
      pointNumber: point.point_number,
      setNumber: point.set_number,
      serverIsPlayer1: point.server_is_player1,
      wonByPlayer1: point.won_by_player1,
      resultType: point.result_type ?? "",
      rallyLength: point.rally_length ?? 0,
      gameNumber: point.game_number,
      setScore: point.set_score ?? "0-0",
      gameScore: point.game_score ?? "0-0",
      pointScore: point.point_score ?? "0-0",
      pointScoreRaw: point.point_score,
      isBreakPoint: point.is_break_point,
      isSetPoint: point.is_set_point,
      isMatchPoint: point.is_match_point,
      shots: rows.map((shot) => ({
        shotNumber: shot.shot_number,
        isPlayer1: shot.is_player1,
        shotType: shot.shot_type,
        spinType: shot.spin_type,
        zone: shot.zone,
        result: shot.result,
        contactX: shot.contact_x,
        contactY: shot.contact_y,
        landingX: shot.landing_x,
        landingY: shot.landing_y,
      })),
      firstShotType: serve?.shot_type ?? null,
      firstShotSpin: serve?.spin_type ?? null,
      firstShotZone: serve?.zone ?? null,
      firstShotResult: serve?.result ?? null,
      secondShotType: ret?.shot_type ?? null,
      secondShotSpin: ret?.spin_type ?? null,
      secondShotZone: ret?.zone ?? null,
      secondShotResult: ret?.result ?? null,
      secondShotContactY: ret?.contact_y ?? null,
    } as unknown as MatchPoint;
  });
}

async function main() {
  // Which seat is the viewer's, and each seat's hand, as the match page reads them.
  const { data: match, error } = await db
    .from("matches")
    .select("player_hand, opponent_hand, source_provider")
    .eq("id", matchId)
    .single();
  if (error || !match) throw new Error(error?.message ?? "no match");
  const { data: sideRows, error: sideError } = await db.rpc(
    programId ? "ask_run_team_query" : "ask_run_query",
    {
      p_viewer: viewer,
      ...(programId ? { p_program_id: programId } : {}),
      scope_sql: `select match_id from ask.matches where match_id = '${matchId}'`,
      sql: "select s.point_number, s.shot_number, s.mine from ask.shots s where s.match_id in (select match_id from scope) and s.shot_number = 1 order by s.point_number limit 1",
    },
  );
  if (sideError) throw new Error(sideError.message);
  const first = (
    sideRows as { rows: { point_number: number; mine: boolean }[] }
  ).rows[0];
  const points = await videoPoints();
  const serveRow = points
    .find((point) => point.pointNumber === first?.point_number)
    ?.shots?.find((shot) => shot.shotNumber === 1);
  if (!first || !serveRow) throw new Error("could not place the viewer's seat");
  const youIsPlayer1 = serveRow.isPlayer1 === first.mine;
  const hand = (side: "you" | "opponent") =>
    side === "you" ? match.player_hand : match.opponent_hand;
  const pageMatch = {
    player1: { hand: youIsPlayer1 ? hand("you") : hand("opponent") },
    player2: { hand: youIsPlayer1 ? hand("opponent") : hand("you") },
    sourceProvider: match.source_provider ?? undefined,
  } as unknown as Match;
  const ctx = buildFilterContext(pageMatch, points, youIsPlayer1);

  let mismatches = 0;
  for (const [name, pattern] of Object.entries(PATTERNS)) {
    const filters = patternMatchFilters(pattern);
    if (!filters) {
      console.log(`- ${name}: no filter form (skipped)`);
      continue;
    }
    const video = applyMatchFilters(points, filters, ctx)
      .map((point) => point.pointNumber)
      .sort((a, b) => a - b);
    const ask = await askPoints(pattern);
    const onlyAsk = ask.filter((n) => !video.includes(n));
    const onlyVideo = video.filter((n) => !ask.includes(n));
    const same = onlyAsk.length === 0 && onlyVideo.length === 0;
    if (!same) mismatches += 1;
    console.log(
      `${same ? "✓" : "✗"} ${name}: Ask ${ask.length}, Video ${video.length}${
        same
          ? ""
          : ` — only Ask ${onlyAsk.join(",")}; only Video ${onlyVideo.join(",")}`
      }`,
    );
  }
  process.exit(mismatches === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
});
