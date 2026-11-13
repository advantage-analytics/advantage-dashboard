import { expect, test } from "@playwright/test";
import {
  boundaryErrors,
  capturedExceptions,
  failActionsWith,
  openHarness,
  serveHarness,
} from "./fixtures/admin-team-harness-server";

/**
 * Settings › Usage: the program card's month stepper when the read never
 * comes back.
 *
 * PostHog issue 01a14f7d: `TypeError: Load failed` on
 * /dashboard/settings/usage in Safari, captured by `global-error.tsx`, and a
 * reload of the same page four seconds later. The stepper awaited
 * `loadProgramUsage` inside `startTransition` with no handler, so a dropped
 * connection was thrown to the error boundary — and with no `error.tsx` under
 * /dashboard, that is the root one: the whole app replaced over one button.
 * The harness' boundary records whatever reaches it.
 */

let harness: Awaited<ReturnType<typeof serveHarness>>;

test.beforeAll(async () => {
  harness = await serveHarness("tests/fixtures/program-usage-card-harness.tsx");
});

test.afterAll(async () => {
  await harness?.close();
});

const LOAD_MONTH_ERROR = "Couldn't load that month. Try again.";

test("a dropped request on the month stepper keeps the month and says so", async ({
  page,
}) => {
  const errors: string[] = [];
  await openHarness(page, harness.origin, errors);
  await failActionsWith(page, "dropped");

  await page.getByRole("button", { name: "Previous month" }).click();

  await expect(page.getByRole("alert")).toHaveText(LOAD_MONTH_ERROR);
  // The month on screen is still the one that loaded.
  await expect(page.getByText("Nov 2026")).toBeVisible();
  expect(await boundaryErrors(page)).toEqual([]);
  expect(errors).toEqual([]);
  // Nothing to fix in a dropped connection, so nothing is reported.
  expect(await capturedExceptions(page)).toEqual([]);
});

test("a real failure is reported, and the next good step clears the sentence", async ({
  page,
}) => {
  const errors: string[] = [];
  await openHarness(page, harness.origin, errors);
  await failActionsWith(page, "server");

  await page.getByRole("button", { name: "Previous month" }).click();
  await expect(page.getByRole("alert")).toHaveText(LOAD_MONTH_ERROR);
  expect(await capturedExceptions(page)).toHaveLength(1);

  await page.evaluate(() => {
    window.__actionFailure = undefined;
  });
  await page.getByRole("button", { name: "Previous month" }).click();

  await expect(page.getByText("Oct 2026")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(await boundaryErrors(page)).toEqual([]);
  expect(errors).toEqual([]);
});
