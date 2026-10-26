import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import {
  AGE_REFUSAL,
  ageAllows,
  ageBand,
  ageOn,
} from "../src/app/onboarding/age";
import {
  LEGAL_VERSIONS,
  legalUpdateCopy,
  missingLegalDocuments,
  requiredLegalDocuments,
} from "../src/lib/legal/versions";

/**
 * The legal-acceptance versions and the onboarding age gate, offline.
 *
 * The versions live in two places that must agree — `LEGAL_VERSIONS` and
 * `current_legal_version()` in SQL, whose insert policy refuses any other
 * version — so this reads the newest migration that defines the function and
 * holds the two in step. The age gate is the owner's rule from 2026-10-25:
 * under 13 never, 13–17 only through a team's link, everyone else an adult.
 */

const MIGRATIONS = resolve(__dirname, "..", "supabase", "migrations");

test("LEGAL_VERSIONS matches current_legal_version() in SQL", () => {
  const sql = readFileSync(
    resolve(MIGRATIONS, "20261025230100_legal_acceptances.sql"),
    "utf8",
  );
  for (const [document, version] of Object.entries(LEGAL_VERSIONS)) {
    expect(sql).toContain(`when '${document}' then '${version}'`);
  }
});

test("everyone agrees to terms and privacy; a guardian to the guardian terms too", () => {
  expect(requiredLegalDocuments("player")).toEqual(["terms", "privacy"]);
  expect(requiredLegalDocuments(null)).toEqual(["terms", "privacy"]);
  expect(requiredLegalDocuments("parent")).toEqual([
    "terms",
    "privacy",
    "guardian",
  ]);
});

test("an older version counts as no acceptance", () => {
  const required = requiredLegalDocuments("parent");
  expect(
    missingLegalDocuments(required, [
      { document: "terms", version: LEGAL_VERSIONS.terms },
      { document: "privacy", version: "1.3" },
      { document: "guardian", version: LEGAL_VERSIONS.guardian },
    ]),
  ).toEqual(["privacy"]);
  expect(
    missingLegalDocuments(
      required,
      Object.entries(LEGAL_VERSIONS).map(([document, version]) => ({
        document,
        version,
      })),
    ),
  ).toEqual([]);
});

test("the terms screen promises nothing the product does not do", () => {
  for (const guardian of [false, true]) {
    const copy = legalUpdateCopy({ returning: true, guardian });
    const text = copy.rows.map((row) => row.text).join("\n");
    // Personal matches are never shared with a team.
    expect(text).toContain("personal matches are never visible to a team");
    expect(text).not.toMatch(
      /share (it|them|a personal match) with (the|your) team/i,
    );
    // The vendor is never named.
    expect(text).not.toMatch(/splitstep/i);
    // Handing an account over is not self-serve.
    if (guardian) expect(text).toContain("contact us");
  }
  expect(legalUpdateCopy({ returning: false, guardian: false }).title).toBe(
    "Agree to our terms",
  );
});

test.describe("age gate", () => {
  const today = "2026-10-25";

  test("whole years, counted on the date parts", () => {
    expect(ageOn("2008-10-25", today)).toBe(18);
    expect(ageOn("2008-10-26", today)).toBe(17);
    expect(ageOn("2013-10-25", today)).toBe(13);
    expect(ageOn("2013-10-26", today)).toBe(12);
  });

  test("a date that is not a real day, or in the future, is no age", () => {
    expect(ageOn("2010-02-31", today)).toBeNull();
    expect(ageOn("2027-01-01", today)).toBeNull();
    expect(ageOn("1899-12-31", today)).toBeNull();
    expect(ageOn("", today)).toBeNull();
    expect(ageOn(null, today)).toBeNull();
  });

  test("bands", () => {
    expect(ageBand("2000-01-15", today)).toBe("adult");
    expect(ageBand("2010-01-15", today)).toBe("teen");
    expect(ageBand("2016-01-15", today)).toBe("child");
  });

  test("13–17 only through a team link; under 13 never", () => {
    expect(ageAllows("adult", false)).toBe(true);
    expect(ageAllows("adult", true)).toBe(true);
    expect(ageAllows("teen", true)).toBe(true);
    expect(ageAllows("teen", false)).toBe(false);
    expect(ageAllows("child", true)).toBe(false);
    expect(ageAllows("child", false)).toBe(false);
  });

  test("the refusals point to a parent or legal guardian, never academy staff", () => {
    for (const sentence of Object.values(AGE_REFUSAL)) {
      expect(sentence).toContain("parent or legal guardian");
      expect(sentence).not.toMatch(/academy staff/i);
    }
  });
});
