import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";

/**
 * `getAskPageSeats()` decides which matches a pattern answer may link to the
 * Video view. A match with no playable video must get no seat — and so no
 * link — or "Watch 4 points" would open its Statistics instead.
 */

const WITH_VIDEO = "aaaaaaaa-0000-4000-8000-000000000001";
const NO_VIDEO = "aaaaaaaa-0000-4000-8000-000000000002";
const VIEWER = "bbbbbbbb-0000-4000-8000-000000000001";

function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "in", "eq", "order", "limit"]) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = async () => result;
  chain.then = (done: (value: unknown) => unknown) =>
    Promise.resolve(result).then(done);
  return chain;
}

function load(videos: Record<string, unknown>) {
  const supabase = {
    from(table: string) {
      if (table === "matches") {
        return query({
          data: [WITH_VIDEO, NO_VIDEO].map((id) => ({
            id,
            program_id: null,
            player1_id: VIEWER,
            player2_id: null,
          })),
          error: null,
        });
      }
      return query({
        data: { point_number: 1, server_is_player1: true },
        error: null,
      });
    },
  };
  return createLoader({
    stubs: {
      react: { cache: (fn: unknown) => fn },
      "@/lib/supabase/server": { createClient: async () => supabase },
      "@/lib/data/match-detail-server": {
        resolveRosterSeatIds: async () => [],
      },
      "@/lib/data/match-video-server": {
        getMatchVideo: async (id: string) => {
          const video = videos[id];
          if (video instanceof Error) throw video;
          return video ?? null;
        },
      },
      "@/lib/data/player-identity-server": {
        getMyPlayerIds: async () => [VIEWER],
        playerSide: () => null,
      },
      "@/lib/data/personal-matches-server": {
        getPersonalMatches: async () => [],
      },
      "@/lib/workspace/active-workspace-server": {
        getWorkspaceContext: async () => null,
      },
    },
  }).load(resolve("src/lib/data/ask-server.ts")) as {
    getAskPageSeats: (ids: string[]) => Promise<Map<string, unknown>>;
  };
}

test("a match with no playable video gets no seat, so no Watch link", async () => {
  const { getAskPageSeats } = load({ [WITH_VIDEO]: { url: "signed" } });
  const seats = await getAskPageSeats([WITH_VIDEO, NO_VIDEO]);
  expect([...seats.keys()]).toEqual([WITH_VIDEO]);
  expect(seats.get(WITH_VIDEO)).toEqual({
    youIsPlayer1: true,
    pointNumber: 1,
    serverIsPlayer1: true,
  });
});

test("a video that cannot be checked counts as none", async () => {
  const { getAskPageSeats } = load({
    [WITH_VIDEO]: new Error("storage unreachable"),
  });
  expect((await getAskPageSeats([WITH_VIDEO, NO_VIDEO])).size).toBe(0);
});
