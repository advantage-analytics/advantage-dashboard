import { expect, test } from "@playwright/test";

import {
  hasProfileName,
  splitRosterName,
} from "@/lib/services/programs/join-name";

/**
 * Joining marks an account onboarded, so the name step never runs afterwards.
 * `/join/<token>` therefore sends a nameless account through that step first,
 * and these are the two rules it leans on: what "nameless" means — asked by
 * both the join page and the onboarding page, which must agree or the two
 * redirect to each other forever — and how a coach's roster name becomes the
 * fields' starting values.
 */
test.describe("hasProfileName · one rule for both readers", () => {
  test("a first name is a name", () => {
    expect(hasProfileName("Priya")).toBe(true);
  });

  test("missing, empty and blank are all nameless", () => {
    expect(hasProfileName(null)).toBe(false);
    expect(hasProfileName(undefined)).toBe(false);
    expect(hasProfileName("")).toBe(false);
    expect(hasProfileName("   ")).toBe(false);
  });
});

test.describe("splitRosterName · a prefill, never a write", () => {
  test("the last word is the last name", () => {
    expect(splitRosterName("Priya Sharma")).toEqual({
      firstName: "Priya",
      lastName: "Sharma",
    });
  });

  test("a longer name keeps everything before the last word together", () => {
    expect(splitRosterName("Mary Jane Watson")).toEqual({
      firstName: "Mary Jane",
      lastName: "Watson",
    });
  });

  test("one word fills only the first field", () => {
    expect(splitRosterName("Priya")).toEqual({
      firstName: "Priya",
      lastName: "",
    });
  });

  test("stray spacing is not part of a name", () => {
    expect(splitRosterName("  Priya   Sharma ")).toEqual({
      firstName: "Priya",
      lastName: "Sharma",
    });
  });

  test("no roster match leaves both fields empty", () => {
    expect(splitRosterName(null)).toEqual({ firstName: "", lastName: "" });
    expect(splitRosterName("")).toEqual({ firstName: "", lastName: "" });
  });
});
