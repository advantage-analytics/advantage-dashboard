import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  pilotTermsCopy,
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
