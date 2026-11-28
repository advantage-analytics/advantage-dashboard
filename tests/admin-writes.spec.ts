import { expect, test, type Locator, type Page } from "@playwright/test";
import { DROPPED_CONNECTION, SERVER_FAILED } from "@/lib/ui/action-rejected";
import { PLANS_BEGIN } from "@/lib/billing/plans";
import {
  formatPilotEnd,
  getMonthlyCapHours,
} from "@/lib/services/splitstep/config";
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
  /** Where the failure has its own sentence: a read has no change to check. */
  sentence?: string;
  run: (page: Page) => Promise<Locator>;
}[] = [
  {
    name: "Save on a conference's Edit dialog",
    surface: "conference",
    run: async (page) => {
      await page.getByRole("button", { name: "Edit" }).click();
      const dialog = dialogOf(page);
      await dialog
        .getByRole("textbox", { name: "Short name", exact: true })
        .fill("IVY");
      await dialog.getByRole("button", { name: "Save", exact: true }).click();
      return dialog;
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
    sentence: "Couldn't load more teams. Try again.",
    run: async (page) => {
      await page.getByRole("button", { name: "Load more" }).click();
      return page.locator("body");
    },
  },
];

for (const { name, surface, sentence, run } of CASES) {
  test(`a dropped request on ${name} stays on its surface`, async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, harness.origin, errors, `/?surface=${surface}`);
    await failActionsWith(page, "dropped");

    const on = await run(page);

    await expect(on.getByText(sentence ?? DROPPED_CONNECTION)).toBeVisible();
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

// ── The site-wide pilot end, either side of PLANS_BEGIN ─────────────────────
//
// Approving a claim and creating a team with "Start the pilot" stamp no pilot
// dates, so the beta's `formatPilotEnd()` is true only while the beta runs.
// From `plansHaveBegun()` the popover's Ends reads "Not set" and the create
// dialog names no end. The browser's clock is pinned either side of the day.

const BEFORE_PLANS = new Date("2026-12-15T12:00:00Z");
const AFTER_PLANS = new Date(`${PLANS_BEGIN}T12:00:00Z`);

for (const { when, at, ends } of [
  { when: "before", at: BEFORE_PLANS, ends: formatPilotEnd() },
  { when: "after", at: AFTER_PLANS, ends: "Not set" },
]) {
  test(`the Approve popover's Ends reads "${ends}" ${when} plans begin`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(at);
    await openHarness(page, harness.origin, [], "/?surface=approve");
    const popover = page.getByRole("dialog", {
      name:
        when === "before"
          ? "Start the pilot for Centennial?"
          : "Open the workspace for Centennial?",
    });
    await expect(popover).toContainText(`Ends${ends}`);
    if (when === "after") await expect(popover).not.toContainText("2026");
  });

  test(`the Approve popover's title and hours rows ${when} plans begin`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(at);
    await openHarness(page, harness.origin, [], "/?surface=approve");
    const popover = page.getByRole("dialog");
    const program = `${getMonthlyCapHours("program")} h every month`;
    if (when === "before") {
      await expect(popover).toContainText("Start the pilot for Centennial?");
      await expect(popover).toContainText(`Team pool${program}`);
      await expect(popover).toContainText(
        `Each member${getMonthlyCapHours("individual")} h`,
      );
      await expect(popover).not.toContainText("Video hours");
    } else {
      await expect(popover).toContainText("Open the workspace for Centennial?");
      await expect(popover).not.toContainText("Start the pilot");
      await expect(popover).toContainText(
        "Video hoursNone until a plan or pilot",
      );
      await expect(popover).toContainText(
        "PilotGrant from the team's Usage view",
      );
      await expect(popover).not.toContainText("Team pool");
      await expect(popover).not.toContainText("Each member");
      await expect(popover).not.toContainText(program);
    }
  });

  test(`Create team's Start the pilot ${when === "before" ? "names" : "does not name"} the pilot end ${when} plans begin`, async ({
    page,
  }) => {
    await page.clock.setFixedTime(at);
    await openHarness(page, harness.origin, [], "/?surface=teams");
    await page.getByRole("button", { name: "Create team" }).click();
    const dialog = dialogOf(page);
    await expect(
      dialog.getByText("Opens the workspace without a review step."),
    ).toBeVisible();
    if (when === "before") {
      await expect(dialog).toContainText(`Pilot ends ${formatPilotEnd()}.`);
    } else {
      await expect(dialog).not.toContainText("Pilot ends");
    }
  });
}
