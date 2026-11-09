import { expect, test } from "@playwright/test";

import {
  DEFAULT_PROFILE_VIEW,
  PROFILE_VIEWS,
  PROFILE_VIEW_PARAM,
  parseProfileView,
  profileViewLabel,
  profileViewQuery,
} from "@/components/dashboard/team/player-profile/profile-view";

/**
 * The player profile's rail switcher (design Q) and its `?tab=` rule. Pure
 * and offline, the same model as `tests/report-view.spec.ts`.
 */

test.describe("PROFILE_VIEWS", () => {
  test("is the rail's two rows, in order, keyed on tab", () => {
    expect(PROFILE_VIEWS).toEqual([
      { value: "statistics", label: "Statistics" },
      { value: "visualizations", label: "Visualizations" },
    ]);
    expect(PROFILE_VIEW_PARAM).toBe("tab");
    expect(DEFAULT_PROFILE_VIEW).toBe("statistics");
  });
});

test.describe("parseProfileView", () => {
  test("a view passes through", () => {
    expect(parseProfileView("statistics")).toBe("statistics");
    expect(parseProfileView("visualizations")).toBe("visualizations");
  });

  test("absent, empty, mis-cased or a report-only value reads as Statistics", () => {
    for (const value of [
      null,
      undefined,
      "",
      "Visualizations",
      "shots",
      "film",
      " visualizations",
    ]) {
      expect(parseProfileView(value)).toBe("statistics");
    }
  });

  test("a repeated tab takes the first value", () => {
    expect(parseProfileView(["visualizations", "statistics"])).toBe(
      "visualizations",
    );
    expect(parseProfileView([])).toBe("statistics");
  });
});

test.describe("profileViewLabel", () => {
  test("names each view as the rail does", () => {
    expect(profileViewLabel("statistics")).toBe("Statistics");
    expect(profileViewLabel("visualizations")).toBe("Visualizations");
  });
});

test.describe("profileViewQuery", () => {
  test("the default view clears tab; the other writes it", () => {
    expect(
      profileViewQuery(new URLSearchParams("tab=visualizations"), "statistics"),
    ).toBe("");
    expect(profileViewQuery(new URLSearchParams(""), "visualizations")).toBe(
      "tab=visualizations",
    );
  });

  test("every other parameter is carried through", () => {
    expect(
      profileViewQuery(new URLSearchParams("a=1&tab=x&b=2"), "visualizations"),
    ).toBe("a=1&tab=visualizations&b=2");
    expect(
      profileViewQuery(new URLSearchParams("a=1&tab=x&b=2"), "statistics"),
    ).toBe("a=1&b=2");
  });

  test("never mutates the params it was handed", () => {
    const params = new URLSearchParams("tab=visualizations");
    profileViewQuery(params, "statistics");
    expect(params.toString()).toBe("tab=visualizations");
  });
});
