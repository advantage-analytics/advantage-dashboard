import { readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import { termsReturnPath, termsUpdateHref } from "@/lib/legal/terms-return";

/**
 * An account that owes the terms is stopped at `/terms-update` on its way into
 * the dashboard, and once it agrees it lands on the page it asked for. A plain
 * `redirect("/terms-update")` dropped it: a player who opened a link to a match
 * (2026-11-21, `/login?next=/dashboard/matches/…`, then Google) agreed and
 * landed on Home instead of the match.
 */

test("the terms screen returns to the dashboard page that was asked for", () => {
  expect(termsReturnPath("/dashboard/matches/abc?tab=video")).toBe(
    "/dashboard/matches/abc?tab=video",
  );
  expect(termsUpdateHref("/dashboard/matches/abc")).toBe(
    "/terms-update?next=%2Fdashboard%2Fmatches%2Fabc",
  );
  expect(termsUpdateHref("/dashboard")).toBe("/terms-update");
  expect(termsUpdateHref(null)).toBe("/terms-update");
});

test("the return path never leaves the dashboard or this origin", () => {
  for (const hostile of [
    "https://evil.example/dashboard",
    "//evil.example/dashboard",
    "/\t/evil.example",
    "/admin/requests",
    "/dashboardx",
    "/terms-update",
    "javascript:alert(1)",
  ]) {
    expect(termsReturnPath(hostile)).toBe("/dashboard");
  }
});

test("the dashboard's terms gate carries the requested page", () => {
  const layout = readFileSync("src/app/dashboard/layout.tsx", "utf8");
  expect(layout).not.toMatch(/redirect\(\s*["'`]\/terms-update["'`]\s*\)/);
  expect(layout).toMatch(/redirect\(termsUpdateHref\(/);
  const action = readFileSync("src/lib/legal/acceptance-actions.ts", "utf8");
  expect(action).not.toMatch(/redirect\(\s*["'`]\/dashboard["'`]\s*\)/);
});
