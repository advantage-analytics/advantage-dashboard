import { expect, test, type Page } from "@playwright/test";
import { DROPPED_CONNECTION } from "@/lib/ui/action-rejected";
import {
  boundaryErrors,
  capturedExceptions,
  failActionsWith,
  openHarness,
  serveHarness,
} from "./fixtures/admin-team-harness-server";

/**
 * The Admin › Teams Pilot card: what its writes do when the request never
 * comes back, and how each way of failing reads.
 *
 * PostHog issue 01a14f7d: `TypeError: Load failed` on /admin/teams/[id] in
 * Safari, right after an admin confirmed the card's Grant / Revoke team pool
 * dialog, and a full reload of the page six seconds later. The actions answer
 * refusals as `{ ok: false }`, but a fetch that fails rejects instead, and the
 * card awaited it inside `startTransition` with no handler — so the rejection
 * was thrown to the error boundary and the page was replaced by an error
 * screen. The harness' boundary records whatever reaches it.
 */

let harness: Awaited<ReturnType<typeof serveHarness>>;

test.beforeAll(async () => {
  harness = await serveHarness("tests/fixtures/pilot-usage-card-harness.tsx");
});

test.afterAll(async () => {
  await harness?.close();
});

const dialogOf = (page: Page) =>
  page.getByRole("alertdialog").or(page.getByRole("dialog"));

async function endPilot(page: Page) {
  await page.getByRole("button", { name: "End pilot" }).click();
  await dialogOf(page).getByRole("button", { name: "End pilot" }).click();
}

for (const { trigger, confirm } of [
  { trigger: "Grant team pool", confirm: "Grant pool" },
  { trigger: "End pilot", confirm: "End pilot" },
]) {
  test(`a dropped request on "${trigger}" stays in the dialog instead of the error screen`, async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, harness.origin, errors);
    await failActionsWith(page, "dropped");

    await page.getByRole("button", { name: trigger }).click();
    const dialog = dialogOf(page);
    await dialog.getByRole("button", { name: confirm }).click();

    await expect(dialog.getByText(DROPPED_CONNECTION)).toBeVisible();
    expect(await boundaryErrors(page)).toEqual([]);
    expect(errors).toEqual([]);
    // The card is still there behind the dialog — nothing replaced the page.
    await expect(
      page.getByRole("alert").filter({ hasText: "Page error" }),
    ).toHaveCount(0);
  });
}

test('a dropped request on "Change end date" stays in the popover', async ({
  page,
}) => {
  const errors: string[] = [];
  await openHarness(page, harness.origin, errors);
  await failActionsWith(page, "dropped");

  await page.getByRole("button", { name: "Change end date" }).click();
  const popover = page.getByRole("dialog", {
    name: "Change the pilot end date",
  });
  await popover.getByRole("spinbutton", { name: /year/i }).press("ArrowUp");
  await popover.getByRole("button", { name: "Save date" }).click();

  await expect(popover.getByText(DROPPED_CONNECTION)).toBeVisible();
  await expect(
    popover.getByRole("button", { name: "Save date" }),
  ).toBeEnabled();
  expect(await boundaryErrors(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('"Change end date" closes the popover and refreshes on success', async ({
  page,
}) => {
  const errors: string[] = [];
  await openHarness(page, harness.origin, errors);

  await page.getByRole("button", { name: "Change end date" }).click();
  const popover = page.getByRole("dialog", {
    name: "Change the pilot end date",
  });
  await popover.getByRole("spinbutton", { name: /year/i }).press("ArrowUp");
  await popover.getByRole("button", { name: "Save date" }).click();

  await expect(popover).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.routerRefreshes)).toBe(1);
  expect(errors).toEqual([]);
});

for (const failure of ["dropped", "closed", "closedInDev"] as const) {
  test(`a request failing as ${failure} reads as unreachable and is not reported`, async ({
    page,
  }) => {
    await openHarness(page, harness.origin, []);
    await failActionsWith(page, failure);
    await endPilot(page);

    await expect(dialogOf(page).getByText(DROPPED_CONNECTION)).toBeVisible();
    expect(await capturedExceptions(page)).toEqual([]);
  });
}

test("a throw inside the action reads differently and reaches PostHog", async ({
  page,
}) => {
  await openHarness(page, harness.origin, []);
  await failActionsWith(page, "server");
  await endPilot(page);

  await expect(
    dialogOf(page).getByText("Something went wrong on our side."),
  ).toBeVisible();
  await expect(dialogOf(page).getByText(DROPPED_CONNECTION)).toHaveCount(0);
  expect(await boundaryErrors(page)).toEqual([]);
  expect(await capturedExceptions(page)).toEqual([
    {
      message:
        "Minified React error #441; visit https://react.dev/errors/441 for the full message",
      digest: "1234567890",
    },
  ]);
});

test("a bad response from in front of the app reaches PostHog", async ({
  page,
}) => {
  await openHarness(page, harness.origin, []);
  await failActionsWith(page, "unexpected");
  await endPilot(page);

  await expect(
    dialogOf(page).getByText("Something went wrong on our side."),
  ).toBeVisible();
  expect(await capturedExceptions(page)).toHaveLength(1);
});

test("an action retired by a deploy asks for a reload and is not reported", async ({
  page,
}) => {
  await openHarness(page, harness.origin, []);
  await failActionsWith(page, "stale");
  await endPilot(page);

  await expect(
    dialogOf(page).getByText("This page is out of date."),
  ).toBeVisible();
  expect(await boundaryErrors(page)).toEqual([]);
  expect(await capturedExceptions(page)).toEqual([]);
});

for (const failure of ["redirect", "notFound"] as const) {
  test(`${failure === "redirect" ? "redirect()" : "notFound()"} is not swallowed by the catch`, async ({
    page,
  }) => {
    await openHarness(page, harness.origin, []);
    await failActionsWith(page, failure);
    await endPilot(page);

    // It keeps travelling to Next's own boundaries, and nothing is reported.
    await expect
      .poll(() => boundaryErrors(page))
      .toEqual([
        failure === "redirect"
          ? "NEXT_REDIRECT"
          : "NEXT_HTTP_ERROR_FALLBACK;404",
      ]);
    expect(await capturedExceptions(page)).toEqual([]);
  });
}
