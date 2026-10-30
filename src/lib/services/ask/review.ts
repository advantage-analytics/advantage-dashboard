import {
  ASK_VISUAL_FIELD_SEPARATOR,
  ASK_VISUAL_LINE_PREFIX,
  type AskRow,
} from "@/lib/services/ask/answer-render";
import { ASK_TABLE_ROWS, numberOrNull } from "@/lib/services/ask/events";
import { askCounterSql, askMeasureLabel } from "@/lib/services/ask/measures";
import { sentenceCase } from "@/lib/services/ask/plays";

/**
 * The review: what "How can I improve for my next match?" gets.
 *
 * Ask never gives advice, and a question like that used to get a generic
 * me-against-opponent table with the no-advice notice under it. The product
 * owner's rule for it is narrower and more useful: say what was bad in the
 * last match, in metrics, and what has declined against the player's own
 * overall and rolling averages — and still never what to do about it.
 *
 * Nothing here is written by a model:
 *
 *   1. The planner only chooses the review (`{"review": true, "scope_sql"}`)
 *      and the matches it may draw on.
 *   2. `ASK_REVIEW_SQL` is a constant. It runs through the same
 *      `ask_run_query` / `ask_run_team_query` as a model-written query, so
 *      the views decide whose rows it reads. One row per measure: the last
 *      match in scope with statistics, the five before it, every earlier
 *      match, and — for a team — the last five against the ones before.
 *      Percentages are pooled (summed made over summed attempts), never an
 *      average of per-match percentages; counts are per-match means.
 *   3. `classifyReview()` decides which measures were worse than the
 *      player's own averages and orders them by how far.
 *   4. `buildReviewAnswer()` writes the answer in the renderer's own syntax
 *      — a headline, one table, the paragraphs — with every number a cell
 *      reference into `reviewAnswerRow()`. It is streamed through
 *      `renderAskAnswer()` exactly as a model's reply is, so the events and
 *      the saved answer have the shape they always had.
 *
 * So the answer can state that second-serve points won were below both
 * averages; it cannot say what to do about it, because no sentence that
 * could is in this file.
 *
 * Pure: no database, no network, no Next.js.
 */

// ── Measures ─────────────────────────────────────────────────────────────────

export interface AskReviewMeasure {
  /** The measure's name in the SQL and, prefixed, in the answer row. Percentages end in `_pct`. */
  key: string;
  /** As the answer names it: the server's one name for the measure (`measures.ts`). */
  label: string;
  /** `match_stats` counter summed for the value: the numerator of a percentage, or the count itself. */
  numerator: string;
  /** The summed counter a percentage divides by; absent for a count, which is a per-match mean. */
  denominator?: string;
  higherIsBetter: boolean;
  /**
   * How far from an average still reads as "in line": percentage points for
   * a percentage, a per-match count for a count.
   */
  tolerance: number;
}

/** In the order a reader expects: serve, return, pressure, strokes, points, rallies. */
export const ASK_REVIEW_MEASURES: readonly AskReviewMeasure[] = [
  {
    key: "first_serve_pct",
    label: askMeasureLabel("first_serve_pct"),
    numerator: "first_serves_in",
    denominator: "first_serves",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    key: "first_serve_won_pct",
    label: askMeasureLabel("first_serve_won_pct"),
    numerator: "first_serve_points_won",
    denominator: "first_serves_in",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    key: "second_serve_won_pct",
    label: askMeasureLabel("second_serve_won_pct"),
    numerator: "second_serve_points_won",
    denominator: "second_serves_in",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    key: "double_faults",
    label: askMeasureLabel("double_faults"),
    numerator: "double_faults",
    higherIsBetter: false,
    tolerance: 0.5,
  },
  {
    key: "aces",
    label: askMeasureLabel("aces"),
    numerator: "aces",
    higherIsBetter: true,
    tolerance: 0.5,
  },
  {
    key: "first_return_won_pct",
    label: askMeasureLabel("first_return_won_pct"),
    numerator: "first_return_points_won",
    denominator: "first_returns",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    key: "second_return_won_pct",
    label: askMeasureLabel("second_return_won_pct"),
    numerator: "second_return_points_won",
    denominator: "second_returns",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    key: "break_points_converted_pct",
    label: askMeasureLabel("break_points_converted_pct"),
    numerator: "break_points_converted",
    denominator: "break_point_opportunities",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    key: "break_points_saved_pct",
    label: askMeasureLabel("break_points_saved_pct"),
    numerator: "break_points_saved",
    denominator: "break_points_faced",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    key: "winners",
    label: askMeasureLabel("winners"),
    numerator: "winners",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    // Every error, not unforced_errors: a review sets the last match against
    // averages over many, and a match whose forced/unforced split nobody
    // judged files every error as unforced. Summed as unforced +
    // coalesce(forced, 0) (`askCounterSql`), it means the same on both.
    key: "errors",
    label: askMeasureLabel("errors"),
    numerator: "errors",
    higherIsBetter: false,
    tolerance: 2,
  },
  {
    key: "total_points_won_pct",
    label: askMeasureLabel("total_points_won_pct"),
    numerator: "total_points_won",
    denominator: "total_points",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    key: "short_rally_won_pct",
    label: askMeasureLabel("short_rally_won_pct"),
    numerator: "short_rally_won",
    denominator: "short_rally_total",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    key: "medium_rally_won_pct",
    label: askMeasureLabel("medium_rally_won_pct"),
    numerator: "medium_rally_won",
    denominator: "medium_rally_total",
    higherIsBetter: true,
    tolerance: 2,
  },
  {
    key: "long_rally_won_pct",
    label: askMeasureLabel("long_rally_won_pct"),
    numerator: "long_rally_won",
    denominator: "long_rally_total",
    higherIsBetter: true,
    tolerance: 2,
  },
];

// ── The canned query ─────────────────────────────────────────────────────────

/** The windows a review reads, by the match's rank from the most recent (1) backwards. */
export const ASK_REVIEW_WINDOWS = [
  { key: "last", from: 1, to: 1 },
  { key: "prev5", from: 2, to: 6 },
  { key: "season", from: 2, to: 100000 },
  { key: "recent5", from: 1, to: 5 },
  { key: "earlier", from: 6, to: 100000 },
] as const;

export type AskReviewWindow = (typeof ASK_REVIEW_WINDOWS)[number]["key"];

function buildReviewSql(): string {
  const counters = [
    ...new Set(
      ASK_REVIEW_MEASURES.flatMap((measure) =>
        measure.denominator
          ? [measure.numerator, measure.denominator]
          : [measure.numerator],
      ),
    ),
  ];
  const windows = ASK_REVIEW_WINDOWS.map(
    (window, index) =>
      `select '${window.key}'${index === 0 ? " as w" : ""}, ${window.from}${index === 0 ? " as lo" : ""}, ${window.to}${index === 0 ? " as hi" : ""}`,
  ).join(" union all ");
  const values = ASK_REVIEW_MEASURES.map((measure, index) => {
    const value = measure.denominator
      ? `round(100.0 * a.${measure.numerator} / nullif(a.${measure.denominator}, 0), 1)`
      : `round(1.0 * a.${measure.numerator} / nullif(a.n, 0), 1)`;
    return `select a.w, a.n, ${index + 1} as ord, '${measure.key}' as measure, ${measure.higherIsBetter} as higher_is_better, ${value} as v from agg a`;
  }).join(" union all ");
  const pick = (column: string, alias: string) =>
    ASK_REVIEW_WINDOWS.map(
      (window) =>
        `max(case when v.w = '${window.key}' then v.${column} end) as ${window.key}_${alias}`,
    ).join(", ");

  return [
    "with ranked as (",
    "select m.played_on, m.opponent_name, m.player_name,",
    "row_number() over (order by m.played_on desc nulls last, m.match_id desc) as rn,",
    counters
      .map((counter) => {
        const sql = askCounterSql(counter, "s");
        return sql === `s.${counter}` ? sql : `${sql} as ${counter}`;
      })
      .join(", "),
    "from ask.match_stats s join ask.matches m on m.match_id = s.match_id",
    "where s.side = 'me' and s.match_id in (select match_id from scope)",
    "and (s.total_points > 0 or s.first_serves > 0)",
    "),",
    `windows as (${windows}),`,
    "agg as (",
    "select w.w, count(*) as n,",
    counters.map((counter) => `sum(r.${counter}) as ${counter}`).join(", "),
    "from windows w join ranked r on r.rn between w.lo and w.hi group by w.w",
    "),",
    "meta as (",
    "select max(case when rn = 1 then played_on end) as last_played_on,",
    "max(case when rn = 1 then opponent_name end) as last_opponent_name,",
    "max(case when rn = 1 then player_name end) as last_player_name,",
    "count(distinct player_name) as players from ranked",
    "),",
    `vals as (${values})`,
    "select v.ord, v.measure, bool_and(v.higher_is_better) as higher_is_better,",
    `${pick("v", "avg").replace("last_avg", "last_match")},`,
    `${pick("n", "matches")},`,
    "max(meta.last_played_on) as last_played_on, max(meta.last_opponent_name) as last_opponent_name,",
    "max(meta.last_player_name) as last_player_name, max(meta.players) as players",
    "from vals v join meta on true group by v.ord, v.measure order by v.ord",
  ].join(" ");
}

/**
 * The review's query: constant, built once from the two tables above. Reads
 * `scope` like every Ask query and names `side`, so it passes `checkAskSql`
 * (`tests/ask-review.spec.ts` holds it there). One row per measure:
 * `measure`, `higher_is_better`, `last_match`, `prev5_avg`, `season_avg`,
 * `recent5_avg`, `earlier_avg`, how many matches each window covers, and the
 * last match's date, opponent and player.
 */
export const ASK_REVIEW_SQL = buildReviewSql();

// ── Reading the result ───────────────────────────────────────────────────────

export interface AskReviewValues {
  measure: AskReviewMeasure;
  values: Record<AskReviewWindow, number | null>;
}

export interface AskReview {
  measures: AskReviewValues[];
  /** How many matches with statistics each window covers. */
  matches: Record<AskReviewWindow, number>;
  /** `YYYY-MM-DD`, or null when the last match has no date. */
  lastPlayedOn: string | null;
  lastOpponentName: string | null;
  /** The program's player in the last match (team scope); the viewer's own name in a personal one. */
  lastPlayerName: string | null;
  /** How many different players the matches with statistics belong to. */
  players: number;
}

function textOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * `ASK_REVIEW_SQL`'s rows as an {@link AskReview}; null when there is no
 * match with statistics in scope, which is "no data", not a review.
 */
export function readAskReview(rows: readonly AskRow[]): AskReview | null {
  const first = rows[0];
  if (!first) return null;
  const count = (window: AskReviewWindow) =>
    numberOrNull(first[`${window}_matches`]) ?? 0;
  const matches = {
    last: count("last"),
    prev5: count("prev5"),
    season: count("season"),
    recent5: count("recent5"),
    earlier: count("earlier"),
  };
  if (matches.last < 1) return null;

  const measures = ASK_REVIEW_MEASURES.flatMap((measure): AskReviewValues[] => {
    const row = rows.find((candidate) => candidate.measure === measure.key);
    if (!row) return [];
    return [
      {
        measure,
        values: {
          last: numberOrNull(row.last_match),
          prev5: numberOrNull(row.prev5_avg),
          season: numberOrNull(row.season_avg),
          recent5: numberOrNull(row.recent5_avg),
          earlier: numberOrNull(row.earlier_avg),
        },
      },
    ];
  });
  if (measures.length === 0) return null;

  return {
    measures,
    matches,
    lastPlayedOn: textOrNull(first.last_played_on),
    lastOpponentName: textOrNull(first.last_opponent_name),
    lastPlayerName: textOrNull(first.last_player_name),
    players: numberOrNull(first.players) ?? 0,
  };
}

// ── Classification ───────────────────────────────────────────────────────────

/**
 * Who a review is about, which decides what is compared with what:
 *
 * - `personal` — the asker's last match against their own previous five and
 *   every earlier match. Second person.
 * - `player`   — the same for one of a program's players. Third person.
 * - `team`     — a program's last five matches against every earlier one.
 */
export type AskReviewMode = "personal" | "player" | "team";

/** The rolling window: a previous-five average needs more earlier matches than this to differ from the overall one. */
export const ASK_REVIEW_ROLLING_MATCHES = 5;

export type AskReviewStatus =
  /** Worse than every average it was compared with. */
  | "worse_than_all"
  /** Worse than one of two. */
  | "worse_than_one"
  | "in_line"
  | "better";

export interface AskReviewItem {
  measure: AskReviewMeasure;
  /** The subject window's value: the last match, or a team's last five. */
  value: number;
  /**
   * One per baseline, in the classification's order: the baseline's value
   * and the gap to it, signed so that a NEGATIVE gap is worse whichever way
   * the measure runs. Null where the baseline has no figure.
   */
  gaps: ({ baseline: number; gap: number } | null)[];
  status: AskReviewStatus;
  /** The negative gaps in tolerances, summed: the further below zero, the further below the averages. */
  score: number;
}

export interface AskReviewClassification {
  mode: AskReviewMode;
  /** The window described: `last`, or `recent5` for a team. */
  subject: AskReviewWindow;
  /** The windows it is compared with: none, one or two. */
  baselines: AskReviewWindow[];
  /** Every measure the subject window has a figure for, furthest below the averages first. */
  items: AskReviewItem[];
  /**
   * Measures whose previous-five average is worse than the overall one, the
   * widest gap first. Empty unless both baselines exist.
   */
  declined: { measure: AskReviewMeasure; prev5: number; season: number }[];
}

const STATUS_ORDER: Record<AskReviewStatus, number> = {
  worse_than_all: 0,
  worse_than_one: 1,
  in_line: 2,
  better: 3,
};

function signedGap(
  measure: AskReviewMeasure,
  value: number,
  baseline: number,
): number {
  const gap = Math.round((value - baseline) * 10) / 10;
  return measure.higherIsBetter ? gap : -gap;
}

/**
 * The windows a review compares, from how much there is to compare. A
 * previous-five average is only stated when it is a different set of matches
 * from the overall one; with five or fewer earlier matches there is one
 * average, and with none there is nothing but the last match.
 */
export function reviewWindows(
  review: AskReview,
  mode: AskReviewMode,
): { subject: AskReviewWindow; baselines: AskReviewWindow[] } {
  if (mode === "team") {
    return {
      subject: "recent5",
      baselines: review.matches.earlier > 0 ? ["earlier"] : [],
    };
  }
  if (review.matches.season === 0) return { subject: "last", baselines: [] };
  return {
    subject: "last",
    baselines:
      review.matches.season > ASK_REVIEW_ROLLING_MATCHES
        ? ["prev5", "season"]
        : ["season"],
  };
}

export function classifyReview(
  review: AskReview,
  mode: AskReviewMode,
): AskReviewClassification {
  const { subject, baselines } = reviewWindows(review, mode);

  const items = review.measures.flatMap((entry): AskReviewItem[] => {
    const value = entry.values[subject];
    if (value === null) return [];
    const gaps = baselines.map((window) => {
      const baseline = entry.values[window];
      return baseline === null
        ? null
        : { baseline, gap: signedGap(entry.measure, value, baseline) };
    });
    const held = gaps.flatMap((gap) => (gap ? [gap.gap] : []));
    const tolerance = entry.measure.tolerance;
    const worse = held.filter((gap) => gap <= -tolerance).length;
    const better = held.filter((gap) => gap >= tolerance).length;
    const status: AskReviewStatus =
      held.length > 0 && worse === held.length
        ? "worse_than_all"
        : worse > 0
          ? "worse_than_one"
          : better > 0
            ? "better"
            : "in_line";
    const score = held.reduce(
      (sum, gap) => sum + Math.min(gap, 0) / tolerance,
      0,
    );
    return [{ measure: entry.measure, value, gaps, status, score }];
  });
  items.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.score - b.score,
  );

  const declined =
    baselines.length === 2
      ? review.measures
          .flatMap((entry) => {
            const prev5 = entry.values.prev5;
            const season = entry.values.season;
            if (prev5 === null || season === null) return [];
            const gap = signedGap(entry.measure, prev5, season);
            return gap <= -entry.measure.tolerance
              ? [{ measure: entry.measure, prev5, season, gap }]
              : [];
          })
          .sort(
            (a, b) => a.gap / a.measure.tolerance - b.gap / b.measure.tolerance,
          )
          .map(({ measure, prev5, season }) => ({ measure, prev5, season }))
      : [];

  return { mode, subject, baselines, items, declined };
}

// ── The answer ───────────────────────────────────────────────────────────────

/**
 * The one row the review's answer is written against: every measure under
 * `<window>_<measure>` — so a percentage still ends in `_pct` and prints
 * with its sign — plus the match counts and the last match's date, opponent
 * and player. The orchestration adds the scope count as it does to any row.
 */
export function reviewAnswerRow(review: AskReview): AskRow {
  const row: AskRow = {
    last_played_on: review.lastPlayedOn,
    last_opponent_name: review.lastOpponentName,
    last_player_name: review.lastPlayerName,
  };
  for (const window of ASK_REVIEW_WINDOWS) {
    row[`${window.key}_matches`] = review.matches[window.key];
  }
  for (const entry of review.measures) {
    for (const window of ASK_REVIEW_WINDOWS) {
      row[`${window.key}_${entry.measure.key}`] = entry.values[window.key];
    }
  }
  return row;
}

const S = ASK_VISUAL_FIELD_SEPARATOR;

/** At most this many measures are spelt out with their figures in one sentence. */
const MAX_REVIEW_LISTED = 4;

function cell(window: AskReviewWindow, measure: AskReviewMeasure): string {
  return `{{r1.${window}_${measure.key}}}`;
}

function joined(parts: readonly string[]): string {
  return parts.length <= 1
    ? (parts[0] ?? "")
    : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** The words that differ between the three modes. No digit in any of them. */
interface ReviewVoice {
  /** "your", "{{r1.last_player_name}}'s", "the team's". */
  whose: string;
  /** "your own", "their own", "its own". */
  own: string;
  /** Heads the table: what the subject window is called. */
  subjectHeading: string;
  /** "in your last match", "across the team's last five matches". */
  where: string;
}

const WINDOW_HEADING: Record<AskReviewWindow, string> = {
  last: "Last match",
  prev5: "Previous five",
  season: "Overall",
  recent5: "Last five",
  earlier: "Earlier",
};

/** How a baseline is named in a sentence. */
const WINDOW_PHRASE: Record<AskReviewWindow, string> = {
  last: "last match",
  prev5: "previous five",
  season: "overall",
  recent5: "last five",
  earlier: "earlier",
};

function voiceFor(mode: AskReviewMode, review: AskReview): ReviewVoice {
  if (mode === "team") {
    return {
      whose: "the team's",
      own: "its own",
      subjectHeading: WINDOW_HEADING.recent5,
      where: "across the team's last five matches",
    };
  }
  if (mode === "player") {
    const whose = review.lastPlayerName
      ? "{{r1.last_player_name}}'s"
      : "the player's";
    return {
      whose,
      own: "their own",
      subjectHeading: WINDOW_HEADING.last,
      where: `in ${whose} last match`,
    };
  }
  return {
    whose: "your",
    own: "your own",
    subjectHeading: WINDOW_HEADING.last,
    where: "in your last match",
  };
}

/** "first serves in at 54.2% (previous five 61%, overall 60.1%)", as references. */
function withFigures(
  item: AskReviewItem,
  classification: AskReviewClassification,
): string {
  const only = classification.baselines.length === 1;
  const against = classification.baselines
    .flatMap((window, index) =>
      item.gaps[index]
        ? [
            `${only && window === "season" ? "earlier average" : WINDOW_PHRASE[window]} ${cell(window, item.measure)}`,
          ]
        : [],
    )
    .join(", ");
  return `${lower(item.measure.label)} at ${cell(classification.subject, item.measure)}${against ? ` (${against})` : ""}`;
}

/** Which averages a sentence is setting the subject against, in words. */
function averagesPhrase(
  classification: AskReviewClassification,
  voice: ReviewVoice,
): string {
  if (classification.mode === "team") return "its earlier matches";
  return classification.baselines.length === 2
    ? `both ${voice.whose} previous-five average and ${voice.whose} overall average`
    : `${voice.whose} average over the earlier matches`;
}

/**
 * The review as answer text in the renderer's syntax: the headline, one
 * `table` block, then the paragraphs. Every number is a reference into
 * `reviewAnswerRow()`; the text holds no digit and no sentence that says
 * what to do.
 */
export function buildReviewAnswer(
  review: AskReview,
  classification: AskReviewClassification,
): string {
  const { mode, subject, baselines, items } = classification;
  const voice = voiceFor(mode, review);
  const worst = items.filter((item) => item.status === "worse_than_all");
  const mixed = items.filter((item) => item.status === "worse_than_one");
  const level = items.filter((item) => item.status === "in_line");
  const better = items.filter((item) => item.status === "better");
  const names = (list: readonly AskReviewItem[]) =>
    joined(list.map((item) => lower(item.measure.label)));

  // ── Headline ──
  let headline: string;
  if (baselines.length === 0) {
    headline =
      mode === "team"
        ? "Every match the team has statistics for is among its last five, so there is no earlier average to set them against."
        : `${sentenceCase(voice.whose)} last match is the only one with statistics, so there is no average of ${voice.own} to set it against.`;
  } else if (worst.length > 0) {
    const named = sentenceCase(names(worst.slice(0, 3)));
    const verb = worst.length === 1 ? "was" : "were";
    if (mode === "team") {
      headline = `${named} ${verb} worse across the team's last five matches than in its earlier ones.`;
    } else if (worst.length > 3) {
      headline = `${named} were the measures furthest behind ${voice.own} averages ${voice.where}.`;
    } else {
      headline = `${named} ${verb} worse than ${baselines.length === 2 ? `both of ${voice.own} averages` : `${voice.own} average`} ${voice.where}.`;
    }
  } else if (mixed.length > 0) {
    headline = `No measure ${voice.where} was worse than both of ${voice.own} averages; ${names(mixed.slice(0, 3))} ${mixed.length === 1 ? "was" : "were"} worse than one of them.`;
  } else {
    headline =
      mode === "team"
        ? "No measure across the team's last five matches was worse than in its earlier ones."
        : `No measure ${voice.where} was worse than ${voice.own} averages.`;
  }

  // ── Table ──
  const columns = [subject, ...baselines];
  const caption =
    mode === "team"
      ? "The team's last five matches against its earlier ones, furthest behind first."
      : baselines.length === 0
        ? `${sentenceCase(voice.whose)} last match.`
        : `${sentenceCase(voice.whose)} last match against ${voice.own} averages, furthest behind first.`;
  const table = [
    `${ASK_VISUAL_LINE_PREFIX} table ${S} ${caption}`,
    `COLUMNS: ${columns
      .map((window) =>
        window === subject
          ? voice.subjectHeading
          : window === "season" && baselines.length === 1
            ? "Earlier matches"
            : WINDOW_HEADING[window],
      )
      .join(` ${S} `)}`,
    ...items
      .slice(0, ASK_TABLE_ROWS)
      .map(
        (item) =>
          `ROW: ${item.measure.label} ${S} ${columns.map((window) => cell(window, item.measure)).join(` ${S} `)}`,
      ),
  ];

  // ── What was below ──
  const paragraphs: string[] = [];
  const opening =
    mode === "team"
      ? "The team's last {{r1.recent5_matches}} matches with statistics, set against the {{r1.earlier_matches}} before them."
      : review.lastOpponentName || review.lastPlayedOn
        ? [
            sentenceCase(voice.whose),
            " last match with statistics was",
            review.lastOpponentName ? " against {{r1.last_opponent_name}}" : "",
            review.lastPlayedOn ? " on {{r1.last_played_on}}" : "",
            ".",
          ].join("")
        : `${sentenceCase(voice.whose)} last match with statistics has no opponent or date recorded.`;

  if (baselines.length === 0) {
    paragraphs.push(
      mode === "team"
        ? "The team has {{r1.recent5_matches}} matches with statistics, all of them among its last five. The table shows them on their own."
        : `${opening} The table shows it on its own: an average needs an earlier match with statistics.`,
    );
  } else {
    const first = [opening];
    const against = averagesPhrase(classification, voice);
    if (worst.length > 0) {
      const listed = worst.slice(0, MAX_REVIEW_LISTED);
      first.push(
        `Worse than ${against}: ${listed.map((item) => withFigures(item, classification)).join("; ")}.`,
      );
      if (worst.length > listed.length) {
        first.push(
          `Also worse than ${baselines.length === 2 ? "both" : "it"}: ${names(worst.slice(listed.length))}.`,
        );
      }
    } else {
      first.push(`No measure was worse than ${against}.`);
    }
    if (mixed.length > 0) {
      const listed = mixed.slice(0, MAX_REVIEW_LISTED);
      first.push(
        `Worse than one of the two averages: ${listed.map((item) => withFigures(item, classification)).join("; ")}.`,
      );
    }
    if (level.length > 0) {
      first.push(
        `In line with ${baselines.length === 2 ? "both averages" : mode === "team" ? "the earlier matches" : "the average"}: ${names(level)}.`,
      );
    }
    if (better.length > 0) {
      first.push(
        `Better than ${mode === "team" ? "in the earlier matches" : baselines.length === 2 ? "at least one average and worse than neither" : "the average"}: ${names(better)}.`,
      );
    }
    paragraphs.push(first.join(" "));
  }

  // ── What has declined: the rolling average against the overall one ──
  if (mode !== "team" && baselines.length === 2) {
    const declined = classification.declined.slice(0, MAX_REVIEW_LISTED);
    paragraphs.push(
      declined.length > 0
        ? `Over the five matches before it, these ran worse than ${voice.whose} overall average of {{r1.season_matches}} earlier matches: ${declined
            .map(
              (entry) =>
                `${lower(entry.measure.label)} (${cell("prev5", entry.measure)} against ${cell("season", entry.measure)})`,
            )
            .join("; ")}.`
        : `Over the five matches before it, no measure ran worse than ${voice.whose} overall average of {{r1.season_matches}} earlier matches.`,
    );
  } else if (mode !== "team" && baselines.length === 1) {
    paragraphs.push(
      review.matches.season === 1
        ? "There is one earlier match with statistics, so it is the only comparison: a separate previous-five average needs more than five."
        : "There are {{r1.season_matches}} earlier matches with statistics, so there is one average: a separate previous-five average needs more than five.",
    );
  }

  return `${headline}\n${table.join("\n")}\n\n${paragraphs.join("\n\n")}`;
}
