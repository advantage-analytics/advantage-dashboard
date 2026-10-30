import type { AskRow } from "@/lib/services/ask/answer-render";
import { askCounterSelect, askCounterSql } from "@/lib/services/ask/measures";

/**
 * The comparisons: three questions the planner used to write SQL for and now
 * only chooses.
 *
 * "How did Rudy do against Aidan Kim?" came back with the opponent's
 * first-serve points won as 100% — the planner had divided the wrong pair of
 * counters, the value was inside 0–100, and nothing could catch it. The same
 * match under another wording printed 71.4%. The review (`review.ts`) never
 * had that fault, because its query is a constant. So the three comparisons
 * people ask for most are constants too:
 *
 *   - `opponent` — one row of `me_x` / `opp_x`: the player's (or program's)
 *     figures beside the opponents' over the matches in scope.
 *   - `players`  — team scope: one row per `player_name` with `group_matches`
 *     and the measures.
 *   - `baseline` — one row of `x` / `all_x` (personal) or `x` / `team_x`
 *     (team): the scoped figures beside the same over every match.
 *
 * The planner replies `{"compare": kind, "scope_sql", "measures"?}` and writes
 * no sql. Each query below is built once from `ASK_COMPARE_MEASURES`, passes
 * `checkAskSql` (`tests/ask-compare.spec.ts` holds each there) and runs
 * through the same `ask_run_query` / `ask_run_team_query` as any other, so
 * the views still decide whose rows it reads. Every query computes every
 * measure; which of them an answer shows is chosen afterwards, in code
 * (`selectCompareMeasures`), from what the question names.
 *
 * Percentages are pooled — summed made over summed attempts. A count is a
 * SUM in the opponent comparison, where both sides played the same matches,
 * and a PER-MATCH MEAN (`<measure>_per_match`) in the other two, where the
 * sides played different numbers of matches.
 *
 * Pure: no database, no network, no Next.js.
 */

export type AskCompareKind = "opponent" | "players" | "baseline";

export const ASK_COMPARE_KINDS: readonly AskCompareKind[] = [
  "opponent",
  "players",
  "baseline",
];

export type AskCompareGroup =
  "serve" | "return" | "pressure" | "rallies" | "net" | "points";

export const ASK_COMPARE_GROUPS: readonly AskCompareGroup[] = [
  "serve",
  "return",
  "pressure",
  "rallies",
  "net",
  "points",
];

export interface AskCompareMeasure {
  /** The measure's bare name. A percentage ends in `_pct`; anything else is a count. */
  key: string;
  /** `match_stats` counters summed for the value: a percentage's numerator, or the count itself. */
  numerator: readonly string[];
  /** The summed counters a percentage divides by; absent for a count. */
  denominator?: readonly string[];
  /** The groups a planner or a question can name it by. */
  groups: readonly AskCompareGroup[];
  /** True for the measures a comparison shows when nothing narrower was asked. */
  standard: boolean;
}

/** In the order a reader expects: serve, return, pressure, strokes, points, rallies, net. */
export const ASK_COMPARE_MEASURES: readonly AskCompareMeasure[] = [
  {
    key: "first_serve_pct",
    numerator: ["first_serves_in"],
    denominator: ["first_serves"],
    groups: ["serve"],
    standard: true,
  },
  {
    key: "first_serve_won_pct",
    numerator: ["first_serve_points_won"],
    denominator: ["first_serves_in"],
    groups: ["serve"],
    standard: true,
  },
  {
    key: "second_serve_won_pct",
    numerator: ["second_serve_points_won"],
    denominator: ["second_serves_in"],
    groups: ["serve"],
    standard: true,
  },
  { key: "aces", numerator: ["aces"], groups: ["serve"], standard: true },
  {
    key: "double_faults",
    numerator: ["double_faults"],
    groups: ["serve"],
    standard: true,
  },
  {
    key: "return_won_pct",
    numerator: ["first_return_points_won", "second_return_points_won"],
    denominator: ["first_returns", "second_returns"],
    groups: ["return"],
    standard: true,
  },
  {
    key: "first_return_won_pct",
    numerator: ["first_return_points_won"],
    denominator: ["first_returns"],
    groups: ["return"],
    standard: false,
  },
  {
    key: "second_return_won_pct",
    numerator: ["second_return_points_won"],
    denominator: ["second_returns"],
    groups: ["return"],
    standard: false,
  },
  {
    key: "break_points_converted_pct",
    numerator: ["break_points_converted"],
    denominator: ["break_point_opportunities"],
    groups: ["return", "pressure"],
    standard: false,
  },
  {
    key: "break_points_converted",
    numerator: ["break_points_converted"],
    groups: ["pressure"],
    standard: true,
  },
  {
    key: "break_point_opportunities",
    numerator: ["break_point_opportunities"],
    groups: ["pressure"],
    standard: true,
  },
  {
    key: "break_points_saved_pct",
    numerator: ["break_points_saved"],
    denominator: ["break_points_faced"],
    groups: ["pressure"],
    standard: false,
  },
  {
    key: "break_points_faced",
    numerator: ["break_points_faced"],
    groups: [],
    standard: false,
  },
  {
    key: "winners",
    numerator: ["winners"],
    groups: ["points"],
    standard: true,
  },
  {
    // Only when asked for by name. Where nobody judged the split this holds
    // every error, so it sums two meanings across a mix of matches; `errors`
    // below is the one a comparison shows by default.
    key: "unforced_errors",
    numerator: ["unforced_errors"],
    groups: [],
    standard: false,
  },
  {
    key: "forced_errors",
    numerator: ["forced_errors"],
    groups: [],
    standard: false,
  },
  {
    // Every error, judged or not: unforced + coalesce(forced, 0), the derived
    // counter in `measures.ts` (both columns are in ask.match_stats).
    key: "errors",
    numerator: ["errors"],
    groups: ["points"],
    standard: true,
  },
  {
    key: "total_points_won_pct",
    numerator: ["total_points_won"],
    denominator: ["total_points"],
    groups: ["points"],
    standard: true,
  },
  {
    key: "short_rally_won_pct",
    numerator: ["short_rally_won"],
    denominator: ["short_rally_total"],
    groups: ["rallies"],
    standard: true,
  },
  {
    key: "medium_rally_won_pct",
    numerator: ["medium_rally_won"],
    denominator: ["medium_rally_total"],
    groups: ["rallies"],
    standard: true,
  },
  {
    key: "long_rally_won_pct",
    numerator: ["long_rally_won"],
    denominator: ["long_rally_total"],
    groups: ["rallies"],
    standard: true,
  },
  {
    key: "long_rally_total",
    numerator: ["long_rally_total"],
    groups: [],
    standard: false,
  },
  {
    key: "net_points_won_pct",
    numerator: ["net_points_won"],
    denominator: ["net_points_appearances"],
    groups: ["net"],
    standard: false,
  },
  {
    key: "net_points_appearances",
    numerator: ["net_points_appearances"],
    groups: ["net"],
    standard: false,
  },
];

const BY_KEY = new Map(
  ASK_COMPARE_MEASURES.map((measure) => [measure.key, measure]),
);

/** The column a measure is returned under: a count that is a per-match mean says so in its name. */
export function compareColumn(
  measure: AskCompareMeasure,
  kind: AskCompareKind,
  perMatch = false,
): string {
  return measure.denominator || (kind === "opponent" && !perMatch)
    ? measure.key
    : `${measure.key}_per_match`;
}

/** The prefix a baseline's columns wear: every match of the player's, or of the program's. */
export function compareBaselinePrefix(team: boolean): "all_" | "team_" {
  return team ? "team_" : "all_";
}

// ── The canned queries ───────────────────────────────────────────────────────

/** A match-stats row with nothing recorded is not a match with statistics. */
const HAS_STATS = "(s.total_points > 0 or s.first_serves > 0)";

const COUNTERS = [
  ...new Set(
    ASK_COMPARE_MEASURES.flatMap((measure) => [
      ...measure.numerator,
      ...(measure.denominator ?? []),
    ]),
  ),
];

function total(
  counters: readonly string[],
  column: (c: string) => string,
): string {
  const sum = counters.map(column).join(" + ");
  return counters.length > 1 ? `(${sum})` : sum;
}

/** A measure's value over one aggregate row: `column` names a summed counter, `n` the matches. */
function value(
  measure: AskCompareMeasure,
  perMatch: boolean,
  column: (counter: string) => string,
  n: string,
): string {
  if (measure.denominator) {
    return `round(100.0 * ${total(measure.numerator, column)} / nullif(${total(measure.denominator, column)}, 0), 1)`;
  }
  return perMatch
    ? `round(1.0 * ${total(measure.numerator, column)} / nullif(${n}, 0), 1)`
    : total(measure.numerator, column);
}

function buildOpponentSql(): string {
  const columns = ASK_COMPARE_MEASURES.flatMap((measure) => {
    const sides = (expression: string, name: string) => [
      `max(case when a.side = 'me' then ${expression} end) as me_${name}`,
      `max(case when a.side = 'opponent' then ${expression} end) as opp_${name}`,
    ];
    const column = (c: string) => `a.${c}`;
    return [
      ...sides(value(measure, false, column, "a.n"), measure.key),
      // A count is also returned as a per-match mean, for a question that
      // asks "per match" or "on average".
      ...(measure.denominator
        ? []
        : sides(
            value(measure, true, column, "a.n"),
            `${measure.key}_per_match`,
          )),
    ];
  });
  return [
    "with agg as (",
    "select s.side, count(*) as n,",
    COUNTERS.map(
      (counter) => `sum(${askCounterSql(counter, "s")}) as ${counter}`,
    ).join(", "),
    "from ask.match_stats s",
    `where s.match_id in (select match_id from scope) and s.side in ('me', 'opponent') and ${HAS_STATS}`,
    "group by s.side",
    ")",
    `select ${columns.join(", ")} from agg a`,
  ].join(" ");
}

function buildPlayersSql(): string {
  const columns = ASK_COMPARE_MEASURES.map(
    (measure) =>
      `${value(measure, true, (c) => `a.${c}`, "a.n")} as ${compareColumn(measure, "players")}`,
  );
  return [
    "with agg as (",
    "select m.player_name, count(*) as n,",
    COUNTERS.map(
      (counter) => `sum(${askCounterSql(counter, "s")}) as ${counter}`,
    ).join(", "),
    "from ask.match_stats s join ask.matches m on m.match_id = s.match_id",
    `where s.side = 'me' and s.match_id in (select match_id from scope) and m.player_name is not null and ${HAS_STATS}`,
    "group by m.player_name",
    ")",
    `select a.player_name, a.n as group_matches, ${columns.join(", ")}`,
    `from agg a order by a.n desc, a.player_name limit ${MAX_ASK_COMPARE_PLAYERS}`,
  ].join(" ");
}

function buildBaselineSql(prefix: string): string {
  const columns = ASK_COMPARE_MEASURES.flatMap((measure) => {
    const name = compareColumn(measure, "baseline");
    return [
      `${value(measure, true, (c) => `a.scope_${c}`, "a.scope_n")} as ${name}`,
      `${value(measure, true, (c) => `a.all_${c}`, "a.all_n")} as ${prefix}${name}`,
    ];
  });
  // How many matches with statistics each side covers, under names the
  // pairing convention does not read as a measure and its baseline.
  columns.push(
    `a.scope_n as ${ASK_COMPARE_SCOPE_MATCHES}`,
    `a.all_n as ${ASK_COMPARE_ALL_MATCHES}`,
  );
  return [
    "with tagged as (",
    "select (s.match_id in (select match_id from scope)) as in_scope,",
    COUNTERS.map((counter) => askCounterSelect(counter, "s")).join(", "),
    `from ask.match_stats s where s.side = 'me' and ${HAS_STATS}`,
    "), agg as (",
    "select sum(case when t.in_scope then 1 else 0 end) as scope_n, count(*) as all_n,",
    COUNTERS.flatMap((counter) => [
      `sum(case when t.in_scope then t.${counter} else 0 end) as scope_${counter}`,
      `sum(t.${counter}) as all_${counter}`,
    ]).join(", "),
    "from tagged t",
    ")",
    `select ${columns.join(", ")} from agg a`,
  ].join(" ");
}

/** The baseline query's two match counts: with statistics in scope, and over every match. */
export const ASK_COMPARE_SCOPE_MATCHES = "scope_stats_matches";
export const ASK_COMPARE_ALL_MATCHES = "every_stats_matches";

/**
 * A scope holding more than this share of every match with statistics has
 * no baseline worth the name: "this season" over a player whose matches are
 * all this season sets seventeen matches against eighteen.
 */
export const MAX_ASK_BASELINE_SHARE = 0.75;

/** Whether a baseline row's scope is too much of everything to be set against it. */
export function baselineIsWholeScope(row: AskRow | undefined): boolean {
  const scoped = row?.[ASK_COMPARE_SCOPE_MATCHES];
  const every = row?.[ASK_COMPARE_ALL_MATCHES];
  return (
    typeof scoped === "number" &&
    typeof every === "number" &&
    every > 0 &&
    scoped / every > MAX_ASK_BASELINE_SHARE
  );
}

/** A players comparison returns at most this many rows: one per roster player. */
export const MAX_ASK_COMPARE_PLAYERS = 12;

/** One row of `me_<measure>` / `opp_<measure>` over the matches in scope; counts are sums, and per-match means beside them. */
export const ASK_COMPARE_OPPONENT_SQL = buildOpponentSql();

/** One row per `player_name` with `group_matches`; counts are per-match means. */
export const ASK_COMPARE_PLAYERS_SQL = buildPlayersSql();

/** One row of `<measure>` over scope beside `all_<measure>` over every match of the player's. */
export const ASK_COMPARE_BASELINE_SQL = buildBaselineSql(
  compareBaselinePrefix(false),
);

/** The same beside `team_<measure>` over every match of the program's. */
export const ASK_COMPARE_TEAM_BASELINE_SQL = buildBaselineSql(
  compareBaselinePrefix(true),
);

/** The query a comparison runs. A personal scope has no players to compare. */
export function compareSql(kind: AskCompareKind, team: boolean): string {
  if (kind === "players") return ASK_COMPARE_PLAYERS_SQL;
  if (kind === "baseline") {
    return team ? ASK_COMPARE_TEAM_BASELINE_SQL : ASK_COMPARE_BASELINE_SQL;
  }
  return ASK_COMPARE_OPPONENT_SQL;
}

/** Which comparison a saved query was, or null for any other sql. */
export function compareKindOfSql(sql: string): AskCompareKind | null {
  if (sql === ASK_COMPARE_OPPONENT_SQL) return "opponent";
  if (sql === ASK_COMPARE_PLAYERS_SQL) return "players";
  if (sql === ASK_COMPARE_BASELINE_SQL) return "baseline";
  if (sql === ASK_COMPARE_TEAM_BASELINE_SQL) return "baseline";
  return null;
}

// ── Which measures an answer shows ───────────────────────────────────────────

/**
 * What a vague word about quality is read as. This is the ONE place that
 * says so: "consistent" is not a column, so an answer that uses one of these
 * names the measures it stands for ({@link AskQuality.note}) rather than
 * crowning anyone by opinion.
 */
export interface AskQuality {
  /** The word as the note prints it. */
  word: string;
  pattern: RegExp;
  measures: readonly string[];
}

export const ASK_QUALITY_MEASURES: readonly AskQuality[] = [
  {
    word: "Consistent",
    pattern: /\b(?:consisten\w*|solid|steady|steadiest|reliable)\b/i,
    measures: ["errors", "total_points_won_pct"],
  },
  {
    word: "Clutch",
    pattern: /\b(?:clutch|mentally tough\w*)\b/i,
    measures: ["break_points_saved_pct", "break_points_converted_pct"],
  },
  {
    word: "Aggressive",
    pattern: /\b(?:aggressi\w*|attacking|offensive)\b/i,
    measures: ["winners", "net_points_appearances"],
  },
  {
    word: "Best overall",
    pattern:
      /\b(?:best overall|best players?|strongest|all[- ]round\w*|most complete)\b/i,
    measures: ["total_points_won_pct"],
  },
];

/** The vague quality word a question uses, or null. */
export function askQuality(question: string): AskQuality | null {
  return (
    ASK_QUALITY_MEASURES.find((quality) => quality.pattern.test(question)) ??
    null
  );
}

/**
 * What the question's own words name, most specific first. A specific match
 * ("double faults") keeps the group it belongs to ("serve") from adding the
 * rest of it.
 */
const QUESTION_MEASURES: readonly (readonly [RegExp, readonly string[]])[] = [
  [/\bdouble[- ]faults?\b/i, ["double_faults"]],
  [/\baces?\b/i, ["aces"]],
  [
    /\bfirst[- ]serve (?:percentage|pct|in)\b|\bfirst serves? in\b/i,
    ["first_serve_pct"],
  ],
  [/\bfirst[- ]serves?\b/i, ["first_serve_pct", "first_serve_won_pct"]],
  [/\bsecond[- ]serves?\b/i, ["second_serve_won_pct"]],
  [
    /\bbreak[- ]points?\b/i,
    [
      "break_points_converted_pct",
      "break_points_saved_pct",
      "break_points_converted",
      "break_point_opportunities",
    ],
  ],
  // Forced errors beside them, so the answer shows what the unforced count
  // leaves out: 38 unforced and 11 forced never reads as 38 errors.
  [/\bunforced errors?\b/i, ["unforced_errors", "forced_errors"]],
  // "errors" or "mistakes" alone is every error: on a match whose split
  // nobody judged that is the only honest count. "unforced errors" (above)
  // and "forced errors" keep their own measure.
  [/(?<!\bforced |\bunforced )\berrors?\b|\bmistakes?\b/i, ["errors"]],
  [/\bwinners\b/i, ["winners"]],
];

/** A rally length the question names beside the word rally: "long rallies or short ones". */
const RALLY_BANDS: readonly (readonly [RegExp, readonly string[]])[] = [
  [/\bshort(?:er|est)?\b/i, ["short_rally_won_pct"]],
  [/\bmedium\b/i, ["medium_rally_won_pct"]],
  [/\blong(?:er|est)?\b/i, ["long_rally_won_pct", "long_rally_total"]],
];

/** Asked on its own — "points won", with no serve, return or rally in front of it. */
const POINTS_WON = /\b(?:total )?points won\b/i;

const QUESTION_GROUPS: readonly (readonly [RegExp, AskCompareGroup])[] = [
  [/\bserv(?:e|es|ed|ing|ice)\b/i, "serve"],
  [/\breturn(?:s|ed|ing)?\b/i, "return"],
  [/\bpressure\b/i, "pressure"],
  [/\brall(?:y|ies)\b/i, "rallies"],
  [/\b(?:net|volley\w*)\b/i, "net"],
];

function groupKeys(group: AskCompareGroup): string[] {
  return ASK_COMPARE_MEASURES.filter((measure) =>
    measure.groups.includes(group),
  ).map((measure) => measure.key);
}

function unique(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}

/** The measures the question's own words name; empty when it names none. */
export function questionMeasures(question: string): string[] {
  const keys: string[] = [];
  for (const [pattern, measures] of QUESTION_MEASURES) {
    if (pattern.test(question)) keys.push(...measures);
  }
  if (/\brall(?:y|ies)\b/i.test(question)) {
    for (const [pattern, measures] of RALLY_BANDS) {
      if (pattern.test(question)) keys.push(...measures);
    }
  }
  if (keys.length > 0) return unique(keys);
  for (const [pattern, group] of QUESTION_GROUPS) {
    if (pattern.test(question)) keys.push(...groupKeys(group));
  }
  if (keys.length === 0 && POINTS_WON.test(question)) {
    keys.push("total_points_won_pct");
  }
  return unique(keys);
}

/** A planner's `measures` list as measure keys: group names and measure names it knows, in order. */
export function plannerMeasures(requested: unknown): string[] {
  if (!Array.isArray(requested)) return [];
  const keys: string[] = [];
  for (const entry of requested) {
    if (typeof entry !== "string") continue;
    const name = entry
      .trim()
      .toLowerCase()
      .replace(/^(?:me|opp|all|team)_/, "");
    if ((ASK_COMPARE_GROUPS as readonly string[]).includes(name)) {
      keys.push(...groupKeys(name as AskCompareGroup));
    } else if (BY_KEY.has(name)) {
      keys.push(name);
    } else if (BY_KEY.has(name.replace(/_per_match$/, ""))) {
      keys.push(name.replace(/_per_match$/, ""));
    }
  }
  return unique(keys);
}

export interface AskCompareSelection {
  measures: AskCompareMeasure[];
  /** True when the question or the planner named them: they are shown in that order. */
  explicit: boolean;
  /** The vague word the measures stand for, when that is where they came from. */
  quality: AskQuality | null;
  /** True when the question asks for per-match figures: an opponent comparison then shows means, not sums. */
  perMatch: boolean;
}

const PER_MATCH_QUESTION =
  /\b(?:per match|a match|each match|on average|average)\b/i;

/**
 * The measures a comparison shows, decided in code: what a vague quality
 * word stands for, else what the question's words name, else what the
 * planner listed, else every standard measure.
 */
export function selectCompareMeasures(
  question: string,
  requested: unknown,
): AskCompareSelection {
  const pick = (keys: readonly string[]) =>
    keys.flatMap((key) => {
      const measure = BY_KEY.get(key);
      return measure ? [measure] : [];
    });
  const perMatch = PER_MATCH_QUESTION.test(question);
  const quality = askQuality(question);
  if (quality) {
    return {
      measures: pick(quality.measures),
      explicit: true,
      quality,
      perMatch,
    };
  }
  const named = questionMeasures(question);
  if (named.length > 0) {
    return { measures: pick(named), explicit: true, quality: null, perMatch };
  }
  const planned = plannerMeasures(requested);
  if (planned.length > 0) {
    return { measures: pick(planned), explicit: true, quality: null, perMatch };
  }
  return {
    measures: ASK_COMPARE_MEASURES.filter((measure) => measure.standard),
    explicit: false,
    quality: null,
    perMatch,
  };
}

/** "Consistent is read here as errors per match and total points won." — no digit in it. */
export function qualityNote(
  quality: AskQuality,
  labels: readonly string[],
): string {
  const list =
    labels.length <= 1
      ? (labels[0] ?? "")
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `"${quality.word}" is not something the matches record; it is read here as ${list}.`;
}

/**
 * A comparison's rows cut down to the measures chosen, in their order. The
 * columns a row carries beside its measures (`player_name`,
 * `group_matches`) are kept.
 */
export function projectCompareRows(
  rows: readonly AskRow[],
  kind: AskCompareKind,
  measures: readonly AskCompareMeasure[],
  team: boolean,
  perMatch = false,
): AskRow[] {
  const prefix = compareBaselinePrefix(team);
  return rows.map((row) => {
    const out: AskRow = {};
    for (const column of ["player_name", "group_matches"]) {
      if (column in row) out[column] = row[column];
    }
    for (const measure of measures) {
      const name = compareColumn(measure, kind, perMatch);
      const columns =
        kind === "opponent"
          ? [`me_${name}`, `opp_${name}`]
          : kind === "baseline"
            ? [name, `${prefix}${name}`]
            : [name];
      for (const column of columns) {
        if (column in row) out[column] = row[column];
      }
    }
    return out;
  });
}

/** Whether a comparison row holds any figure at all: none means no match in scope has statistics. */
export function compareRowHasFigures(row: AskRow | undefined): boolean {
  if (!row) return false;
  return Object.entries(row).some(
    ([column, cell]) =>
      column !== "group_matches" &&
      typeof cell === "number" &&
      Number.isFinite(cell),
  );
}

// ── Mechanical routing ───────────────────────────────────────────────────────

/** "What are my strengths", "where am I weakest": always the player beside the opponents. */
const STRENGTHS = /\b(?:strengths?|strongest|weakness(?:es)?|weakest)\b/i;

/** Whether the question asks for strengths or weaknesses: a comparison with the opponents, never with a baseline. */
export function asksForStrengths(question: string): boolean {
  return STRENGTHS.test(question);
}

const WHAT_HAPPENED =
  /\bwhat happened\b|\bwhy\b[^?.!]*\b(?:los[et]\w*|losing|w[io]n\w*|beat\w*)\b|\bsummar(?:y|ize|ise)\b/i;

/** A part of a match the fixed comparison cannot cut out: one set, a tiebreak, games. */
const INSIDE_A_MATCH =
  /\b(?:first|second|third|fourth|fifth|last|final|deciding|opening) sets?\b|\btie-?breaks?\b|\bgames?\b/i;

/**
 * Whether the question asks what happened in a match or a set of matches,
 * or why they were won or lost. That is the comparison with the opponents,
 * whatever the planner wrote: a query of its own for it once answered
 * "your total points averaged 161.2" under "what happened in my three-set
 * matches". Not for a question about part of a match, a ranking, a split
 * or a placement, which the comparison cannot answer.
 */
export function asksWhatHappened(question: string): boolean {
  return (
    WHAT_HAPPENED.test(question) &&
    !INSIDE_A_MATCH.test(question) &&
    !UNRECORDED_TOPIC.test(question) &&
    compareMisfit(question) === null
  );
}

const PLACEMENT =
  /\bwhere\b[^?.!]*\b(?:serv(?:e|es|ed|ing)|return(?:s|ed|ing)?|hit(?:s|ting)?|aim(?:s|ed|ing)?)\b/i;

/** "Which opponent gives me the most trouble": one row per opponent, match or surface, never a pooled comparison. */
const RANKING =
  /\b(?:which|what) (?:opponents?|match(?:es)?|surfaces?|courts?|tournaments?|months?|days?)\b|\b(?:best|worst|toughest|hardest|easiest) (?:opponents?|match(?:es)?)\b/i;

/** Words that make an "and …" follow-up a question of its own: a record, a ranking, a reason, a count. */
const OWN_SUBJECT =
  /\b(?:record|wins?|won|loss(?:es)?|lost|lose|streak|trend|over time|how many|how often|where|which|who|when|why|list|scores?|sets?|games?|speed|forehands?|backhands?|shots?|improve|practi[cs]e|work on)\b/i;

const ELLIPTICAL = /^\s*(?:and|also|what about|how about|same for|then)\b/i;

/**
 * Whether a follow-up only moves the previous question somewhere else —
 * "And against right-handers?", "What about on clay?" — naming no measure
 * of its own. Such a follow-up keeps the previous query and changes the
 * scope; it is not a new comparison.
 */
export function movesPreviousQuestion(question: string): boolean {
  return (
    ELLIPTICAL.test(question) &&
    !OWN_SUBJECT.test(question) &&
    askQuality(question) === null &&
    questionMeasures(question).length === 0
  );
}

/** Two groups of matches the question sets against each other, by the words that name them. */
const SPLIT_FAMILIES: readonly (readonly [RegExp, RegExp])[] = [
  [/\bleft(?:y|ies|[- ]hand\w*)\b/i, /\bright(?:y|ies|[- ]hand\w*)\b/i],
  [/\bhard\b/i, /\b(?:clay|grass)\b/i],
  [/\bclay\b/i, /\bgrass\b/i],
  [/\bindoors?\b/i, /\boutdoors?\b/i],
  [/\bduals?\b/i, /\btournaments?\b/i],
  [/\bsingles\b/i, /\bdoubles\b/i],
  [/\bfirst sets?\b/i, /\b(?:second|third|later|other) sets?\b/i],
  [
    /\b(?:wins|matches i won|matches we won)\b/i,
    /\b(?:losses|matches i lost|matches we lost)\b/i,
  ],
];

/**
 * Why a question does not fit the fixed comparisons, or null. Each of them
 * sets a player against opponents, other players or a baseline; none of
 * them splits the matches into two groups, and none knows where a ball was
 * hit. A planner that chose one for such a question is told so once.
 */
export function compareMisfit(question: string): string | null {
  if (PLACEMENT.test(question)) {
    return "The question asks WHERE serves or returns were hit, which shape D does not hold. Use shape A: serve direction is serve_t, serve_body and serve_wide in ask.match_stats, or ask.shots.zone joined to ask.points for the points asked about.";
  }
  if (RANKING.test(question)) {
    return "The question asks WHICH opponent, match or surface: a ranking, which shape D does not hold — it would pool them all. Use shape A: one row per opponent (or match, or surface), ordered by the figure asked about with nulls last, each row with its own group_matches.";
  }
  if (
    SPLIT_FAMILIES.some(
      ([one, other]) => one.test(question) && other.test(question),
    )
  ) {
    return "The question sets two groups of matches against each other, which shape D does not do: it would pool them. Use shape A: ONE ROW PER GROUP (group by the column that tells them apart), the same measures in each, and each group's own number of matches as group_matches.";
  }
  return null;
}

/** Subjects no view records: a question about one is refused, never reviewed. */
const UNRECORDED_TOPIC =
  /\b(?:footwork|fitness|movement|stamina|diet|nutrition|sleep|mental\w*|mindset|confidence|nerves|drills?|stretch\w*|warm[- ]?ups?|equipment|rac(?:ket|quet)s?|strings?|shoes|weather|ranking|rankings|seed\w*|lineup|video)\b/i;

const WHAT_TO_WORK_ON =
  /\bwhat\b[^?.!]*\b(?:should|could|can|must|do|does|need|needs)\b[^?.!]*\b(?:practi[cs]e|work on|fix|improve|do differently|focus on|get better at)\b/i;

/**
 * Whether the question asks what to practise, work on, fix, improve or do
 * differently without naming a subject no view records. Such a question is
 * answered with the review — what the last match showed against the
 * player's own averages — and is never refused.
 */
export function asksWhatToWorkOn(question: string): boolean {
  return WHAT_TO_WORK_ON.test(question) && !UNRECORDED_TOPIC.test(question);
}

const WHO_AMONG_PLAYERS =
  /\b(?:who|whom|whose|which (?:of (?:our|the|my) )?(?:players?|one)|each player|our players|compare|versus|vs\.?)\b/i;

/**
 * Whether a team question is a comparison of players that the fixed query
 * can answer: it asks who, which player or to compare, and it uses a vague
 * quality word or names a measure. "Who has the best footwork" names
 * neither and is not one.
 */
export function asksToComparePlayers(question: string): boolean {
  if (!WHO_AMONG_PLAYERS.test(question)) return false;
  if (UNRECORDED_TOPIC.test(question)) return false;
  return askQuality(question) !== null || questionMeasures(question).length > 0;
}
