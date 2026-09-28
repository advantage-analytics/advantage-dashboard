import {
  MATCH_FILTER_KEYS,
  MATCH_FILTER_OPTIONS,
  toggleMatchFilter,
  type MatchFilterKey,
  type MatchFilterValue,
  type MatchFilters,
  type PlayerSide,
} from "./model";

/**
 * The applied-filter chips' pure half — one chip per applied value, and what
 * removing one leaves — kept free of React so a spec can hold it. The Video
 * tab draws them (`film/film-list-filters.ts`, `film/point-list.tsx`); the
 * Statistics tab has no filters.
 *
 * Chips come from the APPLIED filters alone, never from `optionAvailability`:
 * a value the match cannot produce (an `?f=` link carrying Ad-40 onto a video
 * match) is still in force — it is why the cut reads zero points — so it
 * still gets a chip, and the chip is how it gets removed.
 *
 * Serve › Player and Return › Player are one `server` field (the returner is
 * the other player), so they draw ONE chip, in the Serve reading: "Rudy
 * serving". Two chips for one field would remove each other.
 */

export interface AppliedChip {
  /** Stable React key: `${key}:${value}`. */
  id: string;
  key: MatchFilterKey;
  value: unknown;
  label: string;
}

export interface ChipNames {
  you: string;
  opponent: string;
}

function playerName(value: unknown, names: ChipNames): string {
  return (value as PlayerSide) === "you" ? names.you : names.opponent;
}

/** The catalog label of `value` in `key`, or the value itself if it has none. */
function optionLabel(key: MatchFilterKey, value: unknown): string {
  const option = (
    MATCH_FILTER_OPTIONS[key] as readonly { value: unknown; label: string }[]
  ).find((o) => o.value === value);
  return option?.label ?? String(value);
}

/**
 * How each group reads as a chip. A bare option label is ambiguous across
 * groups ("Slice" is a serve spin and a return spin; "Middle" is a return
 * zone and a return contact), so each group says which it is.
 */
const CHIP_LABEL: {
  readonly [K in MatchFilterKey]: (
    option: string,
    value: unknown,
    names: ChipNames,
  ) => string;
} = {
  sets: (_, value) => `Set ${String(value)}`,
  scoreType: (option) => option,
  scorePoints: (option) => option,
  server: (_, value, names) => `${playerName(value, names)} serving`,
  court: (option) => `${option} court`,
  serveType: (option) => option,
  serveSpin: (option) => `${option} serve`,
  serveZone: (option) => `${option} serve`,
  returnType: (option) => `${option} return`,
  returnSpin: (option) => `${option} return`,
  returnZone: (option) => `${option} return`,
  returnContact: (option) => `${option} contact`,
  resultPlayer: (_, value, names) => `Result: ${playerName(value, names)}`,
  resultShot: (option) => `Result: ${option}`,
  resultOutcome: (option) => `Result: ${option}`,
  customPlayer: (_, value, names) => `Custom: ${playerName(value, names)}`,
  customSide: (option) => `Custom: ${option}`,
  customDirection: (option) => `Custom: ${option}`,
  customRallyShot: (_, value) => `Rally shot ${String(value)}`,
};

/** Catalog position of `value` in `key` (sets: the number itself); unknowns last. */
function orderOf(key: MatchFilterKey, value: unknown): number {
  if (key === "sets") return value as number;
  const at = (
    MATCH_FILTER_OPTIONS[key] as readonly { value: unknown }[]
  ).findIndex((o) => o.value === value);
  return at === -1 ? Number.MAX_SAFE_INTEGER : at;
}

/**
 * One chip per applied value, in panel order: groups in `MATCH_FILTER_KEYS`
 * order, values in catalog order (sets ascending) — so the strip does not
 * reshuffle when the same cut is picked in a different order.
 */
export function appliedChips(
  filters: MatchFilters,
  names: ChipNames,
): AppliedChip[] {
  const chips: AppliedChip[] = [];
  for (const key of MATCH_FILTER_KEYS) {
    const raw = filters[key] as unknown;
    const values: unknown[] = Array.isArray(raw)
      ? [...raw].sort((a, b) => orderOf(key, a) - orderOf(key, b))
      : raw === null || raw === undefined
        ? []
        : [raw];
    for (const value of values) {
      chips.push({
        id: `${key}:${String(value)}`,
        key,
        value,
        label: CHIP_LABEL[key](optionLabel(key, value), value, names),
      });
    }
  }
  return chips;
}

/**
 * `filters` without `chip`'s value. A value no longer applied (a stale chip
 * clicked twice) leaves `filters` as it is rather than toggling it back on.
 */
export function removeChip(
  filters: MatchFilters,
  chip: Pick<AppliedChip, "key" | "value">,
): MatchFilters {
  const current = filters[chip.key] as unknown;
  const applied = Array.isArray(current)
    ? current.includes(chip.value)
    : current === chip.value;
  if (!applied) return filters;
  return toggleMatchFilter(
    filters,
    chip.key,
    chip.value as MatchFilterValue<typeof chip.key>,
  );
}
