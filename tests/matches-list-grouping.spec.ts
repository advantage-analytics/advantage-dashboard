import { expect, test } from "@playwright/test";

import {
  matchListGroup,
  matchListStatusLabel,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";

/**
 * The matches list groups rows "In progress / Ready / Failed / No video".
 *
 * Product decision 2026-09-27: a `derivation_failed` row classified
 * `stats_unavailable` (our derivation engine refused the data, deterministically)
 * must not read as a failed match — the match page renders, only the stats
 * section is missing. `matchListGroup()` and `matchListStatusLabel()` are the
 * pure decision points these assertions pin, so the list's behaviour can't
 * silently drift back to lumping that row in with real failures.
 */

test.describe("matchListGroup", () => {
  test("a derivation_failed row classified stats_unavailable groups under Ready", () => {
    const analysis: MatchAnalysis = {
      status: "derivation_failed",
      providerId: null,
      recovery: "stats_unavailable",
    };
    expect(matchListGroup(analysis)).toBe("Ready");
  });

  test("a failed row classified retry groups under Failed", () => {
    const analysis: MatchAnalysis = {
      status: "failed",
      providerId: null,
      recovery: "retry",
    };
    expect(matchListGroup(analysis)).toBe("Failed");
  });

  test("a derivation_failed row classified rederive (a real crash) still groups under Failed", () => {
    const analysis: MatchAnalysis = {
      status: "derivation_failed",
      providerId: null,
      recovery: "rederive",
    };
    expect(matchListGroup(analysis)).toBe("Failed");
  });

  test("a completed row groups under Ready", () => {
    const analysis: MatchAnalysis = {
      status: "completed",
      providerId: null,
    };
    expect(matchListGroup(analysis)).toBe("Ready");
  });

  test("an in-flight row groups under In progress", () => {
    const analysis: MatchAnalysis = {
      status: "processing",
      providerId: null,
    };
    expect(matchListGroup(analysis)).toBe("In progress");
  });

  test("a manual (hand-scored) row groups under No video", () => {
    const analysis: MatchAnalysis = {
      status: "manual",
      providerId: null,
    };
    expect(matchListGroup(analysis)).toBe("No video");
  });

  test("no analysis at all resolves to null, not a group", () => {
    expect(matchListGroup(undefined)).toBeNull();
    expect(matchListGroup(null)).toBeNull();
  });
});

test.describe("matchListStatusLabel", () => {
  test("stats_unavailable reads 'Stats unavailable', never ANALYSIS_LABEL's 'Stats failed'", () => {
    const analysis: MatchAnalysis = {
      status: "derivation_failed",
      providerId: null,
      recovery: "stats_unavailable",
    };
    expect(matchListStatusLabel(analysis)).toBe("Stats unavailable");
  });

  test("a retry-classified failed row keeps ANALYSIS_LABEL's 'Failed'", () => {
    const analysis: MatchAnalysis = {
      status: "failed",
      providerId: null,
      recovery: "retry",
    };
    expect(matchListStatusLabel(analysis)).toBe("Failed");
  });

  test("a completed row keeps ANALYSIS_LABEL's 'Analyzed'", () => {
    const analysis: MatchAnalysis = {
      status: "completed",
      providerId: null,
    };
    expect(matchListStatusLabel(analysis)).toBe("Analyzed");
  });
});
