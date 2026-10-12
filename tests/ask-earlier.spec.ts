import { expect, test } from "@playwright/test";

import {
  ASK_UNDATED_LABEL,
  askDayLabel,
  askMonthGroups,
} from "@/components/dashboard/ask/ask-earlier";

/**
 * `ask-earlier.ts` — how the Ask rail files earlier questions under months.
 * Offline and clockless: rows in, groups out.
 *
 * What these guard is quiet. A month read in the machine's own time zone
 * files a question asked late on the 31st under a different month on the
 * server than in the browser, and React swaps the list after hydration; a
 * "this year" taken from the clock does the same every New Year's Eve.
 */

const row = (id: string, updatedAt: string) => ({ id, updatedAt });

test.describe("askMonthGroups", () => {
  test("one group per month, newest month first, rows in the order given", () => {
    const groups = askMonthGroups([
      row("a", "2026-10-09T18:30:00.000Z"),
      row("b", "2026-10-02T07:15:00.000Z"),
      row("c", "2026-09-28T09:00:00.000Z"),
      row("d", "2026-08-12T09:00:00.000Z"),
      row("e", "2026-08-01T00:00:00.000Z"),
    ]);

    expect(groups.map((group) => [group.key, group.label])).toEqual([
      ["2026-10", "October"],
      ["2026-09", "September"],
      ["2026-08", "August"],
    ]);
    expect(groups.map((group) => group.rows.map((item) => item.id))).toEqual([
      ["a", "b"],
      ["c"],
      ["d", "e"],
    ]);
  });

  test("a month that is not this year's carries its year", () => {
    const groups = askMonthGroups([
      row("a", "2026-01-04T10:00:00.000Z"),
      row("b", "2025-12-30T10:00:00.000Z"),
      row("c", "2025-01-15T10:00:00.000Z"),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      "January",
      "December 2025",
      "January 2025",
    ]);
  });

  test("“this year” is the newest row's, not the clock's", () => {
    // Everything here is years old; the newest year still reads bare.
    const groups = askMonthGroups([
      row("a", "2021-03-04T10:00:00.000Z"),
      row("b", "2020-11-30T10:00:00.000Z"),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      "March",
      "November 2020",
    ]);
  });

  test("a year handed in wins over the newest row's", () => {
    const groups = askMonthGroups(
      [
        row("a", "2025-12-30T10:00:00.000Z"),
        row("b", "2025-11-02T10:00:00.000Z"),
      ],
      2026,
    );

    expect(groups.map((group) => group.label)).toEqual([
      "December 2025",
      "November 2025",
    ]);
  });

  test("groups are ordered by month whatever order the rows arrive in", () => {
    const groups = askMonthGroups([
      row("old", "2025-11-02T12:00:00.000Z"),
      row("new", "2026-10-09T18:30:00.000Z"),
      row("mid", "2026-09-28T09:00:00.000Z"),
      row("new-2", "2026-10-01T00:00:00.000Z"),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      "2026-10",
      "2026-09",
      "2025-11",
    ]);
    expect(groups[0].rows.map((item) => item.id)).toEqual(["new", "new-2"]);
  });

  test("the month is UTC's, on either side of a month's edge", () => {
    const groups = askMonthGroups([
      // 23:30 on Oct 31 in UTC — already November east of Greenwich.
      row("late", "2026-10-31T23:30:00.000Z"),
      // 00:30 on Oct 1 in UTC — still September west of it.
      row("early", "2026-10-01T00:30:00.000Z"),
      // An offset timestamp is read as the instant it names: 01:00 on Nov 1
      // at +02:00 is 23:00 on Oct 31 in UTC.
      row("offset", "2026-11-01T01:00:00+02:00"),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("2026-10");
    expect(groups[0].rows.map((item) => item.id)).toEqual([
      "late",
      "early",
      "offset",
    ]);
  });

  test("a row with no readable date is kept, in a last group of its own", () => {
    const groups = askMonthGroups([
      row("broken", "not a date"),
      row("fine", "2026-10-09T18:30:00.000Z"),
    ]);

    expect(groups.map((group) => [group.key, group.label])).toEqual([
      ["2026-10", "October"],
      ["", ASK_UNDATED_LABEL],
    ]);
    expect(groups[1].rows.map((item) => item.id)).toEqual(["broken"]);
  });

  test("no rows, no groups", () => {
    expect(askMonthGroups([])).toEqual([]);
  });

  test("rows pass through by identity, with whatever else they carry", () => {
    const first = { id: "a", title: "Kept", updatedAt: "2026-10-09T18:30:00Z" };
    const [group] = askMonthGroups([first]);

    expect(group.rows[0]).toBe(first);
  });
});

test.describe("askDayLabel", () => {
  test("short month and day, never a year", () => {
    expect(askDayLabel("2026-10-07T12:00:00.000Z")).toBe("Oct 7");
    expect(askDayLabel("2025-11-02T12:00:00.000Z")).toBe("Nov 2");
    expect(askDayLabel("2026-09-28T09:00:00.000Z")).toBe("Sep 28");
  });

  test("the day is UTC's", () => {
    expect(askDayLabel("2026-10-31T23:30:00.000Z")).toBe("Oct 31");
    expect(askDayLabel("2026-11-01T01:00:00+02:00")).toBe("Oct 31");
  });

  test("null for a date that cannot be read", () => {
    expect(askDayLabel("")).toBeNull();
    expect(askDayLabel("soon")).toBeNull();
  });
});
