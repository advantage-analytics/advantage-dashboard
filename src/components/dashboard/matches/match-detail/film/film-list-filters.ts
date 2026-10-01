import type { MatchPoint } from "@/lib/data/match-points-server";
import { surname } from "@/lib/data/match-utils";

import {
  appliedPhrases,
  capitalizeFirst,
  type PhraseNames,
} from "../match-filters/applied-words";
import {
  activeFilterCount,
  applyMatchFilters,
  EMPTY_MATCH_FILTERS,
  filtersEqual,
  type MatchFilterContext,
  type MatchFilters,
  type PlayerSide,
} from "../match-filters/model";
import {
  filmCutExtras,
  filmCutFilters,
  matchesFilmCutExtras,
  type FilmCutIntent,
  type FilmCutRemainder,
  type LandedFilmCut,
} from "../film-cut-context";

/**
 * What the Film tab's point list is filtered by, in three layers ANDed
 * together:
 *
 * 1. `shared` — the match report's `MatchFilters` (`MatchFiltersProvider`),
 *    mirrored to `?f=`. Film edits it through the quick menu and the filters
 *    drawer (`FiltersPanel`), and a statistic's cut LANDS its `MatchFilters`
 *    half here (`landFilmCut`), replacing whatever was applied, so the
 *    drawer shows exactly those pills pressed.
 * 2. `remainder` — what of a landed cut `MatchFilters` cannot say (its
 *    `FilmCutExtras`) and the statistic's label, Film only: named in the
 *    filter strip, never a pill. Held by `MatchFiltersProvider` beside the
 *    shared filters, above the view switch, so leaving Video and coming back
 *    never keeps the shared half while silently dropping the extras.
 * 3. `savedOnly` — the viewer's bookmarks, a Film-only local toggle: it is
 *    about the viewer, not about the tennis, so it is not a match filter.
 *
 * Pure logic, no React and no `next/navigation`, so specs import it directly
 * and the film subtree stays loadable offline.
 */

/**
 * The Film-only half of the list's filters — the pure input the tab
 * assembles from the provider's remainder and its own `savedOnly`.
 */
export interface FilmLocalFilters {
  remainder: FilmCutRemainder | null;
  savedOnly: boolean;
}

export const NO_FILM_LOCAL_FILTERS: FilmLocalFilters = Object.freeze({
  remainder: null,
  savedOnly: false,
});

/**
 * Everything the list's header, quick menu and filter strip need: the three layers
 * and the writers. `film-tab.tsx` builds ONE of these and hands the same
 * object to both `PointList` mounts (the report column and the fullscreen
 * room's drawer), so the two can never show different cuts.
 */
export interface FilmListFilters {
  shared: MatchFilters;
  setShared: (next: MatchFilters) => void;
  /** A landed cut's Film-only remainder, `null` when none is in force. */
  remainder: LandedFilmCut | null;
  savedOnly: boolean;
  setSavedOnly: (next: boolean) => void;
  /** All three layers at once — the strip's, the header's and the zero state's "Clear all". */
  clearAll: () => void;
}

const noop = () => {};

/** Nothing filtered and nothing to change — a list mounted without a Film tab. */
export const INERT_FILM_LIST_FILTERS: FilmListFilters = Object.freeze({
  shared: EMPTY_MATCH_FILTERS,
  setShared: noop,
  remainder: null,
  savedOnly: false,
  setSavedOnly: noop,
  clearAll: noop,
});

/**
 * The Film list's points: `sharedPoints` — `applyMatchFilters(points,
 * shared)`, i.e. `useMatchFilters().filteredPoints` — AND the remainder's
 * extras (`matchesFilmCutExtras`) AND, when on, the saved toggle. Nothing
 * else: a landed cut's `MatchFilters` keys are evaluated through `shared`
 * alone, so un-setting one in the drawer widens the list. Nothing Film-only
 * applied returns `sharedPoints` itself.
 */
export function filmListPoints(
  sharedPoints: MatchPoint[],
  local: FilmLocalFilters,
): MatchPoint[] {
  const extras = local.remainder?.extras ?? null;
  if (!extras && !local.savedOnly) return sharedPoints;
  return sharedPoints.filter(
    (point) =>
      (!extras || matchesFilmCutExtras(point, extras)) &&
      (!local.savedOnly || point.saved),
  );
}

/**
 * Land a statistic's cut. `shared` comes back as the cut's `MatchFilters`
 * half over the EMPTY filters (`filmCutFilters`) — a landing RESETS the
 * Video filters, it never stacks on them. Whatever was applied before (an
 * earlier figure's cut, a drawer pick) is dropped, so the list is exactly
 * the points the card counted over the whole match; overlaying instead left
 * the previous click's groups ANDed in, and a second figure opened on a
 * narrower list than its own number. (The same object back when that
 * changes nothing.) `remainder` holds ONLY the cut's `FilmCutExtras` and its
 * label, or is `null` when the cut has no extras: a pure cut is just pills.
 *
 * The caller writes `shared` through `setShared`, holds the remainder with
 * `landed: shared` beside it, and turns the saved toggle off (the card
 * counted every point, bookmarked or not).
 */
export function landFilmCut(
  shared: MatchFilters,
  intent: FilmCutIntent,
): { shared: MatchFilters; remainder: FilmCutRemainder | null } {
  const landed = filmCutFilters(intent.cut);
  const extras = filmCutExtras(intent.cut);
  return {
    shared: filtersEqual(landed, shared) ? shared : landed,
    remainder: extras ? { label: intent.label, extras } : null,
  };
}

/** Whether any of the three layers is on. */
export function filmListActive(f: {
  shared: MatchFilters;
  remainder: FilmCutRemainder | null;
  savedOnly: boolean;
}): boolean {
  return activeFilterCount(f.shared) > 0 || f.remainder !== null || f.savedOnly;
}

/* ── The quick menu's vocabulary ─────────────────────────────────────────── */

/**
 * The quick menu's "Show points" choice, read off the layers: "Saved only" is
 * the local toggle, "Break points" is Score › Breakpoint in the shared
 * filters. Saved wins when both are on, as the old menu's `show` did.
 */
export function quickShow(f: {
  shared: MatchFilters;
  savedOnly: boolean;
}): "all" | "break" | "saved" {
  if (f.savedOnly) return "saved";
  if (f.shared.scoreType.includes("breakpoint")) return "break";
  return "all";
}

/**
 * The shared filters with the quick menu's "Show points" choice made: "Break
 * points" is Score type exactly Breakpoint; "All points" and "Saved only"
 * take Breakpoint out (the three rows are one choice). Every other group is
 * left as it is.
 */
export function withQuickShow(
  shared: MatchFilters,
  show: "all" | "break" | "saved",
): MatchFilters {
  if (show === "break") return { ...shared, scoreType: ["breakpoint"] };
  if (!shared.scoreType.includes("breakpoint")) return shared;
  return {
    ...shared,
    scoreType: shared.scoreType.filter((t) => t !== "breakpoint"),
  };
}

/**
 * Whether `shared` holds nothing beyond the quick menu's own two groups:
 * zero out Serve › Player and Score › Breakpoint (the menu's own axes) and
 * ask the shared model whether anything is still active — the same
 * "what counts as empty" rule every other reading of `MatchFilters` uses.
 */
function quickOnly(shared: MatchFilters): boolean {
  return (
    activeFilterCount({
      ...shared,
      server: null,
      scoreType: shared.scoreType.filter((t) => t !== "breakpoint"),
    }) === 0
  );
}

/**
 * The quick-menu trigger's name for what is applied: the menu's own labels
 * where the menu could have made it ("Break points · Reid serving"),
 * "Filtered" once a cut's remainder or any other group is involved, "All
 * points" when nothing is.
 */
export function filmListName(
  f: {
    shared: MatchFilters;
    remainder: FilmCutRemainder | null;
    savedOnly: boolean;
  },
  names: PhraseNames,
): string {
  if (f.remainder !== null || !quickOnly(f.shared)) return "Filtered";
  const show = quickShow(f);
  const showName =
    show === "saved" ? "Saved only" : show === "break" ? "Break points" : null;
  const server = f.shared.server;
  const serverName =
    server === null ? null : `${playerNameOf(server, names)} serving`;
  if (showName && serverName) return `${showName} · ${serverName}`;
  return showName ?? serverName ?? "All points";
}

function playerNameOf(side: PlayerSide, names: PhraseNames): string {
  return side === "you" ? names.you : names.opponent;
}

/** Lower-case a cut label's first letter mid-sentence, unless it opens on a name. */
function midSentence(label: string, names: PhraseNames): string {
  if (label.startsWith(names.you) || label.startsWith(names.opponent)) {
    return label;
  }
  // "Aces · Reid" → "aces · Reid"; an acronym or a score ("T", "40-Ad") stays.
  return /^[A-Z][a-z]/.test(label)
    ? label.charAt(0).toLowerCase() + label.slice(1)
    : label;
}

/**
 * Every applied layer in words, for the filter strip above the video and the
 * zero state (the design system bans accumulating chips — tables.md, Data
 * Table rule 6 — so the cut reads as one sentence): the shared filters
 * (`appliedPhrases`, rally order — a landed cut's `MatchFilters` half reads
 * here, like any other pick), then the statistic's label ("…, from
 * Statistics") ONLY while its Film-only extras are in force — a pure cut is
 * all shared phrases already and names nothing twice — then "saved"; joined
 * with " · ", each segment starting with a capital like every other middot
 * line in the dashboard. "G. Revelli serving · Second serve · Break point".
 * "All points" when nothing is applied.
 */
export function filmListSentence(
  f: {
    shared: MatchFilters;
    remainder: FilmCutRemainder | null;
    savedOnly: boolean;
  },
  names: PhraseNames,
): string {
  const parts = appliedPhrases(f.shared, names);
  if (f.remainder) {
    const label =
      parts.length === 0
        ? f.remainder.label
        : midSentence(f.remainder.label, names);
    parts.push(`${label}, from Statistics`);
  }
  if (f.savedOnly) parts.push("saved");
  return parts.length === 0
    ? "All points"
    : parts.map(capitalizeFirst).join(" · ");
}

/**
 * The strip's one action. Every layer clears at once either way; it reads
 * "Back to all points" while the viewer is still exactly where a
 * statistic's cut put them — a remainder in force, the shared filters equal
 * to the ones its landing wrote (`remainder.landed`), and the saved toggle
 * still off as the landing left it — and "Clear filter" once they have
 * changed anything since.
 */
export function filmStripAction(f: {
  shared: MatchFilters;
  remainder: LandedFilmCut | null;
  savedOnly: boolean;
}): "Clear filter" | "Back to all points" {
  return f.remainder !== null &&
    !f.savedOnly &&
    filtersEqual(f.shared, f.remainder.landed)
    ? "Back to all points"
    : "Clear filter";
}

/**
 * How many points the list would show if `draft` replaced the shared filters
 * — the filters drawer's live footer count ("9 of 114 points") and its
 * "Show 9 points". The list's own rule (`filmListPoints`): the draft's points
 * AND the remainder's extras AND, when on, the saved toggle.
 */
export function filmDraftCount(
  points: MatchPoint[],
  draft: MatchFilters,
  local: FilmLocalFilters,
  ctx: MatchFilterContext,
): number {
  return filmListPoints(applyMatchFilters(points, draft, ctx), local).length;
}

/**
 * "Reid" out of "Marcus Reid" — the list's group-header/pill shorthand.
 * Re-exported under the list's own name; the actual rule (suffixes, doubles
 * partners) lives once in `surname()`.
 */
export const lastNameOf = surname;

/* ── Legacy URL params ───────────────────────────────────────────────────── */

/** Anything with `get`, so `URLSearchParams` and `ReadonlyURLSearchParams` both fit. */
type ParamsReader = { get(name: string): string | null };

/** The pre-T7 quick-cut params: `cut=break|saved` and `serve=you|opp`. */
export const LEGACY_FILM_PARAMS = {
  cut: ["break", "saved"],
  serve: ["you", "opp"],
} as const;

export interface LegacyFilmQuery {
  /** What the legacy params ask of the shared filters. */
  shared: Partial<Pick<MatchFilters, "scoreType" | "server">>;
  savedOnly: boolean;
}

/**
 * The legacy quick-cut params, in the new model: `cut=break` is Score ›
 * Breakpoint and `serve=you|opp` is Serve › Player — both shared filters —
 * and `cut=saved` is the Film-only saved toggle. `null` when the URL carries
 * neither param (or only unknown values), so old links keep working and new
 * ones never touch this path.
 */
export function parseLegacyFilmQuery(
  params: ParamsReader | null | undefined,
): LegacyFilmQuery | null {
  const cut = params?.get("cut") ?? null;
  const serve = params?.get("serve") ?? null;
  const server: PlayerSide | null =
    serve === "you" ? "you" : serve === "opp" ? "opponent" : null;
  const shared: LegacyFilmQuery["shared"] = {
    ...(cut === "break" ? { scoreType: ["breakpoint"] as const } : {}),
    ...(server ? { server } : {}),
  };
  const savedOnly = cut === "saved";
  if (!savedOnly && Object.keys(shared).length === 0) return null;
  return { shared, savedOnly };
}

/** `shared` with a legacy link's filters folded in (Breakpoint added, server set). */
export function withLegacyFilters(
  shared: MatchFilters,
  legacy: LegacyFilmQuery,
): MatchFilters {
  const addBreak =
    legacy.shared.scoreType !== undefined &&
    !shared.scoreType.includes("breakpoint");
  return {
    ...shared,
    scoreType: addBreak
      ? [...shared.scoreType, "breakpoint"]
      : shared.scoreType,
    server: legacy.shared.server ?? shared.server,
  };
}

/**
 * A query string without the legacy params — the shared `?f=` owns them
 * now. Only their legacy VALUES go: the Visualizations view keeps its own
 * `?cut=` (`serve`, `returnPlacement`, …), which is left alone. Every other
 * param is carried through; `current` is never mutated.
 */
export function stripLegacyFilmQuery(
  current: URLSearchParams | string,
): string {
  const next = new URLSearchParams(current.toString());
  for (const [name, values] of Object.entries(LEGACY_FILM_PARAMS)) {
    const value = next.get(name);
    if (value !== null && (values as readonly string[]).includes(value)) {
      next.delete(name);
    }
  }
  return next.toString();
}
