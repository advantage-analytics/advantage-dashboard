import { expect, test } from "@playwright/test";

import {
  ASK_COMPARED_PREFIXES,
  ASK_COMPARED_SUFFIXES,
  ASK_ORDER_SUMMARY_PREFIXES,
} from "@/lib/services/ask/facts";
import {
  ASK_MEASURES,
  ASK_MEASURE_PREFIX_QUALIFIERS,
  ASK_MEASURE_SUFFIX_QUALIFIERS,
  askMeasure,
  askMeasureFullLabel,
  askMeasureLabel,
} from "@/lib/services/ask/measures";
import {
  ASK_REVIEW_MEASURES,
  ASK_REVIEW_WINDOWS,
} from "@/lib/services/ask/review";
import {
  ASK_PERCENTAGE_DEFINITIONS,
  ASK_SCHEMA,
} from "@/lib/services/ask/schema";

/**
 * Offline spec for the measure dictionary: the one place a measure's printed
 * name comes from. "Hard court win percentage = 53.8%" over the share of
 * points won is what it exists to stop.
 */

test.describe("ASK_MEASURES", () => {
  test("names every number the match_stats view documents, hidden ratings aside", () => {
    const stats = ASK_SCHEMA.find((view) => view.view === "match_stats");
    const numeric = (stats?.columns ?? []).filter(
      (column) =>
        (column.type === "number" || column.type === "integer") &&
        !column.hidden,
    );
    expect(numeric.length).toBeGreaterThan(60);
    for (const column of numeric) {
      expect(ASK_MEASURES[column.name], column.name).toBeDefined();
    }
    for (const definition of ASK_PERCENTAGE_DEFINITIONS) {
      expect(ASK_MEASURES[definition.column], definition.column).toBeDefined();
    }
  });

  test("a label is sentence case with no digit and no middot", () => {
    for (const [key, measure] of Object.entries(ASK_MEASURES)) {
      expect(measure.label, key).toMatch(/^[A-Z][A-Za-z -]+$/);
      expect(measure.note ?? "", key).not.toMatch(/[\d·]/);
    }
    for (const [, words] of [
      ...ASK_MEASURE_PREFIX_QUALIFIERS,
      ...ASK_MEASURE_SUFFIX_QUALIFIERS,
    ]) {
      expect(words).toMatch(/^[a-z ]*$/);
    }
  });

  test("a percentage and the count it is computed from share a name", () => {
    expect(askMeasureLabel("total_points_won_pct")).toBe("Total points won");
    expect(askMeasureLabel("total_points_won")).toBe("Total points won");
    expect(askMeasureLabel("first_serve_pct")).toBe("First serves in");
    expect(askMeasureLabel("win_pct")).toBe("Matches won");
    expect(ASK_MEASURES.total_points_won_pct.note).toBe(
      "the share of points, not a match win rate",
    );
    expect(askMeasureLabel("break_point_opportunities")).toBe(
      "Break point chances created",
    );
    expect(ASK_MEASURES.break_point_opportunities.note).toBe(
      "chances to break the other side's serve, not break points faced",
    );
    expect(() => askMeasureLabel("no_such_measure")).toThrow();
  });

  test("is the review's source of names: one label per measure, everywhere", () => {
    for (const measure of ASK_REVIEW_MEASURES) {
      expect(measure.label).toBe(askMeasureLabel(measure.key));
      for (const window of ASK_REVIEW_WINDOWS) {
        expect(askMeasure(`${window.key}_${measure.key}`)?.key).toBe(
          measure.key,
        );
      }
    }
  });
});

test.describe("askMeasure — a column's measure, through the naming convention", () => {
  test("the bare name, then one prefix or suffix, then two", () => {
    expect(askMeasure("first_serve_pct")).toMatchObject({
      key: "first_serve_pct",
      label: "First serves in",
      qualifier: "",
    });
    expect(askMeasure("me_first_serve_pct")?.qualifier).toBe("");
    expect(askMeasure("opp_first_serve_pct")?.qualifier).toBe("opponent");
    expect(askMeasure("team_aces")?.qualifier).toBe("team");
    expect(askMeasure("aces_all")?.qualifier).toBe("all matches");
    expect(askMeasure("all_matches_second_serve_won_pct")).toMatchObject({
      key: "second_serve_won_pct",
      qualifier: "all matches",
    });
    expect(askMeasure("start_opp_winners")).toMatchObject({
      key: "winners",
      qualifier: "first match, opponent",
    });
    expect(askMeasureFullLabel(askMeasure("opp_total_points_won_pct")!)).toBe(
      "Total points won, opponent",
    );
  });

  test("the view's own avg_rally_length is itself, not the average of something", () => {
    expect(askMeasure("avg_rally_length")).toMatchObject({
      key: "avg_rally_length",
      qualifier: "",
    });
    expect(askMeasure("opp_avg_rally_length")?.qualifier).toBe("opponent");
  });

  test("a name the convention cannot place is unknown", () => {
    for (const column of [
      "big_point_serve_t_pct",
      "usual_rate",
      "matches_in_scope",
      "all_matches",
      "played_on",
      "start_unforced_errors_date",
      "a_b_c_first_serve_pct",
      "constructor",
      "me_",
    ]) {
      expect(askMeasure(column), column).toBeNull();
    }
  });

  test("knows every prefix and suffix the facts pair columns by, and the summary prefixes", () => {
    const prefixes = ASK_MEASURE_PREFIX_QUALIFIERS.map(([prefix]) => prefix);
    for (const prefix of [
      ...ASK_COMPARED_PREFIXES,
      ...Object.values(ASK_ORDER_SUMMARY_PREFIXES),
    ]) {
      expect(prefixes, prefix).toContain(prefix);
    }
    const suffixes = ASK_MEASURE_SUFFIX_QUALIFIERS.map(([suffix]) => suffix);
    for (const suffix of ASK_COMPARED_SUFFIXES) {
      expect(suffixes, suffix).toContain(suffix);
    }
    // Longest first, so all_matches_ is read before all_.
    for (let index = 1; index < prefixes.length; index += 1) {
      expect(prefixes[index].length).toBeLessThanOrEqual(
        prefixes[index - 1].length,
      );
    }
  });
});
