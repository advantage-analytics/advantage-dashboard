import {
  MATCH_FILTER_OPTIONS,
  type MatchFilterKey,
  type MatchFilters,
  type PlayerSide,
} from "./model";

/**
 * The applied filters in words — the pure half of the Video tab's filter
 * strip (`film/film-filter-strip.tsx`), kept free of React so a spec can hold
 * it.
 *
 * The design system bans accumulating filter chips (tables.md, Data Table
 * rule 6): a cut reads as ONE sentence in a strip. So each applied value is a
 * lower-case phrase ("second serve", "wide serve", "G. Revelli serving") and
 * the caller joins them with " · ". Only the players' names and the score
 * strings keep their capitals; the caller capitalises the sentence's first
 * letter.
 *
 * Phrases come from the APPLIED filters alone, never from
 * `optionAvailability`: a value the match cannot produce (an `?f=` link
 * carrying Ad-40 onto a video match) is still in force — it is why the cut
 * reads zero points — so it is still named.
 *
 * Serve › Player and Return › Player are one `server` field (the returner is
 * the other player), so they read as ONE phrase, in the Serve reading:
 * "Rudy serving".
 */

export interface PhraseNames {
  you: string;
  opponent: string;
}

function playerName(value: unknown, names: PhraseNames): string {
  return (value as PlayerSide) === "you" ? names.you : names.opponent;
}

/** The catalog label of `value` in `key`, or the value itself if it has none. */
export function optionLabel(key: MatchFilterKey, value: unknown): string {
  const option = (
    MATCH_FILTER_OPTIONS[key] as readonly { value: unknown; label: string }[]
  ).find((o) => o.value === value);
  return option?.label ?? String(value);
}

/** "Forehand" → "forehand"; a single capital ("T") stays as it is. */
function lower(label: string): string {
  return label.length > 1 ? label.toLowerCase() : label;
}

/** "an overhead", "a forehand". */
function article(word: string): string {
  return /^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`;
}

/**
 * How each group reads in the sentence. A bare option label is ambiguous
 * across groups ("slice" is a serve spin and a return spin; "middle" is a
 * return zone and a return contact), so each group says which it is.
 */
const PHRASE: {
  readonly [K in MatchFilterKey]: (
    option: string,
    value: unknown,
    names: PhraseNames,
  ) => string;
} = {
  sets: (_, value) => `set ${String(value)}`,
  scoreType: (option) => lower(option),
  scorePoints: (option) => option,
  server: (_, value, names) => `${playerName(value, names)} serving`,
  court: (option) => `${lower(option)} court`,
  serveType: (option) => lower(option),
  serveSpin: (option) => `${lower(option)} serve`,
  serveZone: (option) => `${lower(option)} serve`,
  returnType: (option) => `${lower(option)} return`,
  returnSpin: (option) => `${lower(option)} return`,
  returnZone: (option) => `${lower(option)} return`,
  returnContact: (option) => `${lower(option)} contact`,
  resultPlayer: (_, value, names) => `${playerName(value, names)}’s result`,
  resultShot: (option) => `ends on ${article(lower(option))}`,
  resultOutcome: (_, value) =>
    value === "won"
      ? "points won"
      : value === "lost"
        ? "points lost"
        : value === "winner"
          ? "winners"
          : "errors",
  customPlayer: (_, value, names) => `a shot by ${playerName(value, names)}`,
  customSide: (option) => `from the ${lower(option)} side`,
  customDirection: (option) => `${lower(option)} shot`,
  customRallyShot: (_, value) => `rally shot ${String(value)}`,
};

/** Catalog position of `value` in `key` (sets: the number itself); unknowns last. */
function orderOf(key: MatchFilterKey, value: unknown): number {
  if (key === "sets") return value as number;
  const at = (
    MATCH_FILTER_OPTIONS[key] as readonly { value: unknown }[]
  ).findIndex((o) => o.value === value);
  return at === -1 ? Number.MAX_SAFE_INTEGER : at;
}

/** The values applied in `key`, in catalog order (sets ascending). */
export function appliedValues(filters: MatchFilters, key: MatchFilterKey) {
  const raw = filters[key] as unknown;
  if (Array.isArray(raw)) {
    return [...(raw as unknown[])].sort(
      (a, b) => orderOf(key, a) - orderOf(key, b),
    );
  }
  return raw === null || raw === undefined ? [] : [raw];
}

/**
 * The order the sentence reads in: the rally's own order — who served and
 * how, the return, then the score it was played at, how it ended and the
 * custom shot — so it reads "G. Revelli serving · second serve · break
 * point" (the approved mock), not the panel's Score-first order. Every key of
 * `MATCH_FILTER_KEYS`, exactly once.
 */
export const SENTENCE_KEYS: readonly MatchFilterKey[] = [
  "server",
  "court",
  "serveType",
  "serveSpin",
  "serveZone",
  "returnType",
  "returnSpin",
  "returnZone",
  "returnContact",
  "sets",
  "scoreType",
  "scorePoints",
  "resultPlayer",
  "resultShot",
  "resultOutcome",
  "customPlayer",
  "customSide",
  "customDirection",
  "customRallyShot",
];

/**
 * One phrase per applied value, in `SENTENCE_KEYS` order, values in catalog
 * order — so the sentence does not reshuffle when the same cut is picked in
 * a different order.
 */
export function appliedPhrases(
  filters: MatchFilters,
  names: PhraseNames,
): string[] {
  const out: string[] = [];
  for (const key of SENTENCE_KEYS) {
    for (const value of appliedValues(filters, key)) {
      out.push(PHRASE[key](optionLabel(key, value), value, names));
    }
  }
  return out;
}

/** "second serve · break point" → "Second serve · break point". */
export function capitalizeFirst(sentence: string): string {
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
