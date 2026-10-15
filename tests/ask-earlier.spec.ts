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
 *
 * So the zone is an argument — the workspace's — and never the machine's.
 * UTC is only the fallback: read in UTC, a question asked on a California
 * evening is dated tomorrow, and on a month's last evening it is filed under
 * next month.
 */

const PACIFIC = "America/Los_Angeles";

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
      undefined,
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

  test("with no zone given, the month is UTC's, on either side of a month's edge", () => {
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

  test("the month is the zone's: a month's last evening stays in that month", () => {
    const rows = [
      // 8:30 pm on Oct 12 in California — Oct 13 in UTC.
      row("evening", "2026-10-13T03:30:00.000Z"),
      // 10 pm on Sep 30 in California — already October in UTC.
      row("month-end", "2026-10-01T05:00:00.000Z"),
      // 9 pm on Dec 31, 2025 in California — already 2026 in UTC.
      row("year-end", "2026-01-01T05:00:00.000Z"),
    ];

    const pacific = askMonthGroups(rows, PACIFIC);
    expect(pacific.map((group) => [group.key, group.label])).toEqual([
      ["2026-10", "October"],
      ["2026-09", "September"],
      ["2025-12", "December 2025"],
    ]);
    expect(pacific.map((group) => group.rows.map((item) => item.id))).toEqual([
      ["evening"],
      ["month-end"],
      ["year-end"],
    ]);

    // The same instants in UTC, which is what the rail used to show.
    expect(askMonthGroups(rows, "UTC").map((group) => group.key)).toEqual([
      "2026-10",
      "2026-01",
    ]);

    // East of Greenwich the edge moves the other way: 23:30 UTC on Oct 31
    // is already November 1 in Tokyo.
    expect(
      askMonthGroups([row("late", "2026-10-31T23:30:00.000Z")], "Asia/Tokyo")[0]
        .key,
    ).toBe("2026-11");
  });

  test("a zone that is missing or unknown reads as UTC and never throws", () => {
    const rows = [row("evening", "2026-10-01T05:00:00.000Z")];
    for (const zone of [undefined, null, "", "Not/AZone", "pacific time"]) {
      expect(askMonthGroups(rows, zone).map((group) => group.key)).toEqual([
        "2026-10",
      ]);
    }
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

  test("the day is the zone's", () => {
    // 8:30 pm on Oct 12 in California.
    expect(askDayLabel("2026-10-13T03:30:00.000Z", PACIFIC)).toBe("Oct 12");
    // 10 pm on Sep 30 in California.
    expect(askDayLabel("2026-10-01T05:00:00.000Z", PACIFIC)).toBe("Sep 30");
    // Mid-afternoon is the same day either way.
    expect(askDayLabel("2026-10-12T21:00:00.000Z", PACIFIC)).toBe("Oct 12");
    expect(askDayLabel("2026-10-31T23:30:00.000Z", "Asia/Tokyo")).toBe("Nov 1");
  });

  test("a zone that is missing or unknown reads as UTC and never throws", () => {
    for (const zone of [undefined, null, "", "Not/AZone"]) {
      expect(askDayLabel("2026-10-13T03:30:00.000Z", zone)).toBe("Oct 13");
    }
  });

  test("with no zone given, the day is UTC's", () => {
    expect(askDayLabel("2026-10-31T23:30:00.000Z")).toBe("Oct 31");
    expect(askDayLabel("2026-11-01T01:00:00+02:00")).toBe("Oct 31");
  });

  test("null for a date that cannot be read", () => {
    expect(askDayLabel("")).toBeNull();
    expect(askDayLabel("soon")).toBeNull();
  });
});

// ── Pins and the filter ─────────────────────────────────────────────────────

import {
  askConversationsMatching,
  askPinnedFirst,
} from "@/components/dashboard/ask/ask-earlier";

test.describe("askPinnedFirst", () => {
  const rows = [
    { id: "a", title: "A", pinnedAt: null },
    { id: "b", title: "B", pinnedAt: "2026-10-03T00:00:00Z" },
    { id: "c", title: "C", pinnedAt: null },
    { id: "d", title: "D", pinnedAt: "2026-10-10T00:00:00Z" },
  ];

  test("pinned rows apart, newest pin first; the rest keep their order", () => {
    const { pinned, rest } = askPinnedFirst(rows);
    expect(pinned.map((row) => row.id)).toEqual(["d", "b"]);
    expect(rest.map((row) => row.id)).toEqual(["a", "c"]);
  });

  test("nothing pinned: an empty first group", () => {
    expect(askPinnedFirst(rows.slice(0, 1)).pinned).toEqual([]);
  });
});

test.describe("askConversationsMatching", () => {
  const rows = [
    { id: "1", title: "Why do I lose to Marek Dvorsky" },
    { id: "2", title: "First serve trend since June" },
    { id: "3", title: "Serve placement on break points" },
  ];

  test("every word of the query, case and spacing aside", () => {
    expect(askConversationsMatching(rows, "serve").map((r) => r.id)).toEqual([
      "2",
      "3",
    ]);
    expect(
      askConversationsMatching(rows, "  BREAK   serve ").map((r) => r.id),
    ).toEqual(["3"]);
    expect(askConversationsMatching(rows, "marek june")).toEqual([]);
  });

  test("a blank query is every row, in order", () => {
    expect(askConversationsMatching(rows, "   ").map((r) => r.id)).toEqual([
      "1",
      "2",
      "3",
    ]);
  });
});
