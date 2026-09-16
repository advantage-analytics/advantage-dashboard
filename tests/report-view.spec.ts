import { expect, test } from "@playwright/test";

import {
  REPORT_VIEWS,
  parseReportView,
  reportViewQuery,
} from "@/components/dashboard/matches/match-detail/report-view";

/**
 * The report's rail switcher (F1) and the `?tab=` rule behind it. Pure and
 * offline, same model as `tests/set-scope.spec.ts`.
 */

test.describe("REPORT_VIEWS", () => {
  test("is the rail's three rows, in order", () => {
    expect(REPORT_VIEWS).toEqual([
      { value: "statistics", label: "Statistics" },
      { value: "shots", label: "Visualizations" },
      { value: "film", label: "Video" },
    ]);
  });
});

test.describe("parseReportView", () => {
  test("shots and film pass through", () => {
    expect(parseReportView("shots")).toBe("shots");
    expect(parseReportView("film")).toBe("film");
  });

  test("absent, empty, mis-cased or stale values read as statistics", () => {
    // "stats" is the retired `?tab=` spelling this page never used but a
    // hand-edited or bookmarked URL still might; "Shots" is the case a typo
    // or a stale link could produce.
    for (const raw of [null, "", "Shots", "stats"]) {
      expect(parseReportView(raw)).toBe("statistics");
    }
  });
});

test.describe("reportViewQuery", () => {
  test("statistics clears the tab parameter entirely", () => {
    expect(
      reportViewQuery(new URLSearchParams("tab=shots"), "statistics"),
    ).toBe("");
  });

  test("shots and film write the tab parameter", () => {
    expect(reportViewQuery(new URLSearchParams(), "shots")).toBe("tab=shots");
    expect(reportViewQuery(new URLSearchParams(), "film")).toBe("tab=film");
  });

  test("every other parameter survives a view change", () => {
    // `?set=2` is the one that matters: switching views must not throw the
    // reader's set scope away.
    expect(reportViewQuery(new URLSearchParams("set=2"), "shots")).toBe(
      "set=2&tab=shots",
    );
    expect(
      reportViewQuery(new URLSearchParams("tab=shots&set=2"), "statistics"),
    ).toBe("set=2");
  });

  test("the caller is not mutated", () => {
    const current = new URLSearchParams("set=2");
    reportViewQuery(current, "film");
    expect(current.toString()).toBe("set=2");
  });
});
