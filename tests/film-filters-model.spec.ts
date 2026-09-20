import { expect, test } from "@playwright/test";

import {
  DEFAULT_FILM_FILTERS,
  countFilmOption,
  cutName,
  parseCut,
  serializeCut,
} from "@/components/dashboard/matches/match-detail/film/filters/types";
import type { MatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";

import { pt } from "./fixtures/film-point";

/** Only the fields `cutName` reads. */
const sides = {
  you: { name: "Alex Rivera", isPlayer1: true },
  opp: { name: "Marcus Reid", isPlayer1: false },
} as unknown as MatchSides;

const points = [
  pt({ id: "a", setNumber: 1, resultType: "Ace", isBreakPoint: true }),
  pt({ id: "b", setNumber: 1, resultType: "Ace", isBreakPoint: false }),
  pt({ id: "c", setNumber: 2, resultType: "Ace", isBreakPoint: true }),
  pt({ id: "d", setNumber: 2, resultType: "Forehand Winner" }),
];

test("cutName reads the quick menu's own labels", () => {
  expect(cutName(DEFAULT_FILM_FILTERS, sides)).toBe("All points");
  expect(cutName({ ...DEFAULT_FILM_FILTERS, pressure: "break" }, sides)).toBe(
    "Break points",
  );
  expect(cutName({ ...DEFAULT_FILM_FILTERS, savedOnly: true }, sides)).toBe(
    "Saved only",
  );
  expect(cutName({ ...DEFAULT_FILM_FILTERS, server: "opp" }, sides)).toBe(
    "Reid serving",
  );
  expect(cutName({ ...DEFAULT_FILM_FILTERS, rallyMin: 5 }, sides)).toBe(
    "Filtered",
  );
});

test("countFilmOption lowers when a second axis is applied", () => {
  const patch = { serve: ["ace" as const] };
  expect(countFilmOption(points, DEFAULT_FILM_FILTERS, true, patch)).toBe(3);
  expect(
    countFilmOption(
      points,
      { ...DEFAULT_FILM_FILTERS, pressure: "break" },
      true,
      patch,
    ),
  ).toBe(2);
});

test("serializeCut and parseCut round trip and keep other params", () => {
  const params = new URLSearchParams("tab=film&point=abc");
  const filters = {
    ...DEFAULT_FILM_FILTERS,
    pressure: "break" as const,
    server: "you" as const,
  };
  const qs = serializeCut(filters, params);
  expect(params.toString()).toBe("tab=film&point=abc");

  const next = new URLSearchParams(qs);
  expect(next.get("tab")).toBe("film");
  expect(next.get("point")).toBe("abc");
  expect(next.get("cut")).toBe("break");
  expect(parseCut(next)).toEqual(filters);

  const cleared = serializeCut(DEFAULT_FILM_FILTERS, next);
  expect(new URLSearchParams(cleared).has("cut")).toBe(false);
  expect(new URLSearchParams(cleared).has("serve")).toBe(false);
  expect(new URLSearchParams(cleared).get("tab")).toBe("film");
});

test("savedOnly wins over break, and bad params give defaults", () => {
  const both = {
    ...DEFAULT_FILM_FILTERS,
    savedOnly: true,
    pressure: "break" as const,
  };
  expect(new URLSearchParams(serializeCut(both, "")).get("cut")).toBe("saved");
  expect(parseCut(null)).toEqual(DEFAULT_FILM_FILTERS);
  expect(parseCut(new URLSearchParams("cut=zzz&serve=both"))).toEqual(
    DEFAULT_FILM_FILTERS,
  );
});

test("advanced-only filters serialize to neither cut nor serve", () => {
  const advanced = {
    ...DEFAULT_FILM_FILTERS,
    rallyMin: 5,
    court: "ad" as const,
    set: 2,
  };
  expect(serializeCut(advanced, "tab=film")).toBe("tab=film");
});
