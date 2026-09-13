import { expect, test } from "@playwright/test";

import {
  COURT_RECORD_WINDOW,
  courtRecordFrom,
  SINGLES_SLOTS,
} from "@/lib/data/team-court-record";
import type {
  EntryMatch,
  EventEntry,
  ProgramEvent,
} from "@/lib/schedule/types";

/**
 * The court-record mosaic, off the schedule.
 *
 * What is worth pinning is the side: a cell marked won under the wrong court,
 * or on the wrong day, looks like every other blue cell. The record on the
 * right of each row is the check a coach would do by eye, so it is checked
 * here against the cells it summarises.
 */

function dual(
  id: string,
  startsOn: string,
  name = `Opponent ${id}`,
): ProgramEvent {
  return {
    id,
    programId: "p-1",
    kind: "dual",
    name,
    startsOn,
    endsOn: startsOn,
    site: "home",
    surface: null,
    host: null,
    format: { bestOf: 3, adScoring: true },
  };
}

function match(id: string, winner: "us" | "them"): EntryMatch {
  return {
    id,
    round: null,
    status: "imported",
    score:
      winner === "us"
        ? { player1: [6, 6], player2: [3, 4] }
        : { player1: [3, 4], player2: [6, 6] },
    opponentLabels: ["Their Player"],
    hasVideo: false,
  };
}

function line(
  slot: string | null,
  result: "us" | "them" | "unplayed" | "forfeit-ours",
  discipline: "singles" | "doubles" = "singles",
): EventEntry {
  return {
    id: `${slot}-${result}`,
    eventId: "e",
    discipline,
    slot,
    position: 0,
    draw: null,
    seed: null,
    playerUserIds: ["u-1"],
    playerLabels: ["Our Player"],
    opponentLabels: ["Their Player"],
    opponentSchool: null,
    forfeit: result === "forfeit-ours" ? "ours" : null,
    matches:
      result === "us" || result === "them"
        ? [match(`m-${slot}-${result}`, result)]
        : [],
  };
}

test("cells follow lineWon per court, and the row record sums them", () => {
  const events = [dual("e-1", "2026-03-14"), dual("e-2", "2026-03-28")];
  const entries = new Map<string, EventEntry[]>([
    ["e-1", [line("S1", "us"), line("S2", "them"), line("S3", "unplayed")]],
    ["e-2", [line("S1", "them"), line("S2", "us"), line("S3", "forfeit-ours")]],
  ]);

  const record = courtRecordFrom(events, entries);

  expect(record.columns.map((c) => c.date)).toEqual(["3/14", "3/28"]);
  expect(record.rows.map((r) => r.slot)).toEqual([...SINGLES_SLOTS]);

  const bySlot = Object.fromEntries(
    record.rows.map((r) => [
      r.slot,
      { ...r, cells: r.cells.map((c) => c.result) },
    ]),
  );
  expect(bySlot.S1.cells).toEqual(["w", "l"]);
  expect(bySlot.S2.cells).toEqual(["l", "w"]);
  // Unplayed is a gap; a forfeit by us is a loss — the point went to them.
  expect(bySlot.S3.cells).toEqual(["-", "l"]);
  expect(bySlot.S3).toMatchObject({ wins: 0, losses: 1 });
  // A court never fielded is all gaps, not all losses.
  expect(bySlot.S6.cells).toEqual(["-", "-"]);
  expect(bySlot.S6).toMatchObject({ wins: 0, losses: 0 });

  // The hover box reads the line, not a paraphrase of it.
  const s1 = record.rows[0].cells[0];
  expect(s1).toMatchObject({
    ours: "Our Player",
    theirs: "Their Player",
    forfeit: null,
  });
  expect(s1.sets.map((set) => `${set.player1}-${set.player2}`)).toEqual([
    "6-3",
    "6-4",
  ]);
  const s3Forfeit = record.rows[2].cells[1];
  expect(s3Forfeit).toMatchObject({ result: "l", forfeit: "ours", sets: [] });
});

test("columns are chronological whatever order the schedule arrives in", () => {
  // `readSchedule` returns newest first.
  const events = [
    dual("e-3", "2026-04-11"),
    dual("e-1", "2026-03-14"),
    dual("e-2", "2026-03-28"),
  ];
  const entries = new Map(events.map((e) => [e.id, [line("S1", "us")]]));

  const record = courtRecordFrom(events, entries);
  expect(record.columns.map((c) => c.eventId)).toEqual(["e-1", "e-2", "e-3"]);
});

test("doubles, tournaments and duals with no singles result stay out", () => {
  const events = [
    dual("e-1", "2026-03-14"),
    { ...dual("e-2", "2026-03-21"), kind: "tournament" as const },
    dual("e-3", "2026-03-28"),
    dual("e-4", "2026-04-04"),
  ];
  const entries = new Map<string, EventEntry[]>([
    ["e-1", [line("S1", "us"), line("D1", "us", "doubles")]],
    ["e-2", [line("S1", "us")]],
    // Lineup filed, nobody has played — a future Saturday.
    ["e-3", [line("S1", "unplayed")]],
    // Doubles only decided so far.
    ["e-4", [line("D1", "them", "doubles"), line("S1", "unplayed")]],
  ]);

  const record = courtRecordFrom(events, entries);
  expect(record.columns.map((c) => c.eventId)).toEqual(["e-1"]);
  expect(record.rows.every((r) => r.cells.length === 1)).toBe(true);
  expect(record.dualsPlayed).toBe(1);
});

test("the window keeps the most recent duals and reports the season total", () => {
  const events = Array.from({ length: COURT_RECORD_WINDOW + 3 }, (_, i) =>
    dual(
      `e-${i}`,
      `2026-0${1 + Math.floor(i / 9)}-${String(1 + (i % 9)).padStart(2, "0")}`,
    ),
  );
  const entries = new Map(events.map((e) => [e.id, [line("S1", "us")]]));

  const record = courtRecordFrom(events, entries);
  expect(record.columns).toHaveLength(COURT_RECORD_WINDOW);
  expect(record.columns[0].eventId).toBe("e-3");
  expect(record.columns.at(-1)?.eventId).toBe(`e-${COURT_RECORD_WINDOW + 2}`);
  expect(record.dualsPlayed).toBe(COURT_RECORD_WINDOW + 3);
});

test("a line with no slot takes its position among the singles", () => {
  const events = [dual("e-1", "2026-03-14")];
  const entries = new Map<string, EventEntry[]>([
    ["e-1", [line(null, "us"), line(null, "them")]],
  ]);

  const record = courtRecordFrom(events, entries);
  const bySlot = Object.fromEntries(
    record.rows.map((r) => [
      r.slot,
      { ...r, cells: r.cells.map((c) => c.result) },
    ]),
  );
  expect(bySlot.S1.cells).toEqual(["w"]);
  expect(bySlot.S2.cells).toEqual(["l"]);
});
