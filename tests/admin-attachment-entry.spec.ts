import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import ts from "typescript";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  programId: uuid(1),
  matchId: uuid(2),
  operationId: uuid(3),
  itemId: uuid(4),
};
const match = {
  id: uuid(2),
  player1_name: "Recorded athlete",
  player1_id: uuid(5),
  player2_name: "Coach opponent",
  date: "2026-09-16T12:00:00Z",
  match_type: "Singles",
  format: { best_of: 3, ad_scoring: false },
  score: { player1: [6, 6], player2: [0, 0] },
  result: "Final Score",
  event_entry_id: uuid(6),
  round: "S1",
};
function harness({
  allowed = true,
  changed = false,
  unknownFormat = false,
  rpcFailure = false,
} = {}) {
  const calls: string[] = [];
  let preparation: unknown;
  const snapshot = { ...match, format: unknownFormat ? null : match.format };
  const query: any = {
    select: () => query,
    eq: () => query,
    is: () => query,
    order: () => query,
    limit: async () => ({ data: [{ id: match.id }], error: null }),
  };
  const mocks: Record<string, unknown> = {
    "@/lib/services/programs/admin-guard": {
      requireAdmin: async () => (allowed ? { id: uuid(8) } : null),
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        calls.push("admin-client");
        return { from: () => query };
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => {
        calls.push("session-client");
        return {
          rpc: async () => ({
            data: changed
              ? null
              : { fingerprint: "a".repeat(32), match: snapshot },
            error: rpcFailure
              ? { message: "column shots.match_id does not exist" }
              : changed
                ? { message: "stale-target" }
                : null,
          }),
        };
      },
    },
    "@/lib/services/programs/admin-analysis-attachment": {
      prepareAdminAnalysisAttachment: async (value: unknown) => {
        calls.push("prepare");
        preparation = value;
        return {
          ok: true,
          preparation: {
            ...input,
            fingerprint: "a".repeat(32),
            status: "prepared",
          },
        };
      },
    },
  };
  const code = ts.transpileModule(
    readFileSync("src/lib/data/admin-attachment-server.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const m = { exports: {} as any };
  new Function("require", "module", "exports", code)(
    (id: string) => {
      if (id in mocks) return mocks[id];
      throw Error(id);
    },
    m,
    m.exports,
  );
  return { api: m.exports, calls, prepared: () => preparation };
}
test("attachment chooser gates privileged candidate reads and preparation before clients", async () => {
  const h = harness({ allowed: false });
  expect((await h.api.listAdminAttachmentTargets(input.programId)).ok).toBe(
    false,
  );
  expect((await h.api.prepareAdminAttachmentTarget(input)).ok).toBe(false);
  expect(h.calls).toEqual([]);
  const invalid = harness();
  expect(
    (
      await invalid.api.prepareAdminAttachmentTarget({
        ...input,
        matchId: "bad",
      })
    ).ok,
  ).toBe(false);
  expect(invalid.calls).toEqual([]);
});
test("eligible preview prepares stable IDs and builds preset entirely from recorded fields", async () => {
  const h = harness();
  const listed = await h.api.listAdminAttachmentTargets(input.programId);
  expect(listed.options[0]).toMatchObject({
    id: match.id,
    supportsVideo: true,
  });
  const result = await h.api.prepareAdminAttachmentTarget(input);
  expect(h.prepared()).toEqual({ ...input, fingerprint: "a".repeat(32) });
  expect(result.attachment.preset).toMatchObject({
    matchId: match.id,
    entryId: match.event_entry_id,
    playerUserId: match.player1_id,
    playerName: match.player1_name,
    opponentName: match.player2_name,
    score: match.score,
    bestOf: 3,
    adScoring: false,
  });
});
test("stale or unavailable format refuses preparation without guessing recorded facts", async () => {
  for (const options of [{ changed: true }, { unknownFormat: true }]) {
    const h = harness(options);
    expect((await h.api.prepareAdminAttachmentTarget(input)).ok).toBe(false);
    expect(h.calls).not.toContain("prepare");
  }
  const h = harness({ unknownFormat: true });
  expect(
    (await h.api.listAdminAttachmentTargets(input.programId)).options,
  ).toEqual([]);
});

test("unexpected attachment RPC errors remain explicit rather than empty eligible results", async () => {
  const h = harness({ rpcFailure: true });
  const result = await h.api.listAdminAttachmentTargets(input.programId);
  expect(result.ok).toBe(false);
  expect(result.message).toContain("check recorded results");
});
