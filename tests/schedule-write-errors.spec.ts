import { loadScheduleWriter } from "./helpers/schedule-writer";
/**
 * `scheduleWriteError` maps a handful of raw Postgres errors to sentences a
 * coach or admin can act on. Two of those sentences name the admin console:
 * a reserved-but-unfinished console submission, and a FK a console table
 * still holds against a row this writer would otherwise delete or update.
 * Everything else round-trips the driver's own message unchanged.
 */
import { expect, test } from "@playwright/test";
import { lineupForfeitSide, planEntryChanges } from "@/lib/schedule/entry-plan";
import {
  DUAL_SLOTS,
  validateDualLineup,
  validateLineup,
} from "@/lib/schedule/lineup-validation";
import { DEFAULT_DOUBLES_GAMES_TO, roundRank } from "@/lib/schedule/format";
import { matchResultFor } from "@/lib/schedule/entry-state";
import type { EventDetail, EventEntry } from "@/lib/schedule/types";
import type {
  LineupLineInput,
  UpdateDualInput,
  UpdateTournamentInput,
} from "@/lib/schedule/actions";

function mockRequire(name: string) {
  if (name === "./entry-plan") return { lineupForfeitSide, planEntryChanges };
  if (name === "./lineup-validation")
    return { validateDualLineup, validateLineup };
  if (name === "./format") return { DEFAULT_DOUBLES_GAMES_TO, roundRank };
  if (name === "./entry-state") return { matchResultFor };
  return {};
}

const writer = loadScheduleWriter(mockRequire);

const RESERVED_SENTENCE =
  "An administrator's console submission has reserved this line and has not finished. Ask an administrator to resume or abandon it in the admin console.";
const CONSOLE_FK_SENTENCE =
  "This event has results recorded through the admin console, so it can't be deleted or have its lines removed here.";

test("a reserved console submission returns the resume-or-abandon sentence", () => {
  expect(
    writer.scheduleWriteError({
      message: 'console-result-reserved: entry "entry-1" is held open',
    }),
  ).toEqual({ error: RESERVED_SENTENCE });
});

test("the reserved-console check runs before the retry-conflict branch", () => {
  // Same driver code as a serialization failure, but the message still names
  // the reservation — the more specific sentence must win.
  expect(
    writer.scheduleWriteError({
      code: "40001",
      message: "console-result-reserved",
    }),
  ).toEqual({ error: RESERVED_SENTENCE });
});

test("a 23503 naming any console-owned foreign key returns the console-results sentence", () => {
  for (const fkey of [
    "admin_upload_submissions_event_id_fkey",
    "admin_upload_submission_items_outcome_id_fkey",
    "admin_schedule_result_targets_entry_id_fkey",
  ]) {
    expect(
      writer.scheduleWriteError({
        code: "23503",
        message: `update or delete on table "program_event_entries" violates foreign key constraint "${fkey}" on table "admin_upload_submissions"`,
      }),
    ).toEqual({ error: CONSOLE_FK_SENTENCE });
  }
});

test("every other error passes its own message through unchanged", () => {
  expect(
    writer.scheduleWriteError({ message: "Something else went wrong." }),
  ).toEqual({ error: "Something else went wrong." });

  // A 23503 that names an unrelated foreign key is not a console reference.
  expect(
    writer.scheduleWriteError({
      code: "23503",
      message:
        'update or delete on table "matches" violates foreign key constraint "matches_created_by_fkey" on table "users"',
    }),
  ).toEqual({
    error:
      'update or delete on table "matches" violates foreign key constraint "matches_created_by_fkey" on table "users"',
  });
});

test("the existing 40001/40P01 retry-conflict sentence is unchanged", () => {
  for (const code of ["40001", "40P01"]) {
    expect(writer.scheduleWriteError({ code, message: "conflict" })).toEqual({
      error:
        "This line changed while you were saving. Refresh the event and try again.",
    });
  }
});

/** A full, valid nine-line dual submission; `id` is set only where given. */
function lineupWith(orphanSlot: string): LineupLineInput[] {
  return DUAL_SLOTS.map((slot, index) => {
    const doubles = slot.startsWith("D");
    const ids = doubles ? [`p${index}a`, `p${index}b`] : [`p${index}`];
    return {
      ...(slot === orphanSlot ? { id: "some-other-entry-id" } : {}),
      discipline: doubles ? "doubles" : "singles",
      slot,
      position: index,
      playerUserIds: ids,
      playerLabels: ids.map((id) => `Player ${id}`),
      opponentLabels: doubles
        ? [`Opp ${index}a`, `Opp ${index}b`]
        : [`Opp ${index}`],
    } as LineupLineInput;
  });
}

test("updateDual's entry delete maps a console-owned foreign key to the console sentence", async () => {
  // One saved, unsettled line at S1. The submission's S1 row carries an id
  // that matches no saved entry, so it plans as an insert and leaves the
  // saved S1 row unmatched — and, being free to move, planned as a delete.
  const savedEntry: EventEntry = {
    id: "entry-S1",
    eventId: "event",
    discipline: "singles",
    slot: "S1",
    position: 0,
    draw: null,
    seed: null,
    playerUserIds: ["old-player"],
    playerLabels: ["Old Player"],
    opponentLabels: ["Old Opponent"],
    opponentSchool: "Opponent",
    opponentProgramId: null,
    forfeit: null,
    matches: [],
    outcomes: [],
  };
  const detail: EventDetail = {
    event: {
      id: "event",
      programId: "program",
      kind: "dual",
      name: "Opponent",
      startsOn: "2026-09-10",
      endsOn: "2026-09-10",
      site: "home",
      surface: "hard",
      host: null,
      format: { bestOf: 3, adScoring: false },
    },
    entries: [savedEntry],
  };

  const deleteCalls: { table: string; ids: unknown }[] = [];
  const client = {
    from(table: string) {
      let mode: "update" | "delete" | "insert" | "read" = "read";
      let ids: unknown;
      const q = {
        update: () => {
          mode = "update";
          return q;
        },
        delete: () => {
          mode = "delete";
          return q;
        },
        insert: () => {
          mode = "insert";
          return q;
        },
        in: (_key: string, value: unknown) => {
          ids = value;
          return q;
        },
        eq: () => q,
        then: (resolve: (value: unknown) => unknown) => {
          if (mode === "delete") {
            deleteCalls.push({ table, ids });
            return Promise.resolve({
              error: {
                code: "23503",
                message:
                  'update or delete on table "program_event_entries" violates foreign key constraint "admin_schedule_result_targets_entry_id_fkey" on table "admin_schedule_result_targets"',
              },
            }).then(resolve);
          }
          return Promise.resolve({ error: null }).then(resolve);
        },
      };
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  };

  const service = writer.createScheduleWriter(
    { programId: "program", userId: "coach" },
    {
      createClient: async () => client as never,
      getEventDetail: async () => detail,
      revalidatePath: () => undefined,
    },
  );

  const input: UpdateDualInput = {
    eventId: "event",
    date: "2026-09-10",
    startsAtTime: null,
    site: "home",
    surface: "hard",
    bestOf: 3,
    adScoring: false,
    doublesGamesTo: 6,
    doublesAdScoring: false,
    lines: lineupWith("S1"),
  };

  expect(await service.updateDual(input)).toEqual({
    error: CONSOLE_FK_SENTENCE,
  });
  expect(deleteCalls).toEqual([
    { table: "program_event_entries", ids: ["entry-S1"] },
  ]);
});

/**
 * An event edit can change its format, and the upload wizard's line preset
 * carries that format — so both edit writers refresh `/dashboard/team/upload`
 * as well as the schedule, or a wizard reopened on one of the event's lines
 * keeps scoring under the old Ad/No-Ad and best-of.
 */
function eventEditWriter(kind: "dual" | "tournament") {
  const refreshed: string[] = [];
  const detail: EventDetail = {
    event: {
      id: "event",
      programId: "program",
      kind,
      name: "Event",
      startsOn: "2026-09-10",
      endsOn: "2026-09-12",
      site: "home",
      surface: "hard",
      host: null,
      format: { bestOf: 3, adScoring: true },
    },
    entries: [],
  };
  const client = {
    from() {
      const q: Record<string, unknown> = {};
      for (const method of ["update", "delete", "insert", "in", "eq"])
        q[method] = () => q;
      q.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ error: null }).then(resolve);
      return q;
    },
    rpc: async () => ({ data: null, error: null }),
  };
  const service = writer.createScheduleWriter(
    { programId: "program", userId: "coach" },
    {
      createClient: async () => client as never,
      getEventDetail: async () => detail,
      revalidatePath: (path: string) => {
        refreshed.push(path);
      },
    },
  );
  return { service, refreshed };
}

test("updateTournament refreshes the upload wizard alongside the schedule", async () => {
  const { service, refreshed } = eventEditWriter("tournament");
  const input: UpdateTournamentInput = {
    eventId: "event",
    name: "Fall Invitational",
    startsOn: "2026-09-10",
    endsOn: "2026-09-12",
    site: "home",
    surface: "hard",
    host: null,
    bestOf: 3,
    adScoring: false,
    entries: [],
  };

  expect(await service.updateTournament(input)).toEqual({ eventId: "event" });
  expect(refreshed).toEqual([
    "/dashboard/team/schedule",
    "/dashboard/team/schedule/event",
    "/dashboard/team/upload",
  ]);
});

test("updateDual refreshes the upload wizard alongside the schedule", async () => {
  const { service, refreshed } = eventEditWriter("dual");
  const input: UpdateDualInput = {
    eventId: "event",
    date: "2026-09-10",
    startsAtTime: null,
    site: "home",
    surface: "hard",
    bestOf: 3,
    adScoring: false,
    doublesGamesTo: 6,
    doublesAdScoring: false,
    // No slot carries an id, so every line plans as an insert.
    lines: lineupWith("none"),
  };

  expect(await service.updateDual(input)).toEqual({ eventId: "event" });
  expect(refreshed).toEqual([
    "/dashboard/team/schedule",
    "/dashboard/team/schedule/event",
    "/dashboard/team/upload",
  ]);
});
