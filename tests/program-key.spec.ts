import { expect, test } from "@playwright/test";

import {
  programKeyFor,
  schoolGroupFor,
} from "@/lib/services/programs/program-key";

/**
 * The admin console's "Create team" writes a collegiate row, and
 * `programs_college_fields_check` refuses one without both of these. Every
 * expectation below is a live directory row read on 2026-09-15 — the rule is
 * the seeded data's, not this test's.
 */

test("the key is the name, de-punctuated, with the squad's letter", () => {
  expect(programKeyFor("Western Kentucky University", "womens")).toBe(
    "WesternKentuckyUniversityW",
  );
  expect(programKeyFor("Davenport University", "mens")).toBe(
    "DavenportUniversityM",
  );
  expect(programKeyFor("Birmingham-Southern College", "mens")).toBe(
    "BirminghamSouthernCollegeM",
  );
  expect(programKeyFor("Bethel University (IN)", "womens")).toBe(
    "BethelUniversityINW",
  );
});

test("a name typed in lower case still produces a directory-shaped key", () => {
  expect(programKeyFor("east stroudsburg university", "womens")).toBe(
    "EastStroudsburgUniversityW",
  );
});

test("accents fold to ASCII — a key is also a URL segment", () => {
  expect(programKeyFor("Université de Montréal", "mens")).toBe(
    "UniversiteDeMontrealM",
  );
});

test("no squad, no suffix — and a name of nothing is an empty key", () => {
  expect(programKeyFor("Claremont-Mudd-Scripps", null)).toBe(
    "ClaremontMuddScripps",
  );
  // A club never reaches the key at all; an unknown squad value must not
  // silently invent a letter.
  expect(programKeyFor("Riverside Tennis Club", "coed")).toBe(
    "RiversideTennisClub",
  );
  expect(programKeyFor("  ", "mens")).toBe("M");
});

test("the group drops 'of' and 'the', spells '&', and carries the state", () => {
  expect(schoolGroupFor("Academy of Art University", "CA")).toBe(
    "academyartuniversity|CA",
  );
  expect(schoolGroupFor("California Institute of Technology", "CA")).toBe(
    "californiainstitutetechnology|CA",
  );
  expect(
    schoolGroupFor("Alabama Agricultural & Mechanical University", "AL"),
  ).toBe("alabamaagriculturalandmechanicaluniversity|AL");
  expect(schoolGroupFor("Bethel University, Tennessee", "tn")).toBe(
    "betheluniversitytennessee|TN",
  );
});

test("two same-named schools in different states are different groups", () => {
  expect(schoolGroupFor("Bethel University", "IN")).not.toBe(
    schoolGroupFor("Bethel University", "TN"),
  );
});

test("a group with no state on file is the stem alone, not a dangling pipe", () => {
  expect(schoolGroupFor("Oglethorpe University", null)).toBe(
    "oglethorpeuniversity",
  );
  expect(schoolGroupFor("Oglethorpe University", "  ")).toBe(
    "oglethorpeuniversity",
  );
});
