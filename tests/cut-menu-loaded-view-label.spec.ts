import { expect, test } from "@playwright/test";
import { loadedViewLabel } from "@/components/dashboard/matches/match-detail/shots/cut-menu";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import type { VizState } from "@/components/dashboard/matches/match-detail/shots/viz-url";
import type { SavedViewLite } from "@/components/dashboard/matches/match-detail/shots/viz-labels";

/**
 * Task 3: the "View" trigger's pure label logic (f4b-report P2e —
 * "The trigger shows the saved view's name with a bookmark glyph once one is
 * loaded... Editing anything afterwards keeps the name but the trigger drops
 * the bookmark"). Extracted out of `cut-menu.tsx` so it's testable without
 * rendering the menu.
 */

const SAVED_VIEW: SavedViewLite = {
  id: "view-1",
  name: "Second-serve returns",
  cut: "returnPlacement",
  chart: "scatter",
  filters: { ...EMPTY_VIZ_FILTERS, ball: ["second"] },
};

function baseState(overrides: Partial<VizState> = {}): VizState {
  return {
    cut: "returnPlacement",
    chart: "scatter",
    filters: { ...EMPTY_VIZ_FILTERS, ball: ["second"] },
    viewId: null,
    ...overrides,
  };
}

test("a loaded, unedited saved view shows its name with the bookmark", () => {
  const state = baseState({ viewId: SAVED_VIEW.id });
  expect(loadedViewLabel(state, [SAVED_VIEW])).toEqual({
    label: "Second-serve returns",
    bookmark: true,
  });
});

test("editing a filter after loading a view keeps the name, drops the bookmark", () => {
  const state = baseState({
    viewId: SAVED_VIEW.id,
    filters: { ...EMPTY_VIZ_FILTERS, ball: ["first"] },
  });
  expect(loadedViewLabel(state, [SAVED_VIEW])).toEqual({
    label: "Second-serve returns",
    bookmark: false,
  });
});

test("switching the cut after loading a view keeps the name, drops the bookmark", () => {
  const state = baseState({ viewId: SAVED_VIEW.id, cut: "serve" });
  expect(loadedViewLabel(state, [SAVED_VIEW])).toEqual({
    label: "Second-serve returns",
    bookmark: false,
  });
});

test("no view loaded falls back to the plain cut label", () => {
  const state = baseState({ viewId: null, cut: "serve" });
  expect(loadedViewLabel(state, [SAVED_VIEW])).toEqual({
    label: "Serve placement",
    bookmark: false,
  });
});

test("the wall (no cut) falls back to 'View'", () => {
  const state = baseState({ viewId: null, cut: null });
  expect(loadedViewLabel(state, [SAVED_VIEW])).toEqual({
    label: "View",
    bookmark: false,
  });
});

test("a viewId that no longer resolves (deleted view) falls back to the cut label", () => {
  const state = baseState({ viewId: "deleted-view", cut: "serve" });
  expect(loadedViewLabel(state, [SAVED_VIEW])).toEqual({
    label: "Serve placement",
    bookmark: false,
  });
});

test("a chart change away from the saved view's chart drops the bookmark", () => {
  const state = baseState({ viewId: SAVED_VIEW.id, chart: "heat" });
  expect(loadedViewLabel(state, [SAVED_VIEW])).toEqual({
    label: "Second-serve returns",
    bookmark: false,
  });
});
