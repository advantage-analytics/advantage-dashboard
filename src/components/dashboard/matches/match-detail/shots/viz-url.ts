/**
 * URL state layer for the Visualizations tab redesign.
 * Maps between VizState (the view's state model) and URLSearchParams.
 * Pure TypeScript; no React, no "use client".
 *
 * The layout: cut/chart/view/filters live in viz keys; other keys (like tab)
 * pass through untouched. Parsing is forgiving — unknown/garbage values read
 * as defaults; serialize omits defaults to keep URLs readable.
 */

import type { Cut, Chart, VizFilters } from "./viz-model";
import { EMPTY_VIZ_FILTERS, filterKeysFor } from "./viz-model";

/* ── sameView (F4) ─────────────────────────────────────────────────────── */

/**
 * Is `candidate` (a default tile, or a saved view) the same view as
 * `current` (whatever's on screen)? Backs the Views row's "current tile"
 * ring: `cut`/`chart`/every filter key valid for that cut must agree, OR
 * `current.viewId` names `candidate.id` outright (a saved view whose filters
 * were themselves just edited elsewhere still reads as "current" by id).
 * The wall (`current.cut === null`) matches nothing, unconditionally — a
 * stray `viewId` carried onto the wall state is not a reason to ring a tile
 * that isn't shown in any court.
 */
export function sameView(
  current: VizState,
  candidate: { cut: Cut; chart: Chart; filters: VizFilters; id?: string },
): boolean {
  if (current.cut === null) return false;

  if (
    current.viewId !== null &&
    candidate.id !== undefined &&
    current.viewId === candidate.id
  ) {
    return true;
  }

  if (current.cut !== candidate.cut) return false;
  if (current.chart !== candidate.chart) return false;

  for (const key of filterKeysFor(candidate.cut)) {
    if (current.filters[key] !== candidate.filters[key]) return false;
  }

  return true;
}

/**
 * Stable identity of the COURT currently on screen — F5's shared-element
 * transition (`viz-state-context.tsx`'s `runCourtMorph`) names its morph
 * target with this, and `viz-focused.tsx`'s scroll-to-top effect keys off
 * it instead of `cut` alone, so a Filters-popover edit (same court,
 * different filters) triggers neither the morph nor a scroll, only an
 * actual court change does.
 *
 * Equal across a pure filter edit — `ball`/`zone`/`result`/`set`/… never
 * enter the key, because none of them change WHICH court is drawn, only
 * what's plotted on it. Different whenever `cut` changes (a different
 * court shape), `filters.player` changes (a different subject's court —
 * "you" vs the opponent), or `viewId` changes (a different saved view,
 * even one that happens to share cut/player with the view left behind).
 * `null` on the wall (`cut === null`): there is no single court to name.
 */
export function viewIdentityKey(state: VizState): string | null {
  if (state.cut === null) return null;
  return `${state.filters.player}:${state.cut}:${state.viewId ?? ""}`;
}

/**
 * F5 fix round 1: where keyboard focus (and, alongside it, the
 * scroll-to-top) should land after a state change — driven ONLY by the
 * before/after `viewIdentityKey`, never by whether a shared-element view
 * transition ran, resolved, or was skipped. A hidden document, a browser
 * without the View Transitions API, and reduced motion all skip or abort
 * the animation, but the view still changes underneath it, and focus must
 * still follow — this function is the pure decision the caller (a plain
 * `useEffect` keyed on `viewIdentityKey(state)` in `viz-state-context.tsx`,
 * NOT `transition.ready`/`finished`) runs on every render, so the four
 * paths (transition ran, `ready` rejected, API unsupported, reduced
 * motion) all resolve through the identical branch.
 *
 * - `prevKey === null`, `nextKey !== null` (the wall to a court, whether a
 *   default tile, a saved view, or a Views-grid tile) → `"focused-view"`.
 * - `prevKey !== null`, `nextKey !== prevKey`, `nextKey !== null` (a
 *   Views-grid tile switching to a DIFFERENT court while staying in the
 *   focused view) → also `"focused-view"` — same destination, the big
 *   court, regardless of whether the view being left was itself a court
 *   or the wall.
 * - `nextKey === null` (Back to wall) → `"opened-tile"`: the caller
 *   refocuses the WALL tile matching `prevKey`, the view being left.
 * - `prevKey === nextKey` (a filter-only edit, or — critically — the very
 *   first render, when the caller seeds its "previous key" ref with the
 *   INITIAL state so this compares equal to itself) → `null`, steals
 *   nothing. This function has no concept of "first mount" on its own;
 *   that guarantee comes entirely from how the caller seeds its ref.
 */
export function focusTargetAfterViewChange(
  prevKey: string | null,
  nextKey: string | null,
): "focused-view" | "opened-tile" | null {
  if (prevKey === nextKey) return null;
  return nextKey !== null ? "focused-view" : "opened-tile";
}

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface VizState {
  cut: Cut | null; // null = the wall
  chart: Chart;
  filters: VizFilters;
  viewId: string | null;
}

/* ── Parse & serialize helper ──────────────────────────────────────────── */

/**
 * Every non-default filter option and its label, keyed by `VizFilters` key.
 * The single source of option labels: `activeFilterEntries` reads it for the
 * applied-strip tokens, and `filters-popover.tsx` reads it to draw pills, so
 * a label can never drift between the two surfaces.
 */
export const OPTIONS = {
  player: { opponent: "Opponent" },
  game: { serving: "Serving", returning: "Returning" },
  ball: { first: "1st", second: "2nd" },
  court: { deuce: "Deuce", ad: "Ad" },
  zone: { t: "T", body: "Body", wide: "Wide" },
  pressure: { break: "Break points", setMatch: "Set & match points" },
  result: { won: "Won", lost: "Lost", ace: "Aces" },
  rally: { short: "1–4 shots", medium: "5–8 shots", long: "9+ shots" },
} as const;

const ORDER = [
  "player",
  "ball",
  "court",
  "zone",
  "result",
  "pressure",
  "rally",
  "game",
] as const;

// `set` (bare) is NOT a viz key: the match report already owns it
// (`set-scope.tsx`'s `SET_PARAM`), dormant today but a silent clobber the day
// it's re-enabled. The viz filter's set value is namespaced to `vset` in the
// URL — `VizFilters.set` stays the in-memory field name throughout this file;
// only the URL-facing key differs.
const VIZ_KEYS = ["cut", "chart", "view", "vset", ...ORDER];

type OptionKey = keyof typeof OPTIONS;

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * The composition rule `use-viz-state.ts` builds its `setState` on: given the
 * latest INTENDED state (not necessarily what's rendered or in the URL yet),
 * apply either a plain replacement or an updater function and return the
 * result. Pulled out here, pure, so a spec can exercise the composition
 * itself without React or `next/navigation` — a plain object always replaces
 * wholesale; an updater always sees `prev`, never a stale render-time value.
 */
export function applyVizUpdate(
  prev: VizState,
  update: VizState | ((prev: VizState) => VizState),
): VizState {
  return typeof update === "function" ? update(prev) : update;
}

/**
 * The reconciliation rule `viz-state-context.tsx`'s `VizStateProvider` runs
 * every time the URL's query string changes: does this query string match
 * one the store itself issued (via `setState` → `router.replace`), or did it
 * arrive from outside (back/forward, a `<Link>` navigation, anything not
 * requested through this store)?
 *
 * - **Own query lands**: `intended` already holds the up-to-date state (it
 *   was written synchronously when `setState` was called), so it's kept
 *   as-is. The matched query AND every older query issued before it are
 *   retired from `ownQueries` — an earlier own request that never itself
 *   lands (Next aborts a superseded `router.replace`) must not linger
 *   forever and later be mistaken for "own" if the browser ever revisits
 *   that exact query string.
 * - **External query**: nothing in `ownQueries` matches, so this URL was not
 *   this store's doing. It wins outright — `intended` is replaced with the
 *   freshly parsed URL state, and `ownQueries` resets to just this query (the
 *   new baseline for future reconciliation).
 *
 * Pure and React-free so it can be tested directly, without mounting the
 * provider or touching `next/navigation`.
 */
export function reconcileVizState({
  urlQuery,
  ownQueries,
  intended,
}: {
  urlQuery: string;
  ownQueries: string[];
  intended: VizState;
}): { state: VizState; ownQueries: string[] } {
  const idx = ownQueries.indexOf(urlQuery);
  if (idx !== -1) {
    return { state: intended, ownQueries: ownQueries.slice(idx + 1) };
  }
  return {
    state: parseVizState(new URLSearchParams(urlQuery)),
    ownQueries: [urlQuery],
  };
}

/**
 * URLSearchParams → VizState. Garbage values read as defaults.
 * `chart=zones` with a non-serve cut parses as `scatter`.
 */
export function parseVizState(params: URLSearchParams): VizState {
  const cutParam = params.get("cut");
  let cut: Cut | null = null;
  if (
    cutParam === "serve" ||
    cutParam === "returnPlacement" ||
    cutParam === "returnContact"
  ) {
    cut = cutParam;
  }

  let chart: Chart = "scatter";
  if (params.get("chart") === "zones") {
    if (cut === "serve") {
      chart = "zones";
    }
    // else: stays "scatter" (zones off serve reads as scatter)
  }

  const viewId = params.get("view");

  const rawFilters = parseFilters(params, cut);
  // Reset serve-only values (zone, result:"ace") once `cut` is resolved, so
  // e.g. `?cut=returnPlacement&result=ace` or `&zone=t` can never parse,
  // serialize or be saved — `carryFilters` is otherwise only ever applied
  // when switching cuts client-side, but garbage/hand-crafted params must be
  // held to the same rule.
  const filters = cut === null ? rawFilters : carryFilters(rawFilters, cut);

  return { cut, chart, filters, viewId };
}

/**
 * Clone params, delete all viz keys, then serialize state.
 * Omits defaults to keep URLs readable. Never mutates input params.
 * Keeps unrelated keys like tab.
 */
export function vizStateQuery(
  params: URLSearchParams,
  state: VizState,
): string {
  const next = new URLSearchParams(params.toString());

  // Delete all viz keys
  for (const key of VIZ_KEYS) {
    next.delete(key);
  }

  // If cut is null, we're done (the wall)
  if (state.cut === null) {
    return next.toString();
  }

  // Serialize cut and chart
  next.set("cut", state.cut);
  if (state.chart !== "scatter") {
    next.set("chart", state.chart);
  }

  // Serialize viewId if present
  if (state.viewId !== null) {
    next.set("view", state.viewId);
  }

  // Serialize filters: only non-default keys that are in filterKeysFor(cut)
  const allowedKeys = new Set(filterKeysFor(state.cut));

  if (state.filters.set !== "any") {
    if (allowedKeys.has("set")) {
      next.set("vset", String(state.filters.set));
    }
  }

  for (const key of ORDER) {
    if (!allowedKeys.has(key)) continue;

    const value = state.filters[key as keyof typeof state.filters];
    const defaultValue = getDefaultFor(key as OptionKey);

    if (value !== defaultValue) {
      next.set(key, String(value));
    }
  }

  return next.toString();
}

/**
 * Every filter key back to `EMPTY_VIZ_FILTERS` — `player` included — and
 * `viewId` cleared, keeping `cut`/`chart` as-is. The one "Clear"/"Clear all"
 * behavior both `applied-strip.tsx` and `filters-popover.tsx` need, pulled
 * out here so the two don't carry verbatim copies of the same object spread.
 */
export function clearedFilters(state: VizState): VizState {
  return { ...state, filters: EMPTY_VIZ_FILTERS, viewId: null };
}

/**
 * Reset serve-only filter values when switching off serve.
 * zone and result:"ace" reset to "any" on non-serve cuts.
 */
export function carryFilters(filters: VizFilters, nextCut: Cut): VizFilters {
  if (nextCut === "serve") {
    return filters;
  }

  // Off serve: reset serve-only values
  const next = { ...filters };
  if (filters.zone !== "any") {
    next.zone = "any";
  }
  if (filters.result === "ace") {
    next.result = "any";
  }
  return next;
}

/**
 * Active filter entries for the UI, ordered per ORDER then set,
 * skipping defaults and keys not in the cut. Returns label strings
 * from OPTIONS.
 */
export function activeFilterEntries(
  state: VizState,
): { key: keyof VizFilters; label: string }[] {
  if (state.cut === null) {
    return [];
  }

  const allowedKeys = new Set(filterKeysFor(state.cut));
  const result: { key: keyof VizFilters; label: string }[] = [];

  // ORDER then set
  for (const key of ORDER) {
    if (!allowedKeys.has(key)) continue;

    const value = state.filters[key as keyof typeof state.filters];
    const defaultValue = getDefaultFor(key as OptionKey);

    if (value !== defaultValue) {
      const label = getLabel(key as OptionKey, String(value));
      result.push({ key: key as keyof VizFilters, label });
    }
  }

  // set
  if (allowedKeys.has("set") && state.filters.set !== "any") {
    result.push({ key: "set", label: `Set ${state.filters.set}` });
  }

  return result;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function parseFilters(params: URLSearchParams, cut: Cut | null): VizFilters {
  // Start with defaults from EMPTY_VIZ_FILTERS
  const filters: VizFilters = { ...EMPTY_VIZ_FILTERS };

  // Parse player
  const playerParam = params.get("player");
  if (playerParam === "opponent") {
    filters.player = "opponent";
  }

  // Parse other ORDER keys
  for (const key of ORDER) {
    if (key === "player") continue; // already handled

    const optionKey = key as OptionKey;
    const param = params.get(key);
    if (param !== null && Object.hasOwn(OPTIONS[optionKey], param)) {
      filters[key as keyof typeof filters] = param as never;
    }
  }

  // Parse set (special: numeric) — namespaced to `vset` (see `VIZ_KEYS`).
  const setParam = params.get("vset");
  if (setParam !== null) {
    const setNum = Number.parseInt(setParam, 10);
    if (setNum > 0) {
      filters.set = setNum;
    }
  }

  return filters;
}

function getDefaultFor(key: OptionKey): string {
  if (key === "player") return "you";
  return "any";
}

function getLabel(key: OptionKey, value: string): string {
  const options = OPTIONS[key] as Record<string, string>;
  return options[value] || value;
}
