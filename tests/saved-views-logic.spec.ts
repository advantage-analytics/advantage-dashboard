import { expect, test } from "@playwright/test";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  filtersToParams,
  normalizeSavedViewName,
  resolveCopyName,
  rowToSavedView,
  rowToSavedViewRow,
  validateVizInput,
  type SavedViewDbRow,
} from "@/lib/data/saved-views-logic";

function dbRow(overrides: Partial<SavedViewDbRow> = {}): SavedViewDbRow {
  return {
    id: "view-1",
    name: "Break points",
    cut: "serve",
    chart: "zones",
    filters: { pressure: "break" },
    sort_order: 3,
    shared: false,
    created_by: "user-1",
    created_at: "2026-09-01T00:00:00Z",
    ...overrides,
  };
}

/* ── filtersToParams ───────────────────────────────────────────────────── */

test("filtersToParams round-trips a plain filters object", () => {
  const params = filtersToParams({ ball: "first", set: 2 });
  expect(params.get("ball")).toBe("first");
  expect(params.get("set")).toBe("2");
});

test("filtersToParams drops null/undefined and ignores non-objects", () => {
  const params = filtersToParams({
    ball: "first",
    zone: null,
    court: undefined,
  });
  expect(params.has("zone")).toBe(false);
  expect(params.has("court")).toBe(false);
  expect(filtersToParams(null).toString()).toBe("");
  expect(filtersToParams("garbage").toString()).toBe("");
  expect(filtersToParams(["a", "b"]).toString()).toBe("");
});

/* ── validateVizInput ──────────────────────────────────────────────────── */

test("validateVizInput accepts a valid serve/zones/filters triple", () => {
  const result = validateVizInput({
    cut: "serve",
    chart: "zones",
    filters: { pressure: "break" },
  });
  expect(result).toEqual({
    cut: "serve",
    chart: "zones",
    filters: { ...EMPTY_VIZ_FILTERS, pressure: "break" },
  });
});

test("validateVizInput rejects an unknown cut", () => {
  expect(
    validateVizInput({ cut: "nonsense", chart: "scatter", filters: {} }),
  ).toBeNull();
});

test("validateVizInput rejects an unknown chart", () => {
  expect(
    validateVizInput({ cut: "serve", chart: "heatmap", filters: {} }),
  ).toBeNull();
});

test("validateVizInput rejects zones off serve rather than downgrading it", () => {
  // parseVizState itself would silently read this as "scatter" (a URL must
  // always resolve to something drawable); a stored/submitted row asking for
  // the impossible pairing is invalid, not a scatter chart in disguise.
  expect(
    validateVizInput({
      cut: "returnPlacement",
      chart: "zones",
      filters: {},
    }),
  ).toBeNull();
});

test("validateVizInput drops a filter value outside its enum", () => {
  const result = validateVizInput({
    cut: "serve",
    chart: "scatter",
    filters: { ball: "third" },
  });
  expect(result).toEqual({
    cut: "serve",
    chart: "scatter",
    filters: EMPTY_VIZ_FILTERS,
  });
});

/* ── rowToSavedView / rowToSavedViewRow ───────────────────────────────── */

test("rowToSavedView maps a valid row", () => {
  const view = rowToSavedView(dbRow());
  expect(view).toEqual({
    id: "view-1",
    name: "Break points",
    cut: "serve",
    chart: "zones",
    filters: { ...EMPTY_VIZ_FILTERS, pressure: "break" },
    order: 3,
  });
});

test("rowToSavedView drops a row with a stale/unknown cut", () => {
  expect(rowToSavedView(dbRow({ cut: "smash" }))).toBeNull();
});

test("rowToSavedView drops a row asking for zones off serve", () => {
  expect(
    rowToSavedView(dbRow({ cut: "returnPlacement", chart: "zones" })),
  ).toBeNull();
});

test("rowToSavedViewRow adds shared/mine for the viewer", () => {
  const row = dbRow({ shared: true, created_by: "user-1" });
  expect(rowToSavedViewRow(row, "user-1")).toMatchObject({
    shared: true,
    mine: true,
  });
  expect(rowToSavedViewRow(row, "someone-else")).toMatchObject({
    shared: true,
    mine: false,
  });
});

test("rowToSavedViewRow returns null for an invalid row same as rowToSavedView", () => {
  expect(rowToSavedViewRow(dbRow({ cut: "smash" }), "user-1")).toBeNull();
});

/* ── normalizeSavedViewName ───────────────────────────────────────────── */

test("normalizeSavedViewName trims and accepts a normal name", () => {
  expect(normalizeSavedViewName("  Break points  ")).toBe("Break points");
});

test("normalizeSavedViewName rejects empty/whitespace-only names", () => {
  expect(normalizeSavedViewName("")).toBeNull();
  expect(normalizeSavedViewName("   ")).toBeNull();
});

test("normalizeSavedViewName rejects names over 60 characters", () => {
  expect(normalizeSavedViewName("a".repeat(61))).toBeNull();
  expect(normalizeSavedViewName("a".repeat(60))).toBe("a".repeat(60));
});

/* ── resolveCopyName ───────────────────────────────────────────────────── */

test("resolveCopyName appends ' copy' when there is no collision", () => {
  expect(resolveCopyName("Break points", new Set())).toBe("Break points copy");
});

test("resolveCopyName numbers past a collision", () => {
  const existing = new Set(["break points copy"]);
  expect(resolveCopyName("Break points", existing)).toBe("Break points copy 2");
});

test("resolveCopyName keeps numbering through multiple collisions", () => {
  const existing = new Set([
    "break points copy",
    "break points copy 2",
    "break points copy 3",
  ]);
  expect(resolveCopyName("Break points", existing)).toBe("Break points copy 4");
});

test("resolveCopyName compares case-insensitively and trimmed", () => {
  const existing = new Set(["break points copy"]);
  expect(resolveCopyName("  BREAK POINTS  ", existing)).toBe(
    "BREAK POINTS copy 2",
  );
});

test("resolveCopyName truncates the base so the result stays within 60 chars", () => {
  const longName = "x".repeat(60);
  const candidate = resolveCopyName(longName, new Set());
  expect(candidate.length).toBeLessThanOrEqual(60);
  expect(candidate.endsWith(" copy")).toBe(true);
});

test("resolveCopyName truncation still numbers past a collision within 60 chars", () => {
  const longName = "x".repeat(60);
  const first = resolveCopyName(longName, new Set());
  const existing = new Set([first.trim().toLowerCase()]);
  const second = resolveCopyName(longName, existing);
  expect(second.length).toBeLessThanOrEqual(60);
  expect(second).not.toBe(first);
  expect(second.endsWith(" copy 2")).toBe(true);
});
