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
import type { WorkspaceKind } from "@/lib/workspace/types";

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
