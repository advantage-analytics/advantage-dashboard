import { expect, test, type Locator, type Page } from "@playwright/test";
import { DROPPED_CONNECTION, SERVER_FAILED } from "@/lib/ui/action-rejected";
import { LOAD_TEAMS_ERROR } from "@/lib/services/programs/conference-format";
import {
  boundaryErrors,
  capturedExceptions,
  failActionsWith,
  openHarness,
  serveHarness,
} from "./fixtures/admin-team-harness-server";

/**
 * The writes on the rest of /admin, which `admin-team-writes.spec.ts` leaves
 * out: a rejected action stays on the surface that made the call instead of
 * replacing the page with the error screen, and `redirect()` / `notFound()`
 * still get through to Next.
 *
 * Each case opens one surface from `admin-writes-harness.tsx`, drives its
 * control to the write, and returns the part of the page the sentence must
 * appear in.
 */

let harness: Awaited<ReturnType<typeof serveHarness>>;

test.beforeAll(async () => {
  harness = await serveHarness("tests/fixtures/admin-writes-harness.tsx");
});

test.afterAll(async () => {
  await harness?.close();
});

const dialogOf = (page: Page) =>
  page.getByRole("alertdialog").or(page.getByRole("dialog"));

const CASES: {
  name: string;
  surface: string;
  run: (page: Page) => Promise<Locator>;
}[] = [
  {
    name: "Save changes on a conference",
    surface: "conference",
    run: async (page) => {
      await page.getByLabel("Short name").fill("IVY");
      await page.getByRole("button", { name: "Save changes" }).click();
      return page.locator("body");
    },
  },
  {
    name: "Delete conference",
    surface: "conference",
    run: async (page) => {
      await page.getByRole("button", { name: "Conference actions" }).click();
      await page.getByRole("menuitem", { name: "Delete" }).click();
      const dialog = dialogOf(page);
      await dialog.getByRole("button", { name: "Delete conference" }).click();
      return dialog;
    },
  },
  {
    name: "Merge conference",
    surface: "merge",
    run: async (page) => {
      const dialog = dialogOf(page);
      await dialog.getByRole("option", { name: /Patriot League/ }).click();
      await dialog.getByRole("button", { name: /^Merge/ }).click();
      return dialog;
    },
  },
  {
    name: "Add conference",
    surface: "add-conference",
    run: async (page) => {
      const dialog = dialogOf(page);
      await dialog.getByPlaceholder("Ivy League").fill("Ivy League");
      await dialog.getByRole("button", { name: "Add conference" }).click();
      return dialog;
    },
  },
  {
    name: "Approve a pilot",
    surface: "approve",
    run: async (page) => {
      await page.getByRole("button", { name: /Approve/ }).click();
      return page.locator("body");
    },
  },
  {
    name: "Decline a pilot",
    surface: "approve",
    run: async (page) => {
      await page.getByRole("button", { name: "Decline" }).click();
      return page.locator("body");
    },
  },
  {
    name: "Start labelling",
    surface: "labelling",
    run: async (page) => {
      await page.getByRole("button", { name: "Start labelling" }).click();
      return page.locator("body");
    },
  },
  {
    name: "a history action",
    surface: "history",
    run: async (page) => {
      await page.getByRole("button", { name: "Reconcile" }).click();
      return page.locator("body");
    },
  },
  {
    name: "Load more teams",
    surface: "teams",
    run: async (page) => {
      await page.getByRole("button", { name: "Load more" }).click();
      return page.locator("body");
    },
  },
];

for (const { name, surface, run } of CASES) {
  test(`a dropped request on ${name} stays on its surface`, async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, harness.origin, errors, `/?surface=${surface}`);
    await failActionsWith(page, "dropped");

    const on = await run(page);

    await expect(on.getByText(DROPPED_CONNECTION)).toBeVisible();
    expect(await boundaryErrors(page)).toEqual([]);
    expect(errors).toEqual([]);
    expect(await capturedExceptions(page)).toEqual([]);
  });

  test(`a redirect from ${name} still reaches Next's boundary`, async ({
    page,
  }) => {
    await openHarness(page, harness.origin, [], `/?surface=${surface}`);
    await failActionsWith(page, "redirect");

    await run(page);

    await expect.poll(() => boundaryErrors(page)).toEqual(["NEXT_REDIRECT"]);
  });
}

test("a throw on a write reads as ours and reaches PostHog", async ({
  page,
}) => {
  await openHarness(page, harness.origin, [], "/?surface=history");
  await failActionsWith(page, "server");

  await page.getByRole("button", { name: "Reconcile" }).click();

  await expect(page.getByText(SERVER_FAILED)).toBeVisible();
  expect(await boundaryErrors(page)).toEqual([]);
  expect(await capturedExceptions(page)).toHaveLength(1);
});

// The drawer loads its teams as it opens, so the failure has to be set first.
const failFromTheStart = (page: Page, failure: string) =>
  page.addInitScript((kind) => {
    (window as unknown as { __actionFailure: string }).__actionFailure = kind;
  }, failure);

test.describe("a conference's teams", () => {
  test("a failed load keeps the section's own sentence", async ({ page }) => {
    await failFromTheStart(page, "server");
    await openHarness(page, harness.origin, [], "/?surface=conference");

    await expect(page.getByText(LOAD_TEAMS_ERROR)).toBeVisible();
    expect(await boundaryErrors(page)).toEqual([]);
    expect(await capturedExceptions(page)).toHaveLength(1);
  });

  test("notFound() from the admin check reaches Next's boundary", async ({
    page,
  }) => {
    await failFromTheStart(page, "notFound");
    await openHarness(page, harness.origin, [], "/?surface=conference");

    await expect
      .poll(() => boundaryErrors(page))
      .toEqual(["NEXT_HTTP_ERROR_FALLBACK;404"]);
  });
});

test.describe("the admin error screen", () => {
  test("reports a crash in the browser, which nothing else would", async ({
    page,
  }) => {
    await openHarness(page, harness.origin, [], "/?surface=boundary");

    await expect(page.getByText("This page couldn't load")).toBeVisible();
    expect(await capturedExceptions(page)).toEqual([
      { message: "Cannot read properties of undefined", digest: undefined },
    ]);
  });

  test("leaves a server throw to onRequestError", async ({ page }) => {
    await openHarness(
      page,
      harness.origin,
      [],
      "/?surface=boundary&kind=server",
    );

    await expect(page.getByText("This page couldn't load")).toBeVisible();
    expect(await capturedExceptions(page)).toEqual([]);
  });

  test("does not report a response that died part-way", async ({ page }) => {
    await openHarness(
      page,
      harness.origin,
      [],
      "/?surface=boundary&kind=closed",
    );

    await expect(page.getByText("This page couldn't load")).toBeVisible();
    expect(await capturedExceptions(page)).toEqual([]);
  });
});
