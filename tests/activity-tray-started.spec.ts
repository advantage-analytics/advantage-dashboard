import { expect, test } from "@playwright/test";

import {
  trayStartedDay,
  trayStartedTitle,
} from "../src/components/dashboard/activity/tray-started";

const NOW = new Date("2026-10-02T21:00:00Z");
const TZ = "America/New_York";

test.describe("tray started label", () => {
  test("names today, yesterday, then the date", () => {
    expect(trayStartedDay("2026-10-02T18:41:00Z", NOW, TZ)).toBe("Today");
    expect(trayStartedDay("2026-10-01T13:12:00Z", NOW, TZ)).toBe("Yesterday");
    expect(trayStartedDay("2026-09-28T13:12:00Z", NOW, TZ)).toBe("Sep 28");
  });

  test("yesterday survives a 25-hour fall-back day", () => {
    // New York fell back on 2026-11-01; now is 23:30 EST that night.
    const now = new Date("2026-11-02T04:30:00Z");
    expect(trayStartedDay("2026-11-01T03:00:00Z", now, TZ)).toBe("Yesterday");
  });

  test("the tooltip carries the exact time", () => {
    expect(trayStartedTitle("2026-10-02T18:41:00Z", NOW, TZ)).toBe(
      "Started today at 2:41 PM",
    );
    expect(trayStartedTitle("2026-09-28T13:12:00Z", NOW, TZ)).toBe(
      "Started on Sep 28 at 9:12 AM",
    );
  });

  test("a bad timestamp renders nothing", () => {
    expect(trayStartedDay("nope", NOW, TZ)).toBe("");
  });
});
