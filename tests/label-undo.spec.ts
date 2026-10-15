import { expect, test } from "@playwright/test";
import { undoLabelOp } from "@/lib/services/labels/undo-session";
import type { AdminClient } from "@/lib/supabase/admin";
import { opHeaders, withLabelOp } from "@/lib/supabase/op-context";

/**
 * The console's Undo, server side (undo-session.ts): the admin gate, the one
 * RPC, and the rows read back. The rewind itself is `undo_label_op`, in the
 * migration `label_row_history_undo`.
 */
const SESSION = "aa7b743e-c1cc-4784-b920-8e5b27c620fa";

function fakeDb(answer: {
  data?: unknown;
  error?: { code: string; message: string };
}) {
  const calls: unknown[][] = [];
  const db = {
    rpc: async (...args: unknown[]) => {
      calls.push(args);
      return { data: answer.data ?? null, error: answer.error ?? null };
    },
  } as unknown as AdminClient;
  return { calls, db };
}

test("refused without an admin, before a client is built; a bad id reads nothing", async () => {
  let built = 0;
  const deps = {
    requireAdmin: async () => null,
    createAdminClient: () => {
      built += 1;
      return {} as AdminClient;
    },
    readPoints: async () => [],
  };
  expect(await undoLabelOp(SESSION, deps)).toEqual({
    error: "Admin access required.",
  });
  expect(
    await undoLabelOp("nope", {
      ...deps,
      requireAdmin: async () => ({ id: "a" }),
    }),
  ).toEqual({ error: "No such session." });
  expect(built).toBe(0);
});

test("one RPC, then the session's rows as they now stand", async () => {
  const { calls, db } = fakeDb({
    data: { undone: "Split point", remaining: 3 },
  });
  const points = [{ id: "p1" }] as never;
  const result = await undoLabelOp(SESSION, {
    requireAdmin: async () => ({ id: "admin" }),
    createAdminClient: () => db,
    readPoints: async () => points,
  });
  expect(calls).toEqual([["undo_label_op", { p_session_id: SESSION }]]);
  expect(result).toEqual({
    ok: true,
    undone: "Split point",
    remaining: 3,
    points,
  });
});

test("the function's own refusal is shown; any other failure is not", async () => {
  const run = (error: { code: string; message: string }) =>
    undoLabelOp(SESSION, {
      requireAdmin: async () => ({ id: "admin" }),
      createAdminClient: () => fakeDb({ error }).db,
      readPoints: async () => [],
    });
  const log = console.error;
  console.error = () => {};
  try {
    expect(
      await run({
        code: "P0001",
        message: "This session is not open for labelling.",
      }),
    ).toEqual({ error: "This session is not open for labelling." });
    expect(
      await run({ code: "42883", message: "function does not exist" }),
    ).toEqual({
      error: "Could not undo. Nothing was changed.",
    });
  } finally {
    console.error = log;
  }
});

test("an action's requests carry one op id and its name; outside one, nothing", async () => {
  expect(opHeaders()).toBeUndefined();
  const seen: (Record<string, string> | undefined)[] = [];
  await withLabelOp("Split point", async () => {
    seen.push(opHeaders());
    await Promise.resolve();
    seen.push(opHeaders());
  });
  expect(seen[0]).toEqual(seen[1]);
  expect(seen[0]?.["x-label-action"]).toBe("Split point");
  expect(seen[0]?.["x-label-op"]).toMatch(/^[0-9a-f-]{36}$/);
  // A second action is a second step.
  let other: string | undefined;
  await withLabelOp("Edit shot", async () => {
    other = opHeaders()?.["x-label-op"];
  });
  expect(other).not.toBe(seen[0]?.["x-label-op"]);
  expect(opHeaders()).toBeUndefined();
});
