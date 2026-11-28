/**
 * URL state layer for the Visualizations tab redesign.
 * Maps between VizState (the view's state model) and URLSearchParams.
 * Pure TypeScript; no React, no "use client".
 *
 * The layout: cut/chart/view/filters live in viz keys; other keys (like tab)
 * pass through untouched. Parsing is forgiving — unknown/garbage values read
 * as defaults; serialize omits defaults to keep URLs readable.
 */

import {
  COLLAPSED_ERROR_VALUES,
  EMPTY_VIZ_FILTERS,
  chartAllowedOn,
  collapseErrorFilter,
  COURT_ENDS,
  courtEndsFor,
  filterKeysFor,
  storedCourtEnds,
  withCourtEnds,
  type Chart,
  type CourtEnds,
  type Cut,
  type ErrorValue,
  type PlayerFilter,
  type VizFilters,
} from "./viz-model";
import { DEFAULT_CUTS } from "./default-cuts";
import {
  appliedValues,
  capitalizeFirst,
  optionLabel,
  phraseFor,
  SENTENCE_KEYS,
  type PhraseNames,
} from "../match-filters/applied-words";
import {
  filtersEqual,
  hasActiveMatchFilters,
  MATCH_FILTER_KEYS,
  parseMatchFilters,
  serializeMatchFilters,
  toggleMatchFilter,
  type FilterBandLabels,
  type MatchFilterAvailability,
  type MatchFilterKey,
  type MatchFilterValue,
} from "../match-filters/model";

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
  // Which ends the court draws, as resolved: a candidate that says nothing
  // (a default tile, an old saved row) is its cut's default.
  if (
    courtEndsFor(candidate.cut, current.filters) !==
    courtEndsFor(candidate.cut, candidate.filters)
  ) {
    return false;
  }

  for (const key of filterKeysFor(candidate.cut)) {
    if (!sameFilterValue(key, current.filters, candidate.filters)) {
      return false;
    }
  }

  return true;
}

/**
 * Whether `a` and `b` agree on one `VizFilters` key: `player` by value,
 * `match` by `filtersEqual` (a candidate built before advanced filters
 * existed may carry none — read as EMPTY), `ends` as stored (absent reads
 * as `null`, the cut's default), every list group as a set.
 */
export function sameFilterValue(
  key: keyof VizFilters,
  a: VizFilters,
  b: VizFilters,
): boolean {
  if (key === "player") return a.player === b.player;
  if (key === "ends") return (a.ends ?? null) === (b.ends ?? null);
  if (key === "match") {
    return filtersEqual(
      a.match ?? EMPTY_VIZ_FILTERS.match,
      b.match ?? EMPTY_VIZ_FILTERS.match,
    );
  }
  return sameValues(a[key] ?? [], b[key] ?? []);
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
 * "you" vs the opponent), `viewId` changes (a different saved view,
 * even one that happens to share cut/player with the view left behind), or
 * the ends the court draws change (`courtEndsFor`: Returns in Contact is a
 * different court from Returns in Placement, and each needs its own tile).
 * The ends enter resolved, so a state that leaves them unsaid and one that
 * names the cut's default share a key; Serves, which has none, adds nothing.
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
  const ends = courtEndsFor(state.cut, state.filters);
  const endsSuffix = ends === null ? "" : `:${ends}`;
  return `${state.filters.player}:${state.cut}:${state.viewId ?? ""}${endsSuffix}${draftSuffix}`;
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
   * The saved view an edited court came from (`?vfrom=`), while `viewId` is
   * null: an edit drops `viewId` (the court is no longer exactly the view)
   * but the lightbox still measures against the view — its title, the
   * strip, the denominator and "Clear filter" all take its filters as the
   * baseline. In the URL so it survives a remount (Watch → Video → Back) and
   * a reload. Never set alongside `viewId` (that IS the baseline), on the
   * wall or on a draft; `applyVizUpdate` keeps it moving: a saved or picked
   * view replaces it, a new cut or the wall drops it. Optional and omitted
   * when absent, like `draft`.
   */
  editedFrom?: string;
  /**
   * The season page's own filters (`?vopp=`, `?vm=`) — which matches of a
   * player's season the opened card is drawn over. Read only where the
   * provider is a season's (`VizParseMatch.season`); the match report never
   * parses them, and they are not `VizFilters`, so a saved view can never
   * carry them. Omitted when neither is on, like `draft`.
   */
  season?: SeasonFilters;
}

/* ── Season filters ─────────────────────────────────────────────────────── */

/** "Opponent plays": the opponent's hand, or a match that does not say. */
export type OpponentHandFilter = "right" | "left" | "unknown";

/** "Result": the player won or lost the match (a match whose score cannot
 *  say is in neither). */
export type SeasonResultFilter = "won" | "lost";

/** "Surface", read off `matches.court_type` (`seasonSurfaceOf`). */
export type SeasonSurface = "hard" | "clay" | "grass" | "unknown";

/** The season's match filters, all chosen in the lightbox's Matches sheet:
 *  the result, the opponent's hand and the surface (null = Any each), and
 *  the ticked matches (none ticked = every match the other three keep). */
export interface SeasonFilters {
  opponentHand: OpponentHandFilter | null;
  result?: SeasonResultFilter | null;
  surface?: SeasonSurface | null;
  matches: string[];
}

export const OPPONENT_HAND_FILTERS: readonly OpponentHandFilter[] = [
  "right",
  "left",
  "unknown",
];
export const SEASON_RESULT_FILTERS: readonly SeasonResultFilter[] = [
  "won",
  "lost",
];
export const SEASON_SURFACES: readonly SeasonSurface[] = [
  "hard",
  "clay",
  "grass",
  "unknown",
];

/** A match row's free-text `court_type` as "Surface" reads it: "Outdoor Hard
 *  Court", "Indoor Hard Court", "Hard" and "hard" are all hard; nothing
 *  recognisable is unknown. */
export function seasonSurfaceOf(
  courtType: string | null | undefined,
): SeasonSurface {
  const t = (courtType ?? "").toLowerCase();
  if (t.includes("clay")) return "clay";
  if (t.includes("grass")) return "grass";
  if (t.includes("hard")) return "hard";
  return "unknown";
}

/** Whether `m` is kept by the match filters' result, hand and surface (the
 *  ticks aside) — the one rule the season fold
 *  (`player-season-viz.ts`) and the lightbox's Matches sheet draft share. */
export function seasonMatchKept(
  m: {
    won: boolean | null;
    hand: OpponentHandFilter;
    surface: SeasonSurface;
  },
  filters: Pick<SeasonFilters, "opponentHand" | "result" | "surface">,
): boolean {
  if (filters.result === "won" && m.won !== true) return false;
  if (filters.result === "lost" && m.won !== false) return false;
  if (filters.opponentHand != null && m.hand !== filters.opponentHand)
    return false;
  if (filters.surface != null && m.surface !== filters.surface) return false;
  return true;
}

/** The URL params the season's filters travel as. */
export const SEASON_HAND_PARAM = "vopp";
export const SEASON_RESULT_PARAM = "vres";
export const SEASON_SURFACE_PARAM = "vsurf";
export const SEASON_MATCH_PARAM = "vm";

/** A match id as the URL may name one — a shape check only; the server
 *  keeps the ids that are matches of this season. */
const MATCH_ID_PATTERN = /^[\w-]{1,64}$/;

/** `season` in canonical form (ids deduped and sorted), or `undefined` when
 *  neither filter is on — the shape `VizState.season` is kept in. */
export function normalizeSeasonFilters(
  season: SeasonFilters | null | undefined,
): SeasonFilters | undefined {
  if (!season) return undefined;
  const opponentHand = OPPONENT_HAND_FILTERS.includes(
    season.opponentHand as OpponentHandFilter,
  )
    ? season.opponentHand
    : null;
  const result = SEASON_RESULT_FILTERS.includes(
    season.result as SeasonResultFilter,
  )
    ? (season.result as SeasonResultFilter)
    : null;
  const surface = SEASON_SURFACES.includes(season.surface as SeasonSurface)
    ? (season.surface as SeasonSurface)
    : null;
  const matches = [...new Set(season.matches)]
    .filter((id) => MATCH_ID_PATTERN.test(id))
    .sort();
  if (
    opponentHand === null &&
    result === null &&
    surface === null &&
    matches.length === 0
  )
    return undefined;
  return { opponentHand, result, surface, matches };
}

/** `state` without its season filters ("Clear filter", a closed card). */
export function withoutSeasonFilters(state: VizState): VizState {
  if (state.season === undefined) return state;
  const next = { ...state };
  delete next.season;
  return next;
}

/** The four URL params one set of match filters travels as. */
interface SeasonFilterParams {
  hand: string;
  result: string;
  surface: string;
  match: string;
}

const LIGHTBOX_SEASON_PARAMS: SeasonFilterParams = {
  hand: SEASON_HAND_PARAM,
  result: SEASON_RESULT_PARAM,
  surface: SEASON_SURFACE_PARAM,
  match: SEASON_MATCH_PARAM,
};

function parseSeasonFilters(
  params: URLSearchParams,
  names: SeasonFilterParams = LIGHTBOX_SEASON_PARAMS,
): SeasonFilters | undefined {
  const hand = params.get(names.hand);
  return normalizeSeasonFilters({
    opponentHand: OPPONENT_HAND_FILTERS.includes(hand as OpponentHandFilter)
      ? (hand as OpponentHandFilter)
      : null,
    result: params.get(names.result) as SeasonResultFilter | null,
    surface: params.get(names.surface) as SeasonSurface | null,
    matches: params.getAll(names.match),
  });
}

/** `season`, canonical (ids sorted, so one selection is one query string
 *  whatever order the ticks came in), written onto `params` under `names`. */
function writeSeasonFilters(
  params: URLSearchParams,
  season: SeasonFilters | null | undefined,
  names: SeasonFilterParams,
): void {
  const canonical = normalizeSeasonFilters(season);
  if (!canonical) return;
  if (canonical.opponentHand !== null)
    params.set(names.hand, canonical.opponentHand);
  if (canonical.result) params.set(names.result, canonical.result);
  if (canonical.surface) params.set(names.surface, canonical.surface);
  for (const id of canonical.matches) params.append(names.match, id);
}

/* ── The player page's match scope ──────────────────────────────────────── */

/**
 * The player page's own match scope (plan §9, decision C4): which matches of
 * the season BOTH of its bodies — Statistics and the Visualizations wall —
 * are computed from. The same shape as the lightbox's `SeasonFilters`, under
 * its own names, for two reasons:
 *
 * - `?vopp=` / `?vres=` / `?vsurf=` / `?vm=` are viz keys (`VIZ_KEYS`): the
 *   store deletes them on every write and never writes them on the wall, so a
 *   scope under those names would be gone the moment a card closed or the
 *   wall's You | Opponent was pressed. These four are NOT viz keys, so
 *   `vizStateQuery` carries them through like `tab`, and the tab switch
 *   (`profileViewQuery`) carries every parameter.
 * - An opened card keeps its own Matches row. It STARTS at the page's scope
 *   (the wall's cards carry it into `VizState.season` —
 *   `buildSeasonCards`), and a reader may then widen or narrow that one card
 *   without rewriting the page's scope under it.
 */
export const SCOPE_HAND_PARAM = "sopp";
export const SCOPE_RESULT_PARAM = "sres";
export const SCOPE_SURFACE_PARAM = "ssurf";
export const SCOPE_MATCH_PARAM = "sm";

const MATCH_SCOPE_PARAMS: SeasonFilterParams = {
  hand: SCOPE_HAND_PARAM,
  result: SCOPE_RESULT_PARAM,
  surface: SCOPE_SURFACE_PARAM,
  match: SCOPE_MATCH_PARAM,
};

/** Every param the page's match scope travels as. */
export const MATCH_SCOPE_KEYS: readonly string[] =
  Object.values(MATCH_SCOPE_PARAMS);

/** The URL's match scope, canonical (`normalizeSeasonFilters`), or
 *  `undefined` when the URL names none — the whole season. Garbage reads as
 *  none; an id is shape-checked only, and the server keeps the ones that are
 *  matches of this season (`scopeSeasonMatches`). */
export function parseMatchScope(
  params: URLSearchParams,
): SeasonFilters | undefined {
  return parseSeasonFilters(params, MATCH_SCOPE_PARAMS);
}

/**
 * `params` with the match scope set to `scope` — every other parameter kept,
 * ids sorted so one scope is one query string. `undefined` (or a scope with
 * nothing on) clears it: the bare URL is the whole season. Returns a new
 * string; `params` is never mutated.
 */
export function matchScopeQuery(
  params: URLSearchParams,
  scope: SeasonFilters | null | undefined,
): string {
  const next = new URLSearchParams(params.toString());
  for (const key of MATCH_SCOPE_KEYS) next.delete(key);
  writeSeasonFilters(next, scope, MATCH_SCOPE_PARAMS);
  return next.toString();
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
  pressure: {
    pressure: "Pressure points",
    break: "Break points",
    setMatch: "Set & match points",
  },
  result: { won: "Won", lost: "Lost", ace: "Aces" },
  rally: { short: "1–4 shots", medium: "5–8 shots", long: "9+ shots" },
  error: {
    unforced: "Unforced errors",
    forced: "Forced errors",
    doubleFault: "Double faults",
  },
  // The Approaches cut's three groups. Their order is the canonical order a
  // selection is kept in (`canonicalOptionValues`), and the order the stats
  // rows list them in.
  entry: {
    approach: "Approach",
    "serve-volley": "Serve and volley",
    "drawn-in": "Drawn in",
  },
  approachTo: {
    backhand: "Their backhand",
    middle: "Middle",
    forehand: "Their forehand",
  },
  approachDir: {
    Crosscourt: "Crosscourt",
    Middle: "Middle",
    "Down the Line": "Down the line",
  },
} as const;

/**
 * Where an applied-strip token words an option differently from its panel
 * row. "Approach to" reads as a destination in the sentence ("To their
 * backhand · Crosscourt"), which also keeps its Middle apart from
 * Direction's: "To the middle" is where the ball went, "Middle" the line it
 * took. Every other option's token is its `OPTIONS` label.
 */
const APPLIED_LABELS: Partial<
  Record<OptionKey, Readonly<Record<string, string>>>
> = {
  approachTo: {
    backhand: "To their backhand",
    middle: "To the middle",
    forehand: "To their forehand",
  },
};

/**
 * The few option values that travel in the URL under a shorter code than
 * their model value: an approach direction is `shots.zone`'s own words,
 * spaces and all, so "Down the Line" goes as `dtl` — the codes the stats
 * rows already key on. Every other value travels as itself.
 */
const URL_VALUE_CODES: Partial<
  Record<string, Readonly<Record<string, string>>>
> = {
  approachDir: {
    Crosscourt: "crosscourt",
    Middle: "middle",
    "Down the Line": "dtl",
  },
};

function codesFor(key: string): Readonly<Record<string, string>> | undefined {
  return Object.hasOwn(URL_VALUE_CODES, key) ? URL_VALUE_CODES[key] : undefined;
}

/** The word a filter value is written as in the URL (see `URL_VALUE_CODES`). */
export function urlValueFor(key: string, value: string): string {
  const codes = codesFor(key);
  return codes && Object.hasOwn(codes, value) ? codes[value] : value;
}

/** `urlValueFor` reversed: the model value a URL word names, or the word
 *  itself for a key with no codes (`parseFilters` then validates it). */
function modelValueFor(key: string, word: string): string | null {
  const codes = codesFor(key);
  if (!codes) return word;
  const found = Object.entries(codes).find(([, code]) => code === word);
  return found ? found[0] : null;
}

/**
 * The word for the one option an unjudged match's Error type offers in place
 * of Unforced / Forced (`errorOptionsFor`), and its applied-strip token.
 */
export const UNJUDGED_ERRORS_LABEL = "Errors";

/** One Error type pill: the values it toggles together, and its word. */
export interface ErrorOption {
  values: readonly ErrorValue[];
  label: string;
}

/**
 * Error type's pills, from `OPTIONS.error` — the source of both wordings.
 * Judged (`MatchFilterContext.errorSplitJudged`): today's three, one value
 * each. Unjudged: nobody has called an error forced or unforced, so the two
 * kinds are one "Errors" pill that toggles both together — never a "Forced"
 * pick that could only draw an empty chart — then Double faults.
 */
export function errorOptionsFor(errorSplitJudged: boolean): ErrorOption[] {
  if (errorSplitJudged) {
    return (Object.keys(OPTIONS.error) as ErrorValue[]).map((value) => ({
      values: [value],
      label: OPTIONS.error[value],
    }));
  }
  return [
    { values: COLLAPSED_ERROR_VALUES, label: UNJUDGED_ERRORS_LABEL },
    { values: ["doubleFault"], label: OPTIONS.error.doubleFault },
  ];
}

/**
 * An Error type option as an Errors toolbar chip: short beside "All" (the
 * Errors board reads All · Unforced · Forced · Double faults). The strip,
 * the wall's card names and Advanced filters keep the full words.
 */
export function errorChipLabel(option: ErrorOption): string {
  if (option.values.length === 1) {
    if (option.values[0] === "unforced") return "Unforced";
    if (option.values[0] === "forced") return "Forced";
  }
  return option.label;
}

const ORDER = [
  "player",
  "ball",
  "court",
  "zone",
  "result",
  "pressure",
  "rally",
  "game",
  "error",
  "entry",
  "approachTo",
  "approachDir",
] as const;

/**
 * The advanced (`MatchFilters`) half of `VizFilters`, in
 * `serializeMatchFilters`' compact form. Its own key, never the Video tab's
 * `?f=` (`MATCH_FILTERS_PARAM`): the two tabs filter independently, and
 * sharing the param would have one silently narrow the other.
 */
export const VIZ_MATCH_FILTERS_PARAM = "vf";

/**
 * The URL param `VizFilters.ends` travels as: `placement`, `contact` or
 * `both`. Never `view` — that is the saved-view id. Written only when the
 * value is not the cut's default (`storedCourtEnds`), and never on Serves.
 */
export const COURT_ENDS_PARAM = "vends";

/**
 * The URL param a filter key travels as. `error` is namespaced to `verr`
 * for the same reason `set` is to `vset` (below): a bare `?error=` is the
 * kind of name an auth or redirect flow puts on the page, and every viz
 * write would strip it. The Approaches cut's groups take the same `v`
 * prefix, short: `ventry`, `vto` (approach to) and `vdir` (direction).
 */
const NAMESPACED_PARAMS: Readonly<Record<string, string>> = {
  error: "verr",
  entry: "ventry",
  approachTo: "vto",
  approachDir: "vdir",
  ends: COURT_ENDS_PARAM,
};

export function paramFor(key: string): string {
  return Object.hasOwn(NAMESPACED_PARAMS, key) ? NAMESPACED_PARAMS[key] : key;
}

/**
 * How the URL says a cut's floor was let go of: `cut=approaches&ventry=any`
 * is every way to the net. A bare `cut=approaches` is the cut on its floor
 * (approach shots only), so "nothing ticked" cannot go unsaid as it does for
 * every other group. Never a model value: it parses to an empty group.
 */
export const FLOOR_LOOSENED_WORD = "any";

/**
 * A cut's floor (`DefaultCut.floor`): the filters it opens on because they
 * are what the cut is — Approaches is approach shots. The same on a judged
 * and an unjudged match, so `DEFAULT_CUTS` is read directly.
 */
export function cutFloor(cut: Cut): Partial<VizFilters> {
  return DEFAULT_CUTS.find((c) => c.cut === cut)?.floor ?? {};
}

/**
 * The filters a court lands on when a menu picks `cut` while `prevCut` is
 * showing: what `carryFilters` keeps, then — only when the cut really
 * changes — the new cut's floor, so Approaches picked from another cut opens
 * on approach shots, as its card does. Picking the cut already showing
 * leaves a loosened floor alone: the reader's untick is theirs.
 */
export function filtersForCut(
  filters: VizFilters,
  prevCut: Cut | null,
  cut: Cut,
): VizFilters {
  const carried = carryFilters(filters, cut);
  return cut === prevCut ? carried : { ...carried, ...cutFloor(cut) };
}

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
  "vfrom",
  SEASON_HAND_PARAM,
  SEASON_RESULT_PARAM,
  SEASON_SURFACE_PARAM,
  SEASON_MATCH_PARAM,
  // Retired with the fullscreen viewer; still a viz key so an old
  // `&fullscreen=1` link is cleaned off the URL by the next update.
  "fullscreen",
  VIZ_MATCH_FILTERS_PARAM,
  COURT_ENDS_PARAM,
  ...ORDER.map(paramFor),
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

 */
export function applyVizUpdate(
  prev: VizState,
  update: VizState | ((prev: VizState) => VizState),
): VizState {
  const resolved = typeof update === "function" ? update(prev) : update;
  const editedFrom = nextEditedFrom(prev, resolved);
  if (!resolved.draft && resolved.editedFrom === editedFrom) return resolved;
  const next: VizState = { ...resolved };
  if (next.draft) next.draft = false;
  if (editedFrom === undefined) delete next.editedFrom;
  else next.editedFrom = editedFrom;
  return next;
}

/**
 * Where `editedFrom` goes on an update: nowhere on the wall, on a court that
 * IS a saved view (`viewId` names the baseline itself), on a draft or on a
 * new cut; otherwise the view the previous court was, or came from — so an
 * edit to view V, and every edit after it, measures against V until another
 * view is saved or picked.
 */
function nextEditedFrom(prev: VizState, next: VizState): string | undefined {
  if (next.cut === null || next.viewId !== null || next.draft === true)
    return undefined;
  if (next.cut !== prev.cut) return undefined;
  return next.editedFrom ?? prev.viewId ?? prev.editedFrom ?? undefined;
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
  match,
}: {
  urlQuery: string;
  ownQueries: string[];
  intended: VizState;
  /** Passed straight to `parseVizState` for an external query. */
  match?: VizParseMatch;
}): { state: VizState; ownQueries: string[]; external: boolean } {
  const idx = ownQueries.indexOf(urlQuery);
  if (idx !== -1) {
    return {
      state: intended,
      ownQueries: ownQueries.slice(idx + 1),
      external: false,
    };
  }
  return {
    state: parseVizState(new URLSearchParams(urlQuery), match),
    ownQueries: [urlQuery],
    external: true,
  };
}

/** What `parseVizState` needs to know about the match the URL is opened on. */
export interface VizParseMatch {
  /** `MatchFilterContext.errorSplitJudged === true` — pass a boolean, never
   *  the raw optional flag. */
  errorSplitJudged: boolean;
  /** The season page: `?vopp=` and `?vm=` are read into `VizState.season`.
   *  Omitted (the match report), they parse away. */
  season?: boolean;
}

/**
 * URLSearchParams → VizState. Garbage values read as defaults.
 * Every supported cut preserves Zones.
 *
 * `match` (the Shots tab passes it): on a match whose errors are not judged,
 * an Error type of `unforced` or `forced` — alone or together, e.g. a link
 * copied off a judged match — resolves to the all-errors pair
 * (`collapseErrorFilter`), so it opens on every error rather than an empty
 * chart. Omitted (saved-view validation, `saved-views-logic.ts`), the values
 * parse exactly as written: a saved view's `error` array is read, never
 * rewritten.
 *
 * With `match`, a cut that has a floor (`cutFloor`) also opens on it: a bare
 * `cut=approaches` is approach shots only — the card's own state, so no
 * filter reads as applied — and "every way in" is spelled out as
 * `ventry=any` (`FLOOR_LOOSENED_WORD`). A `ventry` naming a way in is read
 * as written. Without `match` nothing is filled in: a saved view stored with
 * an empty `entry` stays every way in.
 */
export function parseVizState(
  params: URLSearchParams,
  match?: VizParseMatch,
): VizState {
  const cutParam = params.get("cut");
  let cut: Cut | null = null;
  if (
    cutParam === "serve" ||
    cutParam === "returnPlacement" ||
    cutParam === "returnContact" ||
    cutParam === "rallyPosition" ||
    cutParam === "rallyPlacement" ||
    cutParam === "errors" ||
    cutParam === "approaches"
  ) {
    // Returns is one chart: the old contact id reads as Returns, and
    // `parseFilters` sets its ends to Contact (`chartView`).
    cut = cutParam === "returnContact" ? "returnPlacement" : cutParam;
  }

  // Stays "scatter" — the default — when the requested chart is unknown, the
  // cut is null (the wall), or `chartAllowedOn` rejects the pairing.
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
  // The wall keeps one filter: which player's four cards it shows
  // (`?player=opponent`, the wall's You | Opponent switch). Every other key
  // belongs to an opened card and parses away here.
  const carried =
    cut === null
      ? { ...EMPTY_VIZ_FILTERS, player: rawFilters.player }
      : carryFilters(rawFilters, cut);
  const filters =
    match === undefined
      ? carried
      : {
          ...withUnsaidFloor(carried, cut, params),
          error: collapseErrorFilter(carried.error, match.errorSplitJudged),
        };

  // `draft` only means anything alongside a real cut — on the wall
  // (`cut === null`) it's dropped, same as every other viz key. Omitted
  // (not `draft: false`) when not draft, matching this function's own
  // "garbage/defaults parse away" convention — every existing `toEqual`
  // fixture in `tests/viz-url.spec.ts` that builds an expected `VizState`
  // without a `draft` key relies on that (`{}`'s missing key and `{draft:
  // undefined}` compare equal under `toEqual`; `{draft: false}` would not).
  const draft = cut !== null && params.get("draft") === "1";
  const editedFrom =
    cut !== null && viewId === null && !draft ? params.get("vfrom") : null;
  const season =
    cut !== null && match?.season === true
      ? parseSeasonFilters(params)
      : undefined;

  return {
    cut,
    chart,
    filters,
    viewId,
    ...(draft ? { draft: true } : {}),
    ...(editedFrom ? { editedFrom } : {}),
    ...(season ? { season } : {}),
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

  // The wall: only its You | Opponent switch serializes.
  if (state.cut === null) {
    if (state.filters.player !== "you")
      next.set("player", state.filters.player);
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

  // Serialize viewId if present
  if (state.viewId !== null) {
    next.set("view", state.viewId);
  } else if (state.editedFrom !== undefined && state.draft !== true) {
    next.set("vfrom", state.editedFrom);
  }

  // Serialize filters: only non-default keys that are in filterKeysFor(cut)
  const allowedKeys = new Set(filterKeysFor(state.cut));
  const floor = cutFloor(state.cut);

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
      next.append(paramFor(key), urlValueFor(key, value));
    }
    // A floor group with nothing ticked is said out loud: left off, the
    // reader's "every way in" would read back as the floor (`parseVizState`).
    if (values.length === 0 && Object.hasOwn(floor, key)) {
      next.append(paramFor(key), FLOOR_LOOSENED_WORD);
    }
  }

  if (allowedKeys.has("match") && state.filters.match) {
    const match = serializeMatchFilters(state.filters.match);
    if (match) next.set(VIZ_MATCH_FILTERS_PARAM, match);
  }

  // Which ends the court draws: only a choice away from the cut's default,
  // so one court is one query string. Serves never writes one.
  const ends = storedCourtEnds(state.cut, state.filters.ends);
  if (ends !== null) next.set(COURT_ENDS_PARAM, ends);

  // The season's own filters.
  writeSeasonFilters(next, state.season, LIGHTBOX_SEASON_PARAMS);

  return next.toString();
}

/**
 * Every filter key back to `EMPTY_VIZ_FILTERS` — `player` included — and
 * `viewId` cleared, keeping `cut`/`chart` as-is, and `ends` too: which ends
 * the court draws is not a filter, so clearing filters leaves it alone. The one "Clear"/"Clear all"
 * behavior both `applied-strip.tsx` and `filters-popover.tsx` need, pulled
 * out here so the two don't carry verbatim copies of the same object spread.
 */
export function clearedFilters(state: VizState): VizState {
  const ends = state.filters.ends ?? null;
  return {
    ...state,
    filters: ends === null ? EMPTY_VIZ_FILTERS : { ...EMPTY_VIZ_FILTERS, ends },
    viewId: null,
  };
}

/**
 * `state`'s filters with the court's player set to `player`. Nothing else
 * changes: the advanced filters name players outright and Result › Outcome
 * is yours — the Video tab's meaning — so whose court is drawn never
 * rewrites a filter the user picked.
 */
export function courtFor(state: VizState, player: PlayerFilter): VizFilters {
  if (state.filters.player === player) return state.filters;
  return { ...state.filters, player };
}

/**
 * `availability` narrowed to the options the carry rule keeps on `cut` for
 * `filters`' court player — what the advanced panel offers there. Each
 * option is probed through `carryFilters` itself, so the panel can never
 * offer a pick the cut then silently drops (Won on your Errors court, Aces
 * off serve) and the two rules cannot drift apart.
 */
export function cutAvailability(
  availability: MatchFilterAvailability,
  filters: VizFilters,
  cut: Cut,
): MatchFilterAvailability {
  const out: Record<string, ReadonlySet<unknown>> = {};
  for (const key of MATCH_FILTER_KEYS) {
    const kept = [...(availability[key] as ReadonlySet<unknown>)].filter(
      (value) => {
        const probe = toggleMatchFilter(
          EMPTY_VIZ_FILTERS.match,
          key,
          value as MatchFilterValue<typeof key>,
        );
        const carried = carryFilters(
          { ...EMPTY_VIZ_FILTERS, player: filters.player, match: probe },
          cut,
        );
        return filtersEqual(carried.match, probe);
      },
    );
    out[key] = new Set(kept);
  }
  return out as unknown as MatchFilterAvailability;
}

/** `filters` without what can only match a point the court player won (see
 * `carryFilters`). Result › Outcome is yours, so the court player's win is
 * "won" on your court and "lost" on the opponent's. */
function withoutWinningFilters(filters: VizFilters): VizFilters {
  const match = filters.match ?? EMPTY_VIZ_FILTERS.match;
  return {
    ...filters,
    // Every errors dot is a point the court player lost. Won (theirs, in
    // the pills; either side, in Result › Outcome) could only empty the cut
    // and their Lost would filter nothing while still counting as applied,
    // so neither Outcome means anything here — both go, and the panel does
    // not offer them (`cutAvailability`).
    result: [],
    match: {
      ...match,
      resultOutcome: [],
      returnResult: match.returnResult.filter((v) => v !== "winner"),
      resultEnding: match.resultEnding.filter((v) => v !== "winner"),
    },
  };
}

/**
 * Reset serve-only filter values when switching off serve: `zone` clears
 * entirely (it has no meaning off serve), and `"ace"` alone is dropped out
 * of `result` — any OTHER selected result value (`won`/`lost`) is kept,
 * since those still mean something off serve.
 */
export function carryFilters(filters: VizFilters, nextCut: Cut): VizFilters {
  // Which ends the court draws carries as a choice, re-read against the new
  // cut: dropped on Serves, and dropped where it is that cut's own default
  // (Both, carried onto Approaches). Unsaid stays unsaid — each cut's default.
  filters = withCourtEnds(filters, nextCut, filters.ends ?? null);
  // Error kinds only mean something on the errors cut.
  if (nextCut !== "errors" && filters.error?.length) {
    filters = { ...filters, error: [] };
  }
  // Nor do the approach groups off the Approaches cut.
  if (
    nextCut !== "approaches" &&
    (filters.entry?.length ||
      filters.approachTo?.length ||
      filters.approachDir?.length)
  ) {
    filters = { ...filters, entry: [], approachTo: [], approachDir: [] };
  }
  // Every errors dot is a point the court's player lost on their own
  // error: anything carried in that asks for the court player's won points,
  // aces or winners would empty the cut. Dropped — the pill group's Won and
  // Aces, and the advanced filters' equivalents.
  if (nextCut === "errors") {
    filters = withoutWinningFilters(filters);
  }
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
  // The advanced Serve › Result "Ace" leaves no return, rally shot or error to
  // draw off serve. "Double fault" and "Service winner" leave nothing on the
  // return and rally cuts either, but on the errors cut they stay: a double
  // fault IS the server's error, and a service winner's missed return is the
  // returner's (`errorMadeBy`).
  const serveResult = next.match?.serveResult ?? [];
  const drop = (v: (typeof serveResult)[number]) =>
    v === "ace" ||
    ((v === "service-winner" || v === "double-fault") && nextCut !== "errors");
  if (serveResult.some(drop)) {
    next.match = {
      ...next.match,
      serveResult: serveResult.filter((v) => !drop(v)),
    };
  }
  return next;
}

/**
 * One applied-strip token. `match` tokens carry `matchKey` — the
 * `MatchFilters` group the value belongs to — and the raw `matchValue`, so a
 * token's X can toggle exactly that option back off.
 */
export interface ActiveFilterEntry {
  key: keyof VizFilters;
  value: string;
  /** Every value the token stands for, when it is more than `value` — an
   *  unjudged match's one "Errors" token holds both error kinds, and its X
   *  removes both. */
  values?: readonly string[];
  label: string;
  matchKey?: MatchFilterKey;
  matchValue?: unknown;
}

const DEFAULT_PHRASE_NAMES: PhraseNames = { you: "You", opponent: "Opponent" };

/**
 * Active filter entries for the UI, ordered per ORDER then set, one entry
 * per SELECTED VALUE (not per key) — a group with two values selected draws
 * two removable tokens. Skips empty groups and keys not in the cut. Returns
 * label strings from OPTIONS.
 */
export function activeFilterEntries(
  state: VizState,
  /** Player names for the advanced filters' phrases ("Rudy serving"). */
  names: PhraseNames = DEFAULT_PHRASE_NAMES,
  /**
   * `errorSplitJudged: false` (the match's errors are not judged) words the
   * Error type as its pills do (`errorOptionsFor`): Unforced and Forced are
   * one "Errors" token. Omitted, every value is its own token, as stored.
   */
  options: {
    errorSplitJudged?: boolean;
    /** Contact and Landed in name the viewer's bands ("return struck 0–5
     *  ft behind"). Omitted, the default bands in feet. */
    bandLabels?: FilterBandLabels;
  } = {},
): ActiveFilterEntry[] {
  if (state.cut === null) {
    return [];
  }

  const allowedKeys = new Set(filterKeysFor(state.cut));
  const result: ActiveFilterEntry[] = [];

  for (const key of ORDER) {
    if (!allowedKeys.has(key)) continue;

    if (key === "player") {
      if (state.filters.player !== "you") {
        result.push({
          key: "player",
          value: "opponent",
          label: names.opponent,
        });
      }
      continue;
    }

    if (key === "error" && options.errorSplitJudged === false) {
      for (const option of errorOptionsFor(false)) {
        const picked = option.values.filter((v) =>
          state.filters.error.includes(v),
        );
        if (picked.length === 0) continue;
        result.push({
          key,
          value: picked[0],
          ...(option.values.length > 1 ? { values: picked } : {}),
          label: option.label,
        });
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

  const match = state.filters.match;
  if (allowedKeys.has("match") && match && hasActiveMatchFilters(match)) {
    for (const matchKey of SENTENCE_KEYS) {
      for (const matchValue of appliedValues(match, matchKey)) {
        result.push({
          key: "match",
          value: `${matchKey}:${String(matchValue)}`,
          label: capitalizeFirst(
            phraseFor(
              matchKey,
              optionLabel(matchKey, matchValue, options.bandLabels),
              matchValue,
              names,
            ),
          ),
          matchKey,
          matchValue,
        });
      }
    }
  }

  return result;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

/**
 * `filters` with `cut`'s floor filled into each floor group the URL left
 * unsaid: empty after parsing, and not let go of by name
 * (`FLOOR_LOOSENED_WORD`). The wall (`cut === null`) has no floor.
 */
function withUnsaidFloor(
  filters: VizFilters,
  cut: Cut | null,
  params: URLSearchParams,
): VizFilters {
  if (cut === null) return filters;
  let next = filters;
  for (const [key, value] of Object.entries(cutFloor(cut))) {
    const held = filters[key as keyof VizFilters];
    if (!Array.isArray(held) || held.length > 0) continue;
    if (params.getAll(paramFor(key)).includes(FLOOR_LOOSENED_WORD)) continue;
    next = { ...next, [key]: value };
  }
  return next;
}

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
      .getAll(paramFor(key))
      .map((word) => modelValueFor(key, word))
      .filter(
        (v): v is string => v !== null && Object.hasOwn(OPTIONS[optionKey], v),
      );
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

  filters.match = parseMatchFilters(params.get(VIZ_MATCH_FILTERS_PARAM));

  // Which ends the court draws. The wall has no court, so no value; on a
  // cut, `storedCourtEnds` keeps only a real choice away from its default.
  const endsParam = params.get(COURT_ENDS_PARAM);
  if (cut !== null && COURT_ENDS.includes(endsParam as CourtEnds)) {
    filters.ends = storedCourtEnds(cut, endsParam as CourtEnds);
  }
  // `cut=returnContact` is Returns in Contact, whatever else the link says:
  // the id never carried a choice of ends, it was the choice.
  if (params.get("cut") === "returnContact") filters.ends = "contact";

  return filters;
}

/** An applied-strip token's words: `APPLIED_LABELS`, else `OPTIONS`. */
function getLabel(key: OptionKey, value: string): string {
  const applied = Object.hasOwn(APPLIED_LABELS, key)
    ? APPLIED_LABELS[key]
    : undefined;
  if (applied && Object.hasOwn(applied, value)) return applied[value];
  const options = OPTIONS[key] as Record<string, string>;
  return options[value] || value;
}
