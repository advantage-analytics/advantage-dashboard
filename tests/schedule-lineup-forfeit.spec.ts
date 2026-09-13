import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canManageTeamSchedule, isProgramStaff } from "@/lib/workspace/types";
import { planEntryChanges } from "@/lib/schedule/entry-plan";
import { validateLineup } from "@/lib/schedule/lineup-validation";
import { resolveEntryResult, resultWon } from "@/lib/schedule/entry-state";
import { dualSeed } from "@/components/dashboard/schedule/static/new-dual-flow";
import {
  buildDualPayloadLines,
  filledDualLines,
  lockedByKeyFromSeed,
  lockedForfeitFromSeed,
  seedDualLines,
  seededIdsFromSeed,
  setDraftForfeit,
} from "@/components/dashboard/schedule/static/dual-build-step";
import type { CreateDualInput, LineupLineInput } from "@/lib/schedule/actions";
import type {
  EventDetail,
  EventEntry,
  OutcomeSide,
} from "@/lib/schedule/types";

const input: CreateDualInput = {
  opponent: "Opponent",
  opponentProgramKey: null,
  date: "2026-09-10",
  site: "home",
  surface: "hard",
  bestOf: 3,
  adScoring: false,
  lines: [],
};

function line(slot: string): LineupLineInput {
  return {
    slot,
    discipline: "singles",
    position: Number(slot.slice(1)) - 1,
    playerUserIds: [`player-${slot}`],
    playerLabels: [`Player ${slot}`],
    opponentLabels: [`Opponent ${slot}`],
    forfeit: null,
  };
}

function payload(detail: EventDetail) {
  const seed = dualSeed(detail);
  return buildDualPayloadLines(
    filledDualLines(seedDualLines([], seed), lockedByKeyFromSeed(seed)),
    seededIdsFromSeed(seed),
    lockedForfeitFromSeed(seed),
  );
}

// Execute the real actions and planner over a small database boundary. Rows
// written by create/update are read back through the same domain seed path.
function harness(rpcError = false) {
  type Row = Record<string, unknown>;
  const tables: Record<string, Row[]> = {
    program_events: [],
    program_event_entries: [],
    program_event_outcomes: [],
  };
  const writes: {
    table?: string;
    method?: string;
    name?: string;
    value?: unknown;
  }[] = [];
  function detail(): EventDetail {
    const row = tables.program_events[0];
    return {
      event: {
        id: "event",
        programId: "program",
        kind: "dual",
        name: "Opponent",
        startsOn: String(row.starts_on),
        endsOn: String(row.ends_on),
        site: "home",
        surface: "hard",
        host: null,
        format: { bestOf: 3, adScoring: false },
      },
      entries: tables.program_event_entries.map((entry): EventEntry => ({
        id: String(entry.id),
        eventId: "event",
        discipline: "singles",
        slot: String(entry.slot),
        position: Number(entry.position),
        draw: null,
        seed: null,
        playerUserIds: entry.player_user_ids as string[],
        playerLabels: entry.player_labels as string[],
        opponentLabels: entry.opponent_labels as string[],
        opponentSchool: "Opponent",
        opponentProgramId: null,
        forfeit: entry.forfeit as OutcomeSide | null,
        matches: [],
        outcomes: tables.program_event_outcomes
          .filter((outcome) => outcome.entry_id === entry.id)
          .map((outcome) => ({
            id: String(outcome.id),
            round: null,
            kind: "forfeit",
            side: outcome.side as OutcomeSide,
            actorUserId: "coach",
            recordedAt: "2026-09-10T12:00:00Z",
          })),
      })),
    };
  }
  const client = {
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let method = "read";
      let value: Row | Row[];
      let single = false;
      const q = {
        select: () => q,
        eq: (key: string, expected: unknown) => {
          filters.push((r) => r[key] === expected);
          return q;
        },
        in: (key: string, expected: unknown[]) => {
          filters.push((r) => expected.includes(r[key]));
          return q;
        },
        single: () => {
          single = true;
          return q;
        },
        insert: (next: Row | Row[]) => {
          method = "insert";
          value = next;
          return q;
        },
        update: (next: Row) => {
          method = "update";
          value = next;
          return q;
        },
        delete: () => {
          method = "delete";
          return q;
        },
        then: (resolve: (value: unknown) => unknown) => {
          const matches = (row: Row) => filters.every((filter) => filter(row));
          if (method !== "read") writes.push({ table, method, value });
          if (method === "insert") {
            for (const row of Array.isArray(value) ? value : [value]) {
              tables[table].push({
                id: table === "program_events" ? "event" : `entry-${row.slot}`,
                ...row,
              });
            }
          }
          if (method === "update") {
            tables[table] = tables[table].map((row) =>
              matches(row) ? { ...row, ...value } : row,
            );
          }
          if (method === "delete")
            tables[table] = tables[table].filter((row) => !matches(row));
          const rows = tables[table].filter(matches);
          return Promise.resolve({
            data: single ? rows[0] : rows,
            error: null,
          }).then(resolve);
        },
      };
      return q;
    },
    async rpc(name: string, args: Record<string, unknown>) {
      writes.push({ name, value: args });
      if (rpcError)
        return {
          data: null,
          error: { message: "Result changed concurrently." },
        };
      if (args.p_kind === null) {
        tables.program_event_outcomes = tables.program_event_outcomes.filter(
          (o) => o.entry_id !== args.p_entry_id,
        );
      } else {
        tables.program_event_outcomes.push({
          id: `outcome-${args.p_entry_id}`,
          entry_id: args.p_entry_id,
          kind: args.p_kind,
          side: args.p_side,
        });
      }
      return { data: "event", error: null };
    },
  };
  const actions: Record<string, (input: unknown) => Promise<unknown>> = {};
  runInNewContext(
    ts.transpileModule(readFileSync("src/lib/schedule/actions.ts", "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports: actions,
      require(name: string) {
        if (name === "next/cache") return { revalidatePath: () => undefined };
        if (name === "@/lib/supabase/server")
          return { createClient: async () => client };
        if (name === "@/lib/workspace/active-workspace-server")
          return {
            getWorkspaceContext: async () => ({
              active: { kind: "team", id: "program", role: "coach", eventsPolicy: "staff" },
              viewer: { id: "coach" },
            }),
          };
        if (name === "@/lib/workspace/types") return { canManageTeamSchedule, isProgramStaff };
        if (name === "@/lib/data/schedule-server")
          return { getEventDetail: async () => detail() };
        if (name === "./entry-plan") return { planEntryChanges };
        if (name === "./lineup-validation") return { validateLineup };
        return {};
      },
    },
  );
  return { actions, detail, writes };
}

for (const side of ["ours", "theirs"] as const) {
  test(`${side} forfeit round-trips through create and edit without a match or lost sibling`, async () => {
    for (const viaEdit of [false, true]) {
      const run = harness();
      const lines = [line("S1"), line("S2")];
      if (!viaEdit) lines[0].forfeit = side;
      expect(await run.actions.createDual({ ...input, lines })).toEqual({
        eventId: "event",
      });
      if (viaEdit) {
        const edited = payload(run.detail());
        edited[0].forfeit = side;
        expect(
          await run.actions.updateDual({
            ...input,
            eventId: "event",
            lines: edited,
          }),
        ).toEqual({ eventId: "event" });
      }
      const saved = run.detail();
      expect(saved.entries[0].forfeit).toBeNull();
      expect(saved.entries[0].outcomes?.[0]).toMatchObject({
        kind: "forfeit",
        side,
      });
      expect(resultWon(resolveEntryResult(saved.entries[0], null))).toBe(
        side === "theirs",
      );
      expect(saved.entries[1]).toMatchObject({
        playerUserIds: ["player-S2"],
        playerLabels: ["Player S2"],
        opponentLabels: ["Opponent S2"],
        outcomes: [],
      });
      expect(planEntryChanges(saved.entries, payload(saved))).toEqual({
        insert: [],
        update: [],
        delete: [],
        refuse: [],
      });
      const before = run.writes.length;
      expect(
        await run.actions.updateDual({
          ...input,
          eventId: "event",
          lines: payload(saved),
        }),
      ).toEqual({ eventId: "event" });
      expect(
        run.writes
          .slice(before)
          .every((write) => write.table === "program_events"),
      ).toBe(true);
      expect(
        run.writes.some(
          (write) =>
            write.table === "matches" || write.table === "processing_jobs",
        ),
      ).toBe(false);
      const seed = dualSeed(saved);
      const draft = seedDualLines([], seed);
      expect(
        setDraftForfeit(draft, "S1", null, lockedByKeyFromSeed(seed)),
      ).toBe(draft);
      const forged = payload(saved);
      forged[0].forfeit = side === "ours" ? "theirs" : "ours";
      const beforeRefusal = run.writes.length;
      expect(
        await run.actions.updateDual({
          ...input,
          eventId: "event",
          lines: forged,
        }),
      ).toHaveProperty("error");
      expect(run.writes).toHaveLength(beforeRefusal);
      expect(
        await run.actions.setOutcome({
          entryId: saved.entries[0].id,
          round: null,
          outcome: null,
        }),
      ).toEqual({ ok: true });
      expect(lockedByKeyFromSeed(dualSeed(run.detail())).S1).toBeUndefined();
    }
  });
}

test("draft choices and returning to normal preserve every assignment", () => {
  const draft = seedDualLines([], {
    lines: [
      {
        key: "S1",
        ourIds: ["one"],
        ourLabels: ["One"],
        theirLabels: ["Opponent"],
      },
      { key: "D1", ourIds: ["one", "two"], ourLabels: ["One", "Two"] },
    ],
  });
  for (const side of ["ours", "theirs"] as const) {
    const chosen = setDraftForfeit(draft, "S1", side, {});
    expect(chosen[0]).toEqual({ ...draft[0], forfeit: side });
    expect(chosen.slice(1)).toEqual(draft.slice(1));
    expect(setDraftForfeit(chosen, "S1", null, {})).toEqual(draft);
  }
});

test("outcome failures describe the saved lineup and never report success", async () => {
  const run = harness(true);
  expect(
    await run.actions.createDual({
      ...input,
      lines: [{ ...line("S1"), forfeit: "theirs" }],
    }),
  ).toEqual({
    error: expect.stringMatching(/lineup was saved.*forfeit was not.*Schedule/),
  });
  expect(run.detail().entries[0].outcomes).toEqual([]);
  const editRun = harness(true);
  await editRun.actions.createDual({ ...input, lines: [line("S1")] });
  expect(
    await editRun.actions.updateDual({
      ...input,
      eventId: "event",
      lines: [{ ...line("S1"), forfeit: "ours" }],
    }),
  ).toHaveProperty("error", expect.stringContaining("lineup was saved"));
});

test("every saved non-played result keeps its own label and locks its assignments", async () => {
  const run = harness();
  await run.actions.createDual({ ...input, lines: [line("S1"), line("S2")] });
  for (const kind of ["forfeit", "default", "withdrawal"] as const) {
    for (const side of ["ours", "theirs"] as const) {
      const saved = run.detail();
      saved.entries[0].outcomes = [
        {
          id: "outcome",
          kind,
          side,
          round: null,
          actorUserId: "coach",
          recordedAt: "2026-09-10",
        },
      ];
      const seed = dualSeed(saved);
      const locked = lockedByKeyFromSeed(seed);
      const verb = {
        forfeit: "forfeited",
        default: "defaulted",
        withdrawal: "withdrew",
      }[kind];
      expect(locked.S1).toBe(
        side === "ours"
          ? `We lost — our side ${verb}`
          : `We won — opponent ${verb}`,
      );
      const draft = seedDualLines([], seed);
      expect(setDraftForfeit(draft, "S1", "ours", locked)).toBe(draft);
      expect(planEntryChanges(saved.entries, payload(saved))).toEqual({
        insert: [],
        update: [],
        delete: [],
        refuse: [],
      });
    }
  }
});
