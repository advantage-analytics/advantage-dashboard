import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { getMatchPointsFromSupabase } from "@/lib/data/match-points-server";

/**
 * A minimal fake covering only what `getMatchPointsFromSupabase` calls with
 * `includeBookmarks: false` (so `point_bookmarks`/`matches` are never
 * touched): `points` select, and one empty page of `shots`.
 */
function fakeClient(pointsRows: Record<string, unknown>[]): SupabaseClient {
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
        return {
          select: () => ({
            in: () => ({
              order: () => ({
                order: () => ({
                  order: () => ({
                    range: async () => ({ data: [], error: null }),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table read: ${table}`);
    },
  };
  return client as unknown as SupabaseClient;
}

function row(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: "pt-1",
    point_number: 1,
    set_number: 1,
    game_number: 1,
    set_score: "0-0",
    game_score: "0-0",
    point_score: null,
    result_type: "Forehand Winner",
    won_by_player1: true,
    server_is_player1: true,
    is_break_point: false,
    is_set_point: false,
    is_match_point: false,
    rally_length: 4,
    duration: null,
    video_time: null,
    ...overrides,
  };
}

test("pointScoreRaw carries points.point_score with no fallback", async () => {
  const client = fakeClient([row({ id: "unknown-score", point_score: null })]);
  const points = await getMatchPointsFromSupabase("match-1", client, {
    includeBookmarks: false,
  });

  expect(points).not.toBeNull();
  expect(points).toHaveLength(1);
  expect(points![0].pointScoreRaw).toBeNull();
});

test("pointScore keeps its existing 0-0 default when the score is unknown", async () => {
  const client = fakeClient([row({ id: "unknown-score", point_score: null })]);
  const points = await getMatchPointsFromSupabase("match-1", client, {
    includeBookmarks: false,
  });

  expect(points![0].pointScore).toBe("0-0");
});

test("a real score is carried unchanged on both fields", async () => {
  const client = fakeClient([row({ id: "known-score", point_score: "30-15" })]);
  const points = await getMatchPointsFromSupabase("match-1", client, {
    includeBookmarks: false,
  });

  expect(points![0].pointScore).toBe("30-15");
  expect(points![0].pointScoreRaw).toBe("30-15");
});
