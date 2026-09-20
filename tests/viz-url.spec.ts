import { expect, test } from "@playwright/test";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  activeFilterEntries,
  carryFilters,
  parseVizState,
  vizStateQuery,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";

test("no cut param is the wall", () => {
  const s = parseVizState(new URLSearchParams("tab=shots"));
  expect(s.cut).toBeNull();
  expect(s.chart).toBe("scatter");
  expect(s.filters).toEqual(EMPTY_VIZ_FILTERS);
});

test("round trip keeps tab and drops defaults", () => {
  const params = new URLSearchParams("tab=shots&set=2");
  const q = vizStateQuery(params, {
    cut: "serve",
    chart: "zones",
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS, ball: "first", zone: "t", set: 2 },
  });
  const back = new URLSearchParams(q);
  expect(back.get("tab")).toBe("shots");
  expect(back.get("player")).toBeNull();
  expect(parseVizState(back)).toEqual({
    cut: "serve",
    chart: "zones",
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS, ball: "first", zone: "t", set: 2 },
  });
  expect(params.get("cut")).toBeNull(); // input not mutated
});

test("garbage values read as defaults; zones off serve reads as scatter", () => {
  const s = parseVizState(
    new URLSearchParams("cut=returnContact&chart=zones&ball=third&set=x"),
  );
  expect(s.chart).toBe("scatter");
  expect(s.filters.ball).toBe("any");
  expect(s.filters.set).toBe("any");
  expect(parseVizState(new URLSearchParams("cut=nope")).cut).toBeNull();
});

test("cut = null clears every viz key", () => {
  const q = vizStateQuery(
    new URLSearchParams("tab=shots&cut=serve&ball=first&view=abc"),
    {
      cut: null,
      chart: "scatter",
      viewId: null,
      filters: EMPTY_VIZ_FILTERS,
    },
  );
  expect(q).toBe("tab=shots");
});

test("carryFilters drops serve-only values off serve", () => {
  const f = carryFilters(
    { ...EMPTY_VIZ_FILTERS, zone: "t", result: "ace", ball: "first" },
    "returnPlacement",
  );
  expect(f.zone).toBe("any");
  expect(f.result).toBe("any");
  expect(f.ball).toBe("first");
});

test("activeFilterEntries uses option labels", () => {
  const e = activeFilterEntries({
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: {
      ...EMPTY_VIZ_FILTERS,
      ball: "first",
      zone: "t",
      player: "opponent",
    },
  });
  expect(e.map((x) => x.label)).toEqual(["Opponent", "1st", "T"]);
});

test("prototype chain pollution is rejected", () => {
  const s = parseVizState(
    new URLSearchParams("cut=serve&ball=constructor&zone=toString"),
  );
  expect(s.filters.ball).toBe("any");
  expect(s.filters.zone).toBe("any");
});
