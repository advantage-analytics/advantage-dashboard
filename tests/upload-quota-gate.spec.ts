import { expect, test } from "@playwright/test";

import { quotaRefusal } from "@/components/dashboard/matches/new-match-wizard/validation";

/**
 * The quota gate, without a server.
 *
 * `quotaRefusal` is the pure decision T3 wires into the wizard: given a
 * remaining-seconds budget and a needed trim length, does Continue get
 * blocked, and with what sentence? Pure-function tests, plain import, no
 * browser — same shape as `tests/upload-identity.spec.ts`.
 */

const BASE = {
  neededSeconds: 600,
  capSeconds: 270000, // 75h
  resetsOn: "Oct 1",
} as const;

test("an unresolved budget never refuses", () => {
  expect(
    quotaRefusal({
      ...BASE,
      remainingSeconds: undefined,
      workspaceKind: "personal",
    }),
  ).toBeNull();
});

test("zero remaining refuses with personal copy", () => {
  expect(
    quotaRefusal({
      ...BASE,
      remainingSeconds: 0,
      workspaceKind: "personal",
    }),
  ).toBe("This month's analysis hours are used up. They reset on Oct 1.");
});

test("zero remaining refuses with team copy", () => {
  expect(
    quotaRefusal({
      ...BASE,
      remainingSeconds: 0,
      workspaceKind: "team",
    }),
  ).toBe(
    "Your team's analysis hours for this month are used up. They reset on Oct 1.",
  );
});

test("a trim that exactly fits the remaining budget is allowed", () => {
  // neededSeconds: 600 → Math.ceil(600) === 600
  expect(
    quotaRefusal({
      ...BASE,
      remainingSeconds: 600,
      workspaceKind: "personal",
    }),
  ).toBeNull();
});

test("a trim over the remaining budget by one second is refused, with hour figures from formatHoursTenths", () => {
  expect(
    quotaRefusal({
      ...BASE,
      remainingSeconds: 599,
      workspaceKind: "personal",
    }),
  ).toBe(
    "This trim needs 0.2 h but only 0.2 h is left this month. Shorten the selection to continue.",
  );
});

test("no user-visible string mentions splitstep", () => {
  const messages = [
    quotaRefusal({ ...BASE, remainingSeconds: 0, workspaceKind: "personal" }),
    quotaRefusal({ ...BASE, remainingSeconds: 0, workspaceKind: "team" }),
    quotaRefusal({ ...BASE, remainingSeconds: 599, workspaceKind: "personal" }),
  ];
  for (const message of messages) {
    expect(message?.toLowerCase()).not.toContain("splitstep");
  }
});
