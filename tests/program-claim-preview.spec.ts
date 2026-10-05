import { expect, test } from "@playwright/test";

import { claimPreview } from "@/lib/data/program-claim-preview";

/**
 * The text a coach sees when a program's claim link unfurls
 * (`/claim/[programKey]`): an invitation to set up when nobody has, and
 * nothing about the owner or the claim's age once someone has.
 */

const base = {
  schoolName: "Univ. of Texas Permian Basin",
  teamLabel: "Men's",
};

test("an unclaimed program invites the coach to set it up", () => {
  const p = claimPreview({ ...base, status: "unclaimed" });
  expect(p.title).toBe("Set up Univ. of Texas Permian Basin Men's Tennis");
  expect(p.eyebrow).toBe("Set up your program");
  expect(p.description).toContain("Free through December 31, 2026");
});

test("a suspended program reads like the page it links to: set it up", () => {
  expect(claimPreview({ ...base, status: "suspended" }).eyebrow).toBe(
    "Set up your program",
  );
});

test("a claimed or pending program invites no one to set it up", () => {
  for (const status of ["active", "claim_pending"] as const) {
    const p = claimPreview({ ...base, status });
    expect(p.title).toBe(
      "Univ. of Texas Permian Basin Men's Tennis on Advantage",
    );
    expect(p.title).not.toMatch(/set up/i);
    expect(p.description).not.toMatch(/claimed|pending|ago/i);
  }
});
