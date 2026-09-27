import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { reconcileAdminSubmission } from "@/lib/services/programs/admin-reconciliation";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ACTOR = id(9);

function harness({
  authorized = true,
  consoleCreated = true,
  purgeThrows = false,
  rpcError = null as string | null,
} = {}) {
  const effects: string[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const deletes: { column: string; value: unknown }[][] = [];
  let clients = 0;
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      effects.push("rpc");
      rpcCalls.push({ name, args });
      if (rpcError) return { data: null, error: { message: rpcError } };
      return {
        data: {
          mode: args.p_mode,
          kind: consoleCreated ? "video" : "file",
          operationId: args.p_operation_id,
          itemId: args.p_item_id,
          programId: id(3),
          matchId: id(5),
          jobId: consoleCreated ? id(6) : null,
          fileId: consoleCreated ? null : id(7),
          consoleCreated,
        },
        error: null,
      };
    },
    from: (table: string) => {
      const filters: { column: string; value: unknown }[] = [];
      const q = {
        delete: () => q,
        eq: (column: string, value: unknown) => {
          filters.push({ column, value });
          return q;
        },
        then: (resolve: (v: unknown) => unknown) => {
          effects.push(`delete:${table}`);
          deletes.push(filters);
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  const deps = {
    requireAdmin: async () => (authorized ? { id: ACTOR } : null),
    createAdminClient: () => {
      clients++;
      return client as unknown as SupabaseClient;
    },
    purgeMatchStorage: async (
      _admin: SupabaseClient,
      ids: string[],
      label?: string,
    ) => {
      effects.push(`purge:${ids.join(",")}:${label}`);
      if (purgeThrows) throw new Error("Storage is unavailable.");
    },
  };
  return { deps, effects, rpcCalls, deletes, clients: () => clients };
}
const input = (mode: string) => ({
  operationId: id(1),
  itemId: id(2),
  mode,
});

test("a non-admin is refused before any client or rpc", async () => {
  const h = harness({ authorized: false });
  expect(await reconcileAdminSubmission(input("abandon"), h.deps)).toEqual({
    ok: false,
    message: "Administrator access is required.",
  });
  expect(h.rpcCalls).toHaveLength(0);
  expect(h.clients()).toBe(0);
});

test("invalid ids and modes never reach the rpc", async () => {
  for (const bad of [
    { operationId: "x", itemId: id(2), mode: "abandon" },
    { operationId: id(1), itemId: null, mode: "abandon" },
    { operationId: id(1), itemId: id(2), mode: "delete" },
  ]) {
    const h = harness();
    expect(await reconcileAdminSubmission(bad, h.deps)).toMatchObject({
      ok: false,
    });
    expect(h.rpcCalls).toHaveLength(0);
  }
});

test("the rpc receives the session actor and the mode, never a body actor", async () => {
  const h = harness({ consoleCreated: false });
  const result = await reconcileAdminSubmission(
    { ...input("complete"), actorId: id(99) } as never,
    h.deps,
  );
  expect(result).toMatchObject({ ok: true, mode: "complete" });
  expect(h.rpcCalls).toEqual([
    {
      name: "admin_reconcile_submission_item",
      args: {
        p_actor_id: ACTOR,
        p_operation_id: id(1),
        p_item_id: id(2),
        p_mode: "complete",
      },
    },
  ]);
  expect(h.effects).toEqual(["rpc"]);
});

test("a console-created abandon purges, then deletes that one match", async () => {
  const h = harness();
  expect(
    await reconcileAdminSubmission(input("abandon"), h.deps),
  ).toMatchObject({ ok: true, matchDeleted: true, matchId: id(5) });
  expect(h.effects).toEqual([
    "rpc",
    `purge:${id(5)}:console abandon`,
    "delete:matches",
  ]);
  expect(h.deletes).toEqual([
    [
      { column: "id", value: id(5) },
      { column: "program_id", value: id(3) },
    ],
  ]);
});

test("an attachment abandon keeps the recorded match", async () => {
  const h = harness({ consoleCreated: false });
  expect(
    await reconcileAdminSubmission(input("abandon"), h.deps),
  ).toMatchObject({ ok: true, matchDeleted: false });
  expect(h.effects).toEqual(["rpc"]);
});

test("a purge throw stops before the delete and reports failure", async () => {
  const h = harness({ purgeThrows: true });
  const result = await reconcileAdminSubmission(input("abandon"), h.deps);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.message).toContain("Storage is unavailable.");
  expect(h.effects).toEqual(["rpc", `purge:${id(5)}:console abandon`]);
});

test("rpc refusal codes become operator messages with no follow-up effects", async () => {
  const h = harness({ rpcError: "quota-held" });
  const result = await reconcileAdminSubmission(input("abandon"), h.deps);
  expect(result).toMatchObject({ ok: false });
  if (!result.ok) expect(result.message).toContain("reservation");
  expect(h.effects).toEqual(["rpc"]);
});
