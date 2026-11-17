import type { Chart, Cut, PlayerFilter } from "./viz-model";
import {
  OPPONENT_HAND_FILTERS,
  OPTIONS,
  SEASON_HAND_PARAM,
  SEASON_MATCH_PARAM,
  SEASON_RESULT_FILTERS,
  SEASON_RESULT_PARAM,
  SEASON_SURFACES,
  SEASON_SURFACE_PARAM,
  paramFor,
  urlValueFor,
} from "./viz-url";

/**
 * Which Visualizations controls moved between two URLs, as `filter_changed`
 * payloads. The viz state lives in the query string (`viz-url.ts`), so the
 * URL is the one place every control's change can be read without wiring an
 * event into each menu and pill.
 *
 * Privacy (src/lib/analytics.ts): only parameters whose values are a fixed
 * vocabulary are quoted — a cut, a chart, an option pill. Sets and season
 * matches send how many are picked, never which. Saved views, drafts and the
 * advanced filter blob are left out: their values are ids and free-form
 * state. A quoted value is sent only when it is one of that control's own
 * words; anything else — the URL is editable — is sent as "other", so text
 * typed into the address bar never reaches an event.
 */

// Keyed by the type, so a cut or chart added to `viz-model.ts` fails to
// compile here until it is listed.
const CUTS = {
  serve: true,
  returnPlacement: true,
  returnContact: true,
  rallyPosition: true,
  rallyPlacement: true,
  errors: true,
  approaches: true,
} satisfies Record<Cut, true>;
const CHARTS = {
  scatter: true,
  zones: true,
  heat: true,
} satisfies Record<Chart, true>;
const PLAYERS = { you: true, opponent: true } satisfies Record<
  PlayerFilter,
  true
>;

/**
 * Parameters quoted as they are, each with the only words it may carry: the
 * URL name → that control's vocabulary.
 */
const QUOTED_PARAMS: ReadonlyMap<string, ReadonlySet<string>> = new Map<
  string,
  ReadonlySet<string>
>([
  ["cut", new Set(Object.keys(CUTS))],
  ["chart", new Set(Object.keys(CHARTS))],
  ...Object.entries(OPTIONS).map(
    ([key, words]): [string, ReadonlySet<string>] => [
      paramFor(key),
      new Set(
        key === "player"
          ? Object.keys(PLAYERS)
          : Object.keys(words).map((word) => urlValueFor(key, word)),
      ),
    ],
  ),
  [SEASON_HAND_PARAM, new Set<string>(OPPONENT_HAND_FILTERS)],
  [SEASON_RESULT_PARAM, new Set<string>(SEASON_RESULT_FILTERS)],
  [SEASON_SURFACE_PARAM, new Set<string>(SEASON_SURFACES)],
]);

/** Parameters sent as a count: which sets or matches is nobody's business. */
const COUNTED_PARAMS: readonly string[] = ["vset", SEASON_MATCH_PARAM];

export interface VizFilterChange {
  filter_name: string;
  value: string;
}

/** A parameter's values as one comparable, sendable word. */
function quoted(
  params: URLSearchParams,
  name: string,
  words: ReadonlySet<string>,
): string {
  const values = [
    ...new Set(
      params
        .getAll(name)
        .filter(Boolean)
        .map((value) => (words.has(value) ? value : "other")),
    ),
  ].sort();
  return values.length === 0 ? "any" : values.join("+");
}

/** How many values a parameter carries, as a word. */
function counted(params: URLSearchParams, name: string): string {
  return String(params.getAll(name).filter(Boolean).length);
}

/** One entry per control whose value differs between `prev` and `next`. */
export function vizFilterChanges(
  prev: URLSearchParams,
  next: URLSearchParams,
): VizFilterChange[] {
  const changes: VizFilterChange[] = [];
  for (const [name, words] of QUOTED_PARAMS) {
    const after = quoted(next, name, words);
    if (quoted(prev, name, words) !== after) {
      changes.push({ filter_name: name, value: after });
    }
  }
  for (const name of COUNTED_PARAMS) {
    // Compared as written, so swapping one set for another still counts as a
    // change; the count is what is sent.
    if (prev.getAll(name).join(",") !== next.getAll(name).join(",")) {
      changes.push({ filter_name: name, value: counted(next, name) });
    }
  }
  return changes;
}
