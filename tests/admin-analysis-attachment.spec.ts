import { expect, test } from "@playwright/test";
import {
  getAdminAnalysisAttachment,
  prepareAdminAnalysisAttachment,
} from "@/lib/services/programs/admin-analysis-attachment";
import type { createClient } from "@/lib/supabase/server";
const uuid = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  programId: uuid(1),
  matchId: uuid(2),
  operationId: uuid(3),
  itemId: uuid(4),
  fingerprint: "a".repeat(32),
};
function harness(admin = true, error: { message: string } | null = null) {
  const calls: unknown[] = [];
  const deps = {
    requireAdmin: async () => (admin ? { id: uuid(5) } : null),
    createClient: async () => {
      calls.push("client");
      return {
        rpc: async (name: string, args: unknown) => {
          calls.push({ name, args });
          return { data: null, error };
        },
      } as unknown as Awaited<ReturnType<typeof createClient>>;
    },
  };
  return { calls, deps };
}
test("authorization precedes client creation and strict input refuses protected fields", async () => {
  const denied = harness(false);
  expect((await prepareAdminAnalysisAttachment(input, denied.deps)).ok).toBe(
    false,
  );
  expect(denied.calls).toEqual([]);
  const h = harness();
  for (const [key, value] of Object.entries({
    created_by: uuid(5),
    program_id: uuid(6),
    event_entry_id: uuid(7),
    player1_id: uuid(8),
    player2_id: uuid(9),
    opponent_player_id: uuid(10),
    player1_name: "Fake",
    player2_name: "Fake",
    score: { winner: 2 },
    result: "Retired",
    round: "SF",
    tournament_name: "Fake",
    date: "2026-09-01",
    match_type: "Doubles",
    format: {},
    court_type: "Clay",
    snapshot: {},
    actorId: uuid(5),
  })) {
    expect(
      await prepareAdminAnalysisAttachment({ ...input, [key]: value }, h.deps),
    ).toMatchObject({ ok: false, reason: "invalid-input" });
  }
  expect(h.calls).toEqual([]);
});
test("preparation sends only identity and concurrency token using session client", async () => {
  const h = harness();
  expect(await prepareAdminAnalysisAttachment(input, h.deps)).toMatchObject({
    ok: true,
    preparation: { ...input, status: "prepared" },
  });
  expect(h.calls).toEqual([
    "client",
    {
      name: "admin_prepare_analysis_attachment",
      args: {
        p_operation_id: input.operationId,
        p_item_id: input.itemId,
        p_program_id: input.programId,
        p_match_id: input.matchId,
        p_fingerprint: input.fingerprint,
      },
    },
  ]);
});
test("database revalidation refusals survive service boundary without leaking unexpected errors", async () => {
  for (const reason of [
    "wrong-program",
    "stale-target",
    "existing-analysis",
    "processing-in-flight",
    "attachment-reserved",
    "program-inactive",
  ]) {
    const h = harness(true, { message: reason });
    expect(await prepareAdminAnalysisAttachment(input, h.deps)).toMatchObject({
      ok: false,
      reason,
    });
  }
  const h = harness(true, { message: "private database detail" });
  expect(await prepareAdminAnalysisAttachment(input, h.deps)).toMatchObject({
    ok: false,
    reason: "preparation-failed",
  });
  const denied = harness(false);
  expect(
    (
      await getAdminAnalysisAttachment(
        { programId: input.programId, matchId: input.matchId },
        denied.deps,
      )
    ).ok,
  ).toBe(false);
  expect(denied.calls).toEqual([]);
});
