import { normalizedPersonName } from "@/lib/data/person-name";
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
 *
 * ── One row type, two pages ─────────────────────────────────────────────────
 * Every predicate reads a `Pick` of the fields it needs, so the personal
 * page's `PersonalOpponent` and the team page's `TeamOpponent` both pass
 * through the same functions. The two team-only facets — Program and Faced by
 * — read fields a personal row does not carry (`ProgramFields`,
 * `FacedByFields`, all optional): a personal row simply never matches a
 * program or a roster player, and the personal toolbar never offers either.
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
  "played" | "wins" | "losses" | "playedThisSeason"
>;

/**
 * Whether an opponent belongs to a view.
 *
 * "This season" is at least one meeting in the current `academicSeason()` —
 * the loader counts them into `playedThisSeason`, so the clock stays out of
 * this module. "Never beaten" is no wins and at least one loss:
 * somebody whose only meetings are still undecided (0-0) has not beaten the
 * viewer either, and listing them would read as a losing record.
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
      return opponent.wins === 0 && opponent.losses > 0;
  }
}

/* ── Filter facets ───────────────────────────────────────────────────────── */

export type OpponentHandFilter = "right" | "left";
export type OpponentBackhandFilter = "one-handed" | "two-handed";

/**
 * `null` is a segmented facet's "Any"; an empty list is a checklist facet's.
 * Within a checklist the ticked values OR; the facets AND with each other.
 */
export interface OpponentFilters {
  hand: OpponentHandFilter | null;
  backhand: OpponentBackhandFilter | null;
  /** Team page only — `opponentProgramKey` values. */
  programs: readonly string[];
  /** Team page only — roster `playerId`s. */
  facedBy: readonly string[];
}

/** The two-or-three-option facets, drawn as segmented rows. */
export type OpponentSegmentedFacetKey = "hand" | "backhand";
/** The open, data-driven facets, drawn as checklists. */
export type OpponentChecklistFacetKey = "programs" | "facedBy";
export type OpponentFacetKey =
  OpponentSegmentedFacetKey | OpponentChecklistFacetKey;

export const NO_OPPONENT_FILTERS: OpponentFilters = {
  hand: null,
  backhand: null,
  programs: [],
  facedBy: [],
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
  return (
    filters.hand !== null ||
    filters.backhand !== null ||
    filters.programs.length > 0 ||
    filters.facedBy.length > 0
  );
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

/* ── Program and Faced by — the team page's two checklist facets ─────────── */

/** One checklist row: the value the filter stores and the words beside it. */
export interface OpponentFacetChoice {
  value: string;
  label: string;
}

/** Where an opponent plays, as far as the Program facet reads it. */
interface ProgramFields {
  /** The directory program on their matches, when one was chosen. */
  program?: { id: string; schoolName: string } | null;
  /** The school as somebody typed it — only ever set when `program` is null. */
  school?: string | null;
}

/** Who on the roster met them, as far as the Faced-by facet reads it. */
interface FacedByFields {
  facedBy?: readonly { playerId: string; name: string }[];
}

/** The Program facet's value for an opponent with neither program nor school. */
export const NO_PROGRAM_KEY = "none";
export const NO_PROGRAM_LABEL = "No team";

/**
 * The Program facet's value for one opponent.
 *
 * A directory program is keyed by id. A school somebody typed, with no
 * directory program behind it, is a place of its own and is keyed by its
 * normalised name — the rule `teamOpponentTotals` counts programs by, so the
 * facet lists exactly as many places as the title row's "P programs" says. It
 * is never folded into "No team": that option means nobody has said where the
 * opponent plays at all.
 */
export function opponentProgramKey(opponent: ProgramFields): string {
  if (opponent.program) return `id:${opponent.program.id}`;
  const school = opponent.school?.trim();
  if (school) return `name:${normalizedPersonName(school)}`;
  return NO_PROGRAM_KEY;
}

function byLabel(a: OpponentFacetChoice, b: OpponentFacetChoice): number {
  return a.label.localeCompare(b.label, "en", { sensitivity: "base" });
}

/**
 * The Program checklist: one row per place the listed opponents play, A–Z,
 * then "No team" last — always offered, so the cut "nobody has said where they
 * play" is reachable whichever rows the loader sent.
 */
export function opponentProgramChoices(
  opponents: readonly ProgramFields[],
): OpponentFacetChoice[] {
  const labels = new Map<string, string>();
  for (const opponent of opponents) {
    const key = opponentProgramKey(opponent);
    if (key === NO_PROGRAM_KEY || labels.has(key)) continue;
    labels.set(
      key,
      opponent.program?.schoolName ?? opponent.school?.trim() ?? "",
    );
  }
  return [
    ...[...labels].map(([value, label]) => ({ value, label })).sort(byLabel),
    { value: NO_PROGRAM_KEY, label: NO_PROGRAM_LABEL },
  ];
}

/** The Faced-by checklist: one row per roster player on any listed row, A–Z. */
export function opponentFacedByChoices(
  opponents: readonly FacedByFields[],
): OpponentFacetChoice[] {
  const names = new Map<string, string>();
  for (const opponent of opponents) {
    for (const player of opponent.facedBy ?? []) {
      if (!names.has(player.playerId)) names.set(player.playerId, player.name);
    }
  }
  return [...names].map(([value, label]) => ({ value, label })).sort(byLabel);
}

/** Program: nothing ticked keeps everybody; otherwise any ticked place. */
export function matchesProgramFilter(
  opponent: ProgramFields,
  programs: readonly string[],
): boolean {
  if (programs.length === 0) return true;
  return programs.includes(opponentProgramKey(opponent));
}

/**
 * Faced by: nothing ticked keeps everybody; otherwise an opponent any ticked
 * roster player has met. A row with no `facedBy` — every personal row —
 * matches nobody.
 */
export function matchesFacedByFilter(
  opponent: FacedByFields,
  facedBy: readonly string[],
): boolean {
  if (facedBy.length === 0) return true;
  return (opponent.facedBy ?? []).some((p) => facedBy.includes(p.playerId));
}

/** A checklist tick flipped: a new list, in the order the ticks were made. */
export function toggleFacetValue(
  values: readonly string[],
  value: string,
): string[] {
  return values.includes(value)
    ? values.filter((v) => v !== value)
    : [...values, value];
}

type FilterFields = StyleFields & ProgramFields & FacedByFields;

/** Every facet at once — they AND. */
export function matchesOpponentFilters(
  opponent: FilterFields,
  filters: OpponentFilters,
): boolean {
  return (
    matchesHandFilter(opponent, filters.hand) &&
    matchesBackhandFilter(opponent, filters.backhand) &&
    matchesProgramFilter(opponent, filters.programs) &&
    matchesFacedByFilter(opponent, filters.facedBy)
  );
}

/** The ticked values as their labels, in the checklist's own order. */
function chosenLabels(
  values: readonly string[],
  choices: readonly OpponentFacetChoice[] | undefined,
): string[] {
  const known = (choices ?? []).filter((c) => values.includes(c.value));
  return known.map((c) => c.label);
}

/**
 * The cut in words, for the applied strip: "Faced by Ana Ruiz · No team ·
 * Left-handed · Two-handed". Plain phrases joined by middots, each starting
 * with a capital (law 6); empty when no filter is on.
 *
 * `choices` are the checklists the panel drew, so a ticked program or player
 * is named rather than counted. Several ticks in one facet read as one phrase
 * joined by "or", because that is how they combine.
 */
export function describeOpponentFilters(
  filters: OpponentFilters,
  choices: {
    programs?: readonly OpponentFacetChoice[];
    facedBy?: readonly OpponentFacetChoice[];
  } = {},
): string {
  const phrases: string[] = [];
  if (filters.facedBy.length > 0) {
    const names = chosenLabels(filters.facedBy, choices.facedBy);
    phrases.push(
      names.length > 0
        ? `Faced by ${names.join(" or ")}`
        : `Faced by ${filters.facedBy.length} of the roster`,
    );
  }
  if (filters.programs.length > 0) {
    const names = chosenLabels(filters.programs, choices.programs);
    phrases.push(
      names.length > 0
        ? names.join(" or ")
        : `Program is one of ${filters.programs.length}`,
    );
  }
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

type CutFields = ViewFields & FilterFields & SortFields;

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
  // A program or a roster player is named in the strip above the table, not
  // repeated here: the sentence would run past the card on three ticks.
  const checklist =
    filters.programs.length > 0 || filters.facedBy.length > 0
      ? " in this filter"
      : "";
  const title = `No ${subject}${backhand}${VIEW_CLAUSE[view]}${checklist}`;

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

/* ── The count lines ─────────────────────────────────────────────────────── */

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** The personal title row's subline: "10 opponents · 31 matches · 18 won". */
export function personalOpponentsSubline(totals: {
  opponents: number;
  matches: number;
  won: number;
}): string {
  return [
    count(totals.opponents, "opponent", "opponents"),
    count(totals.matches, "match", "matches"),
    `${totals.won} won`,
  ].join(" · ");
}

/** The team title row's subline: "7 opponents · 4 programs · 23 matches". */
export function teamOpponentsSubline(totals: {
  opponents: number;
  programs: number;
  matches: number;
}): string {
  return [
    count(totals.opponents, "opponent", "opponents"),
    count(totals.programs, "program", "programs"),
    count(totals.matches, "match", "matches"),
  ].join(" · ");
}

/**
 * The team footer: "7 of 7 opponents · 18 of 23 matches analyzed", plus the
 * matches nobody on the roster is recorded as playing, when there are any —
 * they are in none of the figures before it.
 */
export function teamOpponentsFooter(
  shown: number,
  totals: {
    opponents: number;
    matches: number;
    analyzed: number;
    unattributed: number;
  },
): string {
  const line = `${shown} of ${count(totals.opponents, "opponent", "opponents")} · ${totals.analyzed} of ${count(totals.matches, "match", "matches")} analyzed`;
  return totals.unattributed > 0
    ? `${line} · ${count(totals.unattributed, "more match", "more matches")} with no roster player`
    : line;
}
