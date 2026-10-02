import { expect, test } from "@playwright/test";

import {
  REPORT_VIEWS,
  parseReportView,
  reportViewQuery,
  resolveDefaultView,
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

/**
 * Settings › Preferences › "Match report opens at" supplies the default view.
 * A URL without `?tab=` opens there; a URL that names a view still wins.
 */
test.describe("default view from the preference", () => {
  test("an absent or unknown tab reads as the saved default", () => {
    for (const raw of [null, "", "Shots", "stats", "story"]) {
      expect(parseReportView(raw, "film")).toBe("film");
    }
  });

  test("an explicit tab beats the default, statistics included", () => {
    expect(parseReportView("statistics", "film")).toBe("statistics");
    expect(parseReportView("shots", "film")).toBe("shots");
  });

  test("selecting the default view clears the tab parameter", () => {
    expect(
      reportViewQuery(
        new URLSearchParams("tab=statistics&set=2"),
        "shots",
        "shots",
      ),
    ).toBe("set=2");
  });

  test("statistics is written out when it is not the default", () => {
    // Otherwise a reload would drop the reader back on their saved view.
    expect(
      reportViewQuery(new URLSearchParams("tab=film"), "statistics", "film"),
    ).toBe("tab=statistics");
  });
});

test.describe("resolveDefaultView", () => {
  test("a saved Video preference opens at Statistics when there is no video", () => {
    expect(resolveDefaultView("film", false)).toBe("statistics");
    expect(resolveDefaultView("film", true)).toBe("film");
  });

  test("the other views never depend on video", () => {
    expect(resolveDefaultView("shots", false)).toBe("shots");
    expect(resolveDefaultView("statistics", false)).toBe("statistics");
  });
});
