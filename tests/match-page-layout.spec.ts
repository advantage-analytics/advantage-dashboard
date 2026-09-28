import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  isStatsUnavailable,
  matchPageKind,
  type AnalysisStatus,
  type RecoveryClass,
} from "@/lib/data/match-analysis";

/**
 * The match page's layout decision — Analysis steps or the report — as one
 * pure truth table (guardrails §3.3). The page and the route's skeleton both
 * call `matchPageKind`, so pinning it here pins both.
 */

const IN_FLIGHT: AnalysisStatus[] = [
  "uploading",
  "uploaded",
  "queued",
  "processing",
  "deriving",
  "processed",
];
const FAILED: AnalysisStatus[] = ["failed", "derivation_failed"];
const NON_STATS_UNAVAILABLE: RecoveryClass[] = [
  "retry",
  "upload_again",
  "fix_recording",
  "wait_or_ask",
  "rederive",
];
const REPORT: AnalysisStatus[] = [
  "completed",
  "timeline",
  "imported",
  "manual",
];

test.describe("matchPageKind", () => {
  for (const status of IN_FLIGHT) {
    test(`${status} draws the steps`, () => {
      expect(matchPageKind({ status })).toBe("steps");
    });
  }

  for (const status of FAILED) {
    test(`${status} with no recovery draws the steps`, () => {
      expect(matchPageKind({ status })).toBe("steps");
      expect(matchPageKind({ status, recovery: undefined })).toBe("steps");
    });
    for (const recovery of NON_STATS_UNAVAILABLE) {
      test(`${status} + ${recovery} draws the steps`, () => {
        expect(matchPageKind({ status, recovery })).toBe("steps");
      });
    }
  }

  test("derivation_failed + stats_unavailable draws the report", () => {
    expect(
      matchPageKind({
        status: "derivation_failed",
        recovery: "stats_unavailable",
      }),
    ).toBe("report");
  });

  for (const status of REPORT) {
    test(`${status} draws the report`, () => {
      expect(matchPageKind({ status })).toBe("report");
    });
  }

  test("a stale stats_unavailable class never waves an in-flight job through", () => {
    for (const status of IN_FLIGHT) {
      expect(matchPageKind({ status, recovery: "stats_unavailable" })).toBe(
        "steps",
      );
      expect(
        isStatsUnavailable({ status, recovery: "stats_unavailable" }),
      ).toBe(false);
    }
  });
});

test.describe("isStatsUnavailable", () => {
  test("only a failed status carrying stats_unavailable", () => {
    for (const status of FAILED) {
      expect(
        isStatsUnavailable({ status, recovery: "stats_unavailable" }),
      ).toBe(true);
      expect(isStatsUnavailable({ status })).toBe(false);
      for (const recovery of NON_STATS_UNAVAILABLE) {
        expect(isStatsUnavailable({ status, recovery })).toBe(false);
      }
    }
    for (const status of REPORT) {
      expect(
        isStatsUnavailable({ status, recovery: "stats_unavailable" }),
      ).toBe(false);
    }
  });
});

test.describe("the page hint's boundaries", () => {
  const HINT = readFileSync("src/lib/data/match-page-hint-server.ts", "utf8");
  const LOADER = readFileSync("src/lib/data/match-analysis-server.ts", "utf8");

  test("the hint is cached, RLS-scoped and write-free", () => {
    expect(HINT).toContain('import { cache } from "react";');
    expect(HINT).toContain(
      'import { createClient } from "@/lib/supabase/server";',
    );
    expect(HINT).toMatch(/export const getMatchPageHint = cache\(/);
    expect(HINT).not.toContain("@/lib/supabase/admin");
    // Its doc comment names both to say why they are absent; neither is used.
    expect(HINT).not.toMatch(/reap:/);
    expect(HINT).not.toMatch(/reconcileBeforePageRead\(/);
    expect(HINT).not.toContain("@/lib/services/splitstep/reconcile");
    expect(HINT).toContain('.from("matches")');
    expect(HINT).toContain("if (!row) return null;");
    expect(HINT).toContain(
      "analysisFor(await loadMatchAnalysis(supabase, [matchId]),",
    );
    expect(HINT).toContain("matchPageKind(analysis)");
  });

  test("the client-imported loader gains no server-only imports", () => {
    expect(LOADER).not.toContain("@/lib/supabase/server");
    expect(LOADER).not.toMatch(/from "react"/);
  });
});
