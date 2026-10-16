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

const PROGRAM = "cccccccc-0000-4000-8000-000000000001";
const ROSTER_PLAYER = "dddddddd-0000-4000-8000-000000000001";

function load(
  videos: Record<string, unknown>,
  options: {
    matches?: Record<string, unknown>[];
    roster?: { id: string; program_id: string }[];
  } = {},
) {
  const reads: string[] = [];
  const supabase = {
    from(table: string) {
      reads.push(table);
      if (table === "matches") {
        return query({
          data:
            options.matches ??
            [WITH_VIDEO, NO_VIDEO].map((id) => ({
              id,
              program_id: null,
              player1_id: VIEWER,
              player2_id: null,
            })),
          error: null,
        });
      }
      if (table === "program_players") {
        return query({ data: options.roster ?? [], error: null });
      }
      // The batched first-point read: point 1 of every match at once.
      return query({
        data: [WITH_VIDEO, NO_VIDEO].map((match_id) => ({
          match_id,
          point_number: 1,
          server_is_player1: true,
        })),
        error: null,
      });
    },
  };
  const loader = createLoader({
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
  });
  const mod = loader.load(resolve("src/lib/data/ask-server.ts")) as {
    getAskPageSeats: (ids: string[]) => Promise<Map<string, unknown>>;
  };
  return { ...mod, reads };
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

test("the first points and the roster are read once for the batch, not once per match", async () => {
  const { getAskPageSeats, reads } = load(
    { [WITH_VIDEO]: { url: "signed" }, [NO_VIDEO]: { url: "signed" } },
    {
      matches: [
        // The viewer coaches: the seat is held by a roster profile of the
        // match's own program, so the page calls player1 "you" — without
        // the roster read it would fall back to player2.
        {
          id: WITH_VIDEO,
          program_id: PROGRAM,
          player1_id: ROSTER_PLAYER,
          player2_id: "eeeeeeee-0000-4000-8000-000000000001",
        },
        {
          id: NO_VIDEO,
          program_id: null,
          player1_id: VIEWER,
          player2_id: null,
        },
      ],
      roster: [{ id: ROSTER_PLAYER, program_id: PROGRAM }],
    },
  );
  const seats = await getAskPageSeats([WITH_VIDEO, NO_VIDEO]);
  expect(reads.filter((table) => table === "points")).toHaveLength(1);
  expect(reads.filter((table) => table === "program_players")).toHaveLength(1);
  expect(seats.get(WITH_VIDEO)).toMatchObject({ youIsPlayer1: true });
  expect(seats.get(NO_VIDEO)).toMatchObject({ youIsPlayer1: true });
});
