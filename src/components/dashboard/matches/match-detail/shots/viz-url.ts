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
import { EMPTY_VIZ_FILTERS, chartAllowedOn, filterKeysFor } from "./viz-model";

/* ── sameView ───────────────────────────────────────────────────────────── */

/**
 * Is `candidate` (a default tile, or a saved view) the same view as
 * `current` (whatever's on screen)? Backs the Views grid's "current tile"
 * ring (a wrapping grid reached by scrolling the page, not a scrolling
 * row): `cut`/`chart`/every filter key valid for that cut must agree, OR
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
  // A "Create view" draft matches no tile — nothing on the wall or in
  // the Views grid rings while the court is the blank prompt, even one that
  // happens to share cut/chart/filters (draft always starts at
  // serve/scatter/empty, same as the default Serve tile).
  if (current.draft === true) return false;

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
    if (key === "player") {
      if (current.filters.player !== candidate.filters.player) return false;
      continue;
    }
    if (!sameValues(current.filters[key], candidate.filters[key])) {
      return false;
    }
  }

  return true;
}

/**
 * Set equality for two filter-group lists — order-independent, so a
 * candidate whose list wasn't built in canonical order (a hand-built test
 * fixture, or a caller that assembled it directly) still compares correctly
 * against the always-canonical `current.filters`.
 */
function sameValues(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  const bSet = new Set(b);
  return a.every((v) => bSet.has(v));
}

/**
 * Stable identity of the COURT currently on screen — the shared-element
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
 *
 * A `:draft` suffix when `state.draft === true` — the blank "Create
 * view" prompt needs its OWN identity, distinct from the real view it's
 * parked on top of (draft always starts at `serve`/`scatter`/no `viewId`,
 * the same key the default Serve tile would otherwise produce), so the
 * wall→focused-view arrival still counts as a court change (focus/scroll
 * land on the focused view) and leaving draft for that same cut — e.g.
 * picking Serve placement again — is likewise seen as a change, not a no-op.
 */
export function viewIdentityKey(state: VizState): string | null {
  if (state.cut === null) return null;
  const draftSuffix = state.draft === true ? ":draft" : "";
  return `${state.filters.player}:${state.cut}:${state.viewId ?? ""}${draftSuffix}`;
}

/**
 * Where keyboard focus (and, alongside it, the
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
  /**
   * "Create view" — the blank-court prompt state entered from
   * `saved-views-band.tsx`'s `NewViewTile` (`?cut=serve&draft=1`, no
   * filters). Only meaningful alongside a `cut` (dropped on the wall — see
   * `vizStateQuery`, which never serializes it when `cut === null`).
   * Optional rather than a required `false` everywhere: every call site
   * that builds a REAL (non-draft) `VizState` literal simply omits it, and
   * `undefined` reads exactly like `false` everywhere this is checked
   * (`=== true`, never a bare truthy test). The two places that populate it
   * authoritatively are `parseVizState` (reading `?draft=1` off a fresh
   * navigation) and `applyVizUpdate` (clearing it — see that function's own
   * doc comment for why draft never survives a `setState` call).
   */
  draft?: boolean;
  /**
   * The fullscreen court viewer (`viz-fullscreen.tsx`), opened
   * from a `data-viz-fullscreen-door` control on the focused view. Only
   * meaningful alongside a `cut` — dropped on the wall exactly like `draft`
   * (see `vizStateQuery`'s `cut === null` early return and `parseVizState`
   * below). Optional rather than a required `false` everywhere, matching
   * `draft`'s own convention: every call site that builds a real `VizState`
   * literal without opening the viewer simply omits it, and `undefined`
   * reads exactly like `false` everywhere this is checked (`=== true`,
   * never a bare truthy test) — including the `toEqual` fixtures in
   * `tests/viz-url.spec.ts`, which rely on a missing key and `{fullscreen:
   * undefined}` comparing equal (`{fullscreen: false}` would not).
   *
   * Unlike `draft`, `applyVizUpdate` does not clear it on an ordinary
   * filter/cut/chart change — the viewer reads the same `cut`/`chart`/
   * `filters` the focused court does, so those changes are meant to apply
   * live underneath it. But it is NOT unconditional: `applyVizUpdate` is
   * also the one place `fullscreen` is dropped from the OUTPUT (mirroring
   * `draft`'s own clearing) when the resolved state has `cut: null` (Back
   * to wall — the viewer has no court to show) or `draft: true` (draft
   * wins, same precedence `parseVizState` applies) — see that function's
   * own doc comment. This is enforced in-memory, at `applyVizUpdate`
   * itself, not only at the URL layer (`vizStateQuery`'s `cut === null`
   * early return also never serializes it, but the provider renders from
   * the in-memory `VizState`, not the URL, so relying on serialization
   * alone would let "viewer open over the wall" exist as live state for a
   * render or two). It is NOT part of `viewIdentityKey`/`sameView`:
   * opening or closing the viewer is not a different court or a different
   * view, only a different way of looking at the same one.
   */
  fullscreen?: boolean;
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
const VIZ_KEYS = [
  "cut",
  "chart",
  "view",
  "vset",
  "draft",
  "fullscreen",
  ...ORDER,
];

type OptionKey = keyof typeof OPTIONS;
type MultiOptionKey = Exclude<OptionKey, "player">;

/**
 * Canonical form for a multi-select filter group's values: deduped, ordered
 * the way `OPTIONS[key]` itself lists them — so two callers picking the same
 * set of values in a different click order still produce the identical
 * array, and therefore the identical query string (`reconcileVizState`
 * compares query strings, not parsed state, to decide "own" vs. "external").
 * `filters-popover.tsx`'s toggle and `parseFilters` below both route
 * through this rather than each sorting by hand.
 */
export function canonicalOptionValues<K extends MultiOptionKey>(
  key: K,
  values: readonly string[],
): (keyof (typeof OPTIONS)[K])[] {
  const known = Object.keys(OPTIONS[key]);
  const wanted = new Set(values);
  return known.filter((v) => wanted.has(v)) as (keyof (typeof OPTIONS)[K])[];
}

/** Same canonical rule as `canonicalOptionValues`, for `set` — numeric,
 * ascending, deduped rather than ordered by an `OPTIONS` map. */
export function canonicalSetValues(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/* ── Public API ─────────────────────────────────────────────────────────── */

/**
 * The composition rule `use-viz-state.ts` builds its `setState` on: given the
 * latest INTENDED state (not necessarily what's rendered or in the URL yet),
 * apply either a plain replacement or an updater function and return the
 * result. Pulled out here, pure, so a spec can exercise the composition
 * itself without React or `next/navigation` — a plain object always replaces
 * wholesale; an updater always sees `prev`, never a stale render-time value.
 *
 * This is also the ONE place a "Create view" draft gets cleared. Every
 * `setState` call in the tab funnels through here (`viz-state-context.tsx`'s
 * `setState`), so a single check covers every trigger the spec calls
 * out — a cut/chart pick, a filter toggle or token removal, and loading a
 * saved view or tile — without each call site having to remember to drop
 * `draft` itself. Most updaters `{ ...prev, ... }` their way to `resolved`,
 * which carries `prev.draft` forward untouched (including when the pick was
 * a no-op, like choosing Serve placement again while already parked there
 * in draft form — `resolved.draft` is still `true`, so it still clears);
 * a caller building a fresh, non-draft `VizState` literal (a wall tile, a
 * saved view, "Back to wall") never sets `draft` in the first place, so
 * there's nothing here to do for those. Only touches the object when
 * `draft` was actually set, so the common (never-drafted) path returns
 * `resolved` unchanged rather than a new object every call.
 *
 * Also the one place `fullscreen` is dropped from the OUTPUT
 * — omitted, not set to `false` (same convention as `draft` itself; see
 * `VizState.fullscreen`'s doc comment) — when the resolved state has
 * `cut: null` (Back to wall: no court for the viewer to show) or
 * `draft: true` (draft wins, same precedence `parseVizState` applies to a
 * URL that somehow carries both). This runs BEFORE the draft-clearing
 * step below, so it sees `resolved.draft` as the caller left it, not the
 * `false` this function itself writes afterward. Only builds a new object
 * when there's actually a `fullscreen: true` to drop, so the common
 * (viewer-closed) path is untouched.
 */
export function applyVizUpdate(
  prev: VizState,
  update: VizState | ((prev: VizState) => VizState),
): VizState {
  const resolved = typeof update === "function" ? update(prev) : update;

  const withFullscreenRule =
    resolved.fullscreen === true &&
    (resolved.cut === null || resolved.draft === true)
      ? omitFullscreen(resolved)
      : resolved;

  if (!withFullscreenRule.draft) return withFullscreenRule;
  return { ...withFullscreenRule, draft: false };
}

function omitFullscreen(state: VizState): VizState {
  const { fullscreen: _fullscreen, ...rest } = state;
  return rest;
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
    cutParam === "returnContact" ||
    cutParam === "rallyPosition" ||
    cutParam === "rallyPlacement"
  ) {
    cut = cutParam;
  }

  // Stays "scatter" — the default — when the requested chart is unknown, the
  // cut is null (the wall), or `chartAllowedOn` rejects the pairing (zones
  // off serve reads as scatter rather than being rejected outright: a URL
  // must always resolve to something drawable).
  let chart: Chart = "scatter";
  const chartParam = params.get("chart");
  if (
    cut !== null &&
    (chartParam === "zones" || chartParam === "heat") &&
    chartAllowedOn(cut, chartParam)
  ) {
    chart = chartParam;
  }

  const viewId = params.get("view");

  const rawFilters = parseFilters(params, cut);
  // Reset serve-only values (zone, result:"ace") once `cut` is resolved, so
  // e.g. `?cut=returnPlacement&result=ace` or `&zone=t` can never parse,
  // serialize or be saved — `carryFilters` is otherwise only ever applied
  // when switching cuts client-side, but garbage/hand-crafted params must be
  // held to the same rule.
  const filters = cut === null ? rawFilters : carryFilters(rawFilters, cut);

  // `draft` only means anything alongside a real cut — on the wall
  // (`cut === null`) it's dropped, same as every other viz key. Omitted
  // (not `draft: false`) when not draft, matching this function's own
  // "garbage/defaults parse away" convention — every existing `toEqual`
  // fixture in `tests/viz-url.spec.ts` that builds an expected `VizState`
  // without a `draft` key relies on that (`{}`'s missing key and `{draft:
  // undefined}` compare equal under `toEqual`; `{draft: false}` would not).
  const draft = cut !== null && params.get("draft") === "1";

  // `fullscreen=1` only means anything alongside a real cut, same
  // as `draft` — and draft wins when both are somehow present (the blank
  // "Create view" prompt has no court behind it for the viewer to show).
  const fullscreen = cut !== null && !draft && params.get("fullscreen") === "1";

  return {
    cut,
    chart,
    filters,
    viewId,
    ...(draft ? { draft: true } : {}),
    ...(fullscreen ? { fullscreen: true } : {}),
  };
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

  // `draft` only ever serializes alongside a real cut (guaranteed by the
  // early `cut === null` return above) — never on the wall.
  if (state.draft === true) {
    next.set("draft", "1");
  }

  // `fullscreen` only ever serializes alongside a real cut, for the
  // same reason — the early `cut === null` return above means setting
  // `cut: null` (Back to wall) drops it, whether or not a caller happened
  // to carry `fullscreen: true` into that literal.
  if (state.fullscreen === true) {
    next.set("fullscreen", "1");
  }

  // Serialize viewId if present
  if (state.viewId !== null) {
    next.set("view", state.viewId);
  }

  // Serialize filters: only non-default keys that are in filterKeysFor(cut)
  const allowedKeys = new Set(filterKeysFor(state.cut));

  if (allowedKeys.has("set")) {
    for (const setNumber of state.filters.set) {
      next.append("vset", String(setNumber));
    }
  }

  for (const key of ORDER) {
    if (!allowedKeys.has(key)) continue;

    if (key === "player") {
      if (state.filters.player !== "you") {
        next.set("player", state.filters.player);
      }
      continue;
    }

    const values = state.filters[key] as readonly string[];
    for (const value of values) {
      next.append(key, value);
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
 * Reset serve-only filter values when switching off serve: `zone` clears
 * entirely (it has no meaning off serve), and `"ace"` alone is dropped out
 * of `result` — any OTHER selected result value (`won`/`lost`) is kept,
 * since those still mean something off serve.
 */
export function carryFilters(filters: VizFilters, nextCut: Cut): VizFilters {
  if (nextCut === "serve") {
    return filters;
  }

  // Off serve: reset serve-only values
  const next = { ...filters };
  if (filters.zone.length) {
    next.zone = [];
  }
  if (filters.result.includes("ace")) {
    next.result = filters.result.filter((v) => v !== "ace");
  }
  return next;
}

/**
 * Active filter entries for the UI, ordered per ORDER then set, one entry
 * per SELECTED VALUE (not per key) — a group with two values selected draws
 * two removable tokens. Skips empty groups and keys not in the cut. Returns
 * label strings from OPTIONS.
 */
export function activeFilterEntries(
  state: VizState,
): { key: keyof VizFilters; value: string; label: string }[] {
  if (state.cut === null) {
    return [];
  }

  const allowedKeys = new Set(filterKeysFor(state.cut));
  const result: { key: keyof VizFilters; value: string; label: string }[] = [];

  for (const key of ORDER) {
    if (!allowedKeys.has(key)) continue;

    if (key === "player") {
      if (state.filters.player !== "you") {
        result.push({ key: "player", value: "opponent", label: "Opponent" });
      }
      continue;
    }

    const values = state.filters[key] as readonly string[];
    for (const value of values) {
      result.push({ key, value, label: getLabel(key, value) });
    }
  }

  // set
  if (allowedKeys.has("set")) {
    for (const setNumber of state.filters.set) {
      result.push({
        key: "set",
        value: String(setNumber),
        label: `Set ${setNumber}`,
      });
    }
  }

  return result;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function parseFilters(params: URLSearchParams, cut: Cut | null): VizFilters {
  // Start with defaults from EMPTY_VIZ_FILTERS
  const filters: VizFilters = { ...EMPTY_VIZ_FILTERS };

  // Parse player (single-select — the one scalar filter)
  const playerParam = params.get("player");
  if (playerParam === "opponent") {
    filters.player = "opponent";
  }

  // Parse other ORDER keys — every value the param carries, validated
  // against OPTIONS, deduped and sorted into canonical (OPTIONS) order so
  // two equal selections always produce the identical array (and therefore
  // the identical query string — see `canonicalOptionValues`'s doc comment).
  for (const key of ORDER) {
    if (key === "player") continue; // already handled

    const optionKey = key as MultiOptionKey;
    const raw = params
      .getAll(key)
      .filter((v) => Object.hasOwn(OPTIONS[optionKey], v));
    if (raw.length === 0) continue;
    filters[key] = canonicalOptionValues(optionKey, raw) as never;
  }

  // Parse set (special: numeric, multi-valued) — namespaced to `vset` (see
  // `VIZ_KEYS`).
  const setValues = params
    .getAll("vset")
    .map((v) => Number.parseInt(v, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (setValues.length > 0) {
    filters.set = canonicalSetValues(setValues);
  }

  return filters;
}

function getLabel(key: OptionKey, value: string): string {
  const options = OPTIONS[key] as Record<string, string>;
  return options[value] || value;
}
