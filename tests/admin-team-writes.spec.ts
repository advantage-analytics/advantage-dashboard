import { expect, test, type Locator, type Page } from "@playwright/test";
import { DROPPED_CONNECTION, SERVER_FAILED } from "@/lib/ui/action-rejected";
import {
  boundaryErrors,
  capturedExceptions,
  failActionsWith,
  openHarness,
  serveHarness,
} from "./fixtures/admin-team-harness-server";

/**
 * Every write on /admin/teams/[programId] other than the Pilot card's
 * (`pilot-usage-card.spec.ts` has those, and every way of failing): a rejected
 * action stays on the surface that made the call, where its other refusals
 * already show, instead of replacing the page with the error screen.
 *
 * Each case drives the control to its write and returns the part of the page
 * the sentence must appear in.
 */

let harness: Awaited<ReturnType<typeof serveHarness>>;

test.beforeAll(async () => {
  harness = await serveHarness("tests/fixtures/admin-team-writes-harness.tsx");
});

test.afterAll(async () => {
  await harness?.close();
});

const SCHOOL = "Centennial High School";

const dialogOf = (page: Page) =>
  page.getByRole("alertdialog").or(page.getByRole("dialog"));

const CASES: { name: string; run: (page: Page) => Promise<Locator> }[] = [
  {
    name: "Edit details",
    run: async (page) => {
      await page.getByRole("button", { name: "Edit details" }).click();
      const dialog = dialogOf(page);
      await dialog.getByPlaceholder("Meridian State University").fill("New");
      await dialog.getByRole("button", { name: "Save details" }).click();
      return dialog;
    },
  },
  {
    name: "Remove crest",
    run: async (page) => {
      await page.getByRole("button", { name: "More team actions" }).click();
      await page.getByRole("menuitem", { name: "Remove crest" }).click();
      return page.locator("body");
    },
  },
  {
    name: "Upload a crest",
    run: async (page) => {
      await page.locator('input[type="file"]').setInputFiles({
        name: "crest.png",
        mimeType: "image/png",
        // A 1×1 PNG, enough for the adjust dialog to bake.
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
          "base64",
        ),
      });
      await dialogOf(page).getByRole("button", { name: "Save" }).click();
      return page.locator("body");
    },
  },
  {
    name: "Invite someone",
    run: async (page) => {
      await page.getByRole("button", { name: "Invite someone" }).click();
      await page.getByPlaceholder("name@school.edu").fill("new@example.com");
      await page.getByRole("button", { name: "Invite", exact: true }).click();
      return page.locator("body");
    },
  },
  {
    name: "Resend an invitation",
    run: async (page) => {
      await page.getByRole("button", { name: "Resend" }).click();
      return page.locator("body");
    },
  },
  {
    name: "Revoke an invitation",
    run: async (page) => {
      await page.getByRole("button", { name: "Revoke" }).click();
      return page.locator("body");
    },
  },
  {
    name: "a member's role",
    run: async (page) => {
      await page
        .getByRole("button", { name: "Change role, currently Coach" })
        .click();
      await page.getByRole("menuitemradio", { name: "Player" }).click();
      return page.locator("body");
    },
  },
  {
    name: "Transfer ownership",
    run: async (page) => {
      await page.getByRole("button", { name: "Transfer ownership" }).click();
      const dialog = dialogOf(page);
      await dialog.getByPlaceholder(SCHOOL).fill(SCHOOL);
      await dialog.getByPlaceholder(SCHOOL).press("Enter");
      return dialog;
    },
  },
  {
    name: "Decline a request",
    run: async (page) => {
      await page.getByRole("button", { name: "Decline" }).click();
      return page.locator("body");
    },
  },
  {
    name: "Send invite on a request",
    run: async (page) => {
      await page.getByRole("button", { name: "Send invite" }).click();
      return page.locator("body");
    },
  },
  {
    name: "Add player",
    run: async (page) => {
      await page.getByRole("button", { name: "Add player" }).first().click();
      const dialog = dialogOf(page);
      await dialog.getByLabel("First name").fill("Ana");
      await dialog.getByLabel("Last name").fill("Ruiz");
      await dialog.getByRole("button", { name: "Add to roster" }).click();
      return dialog;
    },
  },
  {
    name: "Set conference",
    run: async (page) => {
      await page.getByRole("button", { name: "Set conference" }).click();
      await page.getByRole("menuitemradio", { name: "Ivy League" }).click();
      return page.locator("body");
    },
  },
];

for (const { name, run } of CASES) {
  test(`a dropped request on ${name} stays on its surface`, async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, harness.origin, errors);
    await failActionsWith(page, "dropped");

    const surface = await run(page);

    await expect(surface.getByText(DROPPED_CONNECTION)).toBeVisible();
    expect(await boundaryErrors(page)).toEqual([]);
    expect(errors).toEqual([]);
    expect(await capturedExceptions(page)).toEqual([]);
  });
}

test("a throw on a write reads as ours and reaches PostHog", async ({
  page,
}) => {
  await openHarness(page, harness.origin, []);
  await failActionsWith(page, "server");

  await page.getByRole("button", { name: "Decline" }).click();

  await expect(page.getByText(SERVER_FAILED)).toBeVisible();
  expect(await boundaryErrors(page)).toEqual([]);
  expect(await capturedExceptions(page)).toHaveLength(1);
});

test("a dropped request on an upload switch reverts it", async ({ page }) => {
  await openHarness(page, harness.origin, []);
  await failActionsWith(page, "dropped");

  const upload = page.getByRole("switch", {
    name: "Uploads on for Casey Coach",
  });
  await expect(upload).toBeChecked();
  await upload.click();

  await expect(page.getByText(DROPPED_CONNECTION)).toBeVisible();
  await expect(upload).toBeChecked();
  expect(await boundaryErrors(page)).toEqual([]);
});

test("a redirect from a write still reaches Next's boundary", async ({
  page,
}) => {
  await openHarness(page, harness.origin, []);
  await failActionsWith(page, "redirect");

  await page.getByRole("button", { name: "Decline" }).click();

  await expect.poll(() => boundaryErrors(page)).toEqual(["NEXT_REDIRECT"]);
});
