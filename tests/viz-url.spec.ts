import { expect, test } from "@playwright/test";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  activeFilterEntries,
  applyVizUpdate,
  canonicalOptionValues,
  canonicalSetValues,
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
    filters: { ...EMPTY_VIZ_FILTERS, ball: ["first"], zone: ["t"], set: [2] },
  });
  const back = new URLSearchParams(q);
  expect(back.get("tab")).toBe("shots");
  expect(back.get("player")).toBeNull();
  expect(parseVizState(back)).toEqual({
    cut: "serve",
    chart: "zones",
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS, ball: ["first"], zone: ["t"], set: [2] },
  });
  expect(params.get("cut")).toBeNull(); // input not mutated
});

/* ── multi-value parsing, canonical order, round trip (G1) ───────────────
 * Every group but `player` is multi-select: `getAll` reads every repeated
 * key, values are deduped and sorted into `OPTIONS`' own order (`set` sorts
 * numerically), and the same rule runs on both the read side (`parseVizState`)
 * and the write side (`vizStateQuery`, `filters-popover.tsx`'s toggle) so two
 * callers picking the same set of values always land on the identical array —
 * and therefore the identical query string. */

test("parseVizState reads every repeated key as one list", () => {
  const s = parseVizState(
    new URLSearchParams("cut=serve&ball=first&ball=second&vset=3&vset=1"),
  );
  expect(s.filters.ball).toEqual(["first", "second"]);
  expect(s.filters.set).toEqual([1, 3]);
});

test("parseVizState dedupes repeats and sorts into canonical (OPTIONS) order regardless of URL order", () => {
  // OPTIONS.result lists won, lost, ace in that order — the URL below picks
  // them in the opposite order, with "won" repeated.
  const s = parseVizState(
    new URLSearchParams("cut=serve&result=ace&result=won&result=won"),
  );
  expect(s.filters.result).toEqual(["won", "ace"]);
});

test("canonicalOptionValues and canonicalSetValues dedupe and sort independently of input order", () => {
  expect(canonicalOptionValues("ball", ["second", "first", "second"])).toEqual([
    "first",
    "second",
  ]);
  expect(canonicalSetValues([3, 1, 1, 2])).toEqual([1, 2, 3]);
});

test("vizStateQuery serialises a multi-value group as one repeated param per selected value, in the state's own order", () => {
  // vizStateQuery trusts the state it's given is already canonical (every
  // producer — parseVizState, the popover's toggle — guarantees that); it
  // does not re-sort on the way out, it just appends in array order.
  const q = vizStateQuery(new URLSearchParams(), {
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS, result: ["won", "ace"] },
  });
  const back = new URLSearchParams(q);
  expect(back.getAll("result")).toEqual(["won", "ace"]);
});

test("round trip survives repeated keys and lands on the same canonical state either way they were picked", () => {
  const a = parseVizState(
    new URLSearchParams("cut=serve&ball=second&ball=first"),
  );
  const b = parseVizState(
    new URLSearchParams("cut=serve&ball=first&ball=second"),
  );
  expect(a).toEqual(b);
  expect(vizStateQuery(new URLSearchParams(), a)).toBe(
    vizStateQuery(new URLSearchParams(), b),
  );
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
  expect(s.filters.set).toEqual([1]);
});

test("vizStateQuery leaves an unrelated set param untouched", () => {
  const params = new URLSearchParams("tab=shots&set=2&cut=serve&vset=1");
  const q = vizStateQuery(params, {
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS, set: [3] },
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
  expect(withAce.filters.result).toEqual([]);

  const withZone = parseVizState(
    new URLSearchParams("cut=returnPlacement&zone=t"),
  );
  expect(withZone.filters.zone).toEqual([]);
});

test("garbage values read as defaults; zones off serve reads as scatter", () => {
  const s = parseVizState(
    new URLSearchParams("cut=returnContact&chart=zones&ball=third&vset=x"),
  );
  expect(s.chart).toBe("scatter");
  expect(s.filters.ball).toEqual([]);
  expect(s.filters.set).toEqual([]);
  expect(parseVizState(new URLSearchParams("cut=nope")).cut).toBeNull();
});

/* ── G3a: rallyPosition + heat ────────────────────────────────────────── */

test("parseVizState accepts cut=rallyPosition", () => {
  const s = parseVizState(new URLSearchParams("cut=rallyPosition"));
  expect(s.cut).toBe("rallyPosition");
  expect(s.chart).toBe("scatter");
});

test("round trip: cut=rallyPosition&chart=heat", () => {
  const q = vizStateQuery(new URLSearchParams(""), {
    cut: "rallyPosition",
    chart: "heat",
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
  });
  const back = new URLSearchParams(q);
  expect(back.get("cut")).toBe("rallyPosition");
  expect(back.get("chart")).toBe("heat");
  expect(parseVizState(back)).toEqual({
    cut: "rallyPosition",
    chart: "heat",
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
  });
});

test("heat parses on every cut, including a serve-only zones URL swapped for heat", () => {
  for (const cut of [
    "serve",
    "returnPlacement",
    "returnContact",
    "rallyPosition",
  ]) {
    const s = parseVizState(new URLSearchParams(`cut=${cut}&chart=heat`));
    expect(s.chart).toBe("heat");
  }
});

test("zones still reads as scatter off serve even for rallyPosition", () => {
  const s = parseVizState(new URLSearchParams("cut=rallyPosition&chart=zones"));
  expect(s.chart).toBe("scatter");
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

test("carryFilters drops zone entirely and drops only 'ace' out of result off serve", () => {
  const f = carryFilters(
    {
      ...EMPTY_VIZ_FILTERS,
      zone: ["t"],
      result: ["ace", "won"],
      ball: ["first"],
    },
    "returnPlacement",
  );
  expect(f.zone).toEqual([]);
  expect(f.result).toEqual(["won"]);
  expect(f.ball).toEqual(["first"]);
});

test("carryFilters keeps a result selection with no 'ace' in it untouched", () => {
  const f = carryFilters(
    { ...EMPTY_VIZ_FILTERS, result: ["won", "lost"] },
    "returnContact",
  );
  expect(f.result).toEqual(["won", "lost"]);
});

/* ── activeFilterEntries: one entry per VALUE (G1) ───────────────────────
 * A group with more than one value selected draws one token per value, not
 * one per group. */

test("activeFilterEntries uses option labels, one entry per value", () => {
  const e = activeFilterEntries({
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: {
      ...EMPTY_VIZ_FILTERS,
      ball: ["first"],
      zone: ["t"],
      player: "opponent",
    },
  });
  expect(e.map((x) => x.label)).toEqual(["Opponent", "1st", "T"]);
});

test("activeFilterEntries draws one token per selected value in a multi-select group", () => {
  const e = activeFilterEntries({
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS, ball: ["first", "second"] },
  });
  expect(e).toEqual([
    { key: "ball", value: "first", label: "1st" },
    { key: "ball", value: "second", label: "2nd" },
  ]);
});

test("activeFilterEntries draws one token per selected set number", () => {
  const e = activeFilterEntries({
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: { ...EMPTY_VIZ_FILTERS, set: [1, 2] },
  });
  expect(e).toEqual([
    { key: "set", value: "1", label: "Set 1" },
    { key: "set", value: "2", label: "Set 2" },
  ]);
});

test("clearedFilters resets every key including player, clears viewId, keeps cut and chart", () => {
  const state = {
    cut: "serve" as const,
    chart: "zones" as const,
    viewId: "abc",
    filters: {
      ...EMPTY_VIZ_FILTERS,
      player: "opponent" as const,
      ball: ["first"] as const,
      zone: ["t"] as const,
      set: [2],
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
  expect(s.filters.ball).toEqual([]);
  expect(s.filters.zone).toEqual([]);
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
    filters: { ...prev.filters, ball: ["first"] },
  }));
  const afterZone = applyVizUpdate(afterBall, (prev) => ({
    ...prev,
    filters: { ...prev.filters, zone: ["t"] },
  }));
  expect(afterZone.filters.ball).toEqual(["first"]);
  expect(afterZone.filters.zone).toEqual(["t"]);
});

test("applyVizUpdate: an updater after clearedFilters sees cleared filters", () => {
  const start = {
    cut: "serve" as const,
    chart: "scatter" as const,
    viewId: "abc",
    filters: {
      ...EMPTY_VIZ_FILTERS,
      player: "opponent" as const,
      ball: ["first"] as const,
    },
  };
  const cleared = applyVizUpdate(start, (prev) => clearedFilters(prev));
  const afterZone = applyVizUpdate(cleared, (prev) => ({
    ...prev,
    filters: { ...prev.filters, zone: ["t"] },
  }));
  expect(afterZone.filters).toEqual({ ...EMPTY_VIZ_FILTERS, zone: ["t"] });
  expect(afterZone.viewId).toBeNull();
});

test("applyVizUpdate: a plain-object update replaces wholesale", () => {
  const start = {
    cut: "serve" as const,
    chart: "zones" as const,
    viewId: "abc",
    filters: { ...EMPTY_VIZ_FILTERS, ball: ["first"] as const },
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

test("sameView: matches regardless of list order (canonical vs. hand-built candidate)", () => {
  const current = parseVizState(
    new URLSearchParams("cut=serve&result=won&result=ace"),
  );
  expect(current.filters.result).toEqual(["won", "ace"]); // canonical order
  expect(
    sameView(current, {
      cut: "serve",
      chart: "scatter",
      // Same two values, reversed — must still match.
      filters: { ...current.filters, result: ["ace", "won"] },
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
      filters: { ...current.filters, ball: ["second"] },
    }),
  ).toBe(false);
});

test("sameView: differs when a candidate is missing one of the current's selected values", () => {
  const current = parseVizState(
    new URLSearchParams("cut=serve&ball=first&ball=second"),
  );
  expect(
    sameView(current, {
      cut: "serve",
      chart: "scatter",
      filters: { ...current.filters, ball: ["first"] },
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
      filters: { ...current.filters, zone: ["t"] },
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
      filters: { ...current, ball: ["second"] },
      id: "view-1",
    }),
  ).toBe(true);
});

test("sameView: a saved view also matches by equal cut/chart/filters when no id was carried", () => {
  const filters = { ...EMPTY_VIZ_FILTERS, ball: ["first"] as const };
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

/* ── G4: "Create view" draft state ────────────────────────────────────────
 * `draft` is the blank-court prompt `saved-views-band.tsx`'s `NewViewTile`
 * links to (`?cut=serve&draft=1`, no filters). It only means anything
 * alongside a real cut, and `applyVizUpdate` is the one place it gets
 * cleared — any state change requested through `setState` leaves it behind,
 * even a no-op pick like choosing the same cut again while already parked
 * there in draft form.
 */

test("parseVizState reads draft=1 alongside a cut", () => {
  const s = parseVizState(new URLSearchParams("cut=serve&draft=1"));
  expect(s.draft).toBe(true);
});

test("parseVizState: draft is falsy without the param, and without a valid draft value", () => {
  expect(parseVizState(new URLSearchParams("cut=serve")).draft).not.toBe(true);
  expect(
    parseVizState(new URLSearchParams("cut=serve&draft=yes")).draft,
  ).not.toBe(true);
});

test("parseVizState: draft is dropped on the wall even if the param is present", () => {
  const s = parseVizState(new URLSearchParams("draft=1"));
  expect(s.cut).toBeNull();
  expect(s.draft).not.toBe(true);
});

test("vizStateQuery round trip: draft=1 survives alongside cut, and is omitted when false", () => {
  const draftQuery = vizStateQuery(new URLSearchParams(), {
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
    draft: true,
  });
  const back = new URLSearchParams(draftQuery);
  expect(back.get("draft")).toBe("1");
  expect(parseVizState(back).draft).toBe(true);

  const plainQuery = vizStateQuery(new URLSearchParams(), {
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
  });
  expect(new URLSearchParams(plainQuery).get("draft")).toBeNull();
});

test("vizStateQuery: draft never serializes on the wall, even if the state somehow carries it", () => {
  const q = vizStateQuery(new URLSearchParams(), {
    cut: null,
    chart: "scatter",
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
    draft: true,
  });
  expect(new URLSearchParams(q).get("draft")).toBeNull();
});

test("applyVizUpdate: a plain-object update to a fresh (non-draft) VizState leaves draft unset", () => {
  const draftState = parseVizState(new URLSearchParams("cut=serve&draft=1"));
  const next = applyVizUpdate(draftState, {
    cut: "returnPlacement",
    chart: "scatter",
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
  });
  expect(next.draft).not.toBe(true);
});

test("applyVizUpdate: an updater that spreads prev clears draft even when nothing it changed differs from the draft's own placeholder", () => {
  // Simulates cut-menu.tsx's selectCut("serve") fired while already parked
  // on the draft's own Serve/scatter/no-filters placeholder — the values
  // are identical, but picking it is still a real action that must leave
  // draft behind.
  const draftState = parseVizState(new URLSearchParams("cut=serve&draft=1"));
  const next = applyVizUpdate(draftState, (prev) => ({
    ...prev,
    cut: "serve",
    chart: "scatter",
    filters: EMPTY_VIZ_FILTERS,
    viewId: null,
  }));
  expect(next.draft).not.toBe(true);
  expect(next.cut).toBe("serve");
});

test("applyVizUpdate: an updater that only changes a filter also clears draft", () => {
  const draftState = parseVizState(new URLSearchParams("cut=serve&draft=1"));
  const next = applyVizUpdate(draftState, (prev) => ({
    ...prev,
    filters: { ...prev.filters, ball: ["first"] },
    viewId: null,
  }));
  expect(next.draft).not.toBe(true);
  expect(next.filters.ball).toEqual(["first"]);
});

test("applyVizUpdate: loading a saved view (a fresh literal, not spreading prev) is not draft", () => {
  const draftState = parseVizState(new URLSearchParams("cut=serve&draft=1"));
  const next = applyVizUpdate(draftState, () => ({
    cut: "returnContact",
    chart: "scatter",
    filters: EMPTY_VIZ_FILTERS,
    viewId: "view-1",
  }));
  expect(next.draft).not.toBe(true);
  expect(next.viewId).toBe("view-1");
});

test("sameView: a draft matches no tile, even one with an identical cut/chart/filters", () => {
  const draftState = parseVizState(new URLSearchParams("cut=serve&draft=1"));
  expect(
    sameView(draftState, {
      cut: "serve",
      chart: "scatter",
      filters: EMPTY_VIZ_FILTERS,
    }),
  ).toBe(false);
});

test("viewIdentityKey: a draft has its own identity, distinct from the equivalent non-draft state", () => {
  const draftState = parseVizState(new URLSearchParams("cut=serve&draft=1"));
  const plainState = parseVizState(new URLSearchParams("cut=serve"));
  expect(viewIdentityKey(draftState)).not.toBe(viewIdentityKey(plainState));
  expect(viewIdentityKey(draftState)).not.toBeNull();
});

test("focusTargetAfterViewChange: the wall to itself (both null) steals no focus", () => {
  expect(focusTargetAfterViewChange(null, null)).toBeNull();
});

/* ── Phase 2A: fullscreen court viewer ────────────────────────────────────
 * `fullscreen` opens `viz-fullscreen.tsx` over the focused court. Only
 * meaningful alongside a real cut (dropped on the wall, same as `draft`),
 * and `draft` wins when both are present. Unlike `draft`, `applyVizUpdate`
 * never clears it, and it is excluded from `viewIdentityKey`/`sameView`.
 */

test("parseVizState reads fullscreen=1 alongside a cut", () => {
  const s = parseVizState(new URLSearchParams("cut=serve&fullscreen=1"));
  expect(s.fullscreen).toBe(true);
});

test("parseVizState: fullscreen is falsy without the param, and without a valid value", () => {
  expect(parseVizState(new URLSearchParams("cut=serve")).fullscreen).not.toBe(
    true,
  );
  expect(
    parseVizState(new URLSearchParams("cut=serve&fullscreen=yes")).fullscreen,
  ).not.toBe(true);
});

test("parseVizState: fullscreen is dropped on the wall even if the param is present", () => {
  const s = parseVizState(new URLSearchParams("fullscreen=1"));
  expect(s.cut).toBeNull();
  expect(s.fullscreen).not.toBe(true);
});

test("parseVizState: draft wins over fullscreen when both params are present", () => {
  const s = parseVizState(
    new URLSearchParams("cut=serve&draft=1&fullscreen=1"),
  );
  expect(s.draft).toBe(true);
  expect(s.fullscreen).not.toBe(true);
});

test("vizStateQuery round trip: fullscreen=1 survives alongside cut, and is omitted when false", () => {
  const fsQuery = vizStateQuery(new URLSearchParams(), {
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
    fullscreen: true,
  });
  const back = new URLSearchParams(fsQuery);
  expect(back.get("fullscreen")).toBe("1");
  expect(parseVizState(back).fullscreen).toBe(true);

  const plainQuery = vizStateQuery(new URLSearchParams(), {
    cut: "serve",
    chart: "scatter",
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
  });
  expect(new URLSearchParams(plainQuery).get("fullscreen")).toBeNull();
});

test("vizStateQuery: fullscreen never serializes on the wall, even if the state somehow carries it", () => {
  const q = vizStateQuery(new URLSearchParams(), {
    cut: null,
    chart: "scatter",
    viewId: null,
    filters: EMPTY_VIZ_FILTERS,
    fullscreen: true,
  });
  expect(new URLSearchParams(q).get("fullscreen")).toBeNull();
});

test("applyVizUpdate: fullscreen survives a filter-only update (unlike draft, it is not cleared)", () => {
  const openState = parseVizState(
    new URLSearchParams("cut=serve&fullscreen=1"),
  );
  const next = applyVizUpdate(openState, (prev) => ({
    ...prev,
    filters: { ...prev.filters, ball: ["first"] },
  }));
  expect(next.fullscreen).toBe(true);
  expect(next.filters.ball).toEqual(["first"]);
});

test("applyVizUpdate: fullscreen survives a cut/chart change made while open", () => {
  const openState = parseVizState(
    new URLSearchParams("cut=serve&fullscreen=1"),
  );
  const next = applyVizUpdate(openState, (prev) => ({
    ...prev,
    cut: "returnContact",
    chart: "scatter",
  }));
  expect(next.fullscreen).toBe(true);
  expect(next.cut).toBe("returnContact");
});

test("vizStateQuery: fullscreen is dropped by setting cut back to null (Back to wall)", () => {
  const openState = parseVizState(
    new URLSearchParams("cut=serve&fullscreen=1"),
  );
  const wallState = applyVizUpdate(openState, (prev) => ({
    ...prev,
    cut: null,
  }));
  const q = vizStateQuery(new URLSearchParams(), wallState);
  const back = new URLSearchParams(q);
  expect(back.get("fullscreen")).toBeNull();
  expect(parseVizState(back).fullscreen).not.toBe(true);
});

test("viewIdentityKey: fullscreen does not change the view identity", () => {
  const openState = parseVizState(
    new URLSearchParams("cut=serve&fullscreen=1"),
  );
  const closedState = parseVizState(new URLSearchParams("cut=serve"));
  expect(viewIdentityKey(openState)).toBe(viewIdentityKey(closedState));
});

test("sameView: fullscreen does not affect whether a state matches a tile", () => {
  const openState = parseVizState(
    new URLSearchParams("cut=serve&fullscreen=1"),
  );
  expect(
    sameView(openState, {
      cut: "serve",
      chart: "scatter",
      filters: EMPTY_VIZ_FILTERS,
    }),
  ).toBe(true);
});
