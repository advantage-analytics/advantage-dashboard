import { expect, test } from "@playwright/test";
import { EMPTY_VIZ_FILTERS } from "@/components/dashboard/matches/match-detail/shots/viz-model";
import {
  applyIdOrder,
  bandVisibility,
  canManageSavedView,
  filtersToParams,
  hasDuplicateViewName,
  manageMenuRows,
  mergeManageableOrder,
  moveItem,
  normalizeOrderedIds,
  normalizeSavedViewName,
  resolveCopyName,
  rowToSavedView,
  rowToSavedViewRow,
  savedViewsCountFact,
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

test("validateVizInput never lets a stray filters.chart/cut/view key override the explicit input", () => {
  // `filters` is a jsonb blob a caller controls; without this, a payload
  // could smuggle `chart:"zones"` in through `filters` and have it silently
  // win over the explicit (and validated) top-level `chart`.
  const result = validateVizInput({
    cut: "serve",
    chart: "scatter",
    filters: { chart: "zones", cut: "returnPlacement", view: "hijacked" },
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

/* ── normalizeOrderedIds ───────────────────────────────────────────────── */

const UUID_A = "11111111-1111-1111-1111-111111111111";
const UUID_B = "22222222-2222-2222-2222-222222222222";
const UUID_C = "33333333-3333-3333-3333-333333333333";

test("normalizeOrderedIds passes through a valid, already-unique list", () => {
  expect(normalizeOrderedIds([UUID_A, UUID_B, UUID_C])).toEqual([
    UUID_A,
    UUID_B,
    UUID_C,
  ]);
});

test("normalizeOrderedIds de-duplicates, keeping the first occurrence's position", () => {
  expect(normalizeOrderedIds([UUID_A, UUID_B, UUID_A, UUID_C, UUID_B])).toEqual(
    [UUID_A, UUID_B, UUID_C],
  );
});

test("normalizeOrderedIds rejects a non-UUID-shaped id", () => {
  expect(normalizeOrderedIds([UUID_A, "not-a-uuid"])).toBeNull();
  expect(normalizeOrderedIds(["<script>alert(1)</script>"])).toBeNull();
});

test("normalizeOrderedIds accepts uppercase UUIDs (case-insensitive)", () => {
  expect(normalizeOrderedIds([UUID_A.toUpperCase()])).toEqual([
    UUID_A.toUpperCase(),
  ]);
});

test("normalizeOrderedIds rejects a list longer than 200 ids", () => {
  const tooMany = Array.from(
    { length: 201 },
    (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  );
  expect(normalizeOrderedIds(tooMany)).toBeNull();
});

test("normalizeOrderedIds accepts exactly 200 ids", () => {
  const twoHundred = Array.from(
    { length: 200 },
    (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  );
  expect(normalizeOrderedIds(twoHundred)).toHaveLength(200);
});

test("normalizeOrderedIds rejects a non-array input", () => {
  expect(normalizeOrderedIds(null as unknown as string[])).toBeNull();
  expect(normalizeOrderedIds(undefined as unknown as string[])).toBeNull();
});

/* ── canManageSavedView ────────────────────────────────────────────────── */

test("canManageSavedView: the creator may always manage their own view", () => {
  expect(canManageSavedView({ mine: true, shared: false }, "player")).toBe(
    true,
  );
  expect(canManageSavedView({ mine: true, shared: true }, "player")).toBe(true);
});

test("canManageSavedView: staff may manage a shared view they did not create", () => {
  expect(canManageSavedView({ mine: false, shared: true }, "coach")).toBe(true);
  expect(canManageSavedView({ mine: false, shared: true }, "owner")).toBe(true);
  expect(canManageSavedView({ mine: false, shared: true }, "staff")).toBe(true);
});

test("canManageSavedView: a player may not manage someone else's shared view", () => {
  expect(canManageSavedView({ mine: false, shared: true }, "player")).toBe(
    false,
  );
});

test("canManageSavedView: nobody may manage someone else's private view", () => {
  expect(canManageSavedView({ mine: false, shared: false }, "owner")).toBe(
    false,
  );
});

/* ── hasDuplicateViewName ──────────────────────────────────────────────── */

test("hasDuplicateViewName matches case-insensitively on the trimmed form", () => {
  expect(hasDuplicateViewName("Break Points", ["break points"])).toBe(true);
  expect(hasDuplicateViewName("  break points  ", ["Break Points"])).toBe(true);
});

test("hasDuplicateViewName is false for a non-colliding name", () => {
  expect(hasDuplicateViewName("Deuce side", ["Break points"])).toBe(false);
});

test("hasDuplicateViewName is false for an empty/whitespace name", () => {
  expect(hasDuplicateViewName("   ", ["Break points"])).toBe(false);
  expect(hasDuplicateViewName("", [])).toBe(false);
});

/* ── moveItem ───────────────────────────────────────────────────────────── */

test("moveItem moves an item forward", () => {
  expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
});

test("moveItem moves an item backward", () => {
  expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
});

test("moveItem is a no-op when from equals to", () => {
  expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
});

test("moveItem clamps an out-of-range destination to the nearest end", () => {
  expect(moveItem(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
  expect(moveItem(["a", "b", "c"], 2, -5)).toEqual(["c", "a", "b"]);
});

test("moveItem returns a shallow copy unchanged when from is out of range", () => {
  const input = ["a", "b", "c"];
  const result = moveItem(input, 9, 0);
  expect(result).toEqual(["a", "b", "c"]);
  expect(result).not.toBe(input);
});

/* ── mergeManageableOrder ───────────────────────────────────────────────── */

test("mergeManageableOrder splices a reordered manageable run back into place", () => {
  // "b" and "d" are manageable; "a" and "c" are teammates' tiles that must
  // stay exactly where they were.
  const allIds = ["a", "b", "c", "d"];
  const manageableIds = ["b", "d"];
  const newManageableOrder = ["d", "b"]; // swapped
  expect(
    mergeManageableOrder(allIds, manageableIds, newManageableOrder),
  ).toEqual(["a", "d", "c", "b"]);
});

test("mergeManageableOrder leaves an all-manageable list simply reordered", () => {
  expect(
    mergeManageableOrder(["a", "b", "c"], ["a", "b", "c"], ["c", "a", "b"]),
  ).toEqual(["c", "a", "b"]);
});

test("mergeManageableOrder is a no-op when nothing is manageable", () => {
  expect(mergeManageableOrder(["a", "b", "c"], [], [])).toEqual([
    "a",
    "b",
    "c",
  ]);
});

test("mergeManageableOrder falls back to the original order on a mismatched replacement", () => {
  const allIds = ["a", "b", "c"];
  const manageableIds = ["a", "c"];
  // Wrong length
  expect(mergeManageableOrder(allIds, manageableIds, ["a"])).toEqual(allIds);
  // Contains an id outside the manageable set
  expect(mergeManageableOrder(allIds, manageableIds, ["a", "b"])).toEqual(
    allIds,
  );
  // Duplicate id
  expect(mergeManageableOrder(allIds, manageableIds, ["a", "a"])).toEqual(
    allIds,
  );
});

/* ── manageMenuRows ─────────────────────────────────────────────────────── */

test("manageMenuRows: a private view mine to me, in a personal workspace", () => {
  expect(
    manageMenuRows(
      { mine: true, shared: false },
      { workspaceKind: "personal", role: "owner" },
    ),
  ).toEqual(["rename", "duplicate", "delete"]);
});

test("manageMenuRows: my own private view in a team workspace offers Share", () => {
  expect(
    manageMenuRows(
      { mine: true, shared: false },
      { workspaceKind: "team", role: "player" },
    ),
  ).toEqual(["rename", "duplicate", "share", "delete"]);
});

test("manageMenuRows: my own shared view in a team workspace offers Make private", () => {
  expect(
    manageMenuRows(
      { mine: true, shared: true },
      { workspaceKind: "team", role: "player" },
    ),
  ).toEqual(["rename", "duplicate", "unshare", "delete"]);
});

test("manageMenuRows: staff managing a teammate's shared view gets no share/unshare row", () => {
  expect(
    manageMenuRows(
      { mine: false, shared: true },
      { workspaceKind: "team", role: "staff" },
    ),
  ).toEqual(["rename", "duplicate", "delete"]);
});

/* ── applyIdOrder ───────────────────────────────────────────────────────── */

interface Item {
  id: string;
  name: string;
}

test("applyIdOrder reorders items to match the given id order", () => {
  const items: Item[] = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ];
  expect(applyIdOrder(items, ["c", "a", "b"])).toEqual([
    { id: "c", name: "C" },
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ]);
});

test("applyIdOrder appends items not named in ids, keeping their relative order, at the end", () => {
  const items: Item[] = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
    { id: "d", name: "D" },
  ];
  // "b" and "d" arrived after the snapshot (`ids`) was taken and are not in it.
  expect(applyIdOrder(items, ["c", "a"])).toEqual([
    { id: "c", name: "C" },
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "d", name: "D" },
  ]);
});

test("applyIdOrder drops an id from the snapshot that is no longer present in items", () => {
  const items: Item[] = [
    { id: "a", name: "A" },
    { id: "c", name: "C" },
  ];
  // "b" was in the snapshot but no longer exists in `items` (deleted since).
  expect(applyIdOrder(items, ["c", "b", "a"])).toEqual([
    { id: "c", name: "C" },
    { id: "a", name: "A" },
  ]);
});

test("applyIdOrder returns an empty list unchanged", () => {
  expect(applyIdOrder([], ["a", "b"])).toEqual([]);
});

test("applyIdOrder with an empty snapshot keeps every item in its original order", () => {
  const items: Item[] = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
  ];
  expect(applyIdOrder(items, [])).toEqual(items);
});

/* ── savedViewsCountFact ──────────────────────────────────────────────── */

test("savedViewsCountFact is empty with zero saved views", () => {
  expect(savedViewsCountFact(0)).toBe("");
});

test("savedViewsCountFact singularizes exactly one", () => {
  expect(savedViewsCountFact(1)).toBe(" · 1 saved view");
});

test("savedViewsCountFact pluralizes more than one", () => {
  expect(savedViewsCountFact(2)).toBe(" · 2 saved views");
  expect(savedViewsCountFact(11)).toBe(" · 11 saved views");
});

/* ── bandVisibility ──────────────────────────────────────────────────── */

test("bandVisibility is hidden with zero views and nothing pending", () => {
  expect(bandVisibility(0, false)).toBe("hidden");
});

test("bandVisibility stays status-only with zero views while a status message is showing", () => {
  expect(bandVisibility(0, true)).toBe("status-only");
});

test("bandVisibility is full with at least one view, status or not", () => {
  expect(bandVisibility(1, false)).toBe("full");
  expect(bandVisibility(1, true)).toBe("full");
  expect(bandVisibility(3, false)).toBe("full");
});

// R1 fix: `saved-views-band.tsx`'s status/Undo line is gated on `status !==
// null` alone (`hasStatus` here), never on Manage mode. `bandVisibility`
// takes exactly `(viewCount, hasStatus)` — no third `manageMode` parameter
// — so pressing "Done" (which only flips Manage mode, never `status`) has
// no way to reach this decision at all. Asserting the arity documents that
// invariant directly, rather than by example: the prior bug was a
// component-level gate (`saved-views-band.tsx` rendering the status line
// only `manageMode && …`) that disagreed with this already-correct pure
// decision, not a defect in `bandVisibility` itself, and this pins the
// function's shape so a future edit can't reintroduce that coupling here.
test("bandVisibility takes only viewCount and hasStatus — manage mode is not one of its inputs", () => {
  expect(bandVisibility.length).toBe(2);
});
