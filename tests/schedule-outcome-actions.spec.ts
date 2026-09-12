import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { isProgramStaff } from "@/lib/workspace/types";
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
      discipline: "singles",
      forfeit: null,
    },
    program_events: {
      name: "Dual",
      kind: "dual",
      starts_on: "2026-09-10",
      format: {},
    },
    program_event_outcomes: options.outcome ? [{ id: "outcome" }] : [],
    matches: [],
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
    require(name: string) {
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
                  active: { kind: "team", id: "program", role },
                  viewer: { id: "viewer" },
                },
        };
      if (name === "@/lib/workspace/types") return { isProgramStaff };
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
