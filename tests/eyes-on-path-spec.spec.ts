import { expect, test } from "@playwright/test";

import { fillSessionId, parsePathSpec } from "../scripts/eyes-on/path-spec.mjs";

test.describe("eyes-on path spec", () => {
  test("plain path is personal with no clicks", () => {
    expect(parsePathSpec("/dashboard/matches")).toEqual({
      team: false,
      labeller: false,
      path: "/dashboard/matches",
      clicks: [],
    });
  });

  test("a /dashboard/team path selects the team by location", () => {
    expect(parsePathSpec("/dashboard/team/roster")).toEqual({
      team: true,
      labeller: false,
      path: "/dashboard/team/roster",
      clicks: [],
    });
  });

  test("team: prefix selects the team and is stripped", () => {
    expect(parsePathSpec("team:/dashboard/opponents")).toEqual({
      team: true,
      labeller: false,
      path: "/dashboard/opponents",
      clicks: [],
    });
  });

  test("prefix plus clicks", () => {
    expect(
      parsePathSpec("team:/dashboard/matches/new::Add their team::Next"),
    ).toEqual({
      team: true,
      labeller: false,
      path: "/dashboard/matches/new",
      clicks: ["Add their team", "Next"],
    });
  });

  test("clicks without a prefix are unchanged", () => {
    expect(parsePathSpec("/dashboard/team/roster::Invite::Join link")).toEqual({
      team: true,
      labeller: false,
      path: "/dashboard/team/roster",
      clicks: ["Invite", "Join link"],
    });
  });

  test("team: inside a click name is left alone", () => {
    expect(parsePathSpec("/dashboard::team:/x")).toEqual({
      team: false,
      labeller: false,
      path: "/dashboard",
      clicks: ["team:/x"],
    });
  });

  test("an argument that is not a path is rejected", () => {
    expect(parsePathSpec("dashboard")).toBeNull();
    expect(parsePathSpec("team:dashboard")).toBeNull();
    expect(parsePathSpec("team:")).toBeNull();
  });

  test("labeller: prefix signs in as the labeller and is stripped", () => {
    expect(parsePathSpec("labeller:/label/guide")).toEqual({
      team: false,
      labeller: true,
      path: "/label/guide",
      clicks: [],
    });
  });

  test("a /label path is the labeller's without a prefix", () => {
    expect(parsePathSpec("/label")).toEqual({
      team: false,
      labeller: true,
      path: "/label",
      clicks: [],
    });
    expect(parsePathSpec("/label/[sessionId]::Overview")).toEqual({
      team: false,
      labeller: true,
      path: "/label/[sessionId]",
      clicks: ["Overview"],
    });
  });

  test("team:/dashboard/team and a bare /dashboard are not labeller paths", () => {
    expect(parsePathSpec("team:/dashboard/team")).toEqual({
      team: true,
      labeller: false,
      path: "/dashboard/team",
      clicks: [],
    });
    expect(parsePathSpec("/dashboard")).toEqual({
      team: false,
      labeller: false,
      path: "/dashboard",
      clicks: [],
    });
  });

  test("/labels and /admin/labels are not the labeller area", () => {
    expect(parsePathSpec("/labels")?.labeller).toBe(false);
    expect(parsePathSpec("/admin/labels")?.labeller).toBe(false);
  });

  test("labeller: prefix on a dashboard path keeps it out of the team", () => {
    expect(parsePathSpec("labeller:/dashboard/team")).toEqual({
      team: false,
      labeller: true,
      path: "/dashboard/team",
      clicks: [],
    });
  });

  test("the two prefixes do not combine", () => {
    expect(parsePathSpec("labeller:team:/dashboard")).toBeNull();
    expect(parsePathSpec("team:labeller:/label")).toBeNull();
    expect(parsePathSpec("labeller:label")).toBeNull();
  });

  test("fillSessionId resolves a [sessionId] segment when an id is set", () => {
    expect(fillSessionId("/label/[sessionId]", "abc")).toBe("/label/abc");
    expect(fillSessionId("/label/[sessionId]", "")).toBe("/label/[sessionId]");
    expect(fillSessionId("/label/guide", "abc")).toBe("/label/guide");
  });
});
