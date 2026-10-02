import { expect, test } from "@playwright/test";

import { surname, surnameLabels } from "@/lib/data/match-utils";

/**
 * The player labels the match report's cards print (design 04 F1): surnames,
 * unless that would make the two sides read the same. Pure and offline.
 */

test.describe("surname", () => {
  test("takes the last word of a name", () => {
    expect(surname("Marcus Reid")).toBe("Reid");
    expect(surname("  Ana  de la Cruz ")).toBe("Cruz");
  });

  test("a single-word name comes back as-is", () => {
    expect(surname("Okafor")).toBe("Okafor");
  });

  test("skips a generational suffix", () => {
    expect(surname("Marcus Reid Jr.")).toBe("Reid");
    expect(surname("Marcus Reid, Jr.")).toBe("Reid");
    expect(surname("Tom Okafor III")).toBe("Okafor");
  });

  test("keeps both partners of a doubles side", () => {
    expect(surname("Marcus Reid & Tom Okafor")).toBe("Reid & Okafor");
  });
});

test.describe("surnameLabels", () => {
  test("different surnames print as surnames, in the order given", () => {
    expect(surnameLabels("Marcus Reid", "Tom Okafor")).toEqual([
      "Reid",
      "Okafor",
    ]);
  });

  test("a shared surname gains first initials", () => {
    expect(surnameLabels("Marcus Reid", "Daniel Reid")).toEqual([
      "M. Reid",
      "D. Reid",
    ]);
    expect(surnameLabels("Marcus Reid", "daniel REID")).toEqual([
      "M. Reid",
      "d. REID",
    ]);
  });

  test("a shared surname and initial falls back to the full names", () => {
    expect(surnameLabels("Marcus Reid", "Mia Reid")).toEqual([
      "Marcus Reid",
      "Mia Reid",
    ]);
  });

  test("never returns two identical labels for different names", () => {
    const [you, opp] = surnameLabels("Reid", "Marcus Reid");
    expect(you.toLowerCase()).not.toBe(opp.toLowerCase());
  });
});
