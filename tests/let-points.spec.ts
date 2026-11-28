import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  LET_POINT_FILTER,
  LET_POINT_FLAG,
  isLetPointFlags,
  withoutLetPoints,
} from "@/lib/data/let-points";
import { getMatchPointsFromSupabase } from "@/lib/data/match-points-server";
import { fetchServeShotsForMatches } from "@/lib/data/serve-shots-by-match";
import { LET_REPLAYED_FLAG } from "@/lib/services/splitstep/derivation/flags";

/**
 * Replayed lets are published as flagged points (labels/apply.ts) and must
 * count as nothing: each reader that queries `points` leaves them out, and
 * only the Video tab's list asks for them.
 */

test("the client-side flag is the derivation's flag", () => {
  expect(LET_POINT_FLAG).toBe(LET_REPLAYED_FLAG);
});

test("isLetPointFlags reads the raw jsonb array, and nothing else", () => {
  expect(isLetPointFlags(["hand_labelled", "let_replayed"])).toBe(true);
  expect(isLetPointFlags(["hand_labelled"])).toBe(false);
  expect(isLetPointFlags([])).toBe(false);
  expect(isLetPointFlags(null)).toBe(false);
  expect(isLetPointFlags("let_replayed")).toBe(false);
});

test("withoutLetPoints keeps every point but a let, in order", () => {
  const points = [
    { id: "a" },
    { id: "b", letReplayed: true },
    { id: "c", letReplayed: false },
  ];
  expect(withoutLetPoints(points).map((p) => p.id)).toEqual(["a", "c"]);
});

test("LET_POINT_FILTER is a jsonb containment PostgREST can negate", () => {
  expect(LET_POINT_FILTER).toEqual(["flags", "cs", '["let_replayed"]']);
});

// ── getMatchPointsFromSupabase: the chokepoint ──────────────────────────────

function pointsClient(pointsRows: Record<string, unknown>[]): SupabaseClient {
  const client = {
    from(table: string) {
      if (table === "points") {
        return {
          select: () => ({
            eq: () => ({
              order: async () => ({ data: pointsRows, error: null }),
            }),
          }),
        };
      }
      if (table === "shots") {
        const page = {
          order: () => page,
          range: async () => ({ data: [], error: null }),
        };
        return { select: () => ({ eq: () => page }) };
      }
      throw new Error(`unexpected table read: ${table}`);
    },
  };
  return client as unknown as SupabaseClient;
}

function row(id: string, pointNumber: number, flags: string[]) {
  return {
    id,
    point_number: pointNumber,
    set_number: 1,
    game_number: 1,
    set_score: "0-0",
    game_score: "0-0",
    point_score: "15-0",
    result_type: flags.includes("let_replayed") ? "Let" : "Ace",
    won_by_player1: true,
    server_is_player1: true,
    is_break_point: false,
    is_set_point: false,
    is_match_point: false,
    rally_length: 1,
    duration: null,
    video_time: 10 * pointNumber,
    flags,
  };
}

const ROWS = [
  row("ace", 1, ["hand_labelled"]),
  row("let", 2, ["hand_labelled", "let_replayed"]),
  row("ace-again", 3, ["hand_labelled"]),
];

test("the match's points leave a replayed let out by default", async () => {
  const points = await getMatchPointsFromSupabase(
    "match-1",
    pointsClient(ROWS),
    { includeBookmarks: false },
  );
  expect(points!.map((p) => p.id)).toEqual(["ace", "ace-again"]);
  expect(points!.some((p) => p.letReplayed)).toBe(false);
});

test("asked for, the let comes back marked letReplayed", async () => {
  const points = await getMatchPointsFromSupabase(
    "match-1",
    pointsClient(ROWS),
    { includeBookmarks: false, includeLetReplayed: true },
  );
  expect(points!.map((p) => [p.id, p.letReplayed ?? false])).toEqual([
    ["ace", false],
    ["let", true],
    ["ace-again", false],
  ]);
});

test("a match whose only rows are lets reads as no points", async () => {
  const points = await getMatchPointsFromSupabase(
    "match-1",
    pointsClient([ROWS[1]]),
    { includeBookmarks: false },
  );
  expect(points).toEqual([]);
});

// ── fetchServeShotsForMatches: the home serve map ───────────────────────────

test("the serve map's points read negates the let flag", async () => {
  const nots: unknown[][] = [];
  const query = {
    select: () => query,
    in: () => query,
    order: () => query,
    not: (...args: unknown[]) => {
      nots.push(args);
      return query;
    },
    range: async () => ({ data: [], error: null }),
  };
  const client = { from: () => query } as unknown as SupabaseClient;
  const rows = await fetchServeShotsForMatches(client, ["m-1"]);
  expect(rows).toEqual([]);
  expect(nots).toEqual([[...LET_POINT_FILTER]]);
});

// ── The SQL readers ─────────────────────────────────────────────────────────

test("the migration patches every SQL reader and asserts its hit counts", () => {
  const sql = readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20261128032804_let_points_count_as_nothing.sql",
    ),
    "utf8",
  );
  for (const target of [
    "public.calculate_match_stats(uuid)",
    "public.key_moments(uuid)",
    "public.backfill_returns_in_and_net_points(uuid)",
    "public.rebuild_ask_point_facts(uuid[])",
    "public.self_review_save(uuid,jsonb)",
    "ask.points",
    "ask.shots",
  ]) {
    expect(sql).toContain(`'${target}'`);
  }
  // Each patch refuses to run on a definition that moved.
  expect(sql.match(/raise exception/g)?.length).toBeGreaterThanOrEqual(12);
  expect(sql).toContain("hits <> 45");
  expect(sql).toContain("hits <> 51");
});
