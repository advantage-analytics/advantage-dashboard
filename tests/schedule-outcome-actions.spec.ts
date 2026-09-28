import { loadScheduleWriter } from "./helpers/schedule-writer";
import { expect, test } from "@playwright/test";
import { matchResultFor } from "@/lib/schedule/entry-state";
import { DEFAULT_DOUBLES_GAMES_TO, roundRank } from "@/lib/schedule/format";
import { readFileSync } from "node:fs";
import {
  canManageTeamSchedule,
  isProgramStaff,
  uploadPolicyLabel,
} from "@/lib/workspace/types";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Execute the actual Server Actions with only their request-bound dependencies
// replaced. No Next request, credentials, network, or production data is used.
function actions(
  role = "staff",
  options: {
    rpcError?: string;
    outcome?: boolean;
    otherProgram?: boolean;
    eventsPolicy?: "staff" | "owner";
    discipline?: "singles" | "doubles";
    /** A tournament instead of the dual, with these matches already on the entry. */
    tournament?: { matches: { id: string; round: string }[] };
    /** What `programs` answers for any key — the directory row behind a school. */
    program?: { id: string } | null;
  } = {},
) {
  const writes: unknown[] = [];
  const refreshed: string[] = [];
  const rows: Record<string, unknown> = {
    program_event_entries: {
      id: "entry",
      event_id: "event",
      program_id: options.otherProgram ? "other" : "program",
      slot: "S1",
      player_labels: ["Player"],
      player_user_ids: [],
      discipline: options.discipline ?? "singles",
      forfeit: null,
    },
    program_events: {
      name: options.tournament ? "Invitational" : "Dual",
      kind: options.tournament ? "tournament" : "dual",
      starts_on: "2026-09-10",
      format: {},
    },
    program_event_outcomes: options.outcome ? [{ id: "outcome" }] : [],
    matches: options.tournament?.matches ?? [],
    programs: options.program ?? null,
  };
  const client = {
    async rpc(name: string, args: unknown) {
      writes.push({ name, args });
      return {
        data: options.rpcError ? null : "event",
        error: options.rpcError ? { message: options.rpcError } : null,
      };
    },
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const method of [
        "select",
        "eq",
        "is",
        "limit",
        "single",
        "maybeSingle",
      ])
        q[method] = () => q;
      for (const method of ["insert", "update", "delete"])
        q[method] = (value: unknown) => {
          writes.push({ table, method, value });
          return q;
        };
      q.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: rows[table], error: null }).then(resolve);
      return q;
    },
  };
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const code = ts.transpileModule(
    readFileSync("src/lib/schedule/actions.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(code, {
    exports,
    crypto: { randomUUID: () => "match" },
    require: function mockRequire(name: string) {
      if (name === "./writes-server")
        return loadScheduleWriter(mockRequire, {
          crypto: { randomUUID: () => "match" },
        });
      if (name === "next/cache")
        return { revalidatePath: (path: string) => refreshed.push(path) };
      if (name === "@/lib/supabase/server")
        return { createClient: async () => client };
      if (name === "@/lib/workspace/active-workspace-server")
        return {
          getWorkspaceContext: async () =>
            role === "anonymous"
              ? null
              : {
                  active: {
                    kind: "team",
                    id: "program",
                    role,
                    eventsPolicy: options.eventsPolicy ?? "staff",
                    name: "Team",
                  },
                  viewer: { id: "viewer" },
                },
        };
      if (name === "./entry-state") return { matchResultFor };
      if (name === "./format") return { DEFAULT_DOUBLES_GAMES_TO, roundRank };
      if (name === "@/lib/workspace/types")
        return { canManageTeamSchedule, isProgramStaff, uploadPolicyLabel };
      return {};
    },
  });
  return { actions: exports, writes, refreshed };
}

const outcome = {
  entryId: "entry",
  round: null,
  outcome: { kind: "default", side: "theirs" },
};
const score = {
  entryId: "entry",
  round: null,
  opponentLabels: ["Opponent"],
  ourGames: [6, 6],
  theirGames: [2, 3],
  ourTiebreaks: [],
  theirTiebreaks: [],
};

test("owner, coach and staff set and clear with active program scope and both refreshes", async () => {
  for (const role of ["owner", "coach", "staff"]) {
    for (const value of [outcome, { ...outcome, outcome: null }]) {
      const run = actions(role);
      expect(await run.actions.setOutcome(value)).toEqual({ ok: true });
      expect(run.writes).toEqual([
        {
          name: "set_schedule_outcome",
          args: {
            p_program_id: "program",
            p_entry_id: "entry",
            p_round: null,
            p_kind: value.outcome?.kind ?? null,
            p_side: value.outcome?.side ?? null,
          },
        },
      ]);
      expect(run.refreshed).toEqual([
        "/dashboard/team/schedule",
        "/dashboard/team/schedule/event",
      ]);
    }
  }
});

test("players and signed-out requests never reach a write", async () => {
  for (const role of ["player", "anonymous"]) {
    const run = actions(role);
    expect(await run.actions.setOutcome(outcome)).toHaveProperty("error");
    expect(await run.actions.recordResult(score)).toHaveProperty("error");
    expect(run.writes).toEqual([]);
    expect(run.refreshed).toEqual([]);
  }
});

test("database authorization and conflict errors are actionable and never refresh", async () => {
  for (const message of [
    "That line is unavailable in your active program.",
    "Clear the saved outcome before changing it.",
    "This line already has a match. Remove it before saving an outcome.",
  ]) {
    const run = actions("staff", { rpcError: message });
    expect(await run.actions.setOutcome(outcome)).toEqual({ error: message });
    expect(run.writes).toHaveLength(1);
    expect(run.refreshed).toEqual([]);
  }
});

test("recordResult refuses saved outcomes and cross-program entries without any write", async () => {
  for (const options of [{ outcome: true }, { otherProgram: true }]) {
    const run = actions("staff", options);
    expect(await run.actions.recordResult(score)).toHaveProperty("error");
    expect(run.writes).toEqual([]);
    expect(run.refreshed).toEqual([]);
  }
});

test("cleared outcome leaves the score path available without processing jobs", async () => {
  const run = actions();
  expect(await run.actions.recordResult(score)).toEqual({ matchId: "match" });
  expect(run.writes).toContainEqual(
    expect.objectContaining({ table: "matches", method: "insert" }),
  );
  expect(run.writes).not.toContainEqual(
    expect.objectContaining({ table: "processing_jobs" }),
  );
  expect(run.refreshed).toEqual([
    "/dashboard/team/schedule",
    "/dashboard/team/schedule/event",
  ]);
});

/** The entry write a `recordResult` made, if any. */
function entryUpdate(writes: unknown[]) {
  return writes.find(
    (write): write is { table: string; method: string; value: unknown } =>
      typeof write === "object" &&
      write !== null &&
      (write as { table?: string }).table === "program_event_entries" &&
      (write as { method?: string }).method === "update",
  );
}

test("a dual line syncs the opponent's name onto the entry and leaves its school alone", async () => {
  const run = actions();
  expect(await run.actions.recordResult(score)).toEqual({ matchId: "match" });
  const update = entryUpdate(run.writes);
  expect(update).toBeDefined();
  expect(update!.value).toMatchObject({ opponent_labels: ["Opponent"] });
  expect(update!.value).not.toHaveProperty("opponent_school");
  expect(update!.value).not.toHaveProperty("opponent_program_id");
});

test.describe("a tournament round's school on the entry", () => {
  const round = (name: string) => ({
    ...score,
    round: name,
    opponentLabels: ["Lee Park"],
    opponentSchool: "Ridgeline University",
    opponentProgramKey: "ridgeline",
  });

  test("a first result writes the school and the resolved program id", async () => {
    const run = actions("staff", {
      tournament: { matches: [] },
      program: { id: "ridgeline-id" },
    });
    expect(await run.actions.recordResult(round("R32"))).toEqual({
      matchId: "match",
    });
    expect(run.writes).toContainEqual(
      expect.objectContaining({ table: "matches", method: "insert" }),
    );
    expect(entryUpdate(run.writes)?.value).toMatchObject({
      opponent_labels: ["Lee Park"],
      opponent_school: "Ridgeline University",
      opponent_program_id: "ridgeline-id",
    });
  });

  test("a typed school writes the name and clears the program id", async () => {
    const run = actions("staff", { tournament: { matches: [] } });
    expect(
      await run.actions.recordResult({
        ...round("R32"),
        opponentSchool: "Valley Club",
        opponentProgramKey: null,
      }),
    ).toEqual({ matchId: "match" });
    expect(entryUpdate(run.writes)?.value).toMatchObject({
      opponent_school: "Valley Club",
      opponent_program_id: null,
    });
    // Nothing to resolve, so the directory is never asked.
    expect(run.writes).not.toContainEqual(
      expect.objectContaining({ table: "programs" }),
    );
  });

  test("a correction of the latest round still syncs; an earlier round never clobbers", async () => {
    // R32 is the only round held, and the save is R32 again: a correction of
    // the latest round, so the entry follows it.
    const latest = actions("staff", {
      tournament: { matches: [{ id: "match", round: "R32" }] },
      program: { id: "ridgeline-id" },
    });
    expect(await latest.actions.recordResult(round("R32"))).toEqual({
      matchId: "match",
    });
    expect(latest.writes).toContainEqual(
      expect.objectContaining({ table: "matches", method: "update" }),
    );
    expect(entryUpdate(latest.writes)?.value).toMatchObject({
      opponent_school: "Ridgeline University",
      opponent_program_id: "ridgeline-id",
    });

    // R16 is already held, and the save is R32: a round-old opponent from an
    // edit about a score. The entry keeps R16's.
    const earlier = actions("staff", {
      tournament: { matches: [{ id: "match-r16", round: "R16" }] },
      program: { id: "ridgeline-id" },
    });
    expect(await earlier.actions.recordResult(round("R32"))).toEqual({
      matchId: "match-r16",
    });
    expect(entryUpdate(earlier.writes)).toBeUndefined();
  });
});

test("recordResult defaults college matches to Play On Lets, singles and doubles both", async () => {
  for (const discipline of ["singles", "doubles"] as const) {
    const run = actions("staff", { discipline });
    expect(await run.actions.recordResult(score)).toEqual({ matchId: "match" });
    const insert = run.writes.find(
      (write): write is { table: string; method: string; value: unknown } =>
        typeof write === "object" &&
        write !== null &&
        (write as { table?: string }).table === "matches",
    );
    expect(insert).toBeDefined();
    expect(
      (insert!.value as { format: Record<string, unknown> }).format,
    ).toMatchObject({ play_on_lets: true });
  }
});

test("all extracted writes retain member policy authorization before touching inputs", async () => {
  for (const role of ["anonymous", "player", "coach"]) {
    const run = actions(role, { eventsPolicy: "owner" });
    for (const name of [
      "createDual",
      "createTournament",
      "updateDual",
      "updateTournament",
      "recordResult",
      "setOutcome",
    ])
      expect(await run.actions[name](null)).toHaveProperty("error");
    expect(run.writes).toEqual([]);
    expect(run.refreshed).toEqual([]);
  }
});

test("internal writer has no remotely callable Server Action directive", () => {
  const service = readFileSync("src/lib/schedule/writes-server.ts", "utf8");
  expect(service).not.toMatch(/["']use server["']/);
  const boundary = readFileSync("tests/client-bundle-boundary.spec.ts", "utf8");
  expect(boundary).toContain('"lib/schedule/writes-server.ts"');
});
