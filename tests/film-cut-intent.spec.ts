import { expect, test } from "@playwright/test";

import {
  consumeFilmCut,
  mergeFilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  DEFAULT_FILM_FILTERS,
  applyFilmFilters,
  parseCut,
  serializeCut,
} from "@/components/dashboard/matches/match-detail/film/filters/types";

import { pt } from "./fixtures/film-point";

/**
 * The "watch this cut" intent (Advantage Intelligence UI T2): the pure
 * merge/consume helper behind `MatchReportActions.watchCut` and the film tab's
 * once-only application of it. Offline, same model as
 * `film-filters-model.spec.ts`; the context itself is React and is exercised
 * by the page.
 */

test("mergeFilmCut lays the cut over the defaults and nothing else", () => {
  const merged = mergeFilmCut({ pressure: "break", server: "opp" });
  expect(merged).toEqual({
    ...DEFAULT_FILM_FILTERS,
    pressure: "break",
    server: "opp",
  });
  // The defaults are not mutated by the merge.
  expect(DEFAULT_FILM_FILTERS.pressure).toBe("any");
  expect(mergeFilmCut({})).toEqual(DEFAULT_FILM_FILTERS);
});

test("consumeFilmCut applies once: it hands back the filters and nothing pending", () => {
  const taken = consumeFilmCut({ savedOnly: true, rallyMin: 5 });
  expect(taken).not.toBeNull();
  expect(taken?.filters).toEqual({
    ...DEFAULT_FILM_FILTERS,
    savedOnly: true,
    rallyMin: 5,
  });
  expect(taken?.pending).toBeNull();
  // Consuming what is left is a no-op — the intent was honoured exactly once.
  expect(consumeFilmCut(taken?.pending ?? null)).toBeNull();
  expect(consumeFilmCut(null)).toBeNull();
});

test("a consumed cut narrows the points exactly as applyFilmFilters does", () => {
  const points = [
    pt({ id: "a", isBreakPoint: true, wonByPlayer1: true }),
    pt({ id: "b", isBreakPoint: false, wonByPlayer1: true }),
    pt({ id: "c", isBreakPoint: true, wonByPlayer1: false }),
  ];
  const cut = { pressure: "break" as const, outcome: "you" as const };
  const { filters } = consumeFilmCut(cut)!;
  // Sides resolve in `applyFilmFilters` via `youIsPlayer1`, never in the cut.
  expect(applyFilmFilters(points, filters, true).map((p) => p.id)).toEqual([
    "a",
  ]);
  expect(applyFilmFilters(points, filters, false).map((p) => p.id)).toEqual([
    "c",
  ]);
  // A cut that admits nothing still yields a filter value to apply.
  const none = consumeFilmCut({ set: 9 })!;
  expect(applyFilmFilters(points, none.filters, true)).toEqual([]);
});

test("the URL form is unchanged: only cut= and serve= travel", () => {
  const { filters } = consumeFilmCut({
    pressure: "break",
    server: "you",
    rallyMin: 5,
    court: "ad",
    outcome: "opp",
  })!;
  const qs = new URLSearchParams(serializeCut(filters, "tab=film"));
  expect([...qs.keys()].sort()).toEqual(["cut", "serve", "tab"]);
  expect(qs.get("cut")).toBe("break");
  expect(qs.get("serve")).toBe("you");
  // Reading it back keeps the quick axes only — Advanced stays out of the URL.
  expect(parseCut(qs)).toEqual({
    ...DEFAULT_FILM_FILTERS,
    pressure: "break",
    server: "you",
  });
});
