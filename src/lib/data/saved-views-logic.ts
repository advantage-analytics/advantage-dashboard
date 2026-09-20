/**
 * Pure helpers for saved views (P1 Task 8): validating a `cut`/`chart`/
 * `filters` triple, mapping a `saved_views` DB row to the app's `SavedView`
 * shape, and resolving "<name> copy" collisions. No React, no Supabase, no
 * "use server" — kept separate from `saved-views-server.ts` /
 * `(detail)/[matchId]/saved-views-actions.ts` so `tests/saved-views-logic.spec.ts`
 * can import it without pulling in server-only code (`cookies()`, the
 * Supabase client).
 */

import {
  EMPTY_VIZ_FILTERS,
  type Cut,
  type Chart,
  type VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { parseVizState } from "@/components/dashboard/matches/match-detail/shots/viz-url";
import type { ProgramRole, WorkspaceKind } from "@/lib/workspace/types";

export const SAVED_VIEW_NAME_MAX = 60;

/** Columns read from `public.saved_views` — every loader/action selects this set. */
export const SAVED_VIEW_COLUMNS =
  "id, name, cut, chart, filters, sort_order, shared, created_by, created_at";

/** The app's saved-view shape (task-8-brief.md's `saved-views-server.ts` interface). */
export interface SavedView {
  id: string;
  name: string;
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
  order: number;
}

/**
 * The loader's row: `SavedView` plus what the ⋯ menu (and Undo) need to
 * decide. `deleteSavedView` returns this rather than a bare `SavedView` so
 * the caller knows `mine` — `restoreSavedView` takes it back for the same
 * reason: Undo must refuse to restore a view the caller didn't create. See
 * that function's doc comment.
 */
export type SavedViewRow = SavedView & { shared: boolean; mine: boolean };

/** Columns read from `public.saved_views`, as `SAVED_VIEW_COLUMNS` selects them. */
export interface SavedViewDbRow {
  id: string;
  name: string;
  cut: string;
  chart: string;
  filters: unknown;
  sort_order: number;
  shared: boolean;
  created_by: string;
  created_at: string;
}

/**
 * The only keys a `filters` object may contribute to the params
 * `validateVizInput`/`rowToSavedView` build — `VizFilters`'s own keys, taken
 * from `EMPTY_VIZ_FILTERS` rather than hand-listed so the two can never drift.
 * Deliberately excludes `cut`/`chart`/`view`: those are the URL layer's OTHER
 * top-level keys, and a `filters` jsonb blob is caller-controlled input, so a
 * stray `filters.chart` must never be able to override the explicit `chart`
 * `validateVizInput` was called with.
 */
const KNOWN_FILTER_KEYS = new Set<string>(Object.keys(EMPTY_VIZ_FILTERS));

/**
 * `filters` jsonb → `URLSearchParams`, keeping only keys in
 * `KNOWN_FILTER_KEYS` and skipping null/undefined values, coercing everything
 * else with `String()` — `parseVizState` only ever compares them as strings,
 * so a stored jsonb `2` and `"2"` read identically. Returns an empty
 * `URLSearchParams` for anything that isn't a plain object (a stale row
 * whose `filters` column was hand-edited to an array or a scalar), which
 * `parseVizState` then reads as every filter at its default.
 */
export function filtersToParams(filters: unknown): URLSearchParams {
  const params = new URLSearchParams();
  if (filters && typeof filters === "object" && !Array.isArray(filters)) {
    for (const [key, value] of Object.entries(
      filters as Record<string, unknown>,
    )) {
      if (!KNOWN_FILTER_KEYS.has(key)) continue;
      if (value === null || value === undefined) continue;
      params.set(key, String(value));
    }
  }
  return params;
}

/**
 * Validate a `cut`/`chart`/`filters` triple through `parseVizState` — the
 * same narrowing the URL layer uses for `?cut=`/`?chart=`/filter params — so
 * a stale DB row or a hand-crafted action payload can never carry an unknown
 * cut, an impossible chart/cut pairing, or a filter value outside its enum.
 * Returns null on anything that doesn't round-trip.
 */
export function validateVizInput(input: {
  cut: string;
  chart: string;
  filters: unknown;
}): { cut: Cut; chart: Chart; filters: VizFilters } | null {
  if (input.chart !== "scatter" && input.chart !== "zones") return null;

  const params = filtersToParams(input.filters);
  params.set("cut", input.cut);
  if (input.chart === "zones") params.set("chart", "zones");

  const parsed = parseVizState(params);

  if (parsed.cut === null || parsed.cut !== input.cut) return null;
  // "zones" only exists off "serve" — `parseVizState` silently downgrades
  // that combination to "scatter" rather than rejecting it (a URL must
  // always resolve to something drawable). A stored or submitted row asking
  // for the impossible pairing is invalid, not a scatter chart in disguise.
  if (input.chart === "zones" && parsed.chart !== "zones") return null;

  return { cut: parsed.cut, chart: parsed.chart, filters: parsed.filters };
}

/**
 * DB row → `SavedView`, or null when the row's `cut`/`chart`/`filters` no
 * longer parse (hand-edited in the database, or a future migration narrowed
 * an enum). Dropped rather than coerced to a default cut: silently
 * reassigning a stale row to "serve" would show the viewer a view they never
 * saved.
 */
export function rowToSavedView(row: SavedViewDbRow): SavedView | null {
  const validated = validateVizInput({
    cut: row.cut,
    chart: row.chart,
    filters: row.filters,
  });
  if (!validated) return null;

  return {
    id: row.id,
    name: row.name,
    cut: validated.cut,
    chart: validated.chart,
    filters: validated.filters,
    order: row.sort_order,
  };
}

/** DB row → `SavedViewRow` (adds `shared`/`mine`), or null — see `rowToSavedView`. */
export function rowToSavedViewRow(
  row: SavedViewDbRow,
  viewerId: string,
): SavedViewRow | null {
  const view = rowToSavedView(row);
  if (!view) return null;
  return { ...view, shared: row.shared, mine: row.created_by === viewerId };
}

/** Trim, then reject empty or over the 60-char limit (`saved_views_name_check`). */
export function normalizeSavedViewName(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > SAVED_VIEW_NAME_MAX) return null;
  return trimmed;
}

/**
 * "<name> copy", then "<name> copy 2", "<name> copy 3", … — the first
 * candidate whose case-insensitive, trimmed form is not already in
 * `existingNormalizedNames`. Comparing normalized matches
 * `saved_views_private_name_key`'s `lower(btrim(name))` uniqueness, so a
 * name this resolves to can never still collide at insert.
 *
 * The base is truncated, not the suffix, so a name already at the 60-char
 * limit still gets a real "copy" suffix instead of losing it to truncation.
 */
export function resolveCopyName(
  baseName: string,
  existingNormalizedNames: ReadonlySet<string>,
): string {
  const trimmedBase = baseName.trim();
  let n = 1;
  for (;;) {
    const suffix = n === 1 ? " copy" : ` copy ${n}`;
    const maxBaseLen = Math.max(0, SAVED_VIEW_NAME_MAX - suffix.length);
    const truncatedBase =
      trimmedBase.length > maxBaseLen
        ? trimmedBase.slice(0, maxBaseLen)
        : trimmedBase;
    const candidate = `${truncatedBase}${suffix}`;
    if (!existingNormalizedNames.has(candidate.toLowerCase())) {
      return candidate;
    }
    n++;
  }
}

/**
 * Views are private by default, and a personal workspace has no one else to
 * share with — so `shared` is forced false there regardless of what was
 * asked, and only a team workspace's own request is honored. One spelling so
 * `createSavedView` and `restoreSavedView` can't drift on the rule.
 */
export function resolveSharedFlag(
  kind: WorkspaceKind,
  requested: boolean | undefined,
): boolean {
  return kind === "personal" ? false : Boolean(requested);
}

/**
 * Whether `workspaceRole` may manage (Part B: rename/delete/share/reorder)
 * this view — the client-side mirror of `saved_views` RLS's UPDATE/DELETE
 * shape ("mine, or shared + staff"): the creator always may; staff (anyone
 * but `"player"`) may also manage a view that is `shared`. Read-only for
 * everyone else. `saved-views-band.tsx` uses this to decide whether "Manage
 * views" draws at all — the button is withheld outright when nobody viewing
 * the band could act on anything in it.
 */
export function canManageSavedView(
  view: { mine: boolean; shared: boolean },
  workspaceRole: ProgramRole,
): boolean {
  return view.mine || (view.shared && workspaceRole !== "player");
}

/**
 * Whether `name` collides with an existing view, compared case-insensitively
 * on the trimmed form — the same comparison the database's
 * `saved_views_private_name_key` / shared unique index make, so this can
 * never diverge from what `createSavedView`'s `duplicate_name` will actually
 * reject. `existingNames` must already be scoped to the right pool by the
 * caller (the workspace's shared names, or the viewer's own private ones —
 * see `save-view-dialog.tsx`); this function does no scoping of its own.
 */
export function hasDuplicateViewName(
  name: string,
  existingNames: readonly string[],
): boolean {
  const normalized = name.trim().toLowerCase();
  if (normalized.length === 0) return false;
  return existingNames.some((n) => n.trim().toLowerCase() === normalized);
}

/** `sort_order`'s safe range for a re-inserted row — see `restoreSavedView`. */
export const SORT_ORDER_MIN = 0;
export const SORT_ORDER_MAX = 100_000;

/**
 * An arbitrary number (a deleted row's `order`, replayed back through Undo)
 * → a safe integer `sort_order` for insert. Clamped rather than rejected: a
 * value outside the range is not a reason to refuse the whole restore, only
 * to place it at whichever end of the list it overshot.
 */
export function clampSortOrder(order: number): number {
  const int = Number.isFinite(order) ? Math.trunc(order) : SORT_ORDER_MIN;
  return Math.min(SORT_ORDER_MAX, Math.max(SORT_ORDER_MIN, int));
}

/** `reorderSavedViews` refuses a list longer than this outright — see `normalizeOrderedIds`. */
export const REORDER_MAX_IDS = 200;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate and de-duplicate `reorderSavedViews`' id list before it ever
 * reaches a query: every entry must be UUID-shaped (rejects `<script>…`,
 * empty strings, anything that isn't a `saved_views.id`), and the list must
 * be at most `REORDER_MAX_IDS` long — checked BEFORE de-duplication, so a
 * caller can't force this to do unbounded work by sending a huge list of
 * repeats. Returns null on either failure; on success, returns the ids with
 * duplicates removed, keeping each id's first position (a later repeat would
 * just overwrite its own `sort_order` a second time for no reason).
 */
export function normalizeOrderedIds(ids: string[]): string[] | null {
  if (!Array.isArray(ids)) return null;
  if (ids.length > REORDER_MAX_IDS) return null;

  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (typeof id !== "string" || !UUID_RE.test(id)) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/* ── Manage mode (Task 9 Part B) ───────────────────────────────────────── */

/**
 * Move the item at `from` to index `to`, clamped into range — the drag/drop
 * and ⌥←/⌥→ reorder primitive `manage-tile-menu.tsx`'s drag handling and
 * `saved-views-band.tsx`'s keyboard handler both call. Pure array move, no
 * knowledge of saved views: `to` beyond either end just lands at that end
 * rather than throwing, since a keyboard nudge past the first/last slot is a
 * no-op, not an error. `from` out of range returns a shallow copy unchanged.
 */
export function moveItem<T>(
  items: readonly T[],
  from: number,
  to: number,
): T[] {
  const copy = items.slice();
  if (from < 0 || from >= copy.length) return copy;
  const clampedTo = Math.min(Math.max(to, 0), copy.length - 1);
  const [item] = copy.splice(from, 1);
  copy.splice(clampedTo, 0, item);
  return copy;
}

/**
 * Splice a freshly-reordered run of manageable ids back into the full band
 * order, leaving every non-manageable id in its original slot. Manage mode
 * only lets a viewer drag tiles they `canManageSavedView` — the others (a
 * teammate's private view a player can see but not touch) must not jump
 * around the grid just because the manageable ones did.
 *
 * `allIds` is the band's current full order (manageable ids interleaved with
 * everyone else's); `manageableIds` is which of those ids are draggable, in
 * their OLD relative order; `newManageableOrder` is that same set in its NEW
 * order (e.g. from `moveItem` on the manageable-only subsequence). Each
 * manageable slot in `allIds`, read left to right, takes the next id off
 * `newManageableOrder` — so a non-manageable tile between two manageable ones
 * still separates them the same way after the merge.
 *
 * Defensive on mismatch: if `newManageableOrder` isn't the same set of ids as
 * `manageableIds` (wrong length, or any id doesn't belong), returns `allIds`
 * unchanged rather than dropping or duplicating a row — this is a client-side
 * derivation feeding `reorderSavedViews`, and a bad merge would relocate a
 * teammate's view to the wrong slot server-side with nothing on screen
 * signalling it.
 */
export function mergeManageableOrder(
  allIds: readonly string[],
  manageableIds: readonly string[],
  newManageableOrder: readonly string[],
): string[] {
  const manageableSet = new Set(manageableIds);
  const validReplacement =
    newManageableOrder.length === manageableIds.length &&
    new Set(newManageableOrder).size === manageableSet.size &&
    newManageableOrder.every((id) => manageableSet.has(id));

  if (!validReplacement) return allIds.slice();

  let cursor = 0;
  return allIds.map((id) =>
    manageableSet.has(id) ? newManageableOrder[cursor++] : id,
  );
}

/** One row of the ⋯ tile menu, in the order `manage-tile-menu.tsx` draws them. */
export type ManageMenuRowKind =
  "rename" | "duplicate" | "share" | "unshare" | "delete";

/**
 * Which rows the ⋯ menu draws for `view`, given the workspace it's in and
 * the viewer's role — the pure decision `manage-tile-menu.tsx` renders from.
 * Assumes the caller already gated the menu's very existence on
 * `canManageSavedView`; this only decides what's INSIDE it.
 *
 * Rename and Duplicate always show. Share/unshare is scoped to
 * `view.mine` — not `canManageSavedView` — by a user ruling stricter than
 * what the database allows: staff may rename or delete a shared view they
 * don't own, but never un-share one, since the UPDATE policy's `WITH CHECK`
 * for a staff caller never re-examines the new `shared` value (see
 * `setSavedViewShared`'s doc comment) and the product rule goes further
 * still by withholding the "Share with team" row from staff on someone
 * else's PRIVATE view too — a staff member should not be offered to
 * publish a teammate's still-private view to the whole roster. A personal
 * workspace never shows either row: there is no one else to share with.
 * Delete is always last, after a divider `manage-tile-menu.tsx` draws
 * itself (this function returns rows only, not the divider).
 */
export function manageMenuRows(
  view: { mine: boolean; shared: boolean },
  { workspaceKind }: { workspaceKind: WorkspaceKind; role: ProgramRole },
): ManageMenuRowKind[] {
  const rows: ManageMenuRowKind[] = ["rename", "duplicate"];
  if (workspaceKind === "team" && view.mine) {
    rows.push(view.shared ? "unshare" : "share");
  }
  rows.push("delete");
  return rows;
}
