import { test, expect } from "@playwright/test";
import { submitAdminMatchVideo } from "@/lib/services/programs/admin-video-submission";
import type { AdminUploadContext } from "@/lib/data/admin-upload-server";
import type { AdminCheck } from "@/lib/services/programs/admin-guard";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  operationId: id(1),
  itemId: id(2),
  programId: id(3),
  playerId: id(4),
  opponentName: "Opponent",
  score: {
    player1: [6, 7],
    player2: [4, 6],
    player1_tiebreaks: [null, 7],
    player2_tiebreaks: [null, 4],
  },
  date: "2026-09-15",
  courtType: "Hard",
  bestOf: 3,
  startSeconds: 90,
  endSeconds: 4000,
  initialTopPlayerIsPlayer1: false,
  adScoring: true,
  fixedCamera: false,
};
/**
 * `authorized`: `true` an admin session, `false` a signed-in non-admin (403),
 * `401` no session at all.
 */
function harness(
  authorized: boolean | 401 = true,
  program = id(3),
  rpcError: string | null = null,
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return rpcError
        ? { data: null, error: { message: rpcError } }
        : { data: { match_id: id(5), job_id: id(6) }, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              program_id: program,
              player1_name: "Athlete",
              player2_name: "Opponent",
              score: input.score,
              match_type: "Singles",
            },
            error: null,
          }),
        }),
      }),
    }),
  };
  const deps = {
    checkAdmin: async (): Promise<AdminCheck> =>
      authorized === true
        ? { ok: true, id: id(9) }
        : { ok: false, status: authorized === 401 ? 401 : 403 },
    createAdminClient: () =>
      client as unknown as ReturnType<
        typeof import("@/lib/supabase/admin").createAdminClient
      >,
    getAdminUploadContext: async () => ({
      ok: true as const,
      context: {
        actorId: id(9),
        workspace: { canSubmitVideo: true, programStatus: "active" },
        roster: [{ playerId: id(4), name: "Athlete", userId: null }],
      } as AdminUploadContext,
    }),
  };
  return { deps, calls };
}
test("video admission uses session actor and preserves score tiebreaks and false answers", async () => {
  const h = harness();
  expect(await submitAdminMatchVideo(input, h.deps)).toMatchObject({
    ok: true,
    matchId: id(5),
    jobId: id(6),
  });
  expect(h.calls).toEqual([
    {
      name: "admin_submit_match_video",
      args: expect.objectContaining({
        p_actor_id: id(9),
        p_program_id: id(3),
        p_request: expect.objectContaining({
          score: input.score,
          initialTopPlayerIsPlayer1: false,
          fixedCamera: false,
        }),
      }),
    },
  ]);
});
test("nonadmins and forged actors cannot reach privileged mutation", async () => {
  const h = harness(false);
  expect((await submitAdminMatchVideo(input, h.deps)).ok).toBe(false);
  expect(h.calls).toEqual([]);
  const admin = harness();
  expect(
    (await submitAdminMatchVideo({ ...input, actorId: id(8) }, admin.deps)).ok,
  ).toBe(false);
  expect(admin.calls).toEqual([]);
});
test("refusals carry the status the route answers: 401 no session, 403 not an admin, 400 a bad request", async () => {
  const anonymous = harness(401);
  expect(await submitAdminMatchVideo(input, anonymous.deps)).toEqual({
    ok: false,
    status: 401,
    message: "Administrator access is required.",
  });
  const member = harness(false);
  expect(await submitAdminMatchVideo(input, member.deps)).toMatchObject({
    ok: false,
    status: 403,
  });
  const bad = harness();
  expect(
    await submitAdminMatchVideo({ ...input, startSeconds: -1 }, bad.deps),
  ).toMatchObject({ ok: false, status: 400 });
  expect([anonymous.calls, member.calls, bad.calls]).toEqual([[], [], []]);
});
test("a refused reservation answers a sentence, never the RPC's own text", async () => {
  const h = harness(true, id(3), 'duplicate key value violates "secret_idx"');
  const answer = await submitAdminMatchVideo(input, h.deps);
  expect(answer).toEqual({
    ok: false,
    status: 400,
    message: "Could not reserve this video.",
  });
  expect(JSON.stringify(answer)).not.toContain("secret_idx");
});
test("invalid or missing video answers refuse before job admission", async () => {
  for (const changes of [
    { fixedCamera: null },
    { adScoring: undefined },
    { initialTopPlayerIsPlayer1: null },
    { startSeconds: -1 },
    { endSeconds: 0 },
    { playerId: id(44) },
  ]) {
    const h = harness();
    expect(
      (await submitAdminMatchVideo({ ...input, ...changes }, h.deps)).ok,
    ).toBe(false);
    expect(h.calls).toEqual([]);
  }
});
test("attachment reads protected scores and rejects replacements or wrong program", async () => {
  const attachment = {
    operationId: id(1),
    itemId: id(2),
    programId: id(3),
    matchId: id(5),
    fingerprint: "a".repeat(32),
    startSeconds: 90,
    endSeconds: 4000,
    initialTopPlayerIsPlayer1: false,
    adScoring: true,
    fixedCamera: false,
  };
  const h = harness();
  expect((await submitAdminMatchVideo(attachment, h.deps)).ok).toBe(true);
  expect(h.calls[0].args).toMatchObject({
    p_match_id: id(5),
    p_fingerprint: "a".repeat(32),
    p_request: { score: null, playerId: null },
  });
  const wrong = harness(true, id(8));
  expect((await submitAdminMatchVideo(attachment, wrong.deps)).ok).toBe(false);
  expect(wrong.calls).toEqual([]);
  const replacement = harness();
  expect(
    (
      await submitAdminMatchVideo(
        { ...attachment, score: input.score },
        replacement.deps,
      )
    ).ok,
  ).toBe(false);
  expect(replacement.calls).toEqual([]);
});

test("video admission preserves wizard court labels and permits unanswered optional surface", async () => {
  for (const court of [
    null,
    "",
    "Outdoor Hard Court",
    "Indoor Hard Court",
    "Clay Court",
    "Grass Court",
  ]) {
    const h = harness();
    expect(
      (await submitAdminMatchVideo({ ...input, courtType: court }, h.deps)).ok,
    ).toBe(true);
    expect(
      (h.calls[0].args.p_request as Record<string, unknown>).courtType,
    ).toBe(court || null);
  }
});
