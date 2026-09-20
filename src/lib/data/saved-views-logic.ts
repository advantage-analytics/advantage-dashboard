/**
 * Pure helpers for saved views (P1 Task 8): validating a `cut`/`chart`/
 * `filters` triple, mapping a `saved_views` DB row to the app's `SavedView`
 * shape, and resolving "<name> copy" collisions. No React, no Supabase, no
 * "use server" — kept separate from `saved-views-server.ts` /
 * `(detail)/[matchId]/saved-views-actions.ts` so `tests/saved-views-logic.spec.ts`
 * can import it without pulling in server-only code (`cookies()`, the
 * Supabase client).
 */

import type {
  Cut,
  Chart,
  VizFilters,
} from "@/components/dashboard/matches/match-detail/shots/viz-model";
import { parseVizState } from "@/components/dashboard/matches/match-detail/shots/viz-url";

export const SAVED_VIEW_NAME_MAX = 60;

/**
 * The app's saved-view shape (task-8-brief.md's `saved-views-server.ts`
 * interface). `shared` is optional and NOT part of that brief's literal
 * signature — it rides here only so `deleteSavedView` can hand it back to
 * `restoreSavedView` for Undo, which needs to know whether the row it is
 * re-inserting was shared. Every other reader of `SavedView` — the loader's
 * `SavedViewRow`, `SavedViewLite` in `viz-labels.tsx` — is unaffected by an
 * optional extra field.
 */
export interface SavedView {
  id: string;
  name: string;
  cut: Cut;
  chart: Chart;
  filters: VizFilters;
  order: number;
  shared?: boolean;
}

/** The loader's row: `SavedView` plus what the ⋯ menu needs to decide. */
export type SavedViewRow = SavedView & { shared: boolean; mine: boolean };

/** Columns read from `public.saved_views` — every action selects this set. */
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
 * `filters` jsonb → `URLSearchParams`, skipping null/undefined values and
 * coercing everything else with `String()` — `parseVizState` only ever
 * compares them as strings, so a stored jsonb `2` and `"2"` read identically.
 * Returns an empty `URLSearchParams` for anything that isn't a plain object
 * (a stale row whose `filters` column was hand-edited to an array or a
 * scalar), which `parseVizState` then reads as every filter at its default.
 */
export function filtersToParams(filters: unknown): URLSearchParams {
  const params = new URLSearchParams();
  if (filters && typeof filters === "object" && !Array.isArray(filters)) {
    for (const [key, value] of Object.entries(
      filters as Record<string, unknown>,
    )) {
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
