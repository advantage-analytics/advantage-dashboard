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

test("a trim over the remaining budget by one second is refused, and the overage is never 'zero'", () => {
  expect(
    quotaRefusal({
      ...BASE,
      remainingSeconds: 599,
      workspaceKind: "personal",
    }),
  ).toBe(
    "This trim is 1 min over the 10 min left this month. Shorten the selection to continue.",
  );
});

test("neither figure in the refusal rounds away to nothing", () => {
  // 30 s left, a 6 min window. In tenths of an hour the remainder reads "0.0",
  // so the sentence would refuse on the grounds of an allowance it prints as
  // empty — the same rounding the overage figure already avoids.
  const message = quotaRefusal({
    ...BASE,
    neededSeconds: 360,
    remainingSeconds: 30,
    workspaceKind: "personal",
  });

  expect(message).toBe(
    "This trim is 6 min over the 1 min left this month. Shorten the selection to continue.",
  );
  expect(message).not.toContain("0.0");
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

test("a remainder under a minute never prints as the same amount as the overage", () => {
  // 10 seconds left, a 70-second trim: "1 min over the 1 min left" read as two
  // equal amounts. Only in that collision does the remainder print in seconds.
  expect(
    quotaRefusal({
      remainingSeconds: 10,
      neededSeconds: 70,
      resetsOn: "Nov 1",
      workspaceKind: "personal",
    }),
  ).toBe(
    "This trim is 1 min over the 10 sec left this month. Shorten the selection to continue.",
  );
});
