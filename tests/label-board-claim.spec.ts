import { expect, test } from "@playwright/test";
import {
  boundaryErrors,
  capturedExceptions,
  failActionsWith,
  openHarness,
  serveHarness,
} from "./fixtures/admin-team-harness-server";

/**
 * `/label`: the labeller board's Claim when the request never comes back.
 *
 * PostHog issue 01a14f7d: `TypeError: Load failed` on /label in Safari,
 * captured by `global-error.tsx`. Claim awaited `claimLabelMatchAction` inside
 * `startTransition` with no handler, so a dropped connection was thrown to the
 * error boundary — and with no `error.tsx` under /label, that is the root one:
 * the whole board replaced over one button, and the failure reported as a bug.
 * The harness' boundary records whatever reaches it.
 */

let harness: Awaited<ReturnType<typeof serveHarness>>;

test.beforeAll(async () => {
  harness = await serveHarness("tests/fixtures/label-board-claim-harness.tsx");
});

test.afterAll(async () => {
  await harness?.close();
});

const claim = (page: import("@playwright/test").Page) =>
  page.locator("[data-label-claim]").first().click();

test("a dropped claim stays on the row as a refusal and is not reported", async ({
  page,
}) => {
  const errors: string[] = [];
  await openHarness(page, harness.origin, errors);
  await failActionsWith(page, "dropped");

  await claim(page);

  await expect(
    page.getByText("Couldn't reach the server.", { exact: false }),
  ).toBeVisible();
  // The board is still there: nothing reached the error boundary.
  await expect(page.locator("[data-label-claim]")).toHaveCount(1);
  expect(await boundaryErrors(page)).toEqual([]);
  expect(errors).toEqual([]);
  expect(await capturedExceptions(page)).toEqual([]);
});

test("a server failure on claim is still reported", async ({ page }) => {
  const errors: string[] = [];
  await openHarness(page, harness.origin, errors);
  await failActionsWith(page, "server");

  await claim(page);

  await expect(
    page.getByText("Something went wrong on our side.", { exact: false }),
  ).toBeVisible();
  expect(await boundaryErrors(page)).toEqual([]);
  expect(await capturedExceptions(page)).toHaveLength(1);
});

test("a good claim opens the session", async ({ page }) => {
  const errors: string[] = [];
  await openHarness(page, harness.origin, errors);

  await claim(page);

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { routerPushes: string[] }).routerPushes,
      ),
    )
    .toEqual(["/label/33333333-3333-4333-8333-333333333333"]);
  expect(errors).toEqual([]);
});
