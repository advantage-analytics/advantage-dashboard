import { expect, test } from "@playwright/test";

import {
  isSquadAllowed,
  squadLabel,
  squadMark,
  squadOptionsFor,
  squadsFor,
  toGenderedSquad,
  toSquad,
} from "@/lib/data/squad";
import { programDisplayName, teamLabel } from "@/lib/data/programs-server";
import {
  teamLabel as workspaceTeamLabel,
  workspaceSubtitle,
  type Workspace,
} from "@/lib/workspace/types";

/**
 * `programs.team` — men's, women's, co-ed, or never said.
 *
 * The rule these pin is the one that was broken: null is not a squad. Settings
 * used to read it as "mens", print "Men's tennis" on a club's Squad field and
 * write it to the row on the next save.
 */

test("an unset or unknown squad stays null — nothing guesses one", () => {
  expect(toSquad(null)).toBeNull();
  expect(toSquad(undefined)).toBeNull();
  expect(toSquad("")).toBeNull();
  expect(toSquad("mixed")).toBeNull();
  expect(toSquad("mens")).toBe("mens");
  expect(toSquad("womens")).toBe("womens");
  expect(toSquad("coed")).toBe("coed");
});

test("co-ed and unset both mean no single squad's college directory", () => {
  expect(toGenderedSquad("coed")).toBeNull();
  expect(toGenderedSquad(null)).toBeNull();
  expect(toGenderedSquad("womens")).toBe("womens");
});

test("a college is men's or women's; every other type may also be co-ed", () => {
  expect(squadsFor("college")).toEqual(["mens", "womens"]);
  for (const type of ["club", "high_school", "academy", "other"]) {
    expect(squadsFor(type)).toEqual(["mens", "womens", "coed"]);
  }
  expect(isSquadAllowed("college", "coed")).toBe(false);
  expect(isSquadAllowed("club", "coed")).toBe(true);
  expect(squadOptionsFor("high_school").map((o) => o.label)).toEqual([
    "Men's tennis",
    "Women's tennis",
    "Co-ed tennis",
  ]);
});

test("labels say Co-ed, and say nothing for a team that never chose", () => {
  expect(squadLabel("coed")).toBe("Co-ed");
  expect(squadLabel(null)).toBeNull();
  expect(squadMark("mens")).toBe("M");
  expect(squadMark("coed")).toBe("Co-ed");
  expect(squadMark(null)).toBeNull();
  expect(workspaceTeamLabel("coed")).toBe("Co-ed");
  expect(workspaceTeamLabel(null)).toBeNull();
  // The directory helper keeps its historical fallback for a college row,
  // and no longer turns co-ed into "Men's".
  expect(teamLabel("coed")).toBe("Co-ed");
  expect(teamLabel("womens")).toBe("Women's");
});

test("a co-ed program is called by its own name; the tag rides beside it", () => {
  expect(programDisplayName("Riverside Tennis Club", "coed")).toBe(
    "Riverside Tennis Club",
  );
  expect(programDisplayName("Riverside Tennis Club", null)).toBe(
    "Riverside Tennis Club",
  );
  expect(programDisplayName("Meridian State", "mens")).toBe(
    "Meridian State Men's Tennis",
  );

  const workspace = { kind: "team", team: "coed" } as Workspace;
  expect(workspaceSubtitle(workspace)).toBe("Co-ed team workspace");
  expect(workspaceSubtitle({ ...workspace, team: null })).toBe(
    "Team workspace",
  );
});
