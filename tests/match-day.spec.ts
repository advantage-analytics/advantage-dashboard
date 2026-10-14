import { spawnSync } from "node:child_process";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  compareMatchDays,
  formatMatchDayCompact,
  formatMatchDayLong,
  formatMatchDayMedium,
  formatMatchDayRelative,
  formatMatchDayShort,
  formatMatchDayShortYear,
  matchDay,
  matchDayTime,
  matchDayYear,
  matchDaysAgo,
  utcToday,
} from "@/lib/data/match-day";
import { groupMatchesIntoEvents } from "@/lib/data/home-recent-data";
import { transformDbMatch, type DbMatch } from "@/lib/data/matches-list-types";
import { personalActivityFrom } from "@/lib/data/personal-activity";
import { reportLandedDay } from "@/lib/data/team-home-server";
import {
  datesNeedYear,
  matchesListShape,
} from "@/components/dashboard/matches/match-list-layout";
import { shortMonthDate } from "@/components/dashboard/matches/match-detail/format-clock";

/**
 * Which day a match was played.
 *
 * `matches.date` is a `timestamptz` that stores a calendar DAY: every writer
 * puts the day the user picked in the value's UTC date part, and the time
 * beside it is not a real time. `match-day.ts` is the one reading of it.
 *
 * The failure this pins is silent and depends on where the code runs. A reader
 * that does `new Date(match.date)` and then asks the runtime for the day gets
 * the right answer on Vercel (UTC), the wrong one on a laptop in California,
 * and the wrong one in the browser of every user west of Greenwich whenever
 * the stored time is early — an admin-submitted match at `00:00Z` printed as
 * the day before. So the same match showed different days on different pages.
 *
 * The last block therefore runs the module in child processes under three
 * zones rather than trusting the runner's own.
 */

const MIDNIGHT = "2026-09-28T00:00:00+00:00";
const JUST_AFTER = "2026-09-28T00:18:18.803+00:00";
const LAST_MINUTE = "2026-09-28T23:59:00+00:00";
const BARE = "2026-09-28";
const ZONELESS_NOON = "2026-09-28T12:00:00";

test.describe("matchDay — the leading date part", () => {
  test("every shape a writer produces is the same day", () => {
    for (const stored of [
      MIDNIGHT,
      JUST_AFTER,
      LAST_MINUTE,
      BARE,
      ZONELESS_NOON,
      "2026-09-28T12:00:00Z",
      "2026-09-28 12:00:00+00",
    ]) {
      expect(matchDay(stored), stored).toBe("2026-09-28");
    }
  });

  test("a Date gives its UTC day, not the runtime's", () => {
    expect(matchDay(new Date("2026-09-28T00:00:00Z"))).toBe("2026-09-28");
    expect(matchDay(new Date("2026-09-28T23:59:59Z"))).toBe("2026-09-28");
    expect(matchDay(new Date(Number.NaN))).toBeNull();
  });

  test("an explicit non-UTC offset is converted to the day Postgres stores", () => {
    // PostgREST never returns one; a hand-built value still lands on the UTC day.
    expect(matchDay("2026-09-28T23:30:00-07:00")).toBe("2026-09-29");
    expect(matchDay("2026-09-28T03:00:00+09:00")).toBe("2026-09-27");
    expect(matchDay("2026-09-28T03:00:00+00:00")).toBe("2026-09-28");
    expect(matchDay("2026-09-28T03:00:00-00:00")).toBe("2026-09-28");
  });

  test("nothing, and anything that is not a date, is null", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "not a date",
      "2026-13-01",
      "2026-02-30",
      "2026-9-28",
      "20260928",
      "28/09/2026",
      "2026-09-28x",
      "Smarch 3, 2026",
      "February 30, 2026",
      42 as unknown as string,
    ]) {
      expect(matchDay(bad), String(bad)).toBeNull();
    }
  });

  test("its own long and medium labels read back to the day", () => {
    expect(matchDay("September 28, 2026")).toBe("2026-09-28");
    expect(matchDay("Sep 28, 2026")).toBe("2026-09-28");
    expect(matchDay("May 1, 2025")).toBe("2025-05-01");
    for (const stored of [MIDNIGHT, LAST_MINUTE, "2024-02-29T12:00:00"]) {
      const day = matchDay(stored);
      expect(matchDay(formatMatchDayLong(stored))).toBe(day);
      expect(matchDay(formatMatchDayMedium(stored))).toBe(day);
    }
  });

  test("year, chart time and the comparator read the day", () => {
    expect(matchDayYear(MIDNIGHT)).toBe(2026);
    expect(matchDayYear("garbage")).toBeNull();
    expect(matchDayTime(LAST_MINUTE)).toBe(Date.UTC(2026, 8, 28));
    expect(matchDayTime(null)).toBeNull();

    expect(compareMatchDays(MIDNIGHT, LAST_MINUTE)).toBe(0);
    expect(compareMatchDays("2026-09-27T23:59:00+00:00", MIDNIGHT)).toBe(-1);
    expect(compareMatchDays(MIDNIGHT, "2025-12-31")).toBe(1);
    // Missing sorts last, oldest-first.
    expect(compareMatchDays(null, MIDNIGHT)).toBe(1);
    expect(compareMatchDays(MIDNIGHT, "garbage")).toBe(-1);
    expect(compareMatchDays(null, undefined)).toBe(0);
    expect(
      ["2026-09-28T12:00:00", null, "September 1, 2026", "2025-12-31"].sort(
        compareMatchDays,
      ),
    ).toEqual(["2025-12-31", "September 1, 2026", "2026-09-28T12:00:00", null]);
  });
});

test.describe("labels", () => {
  test("short, medium and long", () => {
    for (const stored of [MIDNIGHT, JUST_AFTER, LAST_MINUTE, BARE]) {
      expect(formatMatchDayShort(stored)).toBe("Sep 28");
      expect(formatMatchDayMedium(stored)).toBe("Sep 28, 2026");
      expect(formatMatchDayLong(stored)).toBe("September 28, 2026");
    }
    expect(formatMatchDayShort("2026-01-01T00:00:00+00:00")).toBe("Jan 1");
    expect(formatMatchDayLong("2024-02-29T00:00:00+00:00")).toBe(
      "February 29, 2024",
    );
  });

  test("a date that cannot be read prints as given; nothing prints as nothing", () => {
    expect(formatMatchDayShort("not a date")).toBe("not a date");
    expect(formatMatchDayLong(null)).toBe("");
    expect(formatMatchDayMedium(undefined)).toBe("");
    expect(formatMatchDayShortYear("??", "2026-10-12")).toBe("??");
    expect(formatMatchDayCompact(null, "2026-10-12")).toBe("");
    expect(formatMatchDayRelative("", "2026-10-12")).toBe("");
  });

  test("the year appears once the match is not from this year", () => {
    expect(formatMatchDayShortYear(MIDNIGHT, "2026-10-12")).toBe("Sep 28");
    expect(formatMatchDayShortYear(MIDNIGHT, "2027-01-01")).toBe(
      "Sep 28, 2026",
    );
    expect(formatMatchDayCompact(MIDNIGHT, "2026-10-12")).toBe("Sep 28");
    expect(formatMatchDayCompact(MIDNIGHT, "2027-01-01")).toBe("Sep ’26");
    // `today` may be a Date: its UTC day is what counts.
    expect(
      formatMatchDayShortYear(MIDNIGHT, new Date("2026-12-31T23:59:59Z")),
    ).toBe("Sep 28");
    expect(
      formatMatchDayShortYear(MIDNIGHT, new Date("2027-01-01T00:00:00Z")),
    ).toBe("Sep 28, 2026");
  });

  test("the year boundary belongs to the stored day, at either edge of it", () => {
    const newYearsEve = "2025-12-31T23:59:00+00:00";
    const newYearsDay = "2026-01-01T00:00:00+00:00";
    expect(matchDay(newYearsEve)).toBe("2025-12-31");
    expect(matchDay(newYearsDay)).toBe("2026-01-01");
    expect(formatMatchDayLong(newYearsEve)).toBe("December 31, 2025");
    expect(formatMatchDayLong(newYearsDay)).toBe("January 1, 2026");
    expect(formatMatchDayShortYear(newYearsEve, "2026-01-01")).toBe(
      "Dec 31, 2025",
    );
    expect(formatMatchDayShortYear(newYearsDay, "2026-01-01")).toBe("Jan 1");
    expect(formatMatchDayCompact(newYearsEve, "2026-01-01")).toBe("Dec ’25");
    expect(formatMatchDayRelative(newYearsEve, "2026-01-01")).toBe("Yesterday");
  });

  test("relative labels count whole days from today", () => {
    const today = "2026-10-12";
    expect(matchDaysAgo("2026-10-12T23:59:00+00:00", today)).toBe(0);
    expect(matchDaysAgo("2026-10-13", today)).toBe(-1);
    expect(matchDaysAgo("nope", today)).toBeNull();

    expect(formatMatchDayRelative("2026-10-12T00:00:00+00:00", today)).toBe(
      "Today",
    );
    expect(formatMatchDayRelative("2026-10-11T23:59:00+00:00", today)).toBe(
      "Yesterday",
    );
    expect(formatMatchDayRelative("2026-10-10", today)).toBe("2 days ago");
    expect(formatMatchDayRelative("2026-10-06", today)).toBe("6 days ago");
    expect(formatMatchDayRelative("2026-10-05", today)).toBe("Last week");
    expect(formatMatchDayRelative("2026-09-29", today)).toBe("Last week");
    expect(formatMatchDayRelative("2026-09-28", today)).toBe("Sep 28");
    expect(formatMatchDayRelative("2025-09-28", today)).toBe("Sep 28, 2025");
    // A day still to come is its date, never "-1 days ago".
    expect(formatMatchDayRelative("2026-10-13", today)).toBe("Oct 13");
    // Across a DST change in most zones: still whole days.
    expect(matchDaysAgo("2026-03-07", "2026-03-09")).toBe(2);
    expect(matchDaysAgo("2026-10-31", "2026-11-02")).toBe(2);
  });

  test("today defaults to the current UTC day", () => {
    expect(utcToday(new Date("2026-10-12T23:59:59Z"))).toBe("2026-10-12");
    expect(utcToday(new Date("2026-10-13T00:00:00Z"))).toBe("2026-10-13");
    const now = new Date();
    expect(utcToday(now)).toBe(now.toISOString().slice(0, 10));
    expect(formatMatchDayRelative(now, now)).toBe("Today");
  });
});

test.describe("the readers that sit on it", () => {
  const row = (date: string): DbMatch => ({
    id: "m1",
    player1_id: "viewer",
    player1_name: "Ada Reid",
    player2_name: "Jo Park",
    tournament_name: "Fall Open",
    round: null,
    date,
    score: { player1: [6, 6], player2: [3, 4] },
    result: null,
    match_type: null,
    court_type: null,
    verified: null,
    duration: null,
  });

  test("the Matches list, match page and share page print the stored day", () => {
    for (const stored of [MIDNIGHT, JUST_AFTER, LAST_MINUTE, ZONELESS_NOON]) {
      expect(transformDbMatch(row(stored), "viewer")?.date, stored).toBe(
        "September 28, 2026",
      );
    }
  });

  test("the match page's short-month form is the same day as the label it shortens", () => {
    expect(shortMonthDate("September 28, 2026")).toBe("Sep 28, 2026");
    expect(shortMonthDate("August 2, 2026")).toBe("Aug 2, 2026");
    expect(shortMonthDate("")).toBe("");
  });

  test("the list's wider Date track is decided by the match's day", () => {
    const thisYear = utcToday().slice(0, 4);
    const lastYear = String(Number(thisYear) - 1);
    // Labels, as the list holds them — and the first instant of this year.
    expect(datesNeedYear([`January 1, ${thisYear}`], [])).toBe(false);
    expect(datesNeedYear([`${thisYear}-01-01T00:00:00+00:00`], [])).toBe(false);
    expect(datesNeedYear([`December 31, ${lastYear}`], [])).toBe(true);
    expect(datesNeedYear([`${lastYear}-12-31T23:59:00+00:00`], [])).toBe(true);
    expect(matchesListShape([`January 1, ${thisYear}`], []).needsYear).toBe(
      false,
    );
    expect(matchesListShape([`December 31, ${lastYear}`], []).needsYear).toBe(
      true,
    );
  });

  test("Home's recent heading is true of every match grouped under it", () => {
    const recent = (id: string, date: string) => ({
      id,
      created_by: "viewer",
      player1_id: "viewer",
      player2_id: null,
      player1_name: "Ada Reid",
      player2_name: "Jo Park",
      tournament_name: "Fall Open",
      round: null,
      date,
      score: { player1: [6, 6], player2: [3, 4] },
      result: null,
      match_type: null,
      court_type: null,
      verified: null,
      duration: null,
      opponent_hand: null,
      opponent_backhand: null,
    });
    type Rows = Parameters<typeof groupMatchesIntoEvents>[0];
    const events = groupMatchesIntoEvents(
      [
        // One event, one day, stored at both ends of it.
        recent("late", "2026-10-11T23:59:00+00:00"),
        recent("early", "2026-10-11T00:00:00+00:00"),
        recent("before", "2026-10-10T23:59:00+00:00"),
      ] as unknown as Rows,
      ["viewer"],
      "viewer",
      new Map(),
      new Map(),
      "2026-10-12",
    );
    expect(events.map((e) => [e.date, e.matches.map((m) => m.id)])).toEqual([
      ["Yesterday", ["late", "early"]],
      ["2 days ago", ["before"]],
    ]);
  });

  test("an import's match date is read as a day; a job's finish as an instant", () => {
    const pacific = "America/Los_Angeles";
    // Friday's import, stored at 00:00Z. Read as an instant in Pacific time it
    // was Thursday evening, and fell out of "since Friday".
    expect(
      reportLandedDay(undefined, "2026-10-09T00:00:00+00:00", pacific),
    ).toBe("2026-10-09");
    expect(
      reportLandedDay(null, "2026-10-09T23:59:00+00:00", "Asia/Tokyo"),
    ).toBe("2026-10-09");
    // A job that finished at 01:00Z Saturday finished on Friday in Pacific time.
    expect(
      reportLandedDay(
        "2026-10-10T01:00:00+00:00",
        "2026-10-03T12:00:00+00:00",
        pacific,
      ),
    ).toBe("2026-10-09");
    expect(reportLandedDay(undefined, null, pacific)).toBeNull();
    expect(reportLandedDay("garbage", "2026-10-09", pacific)).toBeNull();
  });

  test("the activity grid counts a match on its own day, at either edge of it", () => {
    // Monday 12 Oct 2026, 02:00 UTC — still Sunday evening in the Americas.
    const now = new Date("2026-10-12T02:00:00Z");
    const activity = personalActivityFrom(
      [
        { date: "2026-10-11T00:00:00+00:00" },
        { date: "2026-10-11T23:59:00+00:00" },
        { date: "2026-10-12T00:00:00+00:00" },
        { date: null },
      ],
      now,
    );
    const cell = (day: string) => activity.days.find((d) => d.date === day);
    expect(cell("2026-10-11")?.count).toBe(2);
    expect(cell("2026-10-12")?.count).toBe(1);
    expect(activity.sessionCount).toBe(2);
    // 364 distinct consecutive days, Sunday first, this week last.
    expect(activity.days).toHaveLength(364);
    expect(new Set(activity.days.map((d) => d.date)).size).toBe(364);
    expect(activity.days[0].date).toBe("2025-10-19");
    expect(activity.days[363].date).toBe("2026-10-17");
    expect(activity.monthLabels).toHaveLength(12);
    expect(activity.monthLabels[11]).toBe("Oct");
  });
});

/**
 * The regression itself. Each child process starts with `TZ` set, imports the
 * module as it is on disk, and prints what it says about the same stored
 * values — beside what the old reading (`new Date(iso)` + the runtime's zone)
 * says, as the control that proves the zone really took effect.
 */
const MODULE = path.resolve(__dirname, "../src/lib/data/match-day.ts");

const PROBE = `
import(require("node:url").pathToFileURL(process.argv[1]).href).then((m) => {
  const stored = [
    "2026-09-28T00:00:00+00:00",
    "2026-09-28T00:18:18.803+00:00",
    "2026-09-28T23:59:00+00:00",
    "2026-09-28",
    "2026-09-28T12:00:00",
    "2025-12-31T23:59:00+00:00",
    "2026-01-01T00:00:00+00:00",
    "September 28, 2026",
  ];
  const today = "2026-09-29";
  const legacy = (iso) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  process.stdout.write(
    JSON.stringify({
      zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      offsetMinutes: new Date("2026-09-28T12:00:00Z").getTimezoneOffset(),
      legacyMidnight: legacy(stored[0]),
      legacyLastMinute: legacy(stored[2]),
      results: stored.map((value) => ({
        value,
        day: m.matchDay(value),
        year: m.matchDayYear(value),
        time: m.matchDayTime(value),
        ago: m.matchDaysAgo(value, today),
        short: m.formatMatchDayShort(value),
        shortYear: m.formatMatchDayShortYear(value, today),
        medium: m.formatMatchDayMedium(value),
        long: m.formatMatchDayLong(value),
        compact: m.formatMatchDayCompact(value, today),
        relative: m.formatMatchDayRelative(value, today),
        fromEarlyDate: m.matchDay(new Date("2026-09-28T00:00:00Z")),
        fromLateDate: m.matchDay(new Date("2026-09-28T23:59:59Z")),
      })),
    }),
  );
});
`;

interface Probe {
  zone: string;
  offsetMinutes: number;
  legacyMidnight: string;
  legacyLastMinute: string;
  results: Record<string, unknown>[];
}

function probeIn(timeZone: string): Probe {
  const child = spawnSync(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "-e", PROBE, MODULE],
    { env: { ...process.env, TZ: timeZone }, encoding: "utf8" },
  );
  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout) as Probe;
}

test.describe("the same day in every zone", () => {
  test("Los Angeles, UTC and Tokyo agree on every reading and every label", () => {
    const la = probeIn("America/Los_Angeles");
    const utc = probeIn("UTC");
    const tokyo = probeIn("Asia/Tokyo");

    // The control: the zones are real, and the old reading disagrees in them.
    expect(la.zone).toBe("America/Los_Angeles");
    expect(tokyo.zone).toBe("Asia/Tokyo");
    expect([la.offsetMinutes, utc.offsetMinutes, tokyo.offsetMinutes]).toEqual([
      420, 0, -540,
    ]);
    expect(la.legacyMidnight).toBe("September 27, 2026");
    expect(utc.legacyMidnight).toBe("September 28, 2026");
    expect(tokyo.legacyLastMinute).toBe("September 29, 2026");

    // The rule: one answer.
    expect(la.results).toEqual(utc.results);
    expect(tokyo.results).toEqual(utc.results);

    // And it is the right one, not merely the same one.
    const first = utc.results[0];
    expect(first).toMatchObject({
      day: "2026-09-28",
      year: 2026,
      time: Date.UTC(2026, 8, 28),
      ago: 1,
      short: "Sep 28",
      shortYear: "Sep 28",
      medium: "Sep 28, 2026",
      long: "September 28, 2026",
      compact: "Sep 28",
      relative: "Yesterday",
      fromEarlyDate: "2026-09-28",
      fromLateDate: "2026-09-28",
    });
    for (const result of utc.results.slice(0, 5)) {
      expect(result.long, String(result.value)).toBe("September 28, 2026");
    }
    expect(utc.results[5]).toMatchObject({
      day: "2025-12-31",
      shortYear: "Dec 31, 2025",
      compact: "Dec ’25",
    });
    expect(utc.results[6]).toMatchObject({ day: "2026-01-01", short: "Jan 1" });
    expect(utc.results[7]).toMatchObject({
      day: "2026-09-28",
      medium: "Sep 28, 2026",
    });
  });
});
