import { expect, test } from "@playwright/test";

import {
  DEFAULT_COURT_MODE,
  DEFAULT_COURT_ON,
  DEFAULT_DRAWER_OPEN,
  parseCourtMode,
  parseCourtOn,
  parseDrawerOpen,
  roomParam,
} from "@/components/dashboard/matches/match-detail/film/film-room-prefs";

test('parseCourtOn defaults to true, accepts "0", rejects nonsense', () => {
  expect(parseCourtOn(null)).toBe(DEFAULT_COURT_ON);
  expect(parseCourtOn(null)).toBe(true);
  expect(parseCourtOn("0")).toBe(false);
  expect(parseCourtOn("banana")).toBe(true);
});

test('parseCourtMode defaults to "point", accepts "match", rejects nonsense', () => {
  expect(parseCourtMode(null)).toBe(DEFAULT_COURT_MODE);
  expect(parseCourtMode(null)).toBe("point");
  expect(parseCourtMode("match")).toBe("match");
  expect(parseCourtMode("rally")).toBe("point");
});

test('parseDrawerOpen defaults to false, accepts "1", rejects nonsense', () => {
  expect(parseDrawerOpen(null)).toBe(DEFAULT_DRAWER_OPEN);
  expect(parseDrawerOpen(null)).toBe(false);
  expect(parseDrawerOpen("1")).toBe(true);
  expect(parseDrawerOpen("yes")).toBe(false);
});

test("roomParam round trips, keeping other params intact on enter and exit", () => {
  const params = new URLSearchParams("tab=film&cut=break");

  const entered = roomParam(params, true);
  // The input is never mutated.
  expect(params.toString()).toBe("tab=film&cut=break");

  const enteredParams = new URLSearchParams(entered);
  expect(enteredParams.get("tab")).toBe("film");
  expect(enteredParams.get("cut")).toBe("break");
  expect(enteredParams.get("fullscreen")).toBe("1");

  const exited = roomParam(entered, false);
  const exitedParams = new URLSearchParams(exited);
  expect(exitedParams.has("fullscreen")).toBe(false);
  expect(exitedParams.get("tab")).toBe("film");
  expect(exitedParams.get("cut")).toBe("break");
});

test("roomParam tolerates null/undefined params", () => {
  expect(new URLSearchParams(roomParam(null, true)).get("fullscreen")).toBe(
    "1",
  );
  expect(
    new URLSearchParams(roomParam(undefined, false)).has("fullscreen"),
  ).toBe(false);
  expect(roomParam(undefined, false)).toBe("");
});
