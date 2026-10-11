import type { PersonalOpponent } from "@/lib/data/personal-opponents";
import { opponentBackhandLabel, opponentHandLabel } from "./opponent-style";

/**
 * What the Opponents toolbar does to the list: the view chip, the filter cut
 * and the sort order, as predicates and comparators over the loader's grouped
 * opponents.
 *
 * Pure — no JSX, no React, no client-only import — so a spec can call it
 * (`tests/opponents-views.spec.ts`) and the inert toolbar the skeleton and day
 * zero draw can take its labels from here without pulling client code along.
 *
 * The three steps are independent and applied in one order: chip, then filter,
 * then sort. A chip is a view of the list and a filter is a cut of that view
 * (`reference/tables.md` laws 6 and 7), so the filter's "N of M" reads against
 * the chip's set and never the other way round.
 */

/* ── View chips ──────────────────────────────────────────────────────────── */

export type OpponentView = "all" | "this-season" | "played-3" | "never-beaten";

/** A meeting count at or above this is "Played 3 or more". */
export const PLAYED_OFTEN_MIN = 3;

/** The fixed view switcher, in the order the frame draws it. "All" rests. */
export const OPPONENT_VIEWS: readonly { value: OpponentView; label: string }[] =
  [
    { value: "all", label: "All" },
    { value: "this-season", label: "This season" },
    { value: "played-3", label: "Played 3 or more" },
    { value: "never-beaten", label: "Never beaten" },
  ];

export const DEFAULT_OPPONENT_VIEW: OpponentView = "all";

type ViewFields = Pick<
  PersonalOpponent,
  "played" | "wins" | "playedThisSeason"
>;

/**
 * Whether an opponent belongs to a view.
 *
 * "This season" is at least one meeting in the current `academicSeason()` —
 * the loader counts them into `playedThisSeason`, so the clock stays out of
 * this module. "Never beaten" is `wins === 0`, which includes somebody whose
 * only meetings are still undecided: nobody has beaten them yet either way.
 */
export function matchesOpponentView(
  opponent: ViewFields,
  view: OpponentView,
): boolean {
  switch (view) {
    case "all":
      return true;
    case "this-season":
      return opponent.playedThisSeason > 0;
    case "played-3":
      return opponent.played >= PLAYED_OFTEN_MIN;
    case "never-beaten":
      return opponent.wins === 0;
  }
}

/* ── Filter facets ───────────────────────────────────────────────────────── */

export type OpponentHandFilter = "right" | "left";
export type OpponentBackhandFilter = "one-handed" | "two-handed";

/** `null` is a facet's "Any". */
export interface OpponentFilters {
  hand: OpponentHandFilter | null;
  backhand: OpponentBackhandFilter | null;
}

export type OpponentFacetKey = keyof OpponentFilters;

export const NO_OPPONENT_FILTERS: OpponentFilters = {
  hand: null,
  backhand: null,
};

interface FacetOption<V extends string> {
  /** `null` is the neutral option — choosing it clears the facet. */
  value: V | null;
  /** The segment's label in the panel. */
  label: string;
}

/** Hand: Any · Right · Left. */
export const OPPONENT_HAND_OPTIONS: readonly FacetOption<OpponentHandFilter>[] =
  [
    { value: null, label: "Any" },
    { value: "right", label: "Right" },
    { value: "left", label: "Left" },
  ];

/** Backhand: Any · One-handed · Two-handed. */
export const OPPONENT_BACKHAND_OPTIONS: readonly FacetOption<OpponentBackhandFilter>[] =
  [
    { value: null, label: "Any" },
    { value: "one-handed", label: "One-handed" },
    { value: "two-handed", label: "Two-handed" },
  ];

/** Each facet value as the table's own cell words it — and as the strip does. */
const HAND_PHRASE: Record<OpponentHandFilter, "Right-handed" | "Left-handed"> =
  { right: "Right-handed", left: "Left-handed" };

const BACKHAND_PHRASE: Record<
  OpponentBackhandFilter,
  "One-handed" | "Two-handed"
> = { "one-handed": "One-handed", "two-handed": "Two-handed" };

export function hasOpponentFilters(filters: OpponentFilters): boolean {
  return filters.hand !== null || filters.backhand !== null;
}

type StyleFields = Pick<PersonalOpponent, "hand" | "backhand">;

/**
 * Whether an opponent's hand passes the Hand facet. The stored value is raw
 * and unvalidated, so it is read through the same normaliser the Hand cell
 * uses: a row matches "Left" exactly when its cell reads "Left-handed". A hand
 * nobody recorded matches only "Any".
 */
export function matchesHandFilter(
  opponent: StyleFields,
  hand: OpponentHandFilter | null,
): boolean {
  if (hand === null) return true;
  return opponentHandLabel(opponent.hand) === HAND_PHRASE[hand];
}

/** The Backhand facet, on the same terms as `matchesHandFilter`. */
export function matchesBackhandFilter(
  opponent: StyleFields,
  backhand: OpponentBackhandFilter | null,
): boolean {
  if (backhand === null) return true;
  return opponentBackhandLabel(opponent.backhand) === BACKHAND_PHRASE[backhand];
}

/** Both facets at once — they AND. */
export function matchesOpponentFilters(
  opponent: StyleFields,
  filters: OpponentFilters,
): boolean {
  return (
    matchesHandFilter(opponent, filters.hand) &&
    matchesBackhandFilter(opponent, filters.backhand)
  );
}

/**
 * The cut in words, for the applied strip: "Left-handed · Two-handed". Plain
 * phrases joined by middots, each starting with a capital (law 6); empty when
 * no filter is on.
 */
export function describeOpponentFilters(filters: OpponentFilters): string {
  const phrases: string[] = [];
  if (filters.hand) phrases.push(HAND_PHRASE[filters.hand]);
  if (filters.backhand) phrases.push(BACKHAND_PHRASE[filters.backhand]);
  return phrases.join(" · ");
}

/* ── Sort ────────────────────────────────────────────────────────────────── */

export type OpponentSort = "last-played" | "name" | "most-played";

/**
 * The sort menu, in order. `label` is the menu row; `trigger` is what the
 * toolbar's sort trigger reads while that order is on.
 */
export const OPPONENT_SORTS: readonly {
  value: OpponentSort;
  label: string;
  trigger: string;
}[] = [
  {
    value: "last-played",
    label: "Last played (newest first)",
    trigger: "Last played",
  },
  { value: "name", label: "Name (A–Z)", trigger: "Name (A–Z)" },
  { value: "most-played", label: "Most played", trigger: "Most played" },
];

export const DEFAULT_OPPONENT_SORT: OpponentSort = "last-played";

/** What the sort trigger reads for an order. */
export function opponentSortTriggerLabel(sort: OpponentSort): string {
  return (
    OPPONENT_SORTS.find((option) => option.value === sort) ?? OPPONENT_SORTS[0]
  ).trigger;
}

type SortFields = Pick<PersonalOpponent, "name" | "played"> & {
  lastMatch: Pick<PersonalOpponent["lastMatch"], "date">;
};

/** Newest first; undated last, so a missing date never reads as "most recent". */
function byLastPlayed(a: SortFields, b: SortFields): number {
  const x = a.lastMatch.date;
  const y = b.lastMatch.date;
  if (x === y) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return x < y ? 1 : -1;
}

function byName(a: SortFields, b: SortFields): number {
  return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
}

/**
 * A new array in the chosen order; the input is never mutated.
 *
 * Every order falls back to last-played, so two opponents level on the chosen
 * measure — the same name, the same number of meetings — still land in one
 * predictable place rather than wherever the loader left them.
 */
export function sortOpponents<T extends SortFields>(
  opponents: readonly T[],
  sort: OpponentSort,
): T[] {
  const sorted = [...opponents];
  switch (sort) {
    case "last-played":
      return sorted.sort(byLastPlayed);
    case "name":
      return sorted.sort((a, b) => byName(a, b) || byLastPlayed(a, b));
    case "most-played":
      return sorted.sort((a, b) => b.played - a.played || byLastPlayed(a, b));
  }
}

/* ── The three together ──────────────────────────────────────────────────── */

export interface OpponentCut {
  view: OpponentView;
  filters: OpponentFilters;
  sort: OpponentSort;
}

export const RESTING_OPPONENT_CUT: OpponentCut = {
  view: DEFAULT_OPPONENT_VIEW,
  filters: NO_OPPONENT_FILTERS,
  sort: DEFAULT_OPPONENT_SORT,
};

type CutFields = ViewFields & StyleFields & SortFields;

/**
 * The list a cut leaves, in the order the table draws it, plus the size of the
 * chip's own set — the "M" the filter's "N of M" reads against.
 */
export function applyOpponentCut<T extends CutFields>(
  opponents: readonly T[],
  cut: OpponentCut,
): { visible: T[]; inView: number } {
  const viewed = opponents.filter((opponent) =>
    matchesOpponentView(opponent, cut.view),
  );
  const filtered = viewed.filter((opponent) =>
    matchesOpponentFilters(opponent, cut.filters),
  );
  return {
    visible: sortOpponents(filtered, cut.sort),
    inView: viewed.length,
  };
}

/* ── When a cut leaves nothing ───────────────────────────────────────────── */

const VIEW_CLAUSE: Record<OpponentView, string> = {
  all: "",
  "this-season": " this season",
  "played-3": " played 3 or more times",
  "never-beaten": " you have never beaten",
};

/**
 * The one sentence the table body shows when a chip or filter leaves no rows,
 * naming what emptied it ("No left-handed opponents with a two-handed backhand
 * this season"), and the single way back out: drop the filter if one is on —
 * it is the narrower of the two — otherwise return to All.
 */
export function emptyOpponentCut(cut: Pick<OpponentCut, "view" | "filters">): {
  title: string;
  action: { label: string; undo: Pick<OpponentCut, "view" | "filters"> };
} {
  const { view, filters } = cut;
  const subject = filters.hand
    ? `${HAND_PHRASE[filters.hand].toLowerCase()} opponents`
    : "opponents";
  const backhand = filters.backhand
    ? ` with a ${BACKHAND_PHRASE[filters.backhand].toLowerCase()} backhand`
    : "";
  const title = `No ${subject}${backhand}${VIEW_CLAUSE[view]}`;

  return hasOpponentFilters(filters)
    ? {
        title,
        action: {
          label: "Clear filter",
          undo: { view, filters: NO_OPPONENT_FILTERS },
        },
      }
    : {
        title,
        action: {
          label: "Show all opponents",
          undo: { view: DEFAULT_OPPONENT_VIEW, filters },
        },
      };
}
