import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getRecentMatchesForSupport } from "@/lib/data/support-server";

/**
 * The "About" picker offers the viewer's own matches inside the workspace
 * they are looking at — `scopeToWorkspace()`'s rule on top of "your match".
 * A fake client records every filter the read applies, so the spec can say
 * which workspace's matches the query asked for without a database.
 */

const VIEWER = "11111111-1111-1111-1111-111111111111";
const PROGRAM = "22222222-2222-2222-2222-222222222222";
const SEAT = "33333333-3333-3333-3333-333333333333";

type Call = [string, ...unknown[]];

function fakeClient(rows: unknown[] = []) {
  const calls: Call[] = [];
  const builder: Record<string, unknown> = {};
  for (const name of ["select", "or", "eq", "is", "order", "limit"]) {
    builder[name] = (...args: unknown[]) => {
      calls.push([name, ...args]);
      return builder;
    };
  }
  builder.then = (resolve: (value: unknown) => unknown) =>
    resolve({ data: rows, error: null });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: VIEWER } } }) },
    rpc: async () => ({ data: [SEAT], error: null }),
    from: (table: string) => {
      calls.push(["from", table]);
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

const named = (calls: Call[], name: string) =>
  calls.filter(([n]) => n === name).map(([, ...args]) => args);

test("a team workspace offers only that program's matches", async () => {
  const { client, calls } = fakeClient();
  await getRecentMatchesForSupport(client, { id: PROGRAM, kind: "team" });
  expect(named(calls, "eq")).toContainEqual(["program_id", PROGRAM]);
  expect(named(calls, "is")).toEqual([]);
  // Still only the viewer's own: their seat ids, both id spaces.
  expect(String(named(calls, "or")[0][0])).toContain(SEAT);
  expect(String(named(calls, "or")[0][0])).toContain(VIEWER);
});

test("a personal workspace offers only the viewer's unfiled matches", async () => {
  const { client, calls } = fakeClient();
  await getRecentMatchesForSupport(client, { id: VIEWER, kind: "personal" });
  expect(named(calls, "eq")).toContainEqual(["created_by", VIEWER]);
  expect(named(calls, "is")).toContainEqual(["program_id", null]);
  expect(named(calls, "eq")).not.toContainEqual(["program_id", VIEWER]);
});

test("rows still label from the viewer's seat", async () => {
  const { client } = fakeClient([
    {
      id: "m1",
      date: "2026-10-10T12:00:00+00:00",
      player1_id: SEAT,
      player2_id: null,
      player1_name: "Chang Duan",
      player2_name: "Opponent",
      created_by: VIEWER,
      score: null,
      created_at: "2026-10-10T12:00:00+00:00",
    },
  ]);
  const [row] = await getRecentMatchesForSupport(client, {
    id: PROGRAM,
    kind: "team",
  });
  expect(row.label).toBe("vs. Opponent");
});
