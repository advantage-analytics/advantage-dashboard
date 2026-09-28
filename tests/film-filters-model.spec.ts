import { expect, test } from "@playwright/test";

import {
  DEFAULT_FILM_FILTERS,
  FILM_FILTER_SECTIONS,
  FILM_STANDALONE_KEYS,
  applyFilmFilters,
  countFilmOption,
  cutName,
  describeFilmCut,
  filmFiltersEqual,
  hasActiveFilmFilters,
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

test("the section table places every axis exactly once", () => {
  expect(FILM_FILTER_SECTIONS.map((s) => s.name)).toEqual([
    "Score",
    "Serve",
    "Return",
    "Rally",
    "Result",
    "Court",
  ]);

  const placed = [
    ...FILM_FILTER_SECTIONS.flatMap((s) => s.keys),
    ...FILM_STANDALONE_KEYS,
  ];
  expect(new Set(placed).size).toBe(placed.length);
  expect([...placed].sort()).toEqual(Object.keys(DEFAULT_FILM_FILTERS).sort());
});

test("filmFiltersEqual ignores OR-group order but not values", () => {
  const a = {
    ...DEFAULT_FILM_FILTERS,
    serve: ["ace" as const, "wide" as const],
  };
  const b = {
    ...DEFAULT_FILM_FILTERS,
    serve: ["wide" as const, "ace" as const],
  };
  expect(filmFiltersEqual(a, b)).toBe(true);
  expect(filmFiltersEqual(a, { ...a, court: "ad" })).toBe(false);
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

/* ── Rally length: the bounded range ──────────────────────────────────── */

const rallies = [0, 1, 4, 5, 8, 9, 14].map((n) =>
  pt({ id: `r${n}`, rallyLength: n }),
);
const rallyIds = (patch: Partial<typeof DEFAULT_FILM_FILTERS>) =>
  applyFilmFilters(rallies, { ...DEFAULT_FILM_FILTERS, ...patch }, true).map(
    (p) => p.id,
  );

test("rallyMin and rallyMax make the card's three bands, disjoint", () => {
  const short = rallyIds({ rallyMin: 1, rallyMax: 4 });
  const medium = rallyIds({ rallyMin: 5, rallyMax: 8 });
  const long = rallyIds({ rallyMin: 9 });
  expect(short).toEqual(["r1", "r4"]);
  expect(medium).toEqual(["r5", "r8"]);
  expect(long).toEqual(["r9", "r14"]);

  // Together they cover every point with a shot count, once each; the
  // unrecorded 0 is in none of them.
  const all = [...short, ...medium, ...long];
  expect(new Set(all).size).toBe(all.length);
  expect(all.sort()).toEqual(
    rallies
      .filter((p) => p.rallyLength > 0)
      .map((p) => p.id)
      .sort(),
  );
});

test("a max alone still drops rallies with no shot count", () => {
  expect(rallyIds({ rallyMax: 4 })).toEqual(["r1", "r4"]);
  expect(rallyIds({})).toContain("r0");
});

test("rallyMax is an active, compared and described axis", () => {
  const bounded = { ...DEFAULT_FILM_FILTERS, rallyMax: 4 };
  expect(hasActiveFilmFilters(bounded)).toBe(true);
  expect(filmFiltersEqual(bounded, DEFAULT_FILM_FILTERS)).toBe(false);
  expect(filmFiltersEqual(bounded, { ...bounded })).toBe(true);
  expect(cutName(bounded, sides)).toBe("Filtered");

  expect(describeFilmCut({ ...bounded, rallyMin: 1 }, sides)).toBe(
    "Rallies of 1–4 shots",
  );
  expect(describeFilmCut({ ...DEFAULT_FILM_FILTERS, rallyMin: 9 }, sides)).toBe(
    "Rallies of 9+ shots",
  );
  expect(describeFilmCut(bounded, sides)).toBe("Rallies of up to 4 shots");

  const rally = FILM_FILTER_SECTIONS.find((s) => s.id === "rally");
  expect(rally?.keys).toContain("rallyMax");
});

test("rallyMax has no URL form", () => {
  expect(
    serializeCut(
      { ...DEFAULT_FILM_FILTERS, rallyMin: 1, rallyMax: 4 },
      "tab=film",
    ),
  ).toBe("tab=film");
});
