import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * The Teammates section of the opponent menu on the upload wizard's Details
 * step (`/dashboard/matches/new`, step 4: `UploadWizardSteps.tsx` →
 * `DetailsStepContent.tsx`) — T4 of the practice sessions queue.
 *
 * Three layers:
 *   1. `teammates.ts`'s pure rules — who is offered, the order, the pick.
 *   2. `OpponentMenu.tsx` rendered for real — the menu body's DOM order both
 *      ways, the RosterRow grammar, and the read-back's Teammate pill.
 *   3. Source assertions for the wiring a static render of the ~2,200-line
 *      step cannot reach: the personal-workspace gate and the handlers.
 */

const WIZARD = "src/components/dashboard/matches/new-match-wizard";
const read = (file: string) =>
  readFileSync(resolve(process.cwd(), file), "utf8");

const loader = createLoader();
const rules = loader.load(`${WIZARD}/teammates.ts`) as {
  teammateOptions: <P>(roster: P[] | null, subjectId: string | null) => P[];
  teammatesMatching: <P>(list: P[], needle: string) => P[];
  playedWithoutTeammates: <R>(played: R[], mates: unknown[]) => R[];
  teammatesFirst: (matchType: string | undefined, inDual: boolean) => boolean;
  opponentIsTeammate: (form: { opponentSource?: string }) => boolean;
  teammatePick: (row: unknown) => Record<string, unknown>;
};
const menu = loader.load(`${WIZARD}/OpponentMenu.tsx`) as {
  OpponentMenuBody: React.ComponentType<Record<string, unknown>>;
  OpponentReadBack: React.ComponentType<Record<string, unknown>>;
};
const { workspaceLabel } = loader.load(`${WIZARD}/RosterMenu.tsx`) as {
  workspaceLabel: (w: Record<string, unknown>) => string;
};

const person = (
  playerId: string,
  name: string,
  extra: Record<string, unknown> = {},
) => ({
  playerId,
  userId: null,
  name,
  ladderPosition: null,
  classYear: null,
  email: null,
  managedBy: "coach",
  hand: null,
  backhand: null,
  invitedEmail: null,
  ...extra,
});

const ACE = person("pp-ace", "Ace Player", { userId: "u-ace" });
const BEN = person("pp-ben", "Ben Okafor", {
  ladderPosition: 2,
  classYear: "Junior",
  hand: "left",
  backhand: "one-handed",
});
const CAL = person("pp-cal", "Cal Invite", {
  invitedEmail: "cal@example.com",
});
const ROSTER = [ACE, BEN, CAL];

const played = (name: string, playerId: string | null = null) => ({
  name,
  matches: 3,
  lastDate: "2026-10-03",
  hand: null,
  backhand: null,
  playerId,
  opponentTeam: null,
});

const LABEL = "Teammates · ZZ Test Program · M";

function body(props: Record<string, unknown>) {
  return renderToStaticMarkup(
    React.createElement(menu.OpponentMenuBody, {
      inDual: false,
      lineSchool: null,
      lineSlot: null,
      rosterShown: [],
      playedShown: [played("Pat Rival")],
      teammates: { label: LABEL, players: [BEN, CAL] },
      teammatesFirst: false,
      chosenTeammateId: null,
      nameTerm: "",
      exactKnown: false,
      onPickRoster: () => {},
      onPickPlayed: () => {},
      onPickTeammate: () => {},
      onCreate: () => {},
      ...props,
    }),
  );
}

const at = (html: string, needle: string) => {
  const i = html.indexOf(needle);
  expect(i, needle).toBeGreaterThanOrEqual(0);
  return i;
};

// ---- 1. Who is offered ----------------------------------------------------

test("the section is the active roster minus the subject, matched on either id", () => {
  expect(
    rules.teammateOptions(ROSTER, "pp-ace").map((p) => p.playerId),
  ).toEqual(["pp-ben", "pp-cal"]);
  // A preset names its player by the login id; that drops the same row.
  expect(rules.teammateOptions(ROSTER, "u-ace").map((p) => p.playerId)).toEqual(
    ["pp-ben", "pp-cal"],
  );
  // Nobody else on the roster: nothing to offer, so no section.
  expect(rules.teammateOptions([ACE], "pp-ace")).toEqual([]);
  expect(rules.teammateOptions(null, "pp-ace")).toEqual([]);
});

test("teammates follow the typed term like the other sections", () => {
  expect(rules.teammatesMatching([BEN, CAL], "")).toHaveLength(2);
  expect(
    rules.teammatesMatching([BEN, CAL], "ben").map((p) => p.playerId),
  ).toEqual(["pp-ben"]);
  expect(rules.teammatesMatching([BEN, CAL], "zed")).toEqual([]);
});

test("absent in a personal workspace and with nobody else on the roster", () => {
  const src = read(`${WIZARD}/UploadWizardSteps.tsx`);
  const memo = src.slice(src.indexOf("const teammates = useMemo"));
  expect(memo).toMatch(/if \(workspaceKind !== "team"\) return null;/);
  expect(memo).toMatch(/if \(players\.length === 0\) return null;/);
  expect(src).toContain("teammates={teammates}");
  expect(
    workspaceLabel({ kind: "team", name: "ZZ Test Program", team: "mens" }),
  ).toBe("ZZ Test Program · M");
  expect(memo).toContain("`Teammates · ${workspaceLabel(program)}`");

  // A null section draws nothing — no label, no divider.
  const html = body({ teammates: null });
  expect(html).not.toContain("Teammates");
  expect(html).not.toContain("my-[5px]");
  expect(body({ teammates: { label: LABEL, players: [] } })).not.toContain(
    "Teammates",
  );
});

// ---- 2. Order --------------------------------------------------------------

test("Practice lists Teammates before People you've played; anything else after", () => {
  expect(rules.teammatesFirst("Practice", false)).toBe(true);
  expect(rules.teammatesFirst("Tournament", false)).toBe(false);
  expect(rules.teammatesFirst(undefined, false)).toBe(false);
  expect(rules.teammatesFirst("Practice", true)).toBe(false);

  const practice = body({ teammatesFirst: true });
  expect(at(practice, LABEL)).toBeLessThan(
    at(practice, "People you&#x27;ve played"),
  );
  expect(at(practice, "Ben Okafor")).toBeLessThan(at(practice, "Pat Rival"));

  const tournament = body({ teammatesFirst: false });
  expect(at(tournament, "People you&#x27;ve played")).toBeLessThan(
    at(tournament, LABEL),
  );
  expect(at(tournament, "Pat Rival")).toBeLessThan(
    at(tournament, "Ben Okafor"),
  );
  // One hairline between the two sections.
  const between = tournament.slice(
    at(tournament, "Pat Rival"),
    at(tournament, LABEL),
  );
  expect(between).toContain("my-[5px] h-px bg-[var(--border-hairline)]");
});

test("a dual lists the opponent school's roster first, then Teammates", () => {
  const html = body({
    inDual: true,
    lineSchool: "Rival U",
    lineSlot: "#1",
    playedShown: [],
    rosterShown: [
      {
        playerId: "op-1",
        name: "Held Line",
        classYear: "Senior",
        meetings: 1,
        heldThisLine: true,
      },
      {
        playerId: "op-2",
        name: "Rest Roster",
        classYear: null,
        meetings: 0,
        heldThisLine: false,
      },
    ],
  });
  expect(at(html, "Rival U · #1 last season")).toBeLessThan(
    at(html, "Rest of their roster"),
  );
  expect(at(html, "Rest Roster")).toBeLessThan(at(html, LABEL));
  expect(html).not.toContain("People you");
});

test("teammate rows use the RosterRow grammar, no pill and no 'Teammate' text", () => {
  const html = body({ playedShown: [], chosenTeammateId: "pp-ben" });
  const section = html.slice(at(html, 'data-menu-section="teammates"'));
  expect(section).toContain(
    "px-2.5 pt-1.5 pb-1 text-[11px] text-[var(--ink-400)]",
  );
  expect(section).toContain(LABEL);
  expect(section).toContain("h-[38px]");
  expect(section).toContain("size-[22px]");
  expect(section).toContain(
    "text-[12px] font-medium whitespace-nowrap text-[var(--ink-900)]",
  );
  expect(section).toContain("#2 Singles · Junior");
  expect(section).toContain("min-w-0 truncate text-[11px]");
  // The invite still out draws the dashed ring.
  expect(section).toContain("border-dashed");
  // Cal has no ladder spot or class: no meta span on that row at all.
  const cal = section.slice(at(section, "Cal Invite"));
  expect(cal.slice(0, cal.indexOf("</button>"))).not.toContain(
    "text-[11px] text-[var(--ink-500)]",
  );
  // Only the row the form names is chosen; no standing fill on it.
  expect(section.match(/aria-selected="true"/g)).toHaveLength(1);
  const ben = section.slice(0, at(section, "Cal Invite"));
  expect(ben).toContain('aria-selected="true"');
  expect(ben).not.toMatch(
    /(?<!hover:|focus-visible:)bg-\[var\(--surface-subtle\)\]/,
  );
  // No per-row "Teammate" — the label says it.
  expect(section.replace(LABEL, "")).not.toContain("Teammate<");
  expect(section).not.toContain("Coach-managed");
});

test("New opponent and the empty hint still work around the section", () => {
  const typed = body({
    playedShown: [],
    teammates: { label: LABEL, players: [] },
    nameTerm: "Zed",
  });
  expect(typed).toContain("New opponent");
  expect(typed).toContain("\u201cZed\u201d");
  const empty = body({ playedShown: [], teammates: null });
  expect(empty).toContain("Type their name.");
  // An exact teammate name is known: no New row.
  const src = read(`${WIZARD}/DetailsStepContent.tsx`);
  expect(src).toMatch(
    /teammatesShown\.some\(\(p\) => normalizedPersonName\(p\.name\) === needle\)/,
  );
  expect(src).toContain("else if (hitTeammate) pickTeammate(hitTeammate);");
});

// ---- 3. The pick -------------------------------------------------------------

test("picking a teammate writes name, roster id, source, style and clears the team", () => {
  const patch = rules.teammatePick(BEN);
  expect(patch).toEqual({
    opponentName: "Ben Okafor",
    opponentSource: "teammate",
    // The `program_players` id — `opponent_player_id`'s FK target.
    opponentPlayerId: "pp-ben",
    opponentHand: "left",
    opponentBackhand: "one-handed",
    opponentStyleSource: "roster",
    opponentTeamProgram: undefined,
    opponentTeamSchool: undefined,
    opponentTeamSource: undefined,
  });
  // The claimed login id never stands in for the roster id.
  const claimed = rules.teammatePick(
    person("pp-dee", "Dee", { userId: "u-dee" }),
  );
  expect(claimed.opponentPlayerId).toBe("pp-dee");
  expect(claimed.opponentHand).toBeUndefined();
  expect(claimed.opponentStyleSource).toBeUndefined();
  for (const key of [
    "opponentTeamProgram",
    "opponentTeamSchool",
    "opponentTeamSource",
  ])
    expect(Object.prototype.hasOwnProperty.call(claimed, key)).toBe(true);

  const src = read(`${WIZARD}/DetailsStepContent.tsx`);
  expect(src).toContain("Object.entries(teammatePick(row))");
  expect(src).toContain("onPickTeammate={pickTeammate}");
});

// ---- 4. The read-back --------------------------------------------------------

test("a teammate opponent reads with the Teammate pill instead of Add their team", () => {
  const teamField = React.createElement(
    "button",
    { "data-team-field": "" },
    "Add their team",
  );
  const readBack = (source: string | undefined) =>
    renderToStaticMarkup(
      React.createElement(menu.OpponentReadBack, {
        name: "Ben Okafor",
        provenance: source === "teammate" ? "Teammate · From the roster" : null,
        isTeammate: rules.opponentIsTeammate({ opponentSource: source }),
        teamField,
        onChange: () => {},
      }),
    );

  const mate = readBack("teammate");
  expect(mate).toContain("Ben Okafor");
  expect(mate).toMatch(/background:var\(--surface-subtle\)[^>]*>Teammate</);
  expect(mate).toContain("Teammate · From the roster");
  expect(mate).not.toContain("Add their team");
  // The pill sits in the name row, after the name.
  expect(at(mate, "Ben Okafor")).toBeLessThan(at(mate, ">Teammate<"));

  // Played, roster and typed opponents get the field back.
  for (const source of ["history", "roster", "new", undefined]) {
    const html = readBack(source);
    expect(html, String(source)).toContain("Add their team");
    expect(html, String(source)).not.toContain(">Teammate<");
  }

  const src = read(`${WIZARD}/DetailsStepContent.tsx`);
  expect(src).toContain("isTeammate={isTeammate}");
  expect(src).toContain(
    'case "teammate":\n      return "Teammate · From the roster";',
  );
});

test("a teammate is not also listed under People you've played", () => {
  const rows = [
    played("Ben Okafor"),
    played("B. T.", "pp-ben"),
    played("Pat Rival"),
  ];
  expect(
    rules.playedWithoutTeammates(rows, [BEN, CAL]).map((r) => r.name),
  ).toEqual(["Pat Rival"]);
  expect(rules.playedWithoutTeammates(rows, [])).toHaveLength(3);

  const src = read(`${WIZARD}/DetailsStepContent.tsx`);
  expect(src).toContain(
    "playedWithoutTeammates(played, teammatePlayers ?? [])",
  );
});
