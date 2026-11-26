import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  PILOT_TERMS_VERSION,
  TEAM_TERMS_VERSION,
  isShownTermsVersion,
  pilotTermsCopy,
  teamTermsCopy,
  termsCopyFor,
  termsVersionFor,
  type PilotTermsCopy,
  type PilotTermsFlow,
} from "../src/lib/services/programs/pilot-terms";
import {
  formatPilotEnd,
  getMonthlyCapHours,
  type AccountType,
} from "../src/lib/services/splitstep/config";

/**
 * The pilot terms screen's copy (`pilot-terms.ts`, beside
 * `PILOT_TERMS_VERSION`). Offline: it renders the copy module for each flow
 * and tier and reads the strings a coach would see.
 *
 * What it pins is what the coach is agreeing to: the date and the hours are
 * the functions the product enforces with, not numbers typed into a sentence,
 * and the wording makes no promise the product does not keep.
 */

/** Every string the screen can show, flattened. */
function allText(copy: PilotTermsCopy): string[] {
  return [
    copy.title,
    copy.intro,
    ...copy.terms.map((t) => t.segments.map((s) => s.text).join("")),
    copy.confirmation,
    copy.button,
    copy.pendingButton,
    copy.micro,
    copy.refused,
  ];
}

const CASES: { flow: PilotTermsFlow; tier: AccountType }[] = [
  { flow: "college", tier: "program" },
  { flow: "team", tier: "individual" },
  // The hours follow the tier passed in, never the flow.
  { flow: "team", tier: "program" },
  { flow: "college", tier: "individual" },
];

for (const { flow, tier } of CASES) {
  test.describe(`${flow} flow, ${tier} tier`, () => {
    const copy = pilotTermsCopy({ flow, accountType: tier });
    const text = allText(copy).join("\n");

    test("no em dash anywhere", () => {
      expect(text).not.toContain("—");
    });

    test("never names the vendor", () => {
      expect(text).not.toMatch(/splitstep/i);
    });

    test("promises no export or privacy guarantee", () => {
      expect(text).not.toMatch(/export/i);
      expect(text).not.toMatch(/privacy/i);
    });

    test("the end date is formatPilotEnd()", () => {
      const allowance = copy.terms[0].segments;
      const date = allowance.find((s) => s.emphasis === "strong");
      expect(date?.text).toBe(formatPilotEnd());
    });

    test("the hours are getMonthlyCapHours() for the tier passed in", () => {
      const allowance = copy.terms[0].segments;
      const hours = allowance.find((s) => s.emphasis === "figure");
      expect(hours?.text).toBe(`${getMonthlyCapHours(tier)}h`);
    });

    test("terms 1–2 are blue, 4–5 ink, term 3 is the checkbox", () => {
      expect(copy.terms.map((t) => t.tone)).toEqual([
        "blue",
        "blue",
        "ink",
        "ink",
      ]);
      expect(copy.confirmation).toMatch(/^I can add players/);
    });
  });
}

test("the custom-team screen creates the team, the college one continues", () => {
  expect(
    pilotTermsCopy({ flow: "team", accountType: "individual" }).button,
  ).toBe("Accept and create team");
  expect(
    pilotTermsCopy({ flow: "college", accountType: "program" }).button,
  ).toBe("Accept and continue");
});

test("a custom team is never promised the collegiate hours", () => {
  const team = pilotTermsCopy({ flow: "team", accountType: "individual" });
  const college = pilotTermsCopy({ flow: "college", accountType: "program" });
  const figure = (c: PilotTermsCopy) =>
    c.terms[0].segments.find((s) => s.emphasis === "figure")?.text;
  expect(figure(team)).not.toBe(figure(college));
});

test("the copy module and the form carry no literal date or hours", () => {
  const read = (path: string) =>
    readFileSync(resolve(__dirname, "..", path), "utf8");
  for (const source of [
    read("src/lib/services/programs/pilot-terms.ts"),
    read("src/components/claim/pilot-terms-form.tsx"),
  ]) {
    expect(source).not.toMatch(/\b75\b/);
    expect(source).not.toContain("December 31");
    expect(source).not.toContain("2026-12-31");
  }
});

test("the form renders no term prose of its own", () => {
  const form = readFileSync(
    resolve(__dirname, "..", "src/components/claim/pilot-terms-form.tsx"),
    "utf8",
  );
  const college = pilotTermsCopy({ flow: "college", accountType: "program" });
  const team = pilotTermsCopy({ flow: "team", accountType: "individual" });
  for (const copy of [college, team]) {
    for (const line of allText(copy)) {
      // Long enough to be prose, not a shared word like "Creating".
      if (line.length > 24) expect(form).not.toContain(line);
    }
    for (const term of copy.terms) {
      for (const segment of term.segments) {
        if (segment.text.length > 24) expect(form).not.toContain(segment.text);
      }
    }
  }
});

test("both flows disclose that the video analysis provider trains on match video, junior teams' included", () => {
  const sentence =
    "Our video analysis provider uses match video, including video from high school and junior teams, to improve its analysis models.";
  const textOf = (copy: PilotTermsCopy) =>
    copy.terms.map((t) => t.segments.map((s) => s.text).join("")).join("\n");
  for (const copy of [
    pilotTermsCopy({ flow: "team", accountType: "individual" }),
    pilotTermsCopy({ flow: "college", accountType: "program" }),
  ]) {
    expect(textOf(copy)).toContain(sentence);
    expect(textOf(copy)).not.toContain("never used to train");
  }
});

/* -------------------------------------------------------------------------
 * The team terms (`TEAM_TERMS_VERSION`), for a claim from January 1, 2027 by
 * a team that is not on a running pilot.
 * ---------------------------------------------------------------------- */

const BEFORE = new Date("2026-12-31T23:59:59.999Z");
const AFTER = new Date("2027-01-01T00:00:00Z");

const DATA_USE =
  "We may use pilot usage and data to improve Advantage. Our video analysis provider uses match video, including video from high school and junior teams, to improve its analysis models.";

const rowsOf = (copy: PilotTermsCopy) =>
  copy.terms.map((t) => ({
    tone: t.tone,
    text: t.segments.map((s) => s.text).join(""),
  }));

test("the two version ids", () => {
  expect(PILOT_TERMS_VERSION).toBe("2026-fall-pilot-3");
  expect(TEAM_TERMS_VERSION).toBe("2027-team-1");
});

test("which version a claim is made under", () => {
  // Before the date: the pilot's, whatever the program.
  expect(termsVersionFor({ now: BEFORE })).toBe(PILOT_TERMS_VERSION);
  expect(termsVersionFor({ now: BEFORE, pilotRunning: true })).toBe(
    PILOT_TERMS_VERSION,
  );
  // From the first instant of January 1 UTC: the team terms...
  expect(termsVersionFor({ now: AFTER })).toBe(TEAM_TERMS_VERSION);
  expect(termsVersionFor({ now: AFTER, pilotRunning: false })).toBe(
    TEAM_TERMS_VERSION,
  );
  // ...except for a program whose pilot is running.
  expect(termsVersionFor({ now: AFTER, pilotRunning: true })).toBe(
    PILOT_TERMS_VERSION,
  );
});

test("acceptance takes exactly the version that was shown and refuses the other", () => {
  for (const [expected, other] of [
    [PILOT_TERMS_VERSION, TEAM_TERMS_VERSION],
    [TEAM_TERMS_VERSION, PILOT_TERMS_VERSION],
  ] as const) {
    expect(isShownTermsVersion(expected, expected)).toBe(true);
    expect(isShownTermsVersion(other, expected)).toBe(false);
    expect(isShownTermsVersion("2026-fall-pilot-2", expected)).toBe(false);
    expect(isShownTermsVersion("", expected)).toBe(false);
    expect(isShownTermsVersion(undefined, expected)).toBe(false);
    expect(isShownTermsVersion(null, expected)).toBe(false);
  }
});

test("the acceptance is checked against the version the server resolved, by one function", () => {
  const server = readFileSync(
    resolve(__dirname, "..", "src/lib/services/programs/pilot-terms-server.ts"),
    "utf8",
  );
  // The gate, and the row written is the expected version, never the
  // rendered one.
  expect(server).toContain(
    "if (!isShownTermsVersion(renderedVersion, expected)) {",
  );
  expect(server).toContain('return { ok: false, reason: "terms-changed" };');
  expect(server).toContain(
    ".insert({ user_id: user.id, terms_version: expected });",
  );
  // Not a server-action module: a browser cannot call it with a version of
  // its choosing.
  expect(server).not.toMatch(/^["']use server["']/m);

  // The one browser-callable accept resolves the version itself.
  const actions = readFileSync(
    resolve(
      __dirname,
      "..",
      "src/lib/services/programs/pilot-terms-actions.ts",
    ),
    "utf8",
  );
  expect(actions.match(/^export /gm)).toHaveLength(1);
  expect(actions).toContain("claimTermsVersion(");
});

test("the team terms, college flow", () => {
  const copy = teamTermsCopy({ flow: "college" });
  expect(copy.title).toBe("Team terms");
  expect(copy.intro).toBe(
    "You accept these once for this program. Your staff and players won't be asked.",
  );
  expect(rowsOf(copy)).toEqual([
    {
      tone: "blue",
      text: "Setting up is free. Video analysis needs a plan, billed by invoice; hours start when the plan is set and unused hours expire when it ends.",
    },
    { tone: "ink", text: DATA_USE },
    {
      tone: "ink",
      text: "We may change plans and prices for a later season, and we'll tell you first.",
    },
  ]);
  expect(copy.micro).toBe("Free to set up. No card on file.");
});

test("the team terms, custom-team flow, keep the SwingVision sentence", () => {
  const copy = teamTermsCopy({ flow: "team" });
  expect(copy.title).toBe("Team terms");
  expect(copy.intro).toBe(
    "You accept these once for this team. Your staff and players won't be asked.",
  );
  expect(rowsOf(copy)[0]).toEqual({
    tone: "blue",
    text: "Setting up is free. Video analysis needs a plan, billed by invoice; hours start when the plan is set and unused hours expire when it ends. SwingVision imports are free and unlimited.",
  });
  expect(rowsOf(copy).slice(1)).toEqual(
    rowsOf(teamTermsCopy({ flow: "college" })).slice(1),
  );
  expect(copy.micro).toBe("Free to set up. No card on file.");
});

test("the team terms promise no hours, no date and no pilot allowance", () => {
  for (const flow of ["college", "team"] as const) {
    const copy = teamTermsCopy({ flow });
    // No figure and no emphasised date: nothing here is an allowance.
    for (const term of copy.terms) {
      for (const segment of term.segments) {
        expect(segment.emphasis).toBeUndefined();
      }
    }
    const text = allText(copy).join("\n");
    expect(text).not.toMatch(/\d+h\b/);
    expect(text).not.toContain(formatPilotEnd());
    expect(text).not.toMatch(/Free through|end the pilot|monthly hours/);
    expect(text).not.toContain("—");
    expect(text).not.toMatch(/splitstep/i);
  }
});

test("the confirmation, the buttons and the refusal are the pilot's, word for word", () => {
  for (const flow of ["college", "team"] as const) {
    const pilot = pilotTermsCopy({
      flow,
      accountType: flow === "college" ? "program" : "individual",
    });
    const team = teamTermsCopy({ flow });
    expect(team.intro).toBe(pilot.intro);
    expect(team.confirmation).toBe(pilot.confirmation);
    expect(team.button).toBe(pilot.button);
    expect(team.pendingButton).toBe(pilot.pendingButton);
    expect(team.refused).toBe(pilot.refused);
    expect(team.refused).toBe(
      "These terms changed while you were reading. Accept the current version to continue.",
    );
  }
});

test("the pilot terms are unchanged by the second version", () => {
  const copy = pilotTermsCopy({ flow: "college", accountType: "program" });
  expect(copy.title).toBe("Fall Season Pilot terms");
  expect(copy.micro).toBe("Free. No card on file.");
  expect(rowsOf(copy).map((r) => r.tone)).toEqual([
    "blue",
    "blue",
    "ink",
    "ink",
  ]);
  expect(rowsOf(copy)[0].text).toBe(
    `Free through ${formatPilotEnd()}, with ${getMonthlyCapHours("program")}h of Advantage Intelligence video analysis a month for the program. No card and no obligation to buy.`,
  );
  expect(rowsOf(copy)[2].text).toBe(DATA_USE);
  expect(rowsOf(copy)[3].text).toBe(
    "We may change the monthly hours or end the pilot, and we'll tell you first.",
  );
});

test("a screen gets the words of the version it renders", () => {
  for (const flow of ["college", "team"] as const) {
    const accountType = flow === "college" ? "program" : "individual";
    expect(termsCopyFor(PILOT_TERMS_VERSION, { flow, accountType })).toEqual(
      pilotTermsCopy({ flow, accountType }),
    );
    expect(termsCopyFor(TEAM_TERMS_VERSION, { flow, accountType })).toEqual(
      teamTermsCopy({ flow }),
    );
  }
});

test("the team version's id is the one the migration accepts", () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      "..",
      "supabase/migrations/20261126100000_plans_2027_team_terms.sql",
    ),
    "utf8",
  );
  expect(migration).toContain(
    `select array[public.current_pilot_terms_version(), '${TEAM_TERMS_VERSION}']::text[];`,
  );
});
