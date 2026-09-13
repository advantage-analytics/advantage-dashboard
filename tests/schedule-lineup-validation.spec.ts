import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canManageTeamSchedule, isProgramStaff } from "@/lib/workspace/types";
import { planEntryChanges } from "@/lib/schedule/entry-plan";
import { validateLineup } from "@/lib/schedule/lineup-validation";
import type { LineupLineInput } from "@/lib/schedule/actions";
import type {
  EventEntry,
  OutcomeKind,
  OutcomeSide,
} from "@/lib/schedule/types";

function line(slot: string, ids: string[]): LineupLineInput {
  return {
    slot,
    discipline: slot.startsWith("D") ? "doubles" : "singles",
    position: Number(slot.slice(1)),
    playerUserIds: ids,
    playerLabels: ids.map(() => "Same Name"),
    opponentLabels: [],
    forfeit: null,
  };
}

function entry(overrides: Partial<EventEntry> = {}): EventEntry {
  return {
    ...line("D1", ["a", "b"]),
    id: "entry",
    eventId: "event",
    draw: null,
    seed: null,
    opponentSchool: null,
    forfeit: null,
    matches: [],
    ...overrides,
  };
}

// Actual actions and planner, with only request/database boundaries mocked.
function actions(entries: EventEntry[] = []) {
  const writes: unknown[] = [];
  const refreshed: string[] = [];
  const client = {
    from(table: string) {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "single"])
        query[method] = () => query;
      for (const method of ["insert", "update", "delete"])
        query[method] = (value: unknown) => {
          writes.push({ table, method, value });
          return query;
        };
      query.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: { id: "event" }, error: null }).then(resolve);
      return query;
    },
    async rpc(name: string, args: unknown) {
      writes.push({ name, args });
      return { data: null, error: null };
    },
  };
  const exports: Record<string, (input: unknown) => Promise<unknown>> = {};
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
    require(name: string) {
      if (name === "next/cache")
        return { revalidatePath: (path: string) => refreshed.push(path) };
      if (name === "@/lib/supabase/server")
        return { createClient: async () => client };
      if (name === "@/lib/workspace/active-workspace-server")
        return {
          getWorkspaceContext: async () => ({
            active: { kind: "team", id: "program", role: "coach", eventsPolicy: "staff" },
            viewer: { id: "viewer" },
          }),
        };
      if (name === "@/lib/workspace/types") return { canManageTeamSchedule, isProgramStaff };
      if (name === "@/lib/data/schedule-server")
        return {
          getEventDetail: async () => ({
            event: { id: "event", kind: "dual" },
            entries,
          }),
        };
      if (name === "./entry-plan") return { planEntryChanges };
      if (name === "./lineup-validation") return { validateLineup };
      return {};
    },
  });
  return { actions: exports, writes, refreshed };
}

const input = {
  eventId: "event",
  opponent: "Opponent",
  opponentProgramKey: null,
  date: "2026-09-10",
  site: "home",
  surface: "hard",
  bestOf: 3,
  adScoring: true,
};

const invalidLineups = [
  { lines: [line("D2", ["a", "a"])], slot: "D2" },
  { lines: [line("S1", ["a", "a"])], slot: "S1" },
  { lines: [line("D1", ["a", "b"]), line("D2", ["a", "b"])], slot: "D2" },
  { lines: [line("D1", ["a", "b"]), line("D3", ["b", "a"])], slot: "D3" },
];

test("duplicate identities and exact pairs identify the affected line", () => {
  for (const { lines, slot } of invalidLineups) {
    expect(validateLineup(lines)).toEqual([
      { slot, reason: expect.stringContaining(slot) },
    ]);
    const plan = planEntryChanges([], lines);
    expect(plan.refuse).toHaveLength(1);
    expect(plan.insert).toEqual([]);
    expect(plan.update).toEqual([]);
    expect(plan.delete).toEqual([]);
  }
  expect(validateLineup(invalidLineups[3].lines)[0].reason).toContain("D1");
});

test("IDs, not equal labels, determine pairs and do not restrict other participation", () => {
  expect(
    validateLineup([
      line("S1", ["a"]),
      line("S2", ["a"]),
      line("D1", ["a", "b"]),
      line("D2", ["a", "c"]),
      line("D3", ["c", "d"]),
    ]),
  ).toEqual([]);
  expect(
    validateLineup([line("D1", []), line("D2", []), line("D3", ["a"])]),
  ).toEqual([]);
});

test("create and update reject invalid lineups before any event or entry write", async () => {
  for (const { lines, slot } of invalidLineups) {
    for (const action of ["createDual", "updateDual"]) {
      const run = actions([entry()]);
      expect(await run.actions[action]({ ...input, lines })).toEqual({
        error: expect.stringContaining(slot),
      });
      expect(run.writes).toEqual([]);
      expect(run.refreshed).toEqual([]);
    }
  }
});

test("valid singles and doubles with equal display names reach both save paths", async () => {
  for (const action of ["createDual", "updateDual"]) {
    const run = actions();
    expect(
      await run.actions[action]({
        ...input,
        lines: [line("S1", ["a"]), line("D1", ["a", "b"])],
      }),
    ).toEqual({ eventId: "event" });
    expect(run.writes).toContainEqual(
      expect.objectContaining({
        table: "program_event_entries",
        method: "insert",
      }),
    );
  }
});

test("saved outcomes protect every kind and side from reassignment and removal", async () => {
  for (const kind of ["forfeit", "default", "withdrawal"] as OutcomeKind[]) {
    for (const side of ["ours", "theirs"] as OutcomeSide[]) {
      const saved = entry({
        outcomes: [
          {
            id: "outcome",
            round: null,
            kind,
            side,
            actorUserId: "coach",
            recordedAt: "2026-09-10",
          },
        ],
      });
      for (const lines of [[line("D1", ["a", "c"])], [line("S1", ["c"])]]) {
        const run = actions([saved]);
        expect(await run.actions.updateDual({ ...input, lines })).toEqual({
          error: expect.stringMatching(/D1.*Clear the outcome/),
        });
        expect(run.writes).toEqual([]);
      }
      expect(
        planEntryChanges([saved], [line("D1", ["a", "b"])]).refuse,
      ).toEqual([]);
    }
  }
});

test("played and legacy-forfeit protection remains and clearing permits edits", async () => {
  const protectedEntries = [
    entry({ forfeit: "ours" }),
    entry({
      matches: [
        {
          id: "match",
          round: null,
          status: "imported",
          score: null,
          opponentLabels: [],
          hasVideo: false,
        },
      ],
    }),
  ];
  for (const saved of protectedEntries) {
    const run = actions([saved]);
    expect(
      await run.actions.updateDual({
        ...input,
        lines: [line("D1", ["a", "c"])],
      }),
    ).toHaveProperty("error");
    expect(run.writes).toEqual([]);
  }
  const run = actions([entry({ outcomes: [] })]);
  expect(
    await run.actions.updateDual({ ...input, lines: [line("D1", ["a", "c"])] }),
  ).toEqual({ eventId: "event" });
  expect(run.writes).toContainEqual(
    expect.objectContaining({
      table: "program_event_entries",
      method: "update",
    }),
  );
});

test("a tournament outcome in any round protects the entry while unchanged saves remain valid", () => {
  const saved = entry({
    slot: null,
    discipline: "singles",
    draw: "main",
    playerUserIds: ["a"],
    playerLabels: ["Same Name"],
    outcomes: [
      {
        id: "outcome",
        round: "R16",
        kind: "withdrawal",
        side: "ours",
        actorUserId: "coach",
        recordedAt: "2026-09-10",
      },
    ],
  });
  const incoming = {
    id: saved.id,
    discipline: saved.discipline,
    draw: saved.draw,
    seed: saved.seed,
    position: saved.position,
    playerUserIds: saved.playerUserIds,
    playerLabels: saved.playerLabels,
  };
  expect(planEntryChanges([saved], [incoming]).refuse).toEqual([]);
  expect(
    planEntryChanges([saved], [{ ...incoming, seed: 1 }]).refuse[0].reason,
  ).toContain("Clear the outcome");
  expect(planEntryChanges([saved], []).refuse[0].reason).toContain(
    "can't be removed",
  );
});
