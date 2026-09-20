import { expect, test } from "@playwright/test";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  activeFilterEntries,
  applyVizUpdate,
  carryFilters,
  clearedFilters,
  parseVizState,
  reconcileVizState,
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

test("clearedFilters resets every key including player, clears viewId, keeps cut and chart", () => {
  const state = {
    cut: "serve" as const,
    chart: "zones" as const,
    viewId: "abc",
    filters: {
      ...EMPTY_VIZ_FILTERS,
      player: "opponent" as const,
      ball: "first" as const,
      zone: "t" as const,
      set: 2,
    },
  };
  const next = clearedFilters(state);
  expect(next.filters).toEqual(EMPTY_VIZ_FILTERS);
  expect(next.viewId).toBeNull();
  expect(next.cut).toBe("serve");
  expect(next.chart).toBe("zones");
});

test("prototype chain pollution is rejected", () => {
  const s = parseVizState(
    new URLSearchParams("cut=serve&ball=constructor&zone=toString"),
  );
  expect(s.filters.ball).toBe("any");
  expect(s.filters.zone).toBe("any");
});

test("applyVizUpdate: two updaters in sequence both survive (ball then zone)", () => {
  const start = {
    cut: "serve" as const,
    chart: "scatter" as const,
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS },
  };
  const afterBall = applyVizUpdate(start, (prev) => ({
    ...prev,
    filters: { ...prev.filters, ball: "first" },
  }));
  const afterZone = applyVizUpdate(afterBall, (prev) => ({
    ...prev,
    filters: { ...prev.filters, zone: "t" },
  }));
  expect(afterZone.filters.ball).toBe("first");
  expect(afterZone.filters.zone).toBe("t");
});

test("applyVizUpdate: an updater after clearedFilters sees cleared filters", () => {
  const start = {
    cut: "serve" as const,
    chart: "scatter" as const,
    viewId: "abc",
    filters: {
      ...EMPTY_VIZ_FILTERS,
      player: "opponent" as const,
      ball: "first" as const,
    },
  };
  const cleared = applyVizUpdate(start, (prev) => clearedFilters(prev));
  const afterZone = applyVizUpdate(cleared, (prev) => ({
    ...prev,
    filters: { ...prev.filters, zone: "t" },
  }));
  expect(afterZone.filters).toEqual({ ...EMPTY_VIZ_FILTERS, zone: "t" });
  expect(afterZone.viewId).toBeNull();
});

test("applyVizUpdate: a plain-object update replaces wholesale", () => {
  const start = {
    cut: "serve" as const,
    chart: "zones" as const,
    viewId: "abc",
    filters: { ...EMPTY_VIZ_FILTERS, ball: "first" as const },
  };
  const replacement = {
    cut: null,
    chart: "scatter" as const,
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
  };
  expect(applyVizUpdate(start, replacement)).toEqual(replacement);
});

test("reconcileVizState: an own query lands — intended state is kept and the query retired", () => {
  const intended = parseVizState(new URLSearchParams("cut=serve&ball=first"));
  const result = reconcileVizState({
    urlQuery: "cut=serve&ball=first",
    ownQueries: ["cut=serve&ball=first"],
    intended,
  });
  expect(result.state).toEqual(intended);
  expect(result.ownQueries).toEqual([]);
});

test("reconcileVizState: only the later of two own queries lands — the earlier is retired too, not left to be mistaken for own later", () => {
  const intended = parseVizState(new URLSearchParams("cut=serve&ball=second"));
  const result = reconcileVizState({
    urlQuery: "cut=serve&ball=second",
    ownQueries: ["cut=serve&ball=first", "cut=serve&ball=second"],
    intended,
  });
  expect(result.ownQueries).toEqual([]);
  expect(result.state).toEqual(intended);

  // The browser later lands back on the earlier own query (e.g. a stale
  // history entry) — it must now read as external, not "our own", since it
  // was already retired above.
  const later = reconcileVizState({
    urlQuery: "cut=serve&ball=first",
    ownQueries: result.ownQueries,
    intended,
  });
  expect(later.state).toEqual(
    parseVizState(new URLSearchParams("cut=serve&ball=first")),
  );
  expect(later.ownQueries).toEqual(["cut=serve&ball=first"]);
});

test("reconcileVizState: an external navigation while an own query is pending wins over the intended state", () => {
  const intended = parseVizState(new URLSearchParams("cut=serve&ball=first"));
  const result = reconcileVizState({
    urlQuery: "cut=returnPlacement",
    ownQueries: ["cut=serve&ball=first"],
    intended,
  });
  expect(result.state).toEqual(
    parseVizState(new URLSearchParams("cut=returnPlacement")),
  );
  expect(result.ownQueries).toEqual(["cut=returnPlacement"]);
});
