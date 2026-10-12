import { expect, test } from "@playwright/test";

import { parsePathSpec } from "../scripts/eyes-on/path-spec.mjs";

test.describe("eyes-on path spec", () => {
  test("plain path is personal with no clicks", () => {
    expect(parsePathSpec("/dashboard/matches")).toEqual({
      team: false,
      path: "/dashboard/matches",
      clicks: [],
    });
  });

  test("a /dashboard/team path selects the team by location", () => {
    expect(parsePathSpec("/dashboard/team/roster")).toEqual({
      team: true,
      path: "/dashboard/team/roster",
      clicks: [],
    });
  });

  test("team: prefix selects the team and is stripped", () => {
    expect(parsePathSpec("team:/dashboard/opponents")).toEqual({
      team: true,
      path: "/dashboard/opponents",
      clicks: [],
    });
  });

  test("prefix plus clicks", () => {
    expect(
      parsePathSpec("team:/dashboard/matches/new::Add their team::Next"),
    ).toEqual({
      team: true,
      path: "/dashboard/matches/new",
      clicks: ["Add their team", "Next"],
    });
  });

  test("clicks without a prefix are unchanged", () => {
    expect(parsePathSpec("/dashboard/team/roster::Invite::Join link")).toEqual({
      team: true,
      path: "/dashboard/team/roster",
      clicks: ["Invite", "Join link"],
    });
  });

  test("team: inside a click name is left alone", () => {
    expect(parsePathSpec("/dashboard::team:/x")).toEqual({
      team: false,
      path: "/dashboard",
      clicks: ["team:/x"],
    });
  });

  test("an argument that is not a path is rejected", () => {
    expect(parsePathSpec("dashboard")).toBeNull();
    expect(parsePathSpec("team:dashboard")).toBeNull();
    expect(parsePathSpec("team:")).toBeNull();
  });
});
