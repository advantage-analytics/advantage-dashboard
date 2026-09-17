import { test, expect } from "@playwright/test";
import {
  submitAdminTournamentResult,
  validateAdminTournamentSubmission,
  getAdminTournamentResultContext,
} from "@/lib/services/programs/admin-tournament-submission";
import type { AdminUploadContext } from "@/lib/data/admin-upload-server";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const input = {
  operationId: id(1),
  itemId: id(2),
  programId: id(3),
  event: {
    kind: "new",
    tournament: {
      name: "Invitational",
      startsOn: "2026-09-15",
      endsOn: "2026-09-18",
      site: "home",
      surface: "Hard",
      host: null,
      bestOf: 3,
      adScoring: false,
    },
  },
  entry: {
    kind: "new",
    playerId: id(4),
    playerLabel: "Athlete",
    draw: null,
    seed: null,
  },
  round: "R16",
  result: {
    kind: "score",
    ourGames: [6, 7],
    theirGames: [4, 6],
    ourTiebreaks: [null, 7],
    theirTiebreaks: [null, 4],
    opponentLabels: ["Opponent"],
    ending: null,
  },
};
function harness(
  opts: {
    authorized?: boolean;
    actor?: string;
    replay?: boolean;
    lost?: boolean;
    statusLost?: boolean;
    contextOk?: boolean;
  } = {},
) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  let status = opts.replay ? "succeeded" : "pending";
  let contextCalls = 0;
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      if (name === "admin_apply_tournament_result") {
        status = "succeeded";
        if (opts.lost)
          return { data: null, error: { message: "lost after commit" } };
      }
      if (name === "admin_tournament_result_status" && opts.statusLost)
        return { data: null, error: { message: "offline" } };
      return {
        data: {
          operationId: id(1),
          eventId: id(5),
          entryId: id(6),
          item: {
            itemId: id(2),
            round: "R16",
            status,
            matchId: status === "succeeded" ? id(7) : null,
            outcomeId: null,
            error: null,
          },
        },
        error: null,
      };
    },
  };
  const deps = {
    requireAdmin: async () =>
      opts.authorized === false ? null : { id: id(9) },
    createAdminClient: () =>
      client as unknown as ReturnType<
        typeof import("@/lib/supabase/admin").createAdminClient
      >,
    getAdminUploadContext: async () => {
      contextCalls++;
      return opts.contextOk === false
        ? {
            ok: false as const,
            reason: "program-not-found" as const,
            message: "unavailable",
          }
        : {
            ok: true as const,
            context: { actorId: opts.actor ?? id(9) } as AdminUploadContext,
          };
    },
  };
  return { deps, calls, contextCalls: () => contextCalls };
}
test("session and envelope refusal precede privileged setup", async () => {
  for (const options of [
    { authorized: false },
    { actor: id(8) },
    { contextOk: false },
  ]) {
    const h = harness(options);
    expect((await submitAdminTournamentResult(input, h.deps)).ok).toBe(false);
    expect(h.calls).toEqual([]);
  }
  for (const body of [
    { ...input, actorId: id(8) },
    { ...input, round: "qf" },
    { ...input, entry: { ...input.entry, discipline: "doubles" } },
    { ...input, result: { ...input.result, ourGames: [] } },
    {
      ...input,
      event: {
        ...input.event,
        tournament: { ...input.event.tournament, startsOn: "2026-02-30" },
      },
    },
  ]) {
    const h = harness();
    expect((await submitAdminTournamentResult(body, h.deps)).ok).toBe(false);
    expect(h.contextCalls()).toBe(0);
    expect(h.calls).toEqual([]);
  }
});
test("canonical round, full score and false format reach explicit actor/program RPC", async () => {
  const h = harness();
  expect(await submitAdminTournamentResult(input, h.deps)).toMatchObject({
    ok: true,
    eventId: id(5),
    entryId: id(6),
    item: { status: "succeeded", round: "R16" },
  });
  expect(h.calls.map((c) => c.name)).toEqual([
    "admin_prepare_tournament_result",
    "admin_apply_tournament_result",
    "admin_tournament_result_status",
  ]);
  expect(h.calls.every((c) => c.args.p_actor_id === id(9))).toBe(true);
  expect(h.calls[0].args).toMatchObject({
    p_program_id: id(3),
    p_request: input,
  });
});
test("success replay skips mutation and lost apply response reads durable state", async () => {
  const replay = harness({ replay: true });
  await submitAdminTournamentResult(input, replay.deps);
  expect(replay.calls.map((c) => c.name)).toEqual([
    "admin_prepare_tournament_result",
    "admin_tournament_result_status",
  ]);
  const lost = harness({ lost: true });
  expect(await submitAdminTournamentResult(input, lost.deps)).toMatchObject({
    ok: true,
    item: { status: "succeeded" },
  });
  const unavailable = harness({ lost: true, statusLost: true });
  expect(
    await submitAdminTournamentResult(input, unavailable.deps),
  ).toMatchObject({
    ok: false,
    message: expect.stringContaining("Retry the same operation"),
  });
});
test("existing-entry scope and new-entry shape are validated", () => {
  const event = {
      kind: "existing",
      eventId: id(5),
      fingerprint: "a".repeat(32),
    },
    entry = {
      kind: "existing",
      entryId: id(6),
      playerId: id(4),
      fingerprint: "b".repeat(32),
    };
  expect(
    validateAdminTournamentSubmission({ ...input, event, entry }),
  ).toBeNull();
  expect(validateAdminTournamentSubmission({ ...input, entry })).not.toBeNull();
  expect(
    validateAdminTournamentSubmission({
      ...input,
      entry: { ...input.entry, seed: 0 },
    }),
  ).not.toBeNull();
  expect(
    validateAdminTournamentSubmission({
      ...input,
      event: {
        ...input.event,
        tournament: { ...input.event.tournament, bestOf: "3" },
      },
    }),
  ).not.toBeNull();
  expect(
    validateAdminTournamentSubmission({
      ...input,
      result: { kind: "outcome", outcome: "withdrawal", side: "ours" },
    }),
  ).toBeNull();
});
test("context reads require admin and exact program/event identifiers", async () => {
  const denied = harness({ authorized: false });
  expect(
    (await getAdminTournamentResultContext(id(3), id(5), denied.deps)).ok,
  ).toBe(false);
  expect(denied.calls).toEqual([]);
  const h = harness();
  expect((await getAdminTournamentResultContext(id(3), "bad", h.deps)).ok).toBe(
    false,
  );
  expect(h.calls).toEqual([]);
  await getAdminTournamentResultContext(id(3), id(5), h.deps);
  expect(h.calls[0]).toEqual({
    name: "admin_get_tournament_result_context",
    args: { p_actor_id: id(9), p_program_id: id(3), p_event_id: id(5) },
  });
});
