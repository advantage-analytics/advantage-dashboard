import {
  SEASON_HAND_PARAM,
  SEASON_MATCH_PARAM,
  SEASON_RESULT_PARAM,
  SEASON_SURFACE_PARAM,
  VIZ_OPTION_KEYS,
  paramFor,
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
 * state. A value that is not a short plain token is sent as "other", so text
 * typed into the address bar never reaches an event.
 */

/** Parameters quoted as they are: every value is one of a few fixed words. */
const QUOTED_PARAMS: readonly string[] = [
  "cut",
  "chart",
  ...VIZ_OPTION_KEYS.map(paramFor),
  SEASON_HAND_PARAM,
  SEASON_RESULT_PARAM,
  SEASON_SURFACE_PARAM,
];

/** Parameters sent as a count: which sets or matches is nobody's business. */
const COUNTED_PARAMS: readonly string[] = ["vset", SEASON_MATCH_PARAM];

const PLAIN_TOKEN = /^[A-Za-z0-9_-]{1,32}$/;

export interface VizFilterChange {
  filter_name: string;
  value: string;
}

/** A parameter's values as one comparable, sendable word. */
function quoted(params: URLSearchParams, name: string): string {
  const values = params
    .getAll(name)
    .filter(Boolean)
    .map((value) => (PLAIN_TOKEN.test(value) ? value : "other"))
    .sort();
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
  for (const name of QUOTED_PARAMS) {
    const after = quoted(next, name);
    if (quoted(prev, name) !== after) {
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
