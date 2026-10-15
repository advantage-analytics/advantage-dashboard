import { expect, test } from "@playwright/test";

import { type AskRow, renderAskAnswer } from "@/lib/services/ask/answer-render";
import type { AskAnswerEvent, AskVisual } from "@/lib/services/ask/events";
import {
  ASK_REVIEW_MEASURES,
  ASK_REVIEW_SQL,
  ASK_REVIEW_WINDOWS,
  type AskReview,
  type AskReviewMode,
  buildReviewAnswer,
  classifyReview,
  readAskReview,
  reviewAnswerRow,
  reviewWindows,
} from "@/lib/services/ask/review";
import { ASK_PERCENTAGE_DEFINITIONS } from "@/lib/services/ask/schema";
import { checkAskSql } from "@/lib/services/ask/sql-guard";

/**
 * Offline spec for the review — what "How can I improve for my next match?"
 * gets. The product owner's rule: say what was bad in the last match, in
 * metrics, or how an area declined against the player's overall and rolling
 * averages; never what to do about it. So the query is a constant, the
 * classification is the server's, and the answer is written here — these
 * tests hold each of the three.
 */

// ── Fixtures ────────────────────────────────────────────────────────────────

type Values = [
  last: number | null,
  prev5: number | null,
  season: number | null,
  recent5?: number | null,
  earlier?: number | null,
];

interface Meta {
  prev5?: number;
  season?: number;
  recent5?: number;
  earlier?: number;
  players?: number;
  opponent?: string | null;
  player?: string | null;
  playedOn?: string | null;
}

/** `ASK_REVIEW_SQL`'s rows: one per measure, the meta columns on each. */
function sqlRows(values: Record<string, Values>, meta: Meta = {}): AskRow[] {
  return ASK_REVIEW_MEASURES.map((measure, index) => {
    const [last, prev5, season, recent5, earlier] = values[measure.key] ?? [
      null,
      null,
      null,
    ];
    return {
      ord: index + 1,
      measure: measure.key,
      higher_is_better: measure.higherIsBetter,
      last_match: last,
      prev5_avg: prev5,
      season_avg: season,
      recent5_avg: recent5 ?? null,
      earlier_avg: earlier ?? null,
      last_matches: 1,
      prev5_matches: meta.prev5 ?? 5,
      season_matches: meta.season ?? 17,
      recent5_matches: meta.recent5 ?? 5,
      earlier_matches: meta.earlier ?? 13,
      last_played_on:
        meta.playedOn === undefined ? "2026-09-28" : meta.playedOn,
      last_opponent_name:
        meta.opponent === undefined ? "Riley Marsh" : meta.opponent,
      last_player_name:
        meta.player === undefined ? "Mara Sokolov" : meta.player,
      players: meta.players ?? 1,
    };
  });
}

/** A last match worse than both averages on two measures, one of them lower-is-better. */
const SEASON: Record<string, Values> = {
  first_serve_pct: [61, 60.5, 60, 61, 60],
  first_serve_won_pct: [70, 64, 71, 66, 72],
  second_serve_won_pct: [38, 50, 52, 44, 53],
  double_faults: [5, 2.4, 2.9, 3, 2.8],
  aces: [3, 2.8, 2.6, 3, 2.5],
  first_return_won_pct: [40, 33, 34, 35, 34],
  break_points_converted_pct: [null, 44, 41, 40, 42],
  winners: [22, 26, 21, 24, 21],
  unforced_errors: [30, 30.4, 31, 30, 31],
  total_points_won_pct: [49, 50, 50.5, 50, 50.4],
};

function review(values = SEASON, meta: Meta = {}): AskReview {
  const read = readAskReview(sqlRows(values, meta));
  if (!read) throw new Error("fixture has no review");
  return read;
}

async function rendered(text: string, row: AskRow) {
  const { events, result } = renderAskAnswer(
    (async function* chunks() {
      yield text;
    })(),
    [{ ...row, matches_in_scope: 18 }],
  );
  const seen: AskAnswerEvent[] = [];
  for await (const event of events) seen.push(event);
  return { events: seen, result };
}

async function answer(
  values: Record<string, Values>,
  mode: AskReviewMode,
  meta: Meta = {},
) {
  const read = review(values, meta);
  const text = buildReviewAnswer(read, classifyReview(read, mode));
  return { text, ...(await rendered(text, reviewAnswerRow(read))) };
}

function table(visual: AskVisual | null) {
  if (visual?.kind !== "table") throw new Error("no table");
  return visual;
}

/** Words that would turn a statement of fact into advice. */
const ADVICE =
  /\b(should|try|focus|work on|practi[cs]e|need to|aim|consider|recommend|keep it up|well done|improv)/i;

// ── The canned query ────────────────────────────────────────────────────────

test.describe("ASK_REVIEW_SQL", () => {
  test("passes the same guard a model-written query does", () => {
    expect(
      checkAskSql({
        scopeSql: "select match_id from ask.matches",
        sql: ASK_REVIEW_SQL,
      }),
    ).toEqual({ ok: true });
  });

  test("reads scope, names side, and ranks matches newest first with a fixed tiebreak", () => {
    expect(ASK_REVIEW_SQL).toContain(
      "s.match_id in (select match_id from scope)",
    );
    expect(ASK_REVIEW_SQL).toContain("s.side = 'me'");
    expect(ASK_REVIEW_SQL).toContain(
      "row_number() over (order by m.played_on desc nulls last, m.match_id desc)",
    );
  });

  test("the windows are the last match, the five before it, every earlier match, and the team's five against the rest", () => {
    expect(ASK_REVIEW_WINDOWS).toEqual([
      { key: "last", from: 1, to: 1 },
      { key: "prev5", from: 2, to: 6 },
      { key: "season", from: 2, to: 100000 },
      { key: "recent5", from: 1, to: 5 },
      { key: "earlier", from: 6, to: 100000 },
    ]);
    for (const column of [
      "last_match",
      "prev5_avg",
      "season_avg",
      "recent5_avg",
      "earlier_avg",
      "prev5_matches",
      "season_matches",
      "higher_is_better",
      "last_played_on",
      "last_opponent_name",
    ]) {
      expect(ASK_REVIEW_SQL).toContain(` as ${column}`);
    }
  });

  test("pools every percentage — summed made over summed attempts, the schema's own pair — and means every count", () => {
    for (const measure of ASK_REVIEW_MEASURES) {
      if (measure.denominator) {
        const definition = ASK_PERCENTAGE_DEFINITIONS.find(
          (entry) => entry.column === measure.key,
        );
        expect(definition, measure.key).toBeDefined();
        expect(measure.numerator).toBe(definition?.numerator);
        expect(measure.denominator).toBe(definition?.denominator);
        expect(measure.key.endsWith("_pct")).toBe(true);
        expect(ASK_REVIEW_SQL).toContain(
          `'${measure.key}' as measure, ${measure.higherIsBetter} as higher_is_better, round(100.0 * a.${measure.numerator} / nullif(a.${measure.denominator}, 0), 1) as v`,
        );
      } else {
        expect(measure.key.endsWith("_pct")).toBe(false);
        expect(ASK_REVIEW_SQL).toContain(
          `'${measure.key}' as measure, ${measure.higherIsBetter} as higher_is_better, round(1.0 * a.${measure.numerator} / nullif(a.n, 0), 1) as v`,
        );
      }
    }
    // Never an average of per-match percentages.
    expect(ASK_REVIEW_SQL).not.toMatch(/avg\(/);
    expect(ASK_REVIEW_SQL).not.toMatch(/_pct\b(?!')/);
  });

  test("covers the measures the product owner listed; only double faults and unforced errors run lower-is-better", () => {
    expect(ASK_REVIEW_MEASURES.map((measure) => measure.key)).toEqual([
      "first_serve_pct",
      "first_serve_won_pct",
      "second_serve_won_pct",
      "double_faults",
      "aces",
      "first_return_won_pct",
      "second_return_won_pct",
      "break_points_converted_pct",
      "break_points_saved_pct",
      "winners",
      "unforced_errors",
      "total_points_won_pct",
      "short_rally_won_pct",
      "medium_rally_won_pct",
      "long_rally_won_pct",
    ]);
    expect(
      ASK_REVIEW_MEASURES.filter((measure) => !measure.higherIsBetter).map(
        (measure) => measure.key,
      ),
    ).toEqual(["double_faults", "unforced_errors"]);
    for (const measure of ASK_REVIEW_MEASURES) {
      expect(measure.label).not.toMatch(/\d/);
    }
  });
});

// ── Reading and classifying ─────────────────────────────────────────────────

test.describe("readAskReview", () => {
  test("reads the windows, the counts and the last match", () => {
    const read = review();
    expect(read.matches).toEqual({
      last: 1,
      prev5: 5,
      season: 17,
      recent5: 5,
      earlier: 13,
    });
    expect(read.lastOpponentName).toBe("Riley Marsh");
    expect(read.lastPlayedOn).toBe("2026-09-28");
    expect(read.players).toBe(1);
    expect(
      read.measures.find((entry) => entry.measure.key === "double_faults")
        ?.values,
    ).toEqual({ last: 5, prev5: 2.4, season: 2.9, recent5: 3, earlier: 2.8 });
  });

  test("no rows, or no match with statistics, is not a review", () => {
    expect(readAskReview([])).toBeNull();
    expect(
      readAskReview(
        sqlRows(SEASON).map((row) => ({ ...row, last_matches: null })),
      ),
    ).toBeNull();
  });
});

test.describe("reviewWindows — thin data decides what is compared", () => {
  test("more than five earlier matches: the previous five and the overall average", () => {
    expect(reviewWindows(review(), "personal")).toEqual({
      subject: "last",
      baselines: ["prev5", "season"],
    });
  });

  test("five or fewer earlier matches: one average, since the previous five ARE all of them", () => {
    expect(
      reviewWindows(review(SEASON, { season: 5, prev5: 5 }), "player"),
    ).toEqual({ subject: "last", baselines: ["season"] });
  });

  test("no earlier match: only the last match can be described", () => {
    expect(
      reviewWindows(review(SEASON, { season: 0, prev5: 0 }), "personal"),
    ).toEqual({ subject: "last", baselines: [] });
  });

  test("a team compares its last five with the earlier ones, when there are any", () => {
    expect(reviewWindows(review(), "team")).toEqual({
      subject: "recent5",
      baselines: ["earlier"],
    });
    expect(reviewWindows(review(SEASON, { earlier: 0 }), "team")).toEqual({
      subject: "recent5",
      baselines: [],
    });
  });
});

test.describe("classifyReview", () => {
  const classification = classifyReview(review(), "personal");
  const status = (key: string) =>
    classification.items.find((item) => item.measure.key === key)?.status;

  test("worse than both, worse than one, in line, better — by each measure's own tolerance", () => {
    // 38 against 50 and 52.
    expect(status("second_serve_won_pct")).toBe("worse_than_all");
    // Five double faults against 2.4 and 2.9: MORE is worse.
    expect(status("double_faults")).toBe("worse_than_all");
    // 70 against 64 (better) and 71 (within two points): never worse.
    expect(status("first_serve_won_pct")).toBe("better");
    // 22 winners against 26 (four fewer) and 21.
    expect(status("winners")).toBe("worse_than_one");
    // Within tolerance of both.
    expect(status("first_serve_pct")).toBe("in_line");
    expect(status("unforced_errors")).toBe("in_line");
    expect(status("aces")).toBe("in_line");
    expect(status("first_return_won_pct")).toBe("better");
  });

  test("orders by how far below the player's own averages, in tolerances", () => {
    expect(
      classification.items.slice(0, 3).map((item) => item.measure.key),
    ).toEqual(["second_serve_won_pct", "double_faults", "winners"]);
    const [second, doubles] = classification.items;
    // (-12 + -14) / 2 against (-2.6 + -2.1) / 0.5.
    expect(second.score).toBeCloseTo(-13);
    expect(doubles.score).toBeCloseTo(-9.4);
    expect(second.gaps).toEqual([
      { baseline: 50, gap: -12 },
      { baseline: 52, gap: -14 },
    ]);
    // A gap is signed so that negative is worse whichever way the measure runs.
    expect(doubles.gaps).toEqual([
      { baseline: 2.4, gap: -2.6 },
      { baseline: 2.9, gap: -2.1 },
    ]);
  });

  test("leaves out a measure the last match has no figure for", () => {
    expect(status("break_points_converted_pct")).toBeUndefined();
  });

  test("declined: where the previous five ran worse than the overall average", () => {
    expect(classification.declined).toEqual([
      {
        measure: ASK_REVIEW_MEASURES[1],
        prev5: 64,
        season: 71,
      },
      {
        measure: ASK_REVIEW_MEASURES[2],
        prev5: 50,
        season: 52,
      },
    ]);
  });

  test("a team: the last five against the earlier ones, one gap each, nothing 'declined'", () => {
    const team = classifyReview(review(), "team");
    expect(team.subject).toBe("recent5");
    expect(team.baselines).toEqual(["earlier"]);
    expect(team.declined).toEqual([]);
    expect(team.items[0].measure.key).toBe("second_serve_won_pct");
    expect(team.items[0].gaps).toEqual([{ baseline: 53, gap: -9 }]);
    expect(team.items[0].status).toBe("worse_than_all");
  });
});

// ── The answer ──────────────────────────────────────────────────────────────

test.describe("buildReviewAnswer", () => {
  test("renders through the real renderer: headline, one table, two paragraphs, nothing dropped", async () => {
    const { text, events, result } = await answer(SEASON, "personal");

    expect(result.failure).toBeNull();
    expect(result.droppedDigits).toEqual([]);
    expect(result.droppedVisuals).toEqual([]);
    expect(result.droppedVisualRows).toBe(0);
    expect(result.droppedSentences).toBe(0);
    // No digit is typed: every number is a reference.
    expect(text.replace(/\{\{[^}]*\}\}/g, "")).not.toMatch(/\d/);

    expect(events[0]).toEqual({
      type: "headline",
      text: "Second-serve points won and double faults were worse than both of your own averages in your last match.",
    });
    const visual = table(result.visual);
    expect(visual.columns).toEqual(["Last match", "Previous five", "Overall"]);
    expect(visual.rows.slice(0, 3)).toEqual([
      { label: "Second-serve points won", cells: ["38%", "50%", "52%"] },
      { label: "Double faults", cells: ["5", "2.4", "2.9"] },
      { label: "Winners", cells: ["22", "26", "21"] },
    ]);
    expect(visual.rows.length).toBeLessThanOrEqual(8);

    const [below, declined] = result.text.split("\n\n");
    expect(below).toBe(
      "Your last match with statistics was against Riley Marsh on Sep 28, 2026. " +
        "Worse than both your previous-five average and your overall average: second-serve points won at 38% (previous five 50%, overall 52%); double faults at 5 (previous five 2.4, overall 2.9). " +
        "Worse than one of the two averages: winners at 22 (previous five 26, overall 21). " +
        "In line with both averages: total points won, first serves in, aces and unforced errors. " +
        "Better than at least one average and worse than neither: first-serve points won and first-serve return points won.",
    );
    expect(declined).toBe(
      "Over the five matches before it, these ran worse than your overall average of 17 earlier matches: first-serve points won (64% against 71%); second-serve points won (50% against 52%).",
    );
  });

  test("never says what to do, in any mode or data shape", async () => {
    const cases: [Record<string, Values>, AskReviewMode, Meta][] = [
      [SEASON, "personal", {}],
      [SEASON, "player", {}],
      [SEASON, "team", {}],
      [SEASON, "personal", { season: 3, prev5: 3 }],
      [SEASON, "personal", { season: 0, prev5: 0 }],
      [SEASON, "team", { earlier: 0, recent5: 4 }],
    ];
    for (const [values, mode, meta] of cases) {
      const { result } = await answer(values, mode, meta);
      expect(result.failure, mode).toBeNull();
      expect(result.droppedDigits, mode).toEqual([]);
      expect(`${result.headline}\n${result.text}`, mode).not.toMatch(ADVICE);
    }
  });

  test("when nothing was below: says so, and still shows the table", async () => {
    const level: Record<string, Values> = {
      first_serve_pct: [61, 60.5, 60],
      winners: [30, 26, 21],
    };
    const { result } = await answer(level, "personal");
    expect(result.headline).toBe(
      "No measure in your last match was worse than your own averages.",
    );
    expect(result.text).toContain(
      "No measure was worse than both your previous-five average and your overall average.",
    );
    expect(result.text).toContain(
      "Over the five matches before it, no measure ran worse than your overall average of 17 earlier matches.",
    );
    expect(table(result.visual).rows).toHaveLength(2);
  });

  test("worse than only one average is said as exactly that", async () => {
    const { result } = await answer(
      { winners: [22, 26, 21], first_serve_pct: [61, 60, 60] },
      "personal",
    );
    expect(result.headline).toBe(
      "No measure in your last match was worse than both of your own averages; winners was worse than one of them.",
    );
  });

  test("fewer than six earlier matches: one average, and it says how many it covers", async () => {
    const { result } = await answer(SEASON, "personal", {
      season: 3,
      prev5: 3,
    });
    expect(table(result.visual).columns).toEqual([
      "Last match",
      "Earlier matches",
    ]);
    expect(result.headline).toBe(
      "Second-serve points won and double faults were worse than your own average in your last match.",
    );
    expect(result.text).toContain(
      "Worse than your average over the earlier matches: second-serve points won at 38% (earlier average 52%); double faults at 5 (earlier average 2.9).",
    );
    expect(result.text).toContain(
      "There are 3 earlier matches with statistics, so there is one average: a separate previous-five average needs more than five.",
    );
    expect(result.text).not.toContain("previous five ");
  });

  test("no earlier match: only the last match is described", async () => {
    const { result } = await answer(SEASON, "personal", {
      season: 0,
      prev5: 0,
    });
    expect(result.headline).toBe(
      "Your last match is the only one with statistics, so there is no average of your own to set it against.",
    );
    expect(table(result.visual).columns).toEqual(["Last match"]);
    expect(result.text).toBe(
      "Your last match with statistics was against Riley Marsh on Sep 28, 2026. The table shows it on its own: an average needs an earlier match with statistics.",
    );
  });

  test("one of a program's players: third person, by the name the data holds", async () => {
    const { result } = await answer(SEASON, "player");
    expect(result.headline).toBe(
      "Second-serve points won and double faults were worse than both of their own averages in Mara Sokolov's last match.",
    );
    expect(result.text).toContain(
      "Mara Sokolov's last match with statistics was against Riley Marsh on Sep 28, 2026.",
    );
    expect(`${result.headline} ${result.text}`).not.toMatch(/\byou(r)?\b/i);
  });

  test("a team: its last five matches against the earlier ones, two value columns, third person", async () => {
    const { result } = await answer(SEASON, "team", { players: 3 });
    expect(result.headline).toBe(
      "Second-serve points won, first-serve points won and break points converted were worse across the team's last five matches than in its earlier ones.",
    );
    const visual = table(result.visual);
    expect(visual.columns).toEqual(["Last five", "Earlier"]);
    expect(visual.rows[0]).toEqual({
      label: "Second-serve points won",
      cells: ["44%", "53%"],
    });
    expect(result.text).toContain(
      "The team's last 5 matches with statistics, set against the 13 before them.",
    );
    expect(result.text.split("\n\n")).toHaveLength(1);
    expect(`${result.headline} ${result.text}`).not.toMatch(/\byou(r)?\b/i);
  });

  test("a last match with no opponent or date still reads as a sentence", async () => {
    const { result } = await answer(SEASON, "personal", {
      opponent: null,
      playedOn: null,
    });
    expect(
      result.text.startsWith(
        "Your last match with statistics has no opponent or date recorded. Worse than both",
      ),
    ).toBe(true);
    expect(result.failure).toBeNull();
  });
});
