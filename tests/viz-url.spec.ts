import { expect, test } from "@playwright/test";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  activeFilterEntries,
  applyVizUpdate,
  carryFilters,
  clearedFilters,
  focusTargetAfterViewChange,
  parseVizState,
  reconcileVizState,
  sameView,
  vizStateQuery,
  viewIdentityKey,
} from "@/components/dashboard/matches/match-detail/shots/viz-url";

test("no cut param is the wall", () => {
  const s = parseVizState(new URLSearchParams("tab=shots"));
  expect(s.cut).toBeNull();
  expect(s.chart).toBe("scatter");
  expect(s.filters).toEqual(EMPTY_VIZ_FILTERS);
});

test("round trip keeps tab and drops defaults", () => {
  const params = new URLSearchParams("tab=shots&vset=2");
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

/* ── `vset` namespacing (I2) ──────────────────────────────────────────────
 * The match report already owns the bare `set` query key
 * (`set-scope.tsx`'s `SET_PARAM`), dormant today but a silent clobber the
 * day it's re-enabled. The viz filter's set value is namespaced to `vset`
 * in the URL; `VizFilters.set` stays the in-memory field name. */

test("vset parses into filters.set; an unrelated set param is ignored", () => {
  const s = parseVizState(
    new URLSearchParams("tab=shots&set=2&cut=serve&vset=1"),
  );
  expect(s.filters.set).toBe(1);
});

test("vizStateQuery leaves an unrelated set param untouched", () => {
  const params = new URLSearchParams("tab=shots&set=2&cut=serve&vset=1");
  const q = vizStateQuery(params, {
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS, set: 3 },
  });
  const back = new URLSearchParams(q);
  expect(back.get("set")).toBe("2");
  expect(back.get("vset")).toBe("3");
});

test("vizStateQuery leaves an unrelated set param untouched even going back to the wall", () => {
  const params = new URLSearchParams("tab=shots&set=2&cut=serve&vset=1");
  const q = vizStateQuery(params, {
    cut: null,
    chart: "scatter",
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
  });
  const back = new URLSearchParams(q);
  expect(back.get("set")).toBe("2");
  expect(back.get("vset")).toBeNull();
  expect(back.get("cut")).toBeNull();
});

/* ── carryFilters applied on parse (M4) ────────────────────────────────── */

test("parseVizState resets serve-only filters when cut is off serve", () => {
  const withAce = parseVizState(
    new URLSearchParams("cut=returnPlacement&result=ace"),
  );
  expect(withAce.filters.result).toBe("any");

  const withZone = parseVizState(
    new URLSearchParams("cut=returnPlacement&zone=t"),
  );
  expect(withZone.filters.zone).toBe("any");
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

/* ── `sameView` (F4) ────────────────────────────────────────────────────
 * The Views row's "current tile" test: is `current` (the state on screen)
 * the same view as this candidate tile (a default cut, or a saved view)? */

test("sameView: a default tile matches its own state", () => {
  const current = parseVizState(
    new URLSearchParams("cut=serve&ball=first&player=you"),
  );
  expect(
    sameView(current, {
      cut: "serve",
      chart: "scatter",
      filters: current.filters,
    }),
  ).toBe(true);
});

test("sameView: differs when one filter differs", () => {
  const current = parseVizState(
    new URLSearchParams("cut=serve&ball=first&player=you"),
  );
  expect(
    sameView(current, {
      cut: "serve",
      chart: "scatter",
      filters: { ...current.filters, ball: "second" },
    }),
  ).toBe(false);
});

test("sameView: ignores keys not on the cut", () => {
  // `zone` is a serve-only key; comparing a returnPlacement candidate must
  // never look at it even if the two filter objects disagree there.
  const current = parseVizState(
    new URLSearchParams("cut=returnPlacement&player=you"),
  );
  expect(
    sameView(current, {
      cut: "returnPlacement",
      chart: "scatter",
      filters: { ...current.filters, zone: "t" },
    }),
  ).toBe(true);
});

test("sameView: a saved view matches by id even when its filters differ (e.g. renamed/edited elsewhere)", () => {
  const current = { ...EMPTY_VIZ_FILTERS };
  const state = {
    cut: "serve" as const,
    chart: "scatter" as const,
    filters: current,
    viewId: "view-1",
  };
  expect(
    sameView(state, {
      cut: "serve",
      chart: "scatter",
      filters: { ...current, ball: "second" },
      id: "view-1",
    }),
  ).toBe(true);
});

test("sameView: a saved view also matches by equal cut/chart/filters when no id was carried", () => {
  const filters = { ...EMPTY_VIZ_FILTERS, ball: "first" as const };
  const state = {
    cut: "serve" as const,
    chart: "scatter" as const,
    filters,
    viewId: null,
  };
  expect(
    sameView(state, {
      cut: "serve",
      chart: "scatter",
      filters,
      id: "view-1",
    }),
  ).toBe(true);
});

test("sameView: the wall state (cut: null) matches nothing", () => {
  const wall = parseVizState(new URLSearchParams("tab=shots"));
  expect(
    sameView(wall, {
      cut: "serve",
      chart: "scatter",
      filters: EMPTY_VIZ_FILTERS,
    }),
  ).toBe(false);
});

/* ── viewIdentityKey (F5) ─────────────────────────────────────────────── */

test("viewIdentityKey: null on the wall", () => {
  const wall = parseVizState(new URLSearchParams("tab=shots"));
  expect(viewIdentityKey(wall)).toBeNull();
});

test("viewIdentityKey: equal across a pure filter edit (cut, player, viewId unchanged)", () => {
  const a = parseVizState(new URLSearchParams("cut=serve&ball=first"));
  const b = parseVizState(new URLSearchParams("cut=serve&ball=second&zone=t"));
  expect(viewIdentityKey(a)).toBe(viewIdentityKey(b));
  expect(viewIdentityKey(a)).not.toBeNull();
});

test("viewIdentityKey: different across a cut change", () => {
  const serve = parseVizState(new URLSearchParams("cut=serve"));
  const returnPlacement = parseVizState(
    new URLSearchParams("cut=returnPlacement"),
  );
  expect(viewIdentityKey(serve)).not.toBe(viewIdentityKey(returnPlacement));
});

test("viewIdentityKey: different across a player (subject) change", () => {
  const you = parseVizState(new URLSearchParams("cut=serve"));
  const opponent = parseVizState(
    new URLSearchParams("cut=serve&player=opponent"),
  );
  expect(viewIdentityKey(you)).not.toBe(viewIdentityKey(opponent));
});

test("viewIdentityKey: different across a viewId change, same cut/player/filters otherwise", () => {
  const noView = parseVizState(new URLSearchParams("cut=serve"));
  const savedView = parseVizState(new URLSearchParams("cut=serve&view=view-1"));
  expect(viewIdentityKey(noView)).not.toBe(viewIdentityKey(savedView));
});

/* ── focusTargetAfterViewChange (F5 fix round 1) ─────────────────────────
 * Pure decision behind where keyboard focus (and the scroll-to-top) lands
 * after a state change — driven purely by the before/after `viewIdentityKey`,
 * never by whether a view transition ran, resolved, or was skipped (a
 * hidden document, an unsupported browser, or reduced motion all abort or
 * skip the animation, but the view still changes and focus still must
 * move). The caller seeds its "previous key" ref with the INITIAL state at
 * mount, so a same-key result on the very first effect run is what encodes
 * "do not steal focus on page load" — this function itself only ever
 * compares two keys, it has no notion of "first mount".
 */

test("focusTargetAfterViewChange: wall to focused lands on the focused view", () => {
  expect(focusTargetAfterViewChange(null, "you:serve:")).toBe("focused-view");
});

test("focusTargetAfterViewChange: focused to a DIFFERENT focused view (Views-grid tile) also lands on the focused view", () => {
  expect(focusTargetAfterViewChange("you:serve:", "opponent:serve:")).toBe(
    "focused-view",
  );
});

test("focusTargetAfterViewChange: focused to wall (Back to wall) returns focus to the opened tile", () => {
  expect(focusTargetAfterViewChange("you:serve:", null)).toBe("opened-tile");
});

test("focusTargetAfterViewChange: a filter-only change (same key) steals no focus", () => {
  expect(focusTargetAfterViewChange("you:serve:", "you:serve:")).toBeNull();
});

test("focusTargetAfterViewChange: the wall to itself (both null) steals no focus", () => {
  expect(focusTargetAfterViewChange(null, null)).toBeNull();
});
