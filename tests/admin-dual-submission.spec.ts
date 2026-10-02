import { test, expect } from "@playwright/test";
import {
  submitAdminDualResults,
  validateAdminDualSubmission,
} from "@/lib/services/programs/admin-dual-submission";
import type { AdminUploadContext } from "@/lib/data/admin-upload-server";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  operationId: id(1),
  programId: id(2),
  event: { kind: "existing", eventId: id(3), fingerprint: "a".repeat(32) },
  items: [
    {
      itemId: id(4),
      slot: "S1",
      result: { kind: "outcome", outcome: "default", side: "ours" },
    },
    {
      itemId: id(5),
      slot: "S2",
      result: { kind: "outcome", outcome: "withdrawal", side: "theirs" },
    },
  ],
};
function harness(
  options: {
    authorized?: boolean;
    actor?: string;
    replay?: boolean;
    lost?: boolean;
  } = {},
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const items = input.items.map((i, n) => ({
    ...i,
    status: options.replay && n === 0 ? "succeeded" : "pending",
    matchId: null,
    outcomeId: null,
    error: null,
  }));
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "admin_apply_dual_result") {
        const item = items.find((i) => i.itemId === args.p_item_id)!;
        item.status =
          item.slot === "S1" && !options.lost ? "failed" : "succeeded";
        if (options.lost)
          return {
            data: null,
            error: { message: "connection lost after commit" },
          };
      }
      return { data: { eventId: id(3), items }, error: null };
    },
  };
  const deps = {
    requireAdmin: async () =>
      options.authorized === false ? null : { id: id(9) },
    createAdminClient: () =>
      client as unknown as ReturnType<
        typeof import("@/lib/supabase/admin").createAdminClient
      >,
    getAdminUploadContext: async () => ({
      ok: true as const,
      context: { actorId: options.actor ?? id(9) } as AdminUploadContext,
    }),
  };
  return { deps, calls };
}
test("all lines and session authority are validated before setup", async () => {
  for (const [body, options] of [
    [input, { authorized: false }],
    [{ ...input, actorId: id(8) }, {}],
    [
      {
        ...input,
        items: [
          input.items[0],
          { ...input.items[1], result: { kind: "outcome", side: "ours" } },
        ],
      },
      {},
    ],
    [input, { actor: id(8) }],
  ] as const) {
    const h = harness(options);
    expect((await submitAdminDualResults(body, h.deps)).ok).toBe(false);
    expect(h.calls).toEqual([]);
  }
});
test("durable per-line failure does not prevent another line and actor is explicit", async () => {
  const h = harness();
  const result = await submitAdminDualResults(input, h.deps);
  expect(result).toMatchObject({
    ok: true,
    items: [{ status: "failed" }, { status: "succeeded" }],
  });
  expect(h.calls.map((c) => c.name)).toEqual([
    "admin_prepare_dual_results",
    "admin_apply_dual_result",
    "admin_apply_dual_result",
    "admin_dual_result_status",
  ]);
  expect(h.calls.every((c) => c.args.p_actor_id === id(9))).toBe(true);
  expect(h.calls[0].args.p_program_id).toBe(id(2));
});
test("retry skips successes and lost response recovers durable state", async () => {
  const replay = harness({ replay: true });
  await submitAdminDualResults(input, replay.deps);
  expect(
    replay.calls
      .filter((c) => c.name === "admin_apply_dual_result")
      .map((c) => c.args.p_item_id),
  ).toEqual([id(5)]);
  const lost = harness({ lost: true });
  expect(await submitAdminDualResults(input, lost.deps)).toMatchObject({
    ok: true,
    items: [{ status: "succeeded" }, { status: "pending" }],
  });
  expect(
    lost.calls.filter((c) => c.name === "admin_apply_dual_result"),
  ).toHaveLength(1);
});
test("calendar normalization and numeric format coercion are refused", () => {
  const dual = {
    opponent: "Other",
    opponentProgramKey: null,
    date: "2026-02-30",
    startsAtTime: null,
    site: "home",
    surface: "Hard",
    bestOf: 3,
    adScoring: null,
    doublesGamesTo: 8,
    doublesAdScoring: false,
    lines: Array.from({ length: 9 }, (_, n) => ({
      slot: n < 6 ? `S${n + 1}` : `D${n - 5}`,
      discipline: n < 6 ? "singles" : "doubles",
      position: n,
      playerUserIds: (n < 6 ? [n] : [(n - 6) * 2, (n - 6) * 2 + 1]).map((i) =>
        id(20 + i),
      ),
      playerLabels: n < 6 ? [`Player${n}`] : ["A", "B"],
      opponentLabels: n < 6 ? ["Opponent"] : ["One", "Two"],
    })),
  };
  expect(
    validateAdminDualSubmission({ ...input, event: { kind: "new", dual } }),
  ).not.toBeNull();
  dual.date = "2026-02-28";
  expect(
    validateAdminDualSubmission({ ...input, event: { kind: "new", dual } }),
  ).toBeNull();
  expect(
    validateAdminDualSubmission({
      ...input,
      event: { kind: "new", dual: { ...dual, bestOf: "3" } },
    }),
  ).not.toBeNull();
});
