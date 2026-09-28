import type { MatchPoint } from "@/lib/data/match-points-server";

import {
  appliedChips,
  type AppliedChip,
  type ChipNames,
} from "../match-filters/applied-chips";
import {
  activeFilterCount,
  EMPTY_MATCH_FILTERS,
  MATCH_FILTER_KEYS,
  type MatchFilterContext,
  type MatchFilters,
  type PlayerSide,
} from "../match-filters/model";
import {
  applyFilmCut,
  hasFilmCut,
  type FilmCutIntent,
} from "../film-cut-context";

/**
 * What the Film tab's point list is filtered by (T7), in three layers ANDed
 * together:
 *
 * 1. `shared` — the match report's `MatchFilters` (`MatchFiltersProvider`),
 *    the same state the Statistics tab reads and `?f=` mirrors. Film edits it
 *    through the quick menu and the Advanced panel (`FiltersPanel`).
 * 2. `cut` — a statistic's one-off cut (`film-cut-context.tsx`), Film only:
 *    one removable chip, never written to the shared state.
 * 3. `savedOnly` — the viewer's bookmarks, a Film-only local toggle: it is
 *    about the viewer, not about the tennis, so it is not a match filter.
 *
 * Pure logic, no React and no `next/navigation`, so specs import it directly
 * and the film subtree stays loadable offline.
 */

/** The Film-only half of the list's filters — held by `film-tab.tsx`. */
export interface FilmLocalFilters {
  cut: FilmCutIntent | null;
  savedOnly: boolean;
}

export const NO_FILM_LOCAL_FILTERS: FilmLocalFilters = Object.freeze({
  cut: null,
  savedOnly: false,
});

/**
 * Everything the list's header, quick menu and chips need: the three layers
 * and the one writer for each. `film-tab.tsx` builds ONE of these and hands
 * the same object to both `PointList` mounts (the report column and the
 * fullscreen room's drawer), so the two can never show different cuts.
 */
export interface FilmListFilters {
  shared: MatchFilters;
  setShared: (next: MatchFilters) => void;
  cut: FilmCutIntent | null;
  clearCut: () => void;
  savedOnly: boolean;
  setSavedOnly: (next: boolean) => void;
  /** All three layers at once — the header's and the zero state's "Clear all". */
  clearAll: () => void;
}

const noop = () => {};

/** Nothing filtered and nothing to change — a list mounted without a Film tab. */
export const INERT_FILM_LIST_FILTERS: FilmListFilters = Object.freeze({
  shared: EMPTY_MATCH_FILTERS,
  setShared: noop,
  cut: null,
  clearCut: noop,
  savedOnly: false,
  setSavedOnly: noop,
  clearAll: noop,
});

/**
 * The Film list's points: the shared filters' points (`sharedPoints`, i.e.
 * `useMatchFilters().filteredPoints`) AND the statistic's cut AND, when on,
 * the saved toggle. `points` is the whole match in match order, which the
 * cut's own `MatchFilters` half is evaluated over. Nothing Film-only applied
 * returns `sharedPoints` itself.
 */
export function filmListPoints(
  points: MatchPoint[],
  sharedPoints: MatchPoint[],
  local: FilmLocalFilters,
  ctx: MatchFilterContext,
): MatchPoint[] {
  const cut = applyFilmCut(points, sharedPoints, local.cut?.cut ?? null, ctx);
  return local.savedOnly ? cut.filter((p) => p.saved) : cut;
}

/**
 * Land a statistic's cut: the cut becomes the Film-only lens and the saved
 * toggle goes off (the card counted every point, bookmarked or not). `shared`
 * comes back as the SAME object — a cut is never written to the shared
 * filters. An empty cut (`{}`, a whole-match row) lands as no cut at all.
 */
export function landFilmCut(
  state: { shared: MatchFilters; local: FilmLocalFilters },
  intent: FilmCutIntent,
): { shared: MatchFilters; local: FilmLocalFilters } {
  return {
    shared: state.shared,
    local: { cut: hasFilmCut(intent.cut) ? intent : null, savedOnly: false },
  };
}

/** Whether any of the three layers is on. */
export function filmListActive(f: {
  shared: MatchFilters;
  cut: FilmCutIntent | null;
  savedOnly: boolean;
}): boolean {
  return activeFilterCount(f.shared) > 0 || f.cut !== null || f.savedOnly;
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

/** Whether `shared` holds nothing beyond the quick menu's own two groups. */
function quickOnly(shared: MatchFilters): boolean {
  return MATCH_FILTER_KEYS.every((key) => {
    if (key === "server") return true;
    if (key === "scoreType") {
      return (
        shared.scoreType.length === 0 ||
        (shared.scoreType.length === 1 && shared.scoreType[0] === "breakpoint")
      );
    }
    const v = shared[key] as unknown;
    return Array.isArray(v) ? v.length === 0 : v === null;
  });
}

/**
 * The quick-menu trigger's name for what is applied: the menu's own labels
 * where the menu could have made it ("Break points · Reid serving"),
 * "Filtered" once a cut or any other group is involved, "All points" when
 * nothing is.
 */
export function filmListName(
  f: { shared: MatchFilters; cut: FilmCutIntent | null; savedOnly: boolean },
  names: ChipNames,
): string {
  if (f.cut !== null || !quickOnly(f.shared)) return "Filtered";
  const show = quickShow(f);
  const showName =
    show === "saved" ? "Saved only" : show === "break" ? "Break points" : null;
  const server = f.shared.server;
  const serverName =
    server === null ? null : `${playerNameOf(server, names)} serving`;
  if (showName && serverName) return `${showName} · ${serverName}`;
  return showName ?? serverName ?? "All points";
}

function playerNameOf(side: PlayerSide, names: ChipNames): string {
  return side === "you" ? names.you : names.opponent;
}

/**
 * Every applied layer as chips, in reading order: saved, the statistic's
 * cut, then the shared filters in panel order. `kind` says which layer a chip
 * removes — the cut chip clears only the cut.
 */
export type FilmListChip =
  | { kind: "saved"; id: "saved"; label: string }
  | { kind: "cut"; id: "cut"; label: string }
  | { kind: "shared"; id: string; label: string; chip: AppliedChip };

export function filmListChips(
  f: { shared: MatchFilters; cut: FilmCutIntent | null; savedOnly: boolean },
  names: ChipNames,
): FilmListChip[] {
  const out: FilmListChip[] = [];
  if (f.savedOnly) out.push({ kind: "saved", id: "saved", label: "Saved" });
  if (f.cut) out.push({ kind: "cut", id: "cut", label: f.cut.label });
  for (const chip of appliedChips(f.shared, names)) {
    out.push({ kind: "shared", id: chip.id, label: chip.label, chip });
  }
  return out;
}

/**
 * The applied layers in words, for the zero state: "Saved, Aces · Reid,
 * Breakpoint". The same labels as the chips, so the sentence and the strip
 * above it cannot disagree.
 */
export function filmListSentence(
  f: { shared: MatchFilters; cut: FilmCutIntent | null; savedOnly: boolean },
  names: ChipNames,
): string {
  const labels = filmListChips(f, names).map((chip) => chip.label);
  return labels.length === 0 ? "All points" : labels.join(", ");
}

/** "Reid" out of "Marcus Reid" — the list's group-header/pill shorthand. */
export function lastNameOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : name;
}

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
