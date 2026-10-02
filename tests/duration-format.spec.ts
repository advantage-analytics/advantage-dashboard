import { expect, test } from "@playwright/test";

import {
  durationParts,
  formatDuration,
  formatHoursMinutes,
  formatMatchDuration,
} from "@/lib/format/duration";

test("a recorded match length reads lowercase, to the whole minute", () => {
  expect(formatMatchDuration(58 * 60_000)).toBe("58m");
  expect(formatMatchDuration(94 * 60_000)).toBe("1h 34m");
  expect(formatMatchDuration(120 * 60_000)).toBe("2h");
  // Floors, as the match length always has: 34m 59s is still 34m.
  expect(formatMatchDuration(94 * 60_000 + 59_000)).toBe("1h 34m");
});

test("a match with no recorded length is empty, so a caller can fall back", () => {
  expect(formatMatchDuration(null)).toBe("");
  expect(formatMatchDuration(undefined)).toBe("");
  expect(formatMatchDuration(0)).toBe("");
});

test("hours and minutes carry into the hour instead of reading 60m", () => {
  expect(formatHoursMinutes(59 * 60 + 40)).toBe("1h");
  expect(formatHoursMinutes(35 * 60)).toBe("35m");
  expect(formatHoursMinutes(107 * 60)).toBe("1h 47m");
});

test("a wait keeps its own shape", () => {
  expect(formatDuration(720)).toBe("12 min");
  expect(formatDuration(5340)).toBe("1h 29m");
});

test("parts split a length in minutes for a tile that sets units apart", () => {
  expect(durationParts(94)).toEqual({ hours: 1, mins: 34 });
});
