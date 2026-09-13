/**
 * A dual's lineup and its saved outcomes, through the real actions.
 *
 * The rules under test:
 *   - a dual saves only with all nine lines set — a player, a pair, or
 *     "No player";
 *   - "No player" is the ONE outcome a lineup writes: a forfeit for our side,
 *     recorded at save and taken back when a player is named;
 *   - every other outcome is the score flow's, and a line that holds one is
 *     read-only in the lineup — it round-trips unchanged, and a submission
 *     that moves it is refused whole.
 */
import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { canManageTeamSchedule, isProgramStaff } from "@/lib/workspace/types";
import {
  isNoPlayerLine,
  isOpponentNoPlayerLine,
  lineupForfeitSide,
  planEntryChanges,
} from "@/lib/schedule/entry-plan";
import {
  DUAL_SLOTS,
  validateDualLineup,
  validateLineup,
} from "@/lib/schedule/lineup-validation";
import { resolveEntryResult, resultWon } from "@/lib/schedule/entry-state";
import { dualSeed } from "@/components/dashboard/schedule/static/new-dual-flow";
import {
  buildDualPayloadLines,
  filledDualLines,
  lockedByKeyFromSeed,
  seedDualLines,
  seededIdsFromSeed,
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
  const doubles = slot.startsWith("D");
  const ids = doubles
    ? [`player-${slot}a`, `player-${slot}b`]
    : [`player-${slot}`];
  return {
    slot,
    discipline: doubles ? "doubles" : "singles",
    position: DUAL_SLOTS.indexOf(slot as (typeof DUAL_SLOTS)[number]),
    playerUserIds: ids,
    playerLabels: ids.map((id) => id.replace("player-", "Player ")),
    opponentLabels: doubles
      ? [`Opponent ${slot}a`, `Opponent ${slot}b`]
      : [`Opponent ${slot}`],
  };
}

/** All nine lines, with the named slots marked "No player". */
function lineup(...noPlayer: string[]): LineupLineInput[] {
  return DUAL_SLOTS.map((slot) =>
    noPlayer.includes(slot)
      ? {
          ...line(slot),
          playerUserIds: [],
          playerLabels: [],
          opponentLabels: [],
          noPlayer: true,
        }
      : line(slot),
  );
}

function payload(detail: EventDetail) {
  const seed = dualSeed(detail);
  return buildDualPayloadLines(
    filledDualLines(seedDualLines([], seed), lockedByKeyFromSeed(seed)),
    seededIdsFromSeed(seed),
  );
}

// Execute the real actions and planner over a small database boundary. Rows
// written by create/update are read back through the same domain seed path.
function harness() {
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
        discipline: entry.discipline as EventEntry["discipline"],
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
            kind: outcome.kind as "forfeit",
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
              active: {
                kind: "team",
                id: "program",
                role: "coach",
                eventsPolicy: "staff",
              },
              viewer: { id: "coach" },
            }),
          };
        if (name === "@/lib/workspace/types")
          return { canManageTeamSchedule, isProgramStaff };
        if (name === "@/lib/data/schedule-server")
          return { getEventDetail: async () => detail() };
        if (name === "./entry-plan")
          return { isNoPlayerLine, lineupForfeitSide, planEntryChanges };
        if (name === "./lineup-validation")
          return { validateDualLineup, validateLineup };
        return {};
      },
    },
  );
  return { actions, detail, writes };
}

const outcomeWrites = (writes: { name?: string; value?: unknown }[]) =>
  writes.filter((write) => write.name === "set_schedule_outcome");

const bySlot = (detail: EventDetail, slot: string) =>
  detail.entries.find((entry) => entry.slot === slot)!;

test("a dual with every line named writes no outcome, created or edited", async () => {
  const run = harness();
  expect(await run.actions.createDual({ ...input, lines: lineup() })).toEqual({
    eventId: "event",
  });
  const edited = payload(run.detail());
  edited[1] = { ...edited[1], opponentLabels: ["Someone Else"] };
  expect(
    await run.actions.updateDual({ ...input, eventId: "event", lines: edited }),
  ).toEqual({ eventId: "event" });

  expect(outcomeWrites(run.writes)).toEqual([]);
  expect(run.detail().entries).toHaveLength(9);
  expect(
    run.detail().entries.every((entry) => entry.outcomes?.length === 0),
  ).toBe(true);
});

test("a lineup with a line unset is refused before anything is written", async () => {
  const eight = lineup().filter((row) => row.slot !== "S6");
  const halfPair = lineup().map((row) =>
    row.slot === "D2"
      ? { ...row, playerUserIds: ["player-D2a"], playerLabels: ["Player D2a"] }
      : row,
  );
  const unnamed = lineup().map((row) =>
    row.slot === "S3" ? { ...row, playerUserIds: [], playerLabels: [] } : row,
  );
  for (const lines of [eight, halfPair, unnamed]) {
    const run = harness();
    expect(await run.actions.createDual({ ...input, lines })).toEqual({
      error: expect.stringContaining("needs a player, or No player"),
    });
    expect(run.writes).toEqual([]);
  }

  const run = harness();
  await run.actions.createDual({ ...input, lines: lineup() });
  const before = run.writes.length;
  expect(
    await run.actions.updateDual({ ...input, eventId: "event", lines: eight }),
  ).toEqual({
    error: expect.stringContaining("needs a player, or No player"),
  });
  expect(run.writes).toHaveLength(before);
});

test("No player records a forfeit for our side, and reopens editable", async () => {
  const run = harness();
  expect(
    await run.actions.createDual({ ...input, lines: lineup("S6", "D3") }),
  ).toEqual({ eventId: "event" });

  const saved = run.detail();
  for (const slot of ["S6", "D3"]) {
    const entry = bySlot(saved, slot);
    expect(entry.playerLabels).toEqual([]);
    expect(entry.outcomes).toEqual([
      expect.objectContaining({ kind: "forfeit", side: "ours", round: null }),
    ]);
    // Our side forfeited, so the point is THEIRS.
    expect(resultWon(resolveEntryResult(entry, null))).toBe(false);
    expect(isNoPlayerLine(entry)).toBe(true);
  }
  expect(outcomeWrites(run.writes)).toHaveLength(2);
  expect(bySlot(saved, "S5").outcomes).toEqual([]);

  // The builder opens it as "No player", unlocked — and saving it untouched
  // writes nothing but the event row.
  const seed = dualSeed(saved);
  expect(seed.lines?.find((row) => row.key === "S6")).toMatchObject({
    noPlayer: true,
    locked: undefined,
  });
  expect(lockedByKeyFromSeed(seed)).toEqual({});
  const before = run.writes.length;
  expect(
    await run.actions.updateDual({
      ...input,
      eventId: "event",
      lines: payload(saved),
    }),
  ).toEqual({ eventId: "event" });
  expect(
    run.writes.slice(before).every((write) => write.table === "program_events"),
  ).toBe(true);
});

test("naming a player on a No player line clears its forfeit first", async () => {
  const run = harness();
  await run.actions.createDual({ ...input, lines: lineup("S6") });
  const lines = payload(run.detail()).map((row) =>
    row.slot === "S6"
      ? {
          ...row,
          noPlayer: false,
          playerUserIds: ["player-S6"],
          playerLabels: ["Player S6"],
        }
      : row,
  );
  const before = run.writes.length;
  expect(
    await run.actions.updateDual({ ...input, eventId: "event", lines }),
  ).toEqual({ eventId: "event" });

  const after = run.writes.slice(before);
  const clear = after.findIndex(
    (write) =>
      write.name === "set_schedule_outcome" &&
      (write.value as { p_kind: unknown }).p_kind === null,
  );
  const update = after.findIndex(
    (write) =>
      write.table === "program_event_entries" && write.method === "update",
  );
  expect(clear).toBeGreaterThanOrEqual(0);
  expect(update).toBeGreaterThan(clear);
  expect(bySlot(run.detail(), "S6")).toMatchObject({
    playerLabels: ["Player S6"],
    outcomes: [],
  });
});

test("marking a named line No player updates it, then records the forfeit", async () => {
  const run = harness();
  await run.actions.createDual({ ...input, lines: lineup() });
  const lines = payload(run.detail()).map((row) =>
    row.slot === "S5"
      ? {
          ...row,
          noPlayer: true,
          playerUserIds: [],
          playerLabels: [],
          opponentLabels: [],
        }
      : row,
  );
  const before = run.writes.length;
  expect(
    await run.actions.updateDual({ ...input, eventId: "event", lines }),
  ).toEqual({ eventId: "event" });

  const after = run.writes.slice(before);
  const update = after.findIndex(
    (write) =>
      write.table === "program_event_entries" && write.method === "update",
  );
  const record = after.findIndex(
    (write) =>
      write.name === "set_schedule_outcome" &&
      (write.value as { p_kind: unknown }).p_kind === "forfeit",
  );
  expect(update).toBeGreaterThanOrEqual(0);
  expect(record).toBeGreaterThan(update);
  expect(bySlot(run.detail(), "S5")).toMatchObject({
    playerLabels: [],
    outcomes: [expect.objectContaining({ kind: "forfeit", side: "ours" })],
  });
});

test("opponent No player records THEIR forfeit, reopens editable, and a name clears it", async () => {
  const run = harness();
  const lines = lineup().map((row) =>
    row.slot === "S4"
      ? { ...row, opponentLabels: [], opponentNoPlayer: true }
      : row,
  );
  expect(await run.actions.createDual({ ...input, lines })).toEqual({
    eventId: "event",
  });

  const saved = run.detail();
  const s4 = bySlot(saved, "S4");
  expect(s4.playerLabels).toEqual(["Player S4"]);
  expect(s4.outcomes).toEqual([
    expect.objectContaining({ kind: "forfeit", side: "theirs", round: null }),
  ]);
  // The opponent forfeited, so the point is OURS.
  expect(resultWon(resolveEntryResult(s4, null))).toBe(true);
  expect(isOpponentNoPlayerLine(s4)).toBe(true);
  expect(isNoPlayerLine(s4)).toBe(false);

  const seed = dualSeed(saved);
  expect(seed.lines?.find((row) => row.key === "S4")).toMatchObject({
    theirNoPlayer: true,
    noPlayer: false,
    locked: undefined,
  });
  const roundTrip = payload(saved);
  expect(roundTrip.find((row) => row.slot === "S4")).toMatchObject({
    opponentNoPlayer: true,
    opponentLabels: [],
  });
  let before = run.writes.length;
  expect(
    await run.actions.updateDual({
      ...input,
      eventId: "event",
      lines: roundTrip,
    }),
  ).toEqual({ eventId: "event" });
  expect(outcomeWrites(run.writes.slice(before))).toEqual([]);

  // Our side goes No player instead: their forfeit is cleared, ours recorded.
  const flipped = roundTrip.map((row) =>
    row.slot === "S4"
      ? {
          ...row,
          opponentNoPlayer: false,
          noPlayer: true,
          playerUserIds: [],
          playerLabels: [],
        }
      : row,
  );
  before = run.writes.length;
  expect(
    await run.actions.updateDual({
      ...input,
      eventId: "event",
      lines: flipped,
    }),
  ).toEqual({ eventId: "event" });
  expect(
    outcomeWrites(run.writes.slice(before)).map(
      (write) => (write.value as { p_side: unknown }).p_side,
    ),
  ).toEqual([null, "ours"]);
  expect(bySlot(run.detail(), "S4").outcomes).toEqual([
    expect.objectContaining({ side: "ours" }),
  ]);

  // And naming everyone clears it for good.
  const named = payload(run.detail()).map((row) =>
    row.slot === "S4"
      ? {
          ...row,
          noPlayer: false,
          playerUserIds: ["player-S4"],
          playerLabels: ["Player S4"],
          opponentLabels: ["Opponent S4"],
        }
      : row,
  );
  expect(
    await run.actions.updateDual({ ...input, eventId: "event", lines: named }),
  ).toEqual({ eventId: "event" });
  expect(bySlot(run.detail(), "S4").outcomes).toEqual([]);
});

for (const side of ["ours", "theirs"] as const) {
  test(`a ${side} forfeit saved on the event on a named line stays locked`, async () => {
    const run = harness();
    await run.actions.createDual({ ...input, lines: lineup() });
    expect(
      await run.actions.setOutcome({
        entryId: "entry-S1",
        round: null,
        outcome: { kind: "forfeit", side },
      }),
    ).toEqual({ ok: true });

    const saved = run.detail();
    const s1 = bySlot(saved, "S1");
    expect(isNoPlayerLine(s1)).toBe(false);
    expect(resultWon(resolveEntryResult(s1, null))).toBe(side === "theirs");
    expect(lockedByKeyFromSeed(dualSeed(saved)).S1).toBeDefined();

    expect(planEntryChanges(saved.entries, payload(saved))).toEqual({
      insert: [],
      update: [],
      delete: [],
      refuse: [],
    });
    expect(
      await run.actions.updateDual({
        ...input,
        eventId: "event",
        lines: payload(saved),
      }),
    ).toEqual({ eventId: "event" });

    // Naming someone else on it, or marking it No player, is refused whole.
    for (const forged of [
      payload(saved).map((row) =>
        row.slot === "S1" ? { ...row, playerLabels: ["Somebody Else"] } : row,
      ),
      payload(saved).map((row) =>
        row.slot === "S1"
          ? { ...row, noPlayer: true, playerUserIds: [], playerLabels: [] }
          : row,
      ),
    ]) {
      const before = run.writes.length;
      expect(
        await run.actions.updateDual({
          ...input,
          eventId: "event",
          lines: forged,
        }),
      ).toHaveProperty("error");
      expect(run.writes).toHaveLength(before);
    }

    // Clearing it on the event reopens the line.
    expect(
      await run.actions.setOutcome({
        entryId: s1.id,
        round: null,
        outcome: null,
      }),
    ).toEqual({ ok: true });
    expect(lockedByKeyFromSeed(dualSeed(run.detail())).S1).toBeUndefined();
  });
}

test("every saved non-played result keeps its own label and locks its assignments", async () => {
  const run = harness();
  await run.actions.createDual({ ...input, lines: lineup() });
  for (const kind of ["forfeit", "default", "withdrawal"] as const) {
    for (const side of ["ours", "theirs"] as const) {
      const saved = run.detail();
      const s1 = bySlot(saved, "S1");
      s1.outcomes = [
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
      expect(planEntryChanges(saved.entries, payload(saved))).toEqual({
        insert: [],
        update: [],
        delete: [],
        refuse: [],
      });
    }
  }
});
