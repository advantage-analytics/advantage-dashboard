import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  abandonAdminResults,
  reconcileAdminSubmission,
  resumeAdminResults,
} from "@/lib/services/programs/admin-reconciliation";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ACTOR = id(9);

function harness({
  authorized = true,
  consoleCreated = true,
  // Independent of consoleCreated: the console creates matches for videos and
  // files alike, and attaches both to a coach's match.
  kind = (consoleCreated ? "video" : "file") as "video" | "file",
  // What the RPC hands back for the abandoned file's object; null is what a
  // video abandon and a complete return.
  storagePath = null as string | null,
  purgeThrows = false,
  removeFails = false,
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
          kind,
          operationId: args.p_operation_id,
          itemId: args.p_item_id,
          programId: id(3),
          matchId: id(5),
          jobId: kind === "video" ? id(6) : null,
          fileId: kind === "file" ? id(7) : null,
          storagePath,
          consoleCreated,
        },
        error: null,
      };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          effects.push(`remove:${bucket}:${paths.join(",")}`);
          return removeFails
            ? { data: null, error: { message: "Object not found" } }
            : { data: paths.map((name) => ({ name })), error: null };
        },
      }),
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

// ─── The abandoned file's object (T29) ──────────────────────────────────────

const XLSX = `_admin-console/${id(1)}/${id(2)}/${"a".repeat(64)}.xlsx`;

test("a console-created file abandon removes the .xlsx, then purges and deletes the match", async () => {
  const h = harness({ kind: "file", storagePath: XLSX });
  expect(
    await reconcileAdminSubmission(input("abandon"), h.deps),
  ).toMatchObject({
    ok: true,
    kind: "file",
    matchDeleted: true,
    matchId: id(5),
  });
  // The remove comes straight after the RPC: the purge reads match_files by
  // match id and the RPC has just deleted that row, so it would miss the object.
  expect(h.effects).toEqual([
    "rpc",
    `remove:match-data:${XLSX}`,
    `purge:${id(5)}:console abandon`,
    "delete:matches",
  ]);
});

test("an attachment file abandon removes the .xlsx and keeps the coach's match", async () => {
  const h = harness({ consoleCreated: false, kind: "file", storagePath: XLSX });
  expect(
    await reconcileAdminSubmission(input("abandon"), h.deps),
  ).toMatchObject({ ok: true, kind: "file", matchDeleted: false });
  expect(h.effects).toEqual(["rpc", `remove:match-data:${XLSX}`]);
});

test("a video abandon, a file complete and a null path never touch storage", async () => {
  // The guards are the kind, the mode and the path itself: a stray path on a
  // video or on a complete is ignored, as is a file abandon with no path.
  const video = harness({ kind: "video", storagePath: XLSX });
  await reconcileAdminSubmission(input("abandon"), video.deps);
  expect(video.effects).toEqual([
    "rpc",
    `purge:${id(5)}:console abandon`,
    "delete:matches",
  ]);
  const complete = harness({ kind: "file", storagePath: XLSX });
  expect(
    await reconcileAdminSubmission(input("complete"), complete.deps),
  ).toMatchObject({ ok: true, mode: "complete" });
  expect(complete.effects).toEqual(["rpc"]);
  const pathless = harness({ kind: "file" });
  await reconcileAdminSubmission(input("abandon"), pathless.deps);
  expect(pathless.effects).toEqual([
    "rpc",
    `purge:${id(5)}:console abandon`,
    "delete:matches",
  ]);
});

test("a failed remove is logged and changes nothing about the reconcile", async () => {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const h = harness({ kind: "file", storagePath: XLSX, removeFails: true });
    expect(
      await reconcileAdminSubmission(input("abandon"), h.deps),
    ).toMatchObject({ ok: true, matchDeleted: true });
    expect(h.effects).toEqual([
      "rpc",
      `remove:match-data:${XLSX}`,
      `purge:${id(5)}:console abandon`,
      "delete:matches",
    ]);
  } finally {
    console.error = original;
  }
  expect(logged).toHaveLength(1);
  expect(String(logged[0][0])).toContain("[console abandon]");
  expect(String(logged[0][0])).toContain(XLSX);
});

// ─── Resume and abandon pending dual/tournament results (T25) ───────────────

function resultHarness({
  kind = "dual",
  actorUserId = ACTOR,
  batch = true,
  submission = true,
  rpcError = null as string | null,
} = {}) {
  const effects: string[] = [];
  const reads: { table: string; filters: [string, unknown][] }[] = [];
  const stored = {
    operationId: id(1),
    programId: id(3),
    event: { kind: "existing", eventId: id(4), fingerprint: "a".repeat(32) },
    items: [
      {
        itemId: id(2),
        slot: "S1",
        result: { kind: "outcome", outcome: "forfeit", side: "theirs" },
      },
    ],
  };
  const tables: Record<string, Record<string, unknown> | null> = {
    admin_upload_submissions: submission
      ? { operation_id: id(1), actor_user_id: actorUserId, kind }
      : null,
    admin_dual_batches: batch && kind === "dual" ? { request: stored } : null,
    admin_tournament_batches:
      batch && kind === "tournament" ? { request: stored } : null,
  };
  const session = {
    from(table: string) {
      const filters: [string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (column: string, value: unknown) => {
          filters.push([column, value]);
          return q;
        },
        maybeSingle: async () => {
          effects.push(`read:${table}`);
          reads.push({ table, filters });
          return { data: tables[table] ?? null, error: null };
        },
      };
      return q;
    },
  };
  const submitted: { service: string; input: unknown }[] = [];
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const deps = {
    requireAdmin: async () => ({ id: ACTOR }),
    createClient: async () => session as unknown as SupabaseClient,
    createAdminClient: () =>
      ({
        rpc: async (name: string, args: Record<string, unknown>) => {
          effects.push("rpc");
          rpcCalls.push({ name, args });
          if (rpcError) return { data: null, error: { message: rpcError } };
          return {
            data: { abandonedItemIds: [id(2)], items: [] },
            error: null,
          };
        },
      }) as unknown as SupabaseClient,
    submitAdminDualResults: async (input: unknown) => {
      effects.push("submit:dual");
      submitted.push({ service: "dual", input });
      return {
        ok: true as const,
        operationId: id(1),
        eventId: id(4),
        items: [],
      };
    },
    submitAdminTournamentResult: async (input: unknown) => {
      effects.push("submit:tournament");
      submitted.push({ service: "tournament", input });
      return {
        ok: true as const,
        operationId: id(1),
        eventId: id(4),
        entryId: id(6),
        item: {
          itemId: id(2),
          status: "succeeded",
          round: "R32",
        } as never,
      };
    },
  };
  return { deps, effects, reads, submitted, rpcCalls, stored };
}

test("resume hands the stored batch request, unmodified, to the submit service", async () => {
  for (const kind of ["dual", "tournament"] as const) {
    const h = resultHarness({ kind });
    const snapshot = JSON.stringify(h.stored);
    const result = await resumeAdminResults(id(1), h.deps);
    expect(result).toMatchObject({ ok: true, kind });
    expect(h.submitted).toHaveLength(1);
    expect(h.submitted[0].service).toBe(kind);
    // Same object, same bytes: nothing was rebuilt, reordered or added.
    expect(h.submitted[0].input).toBe(h.stored);
    expect(JSON.stringify(h.submitted[0].input)).toBe(snapshot);
    expect(h.reads.map((r) => r.table)).toEqual([
      "admin_upload_submissions",
      kind === "dual" ? "admin_dual_batches" : "admin_tournament_batches",
    ]);
    expect(h.reads.every((r) => r.filters[0][1] === id(1))).toBe(true);
  }
});

test("resume never reads a request from its input", async () => {
  const h = resultHarness();
  const forged = {
    operationId: id(1),
    request: { operationId: id(1), programId: id(77), items: [] },
  };
  expect(await resumeAdminResults(forged, h.deps)).toMatchObject({
    ok: false,
  });
  expect(h.submitted).toHaveLength(0);
  expect(h.effects).toEqual([]);
  // Only the id is taken from the caller; the service reads the stored one.
  const ok = resultHarness();
  await resumeAdminResults(id(1).toUpperCase(), ok.deps);
  expect(ok.submitted[0].input).toBe(ok.stored);
});

test("resume by a different administrator refuses before any submit call", async () => {
  const h = resultHarness({ actorUserId: id(55) });
  const result = await resumeAdminResults(id(1), h.deps);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.message).toContain("started this submission");
  expect(h.submitted).toHaveLength(0);
  expect(h.effects).toEqual(["read:admin_upload_submissions"]);
});

test("resume refuses a missing batch, a missing operation and other kinds", async () => {
  for (const h of [
    resultHarness({ batch: false }),
    resultHarness({ submission: false }),
    resultHarness({ kind: "video" }),
  ]) {
    expect(await resumeAdminResults(id(1), h.deps)).toMatchObject({
      ok: false,
    });
    expect(h.submitted).toHaveLength(0);
  }
  const unauthorized = resultHarness();
  unauthorized.deps.requireAdmin = async () => null as never;
  expect(await resumeAdminResults(id(1), unauthorized.deps)).toEqual({
    ok: false,
    message: "Administrator access is required.",
  });
  expect(unauthorized.effects).toEqual([]);
});

test("abandon calls the rpc with the session actor", async () => {
  const h = resultHarness({ actorUserId: id(55) });
  expect(await abandonAdminResults(id(1), h.deps)).toEqual({
    ok: true,
    abandonedItemIds: [id(2)],
  });
  expect(h.rpcCalls).toEqual([
    {
      name: "admin_abandon_result_items",
      args: { p_actor_id: ACTOR, p_operation_id: id(1) },
    },
  ]);
  const refused = resultHarness({ rpcError: "kind-unsupported" });
  const result = await abandonAdminResults(id(1), refused.deps);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.message).toContain("dual and tournament");
  const bad = resultHarness();
  expect(await abandonAdminResults("x", bad.deps)).toMatchObject({
    ok: false,
  });
  expect(bad.rpcCalls).toHaveLength(0);
});
