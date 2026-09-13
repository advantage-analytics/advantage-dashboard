import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canManageTeamSchedule, isProgramStaff } from "@/lib/workspace/types";
import {
  isNoPlayerLine,
  lineupForfeitSide,
  planEntryChanges,
} from "@/lib/schedule/entry-plan";
import {
  DUAL_SLOTS,
  isLineSet,
  lineupClashes,
  validateDualLineup,
  validateLineup,
} from "@/lib/schedule/lineup-validation";
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
  };
}

/** All nine lines with distinct athletes, then `overrides` by slot. */
function full(overrides: Record<string, string[]> = {}): LineupLineInput[] {
  return DUAL_SLOTS.map((slot) =>
    line(
      slot,
      overrides[slot] ??
        (slot.startsWith("D") ? [`${slot}-a`, `${slot}-b`] : [`${slot}-a`]),
    ),
  );
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
            active: {
              kind: "team",
              id: "program",
              role: "coach",
              eventsPolicy: "staff",
            },
            viewer: { id: "viewer" },
          }),
        };
      if (name === "@/lib/workspace/types")
        return { canManageTeamSchedule, isProgramStaff };
      if (name === "@/lib/data/schedule-server")
        return {
          getEventDetail: async () => ({
            event: { id: "event", kind: "dual" },
            entries,
          }),
        };
      if (name === "./entry-plan")
        return { isNoPlayerLine, lineupForfeitSide, planEntryChanges };
      if (name === "./lineup-validation")
        return { validateDualLineup, validateLineup };
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

const invalidDuals = [
  { lines: full({ D2: ["a", "a"] }), slot: "D2" },
  { lines: full({ S1: ["a"], S4: ["a"] }), slot: "S4" },
  { lines: full({ D1: ["a", "b"], D2: ["a", "c"] }), slot: "D2" },
  { lines: full({ D1: ["a", "b"], D2: ["a", "b"] }), slot: "D2" },
  { lines: full({ D1: ["a", "b"], D3: ["b", "a"] }), slot: "D3" },
];

test("a player plays one singles line and one doubles line, never two of either", () => {
  expect(
    lineupClashes([
      { slot: "S1", discipline: "singles", ids: ["a"] },
      { slot: "S2", discipline: "singles", ids: ["b"] },
      { slot: "S3", discipline: "singles", ids: ["a"] },
      { slot: "D1", discipline: "doubles", ids: ["a", "b"] },
      { slot: "D2", discipline: "doubles", ids: ["c", "b"] },
      { slot: "D3", discipline: "doubles", ids: ["", ""] },
    ]),
  ).toEqual(
    new Map([
      ["S3", "S1"],
      ["D2", "D1"],
    ]),
  );
  // Singles plus doubles is one of each.
  expect(validateDualLineup(full({ S1: ["a"], D1: ["a", "b"] }))).toEqual([]);
  expect(
    validateDualLineup(full({ S2: ["a"], S5: ["a"] }))[0].reason,
  ).toContain("already on S2");
});

test("opponent No player is exclusive with our own and with named opponents", () => {
  const withSlot = (patch: Partial<LineupLineInput>) =>
    full().map((row) => (row.slot === "S3" ? { ...row, ...patch } : row));
  expect(validateDualLineup(withSlot({ opponentNoPlayer: true }))).toEqual([]);
  const errorsFor = (lines: LineupLineInput[]) =>
    validateDualLineup(lines).map((error) => error.slot);
  expect(
    errorsFor(
      withSlot({
        opponentNoPlayer: true,
        noPlayer: true,
        playerUserIds: [],
        playerLabels: [],
      }),
    ),
  ).toEqual(["S3"]);
  expect(
    errorsFor(withSlot({ opponentNoPlayer: true, opponentLabels: ["Them"] })),
  ).toEqual(["S3"]);
});

test("a dual lineup is complete only with all nine lines set", () => {
  expect(validateDualLineup(full())).toEqual([]);
  expect(
    validateDualLineup(
      full().map((row) =>
        row.slot === "S6"
          ? { ...row, playerUserIds: [], playerLabels: [], noPlayer: true }
          : row,
      ),
    ),
  ).toEqual([]);

  const errorsFor = (lines: LineupLineInput[]) =>
    validateDualLineup(lines).map((error) => error.slot);
  // A missing court, a half pair, an unnamed singles line.
  expect(errorsFor(full().filter((row) => row.slot !== "D3"))).toEqual(["D3"]);
  expect(errorsFor(full({ D2: ["a"] }))).toEqual(["D2"]);
  expect(errorsFor(full({ S4: [] }))).toEqual(["S4"]);
  // A court twice, and No player with a player still on it.
  expect(errorsFor([...full(), line("S1", ["z"])])).toEqual(["S1"]);
  expect(
    errorsFor(
      full().map((row) =>
        row.slot === "S2" ? { ...row, noPlayer: true } : row,
      ),
    ),
  ).toEqual(["S2"]);
  expect(validateDualLineup(full({ S4: [] }))[0].reason).toContain("S4");

  expect(isLineSet({ discipline: "doubles", playerLabels: ["A", " "] })).toBe(
    false,
  );
  expect(
    isLineSet({ discipline: "singles", playerLabels: [], noPlayer: true }),
  ).toBe(true);
});

test("create and update reject invalid lineups before any event or entry write", async () => {
  for (const { lines, slot } of invalidDuals) {
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
        lines: full({ S1: ["a"], D1: ["a", "b"] }),
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
        // Named, so a forfeit by THEM is the score flow's result and not the
        // lineup's own opponent "No player".
        opponentLabels: ["Their A", "Their B"],
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
      const noPair = full().map((row) =>
        row.slot === "D1"
          ? { ...row, playerUserIds: [], playerLabels: [], noPlayer: true }
          : row,
      );
      for (const lines of [full({ D1: ["a", "c"] }), noPair]) {
        const run = actions([saved]);
        expect(await run.actions.updateDual({ ...input, lines })).toEqual({
          error: expect.stringMatching(/D1.*Clear the outcome/),
        });
        expect(run.writes).toEqual([]);
      }
      expect(
        planEntryChanges(
          [saved],
          [{ ...line("D1", ["a", "b"]), opponentLabels: saved.opponentLabels }],
        ).refuse,
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
        lines: full({ D1: ["a", "c"] }),
      }),
    ).toHaveProperty("error");
    expect(run.writes).toEqual([]);
  }
  const run = actions([entry({ outcomes: [] })]);
  expect(
    await run.actions.updateDual({ ...input, lines: full({ D1: ["a", "c"] }) }),
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
