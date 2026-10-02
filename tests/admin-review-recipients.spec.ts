import { expect, test } from "@playwright/test";

import { INTERNAL_ALERTS_ADDRESS } from "@/lib/services/email";
import { reviewNeededRecipients } from "@/lib/services/notifications/admin-review-mail";

/**
 * T1 — internal alerts get a copy of the "admin review needed" mail.
 * Offline: `reviewNeededRecipients` is pure, and `INTERNAL_ALERTS_ADDRESS` is
 * a constant. Nothing here touches a database or sends anything.
 */

test("the internal address is appended when no admin has it", () => {
  const recipients = reviewNeededRecipients(
    ["coach@example.edu", "admin@example.edu"],
    "team@advantage-analytics.com",
  );
  expect(recipients).toEqual([
    "coach@example.edu",
    "admin@example.edu",
    "team@advantage-analytics.com",
  ]);
});

test("an admin already using the internal address is not duplicated, case-insensitively", () => {
  const recipients = reviewNeededRecipients(
    ["Team@Advantage-Analytics.com", "coach@example.edu"],
    "team@advantage-analytics.com",
  );
  expect(recipients).toEqual([
    "Team@Advantage-Analytics.com",
    "coach@example.edu",
  ]);
});

test("an empty admin list still yields the internal address", () => {
  const recipients = reviewNeededRecipients([], "team@advantage-analytics.com");
  expect(recipients).toEqual(["team@advantage-analytics.com"]);
});

test("INTERNAL_ALERTS_ADDRESS is a non-empty email-shaped string", () => {
  expect(typeof INTERNAL_ALERTS_ADDRESS).toBe("string");
  expect(INTERNAL_ALERTS_ADDRESS.length).toBeGreaterThan(0);
  expect(INTERNAL_ALERTS_ADDRESS).toContain("@");
});
