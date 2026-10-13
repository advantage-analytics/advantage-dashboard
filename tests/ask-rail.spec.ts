import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The Ask page's left rail, driven in a real browser.
 *
 * `tests/fixtures/ask-rail-harness.tsx` is bundled with webpack and served
 * from a throwaway port — the same harness pattern as `ask-composer.spec.ts`
 * — because the delete is a dialog and the rail collapses: a row action
 * opens the repo's `ConfirmDialog`, and only its confirm may reach the
 * handler; a click swaps the rail for a strip of two buttons, and the choice
 * outlives a reload. A static render could assert none of that.
 *
 * The bundle carries no stylesheet, so nothing here measures a width or an
 * opacity: what is pinned is the markup, the names, and the classes the
 * reveal hangs on.
 *
 * The harness stands in for the page: its delete handler records the id it
 * was called with, where the page's calls the `deleteAskConversation` server
 * action with that same argument, and its "New question" handler counts.
 */

const webpack = (
  nextWebpack as unknown as {
    webpack: (
      config: unknown,
      callback: (error: Error | null, stats: WebpackStats) => void,
    ) => void;
  }
).webpack;

type WebpackStats = { toJson(): { errors?: unknown[] } };

const FIRST = "11111111-1111-4111-8111-111111111111";
const SECOND = "22222222-2222-4222-8222-222222222222";
const THIRD = "33333333-3333-4333-8333-333333333333";
const FOURTH = "44444444-4444-4444-8444-444444444444";

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "ask-rail-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/ask-rail-harness.tsx"),
        output: { path: outputPath, filename: "bundle.js" },
        module: {
          rules: [
            {
              test: /\.tsx?$/,
              exclude: /node_modules/,
              use: resolve("tests/fixtures/tsx-transpile-loader.js"),
            },
          ],
        },
        resolve: {
          extensions: [".tsx", ".ts", ".jsx", ".js"],
          // An earlier question is a `next/link`; here it is the plain
          // anchor it renders to. No `next/navigation` alias and no stand-in
          // for a server action, on purpose: the rail must bundle without
          // either.
          alias: {
            "@": resolve("src"),
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
          },
        },
      },
      (error: Error | null, stats: WebpackStats) => {
        if (error) reject(error);
        else done(stats.toJson());
      },
    );
  });
  expect(result.errors ?? []).toEqual([]);

  const bundle = readFileSync(join(outputPath, "bundle.js"));
  server = createServer((request, response) => {
    if (request.url?.startsWith("/bundle.js")) {
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.end(bundle);
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      '<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
});

async function openFixture(page: Page, query = "") {
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

const rail = (page: Page) =>
  page.getByRole("navigation", { name: "Earlier questions" });
const limit = (page: Page) => page.locator('[data-ask-rail="limit"]');
const meter = (page: Page) => limit(page).getByRole("img");
const months = (page: Page) => rail(page).locator("[data-ask-month]");
const dialog = (page: Page) => page.getByRole("alertdialog");
const newQuestion = (page: Page) =>
  rail(page).getByRole("button", { name: "New question" });

async function deleted(page: Page) {
  return JSON.parse(
    (await page.getByLabel("Deleted").textContent()) ?? "[]",
  ) as string[];
}

test.describe("what the rail holds", () => {
  test("a landmark with New question, the months, then the limit", async ({
    page,
  }) => {
    await openFixture(page);

    await expect(rail(page)).toHaveAttribute("data-ask-rail", "open");
    await expect(newQuestion(page)).toBeVisible();
    await expect(
      rail(page).getByRole("button", { name: "Hide earlier questions" }),
    ).toBeVisible();
    // The limit is the foot: after the last row in the document.
    const order = await rail(page).evaluate((nav) => {
      const list = nav.querySelector("[data-ask-rail-list]")!;
      const foot = nav.querySelector('[data-ask-rail="limit"]')!;
      return list.compareDocumentPosition(foot);
    });
    expect(order & 4).toBe(4); // DOCUMENT_POSITION_FOLLOWING
  });

  test("no “Bring your own model”, no “Tagged in this question”, no link out", async ({
    page,
  }) => {
    await openFixture(page);

    await expect(rail(page)).not.toContainText(/bring your own/i);
    await expect(rail(page)).not.toContainText(/model/i);
    await expect(rail(page)).not.toContainText(/tagged/i);
    await expect(page.locator('[data-ask-rail="tags"]')).toHaveCount(0);
    // Every link in the rail is an earlier question, and there is no field.
    for (const link of await rail(page).getByRole("link").all()) {
      await expect(link).toHaveAttribute("href", /^\/dashboard\/ask\?c=/);
    }
    await expect(rail(page).locator("input, textarea")).toHaveCount(0);
  });
});

test.describe("New question", () => {
  test("calls its handler", async ({ page }) => {
    await openFixture(page);

    await newQuestion(page).click();
    await newQuestion(page).click();

    await expect(page.getByLabel("New questions")).toHaveText("2");
  });

  test("prints its shortcut as three keycaps a screen reader skips", async ({
    page,
  }) => {
    await openFixture(page);

    const keys = newQuestion(page).locator("[data-ask-keys]");
    await expect(keys).toHaveAttribute("aria-hidden", "true");
    await expect(keys.locator("kbd")).toHaveCount(3);
    // ⇧ ⌘ O on a Mac, Ctrl ⇧ O elsewhere: whichever machine runs this.
    expect((await keys.locator("kbd").allTextContents()).join(" ")).toMatch(
      /^(⇧ ⌘ O|Ctrl ⇧ O)$/,
    );
    // The name is the words alone.
    await expect(newQuestion(page)).toHaveAccessibleName("New question");
  });
});

test.describe("earlier questions, by month", () => {
  test("one group per month, newest first, the year on an older year's", async ({
    page,
  }) => {
    await openFixture(page);

    await expect(rail(page).getByRole("heading")).toHaveText([
      "October",
      "September",
      "November 2025",
    ]);
    await expect(months(page)).toHaveCount(3);
    await expect(months(page).nth(0).getByRole("link")).toHaveCount(2);
    await expect(months(page).nth(1).getByRole("link")).toHaveCount(1);
    await expect(months(page).nth(2).getByRole("link")).toHaveCount(1);
  });

  test("a row is its title and its date, and links to its conversation", async ({
    page,
  }) => {
    await openFixture(page);

    const rows = rail(page).getByRole("listitem");
    await expect(rows).toHaveCount(4);
    await expect(rows.locator("a")).toHaveText([
      "Why did my second serve hold up against Marcus?",
      "First serve trend since June",
      "How do I do against left-handers?",
      "Break points saved last season",
    ]);
    // The date never carries a year: the month label above does.
    await expect(rows.locator("time")).toHaveText([
      "Oct 9",
      "Oct 2",
      "Sep 28",
      "Nov 2",
    ]);
    await expect(rows.nth(0).locator("time")).toHaveAttribute(
      "datetime",
      "2026-10-09T18:30:00.000Z",
    );

    const links = rail(page).getByRole("link");
    for (const [index, id] of [FIRST, FOURTH, SECOND, THIRD].entries()) {
      await expect(links.nth(index)).toHaveAttribute(
        "href",
        `/dashboard/ask?c=${id}`,
      );
    }
  });

  // The zone is the workspace's, handed in as a string — not the browser's
  // and not UTC — so a Pacific evening is dated the day it was, on the server
  // and here alike.
  test("a question is dated in the workspace's time zone, not UTC's", async ({
    page,
  }) => {
    await openFixture(page, "?earlier=edge&tz=America/Los_Angeles");

    await expect(rail(page).getByRole("heading")).toHaveText([
      "October",
      "September",
    ]);
    await expect(rail(page).getByRole("listitem").locator("time")).toHaveText([
      "Oct 12",
      "Sep 30",
    ]);
    // The attribute stays the instant itself.
    await expect(
      rail(page).getByRole("listitem").first().locator("time"),
    ).toHaveAttribute("datetime", "2026-10-13T03:30:00.000Z");
  });

  test("with no zone, or one that is not a zone, the dates are UTC's and nothing throws", async ({
    page,
  }) => {
    for (const query of ["?earlier=edge", "?earlier=edge&tz=Not/AZone"]) {
      await openFixture(page, query);
      await expect(rail(page).getByRole("heading")).toHaveText(["October"]);
      await expect(rail(page).getByRole("listitem").locator("time")).toHaveText(
        ["Oct 13", "Oct 1"],
      );
    }
  });

  test("the open conversation says so, and only it", async ({ page }) => {
    await openFixture(page);

    const current = rail(page).locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveAttribute("href", `/dashboard/ask?c=${SECOND}`);
    // The neutral wash on its row, and the heavier title.
    const row = rail(page).getByRole("listitem").nth(2);
    expect((await row.getAttribute("class"))?.split(/\s+/)).toContain(
      "bg-[var(--surface-subtle)]",
    );
    expect(
      (await current.locator("span").getAttribute("class"))?.split(/\s+/),
    ).toEqual(expect.arrayContaining(["font-medium", "text-[var(--ink-900)]"]));
  });

  test("an empty list is one honest line, not a skeleton", async ({ page }) => {
    await openFixture(page, "?earlier=none");

    await expect(rail(page).locator("[data-ask-rail-empty]")).toHaveText(
      "Questions you ask are kept here.",
    );
    await expect(rail(page).getByRole("link")).toHaveCount(0);
    await expect(rail(page).getByRole("heading")).toHaveCount(0);
    await expect(rail(page).locator("[data-pending-bar]")).toHaveCount(0);
    // New question and the limit are unaffected.
    await expect(newQuestion(page)).toBeVisible();
    await expect(limit(page)).toBeVisible();
  });

  test("each row has a named delete that takes the date's place on hover and focus-within", async ({
    page,
  }) => {
    await openFixture(page);

    const rows = rail(page).getByRole("listitem");
    const button = rows.nth(0).getByRole("button");
    await expect(button).toHaveAttribute(
      "aria-label",
      "Delete Why did my second serve hold up against Marcus?",
    );

    // The row is the group the swap hangs on.
    expect((await rows.nth(0).getAttribute("class"))?.split(/\s+/)).toContain(
      "group",
    );
    expect((await button.getAttribute("class"))?.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "opacity-0",
        "group-hover:opacity-100",
        "group-focus-within:opacity-100",
        // Out of flow, so revealing it moves nothing.
        "absolute",
      ]),
    );
    expect(
      (await rows.nth(0).locator("time").getAttribute("class"))?.split(/\s+/),
    ).toEqual(
      expect.arrayContaining([
        "group-hover:opacity-0",
        "group-focus-within:opacity-0",
      ]),
    );

    // And it answers hover with the dark tooltip.
    await button.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Delete");
  });
});

test.describe("the limit", () => {
  test("what is left, the count, a 20-segment meter and the rule", async ({
    page,
  }) => {
    await openFixture(page, "?used=8");

    await expect(limit(page).locator("[data-ask-left]")).toHaveText(
      "12 questions left",
    );
    await expect(limit(page).locator("[data-ask-count]")).toHaveText("8 / 20");
    // The meter's label already says the count to a screen reader.
    await expect(limit(page).locator("[data-ask-count]")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    await expect(meter(page)).toHaveAttribute(
      "aria-label",
      "8 of 20 questions used",
    );
    await expect(limit(page)).toContainText("Resets on the 1st");
  });

  for (const used of [0, 1, 8, 19, 20]) {
    test(`the meter fills exactly ${used} of 20 segments`, async ({ page }) => {
      await openFixture(page, `?used=${used}`);

      const units = meter(page).locator("[data-ask-unit]");
      await expect(units).toHaveCount(20);
      await expect(meter(page).locator('[data-ask-unit="used"]')).toHaveCount(
        used,
      );
      // Filled from the left: every used segment comes before every free one.
      const order = await units.evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-ask-unit")),
      );
      expect(order).toEqual([
        ...Array<string>(used).fill("used"),
        ...Array<string>(20 - used).fill("left"),
      ]);
      await expect(meter(page)).toHaveAttribute(
        "aria-label",
        `${used} of 20 questions used`,
      );
    });
  }

  test("at the cap it reads “0 questions left”", async ({ page }) => {
    await openFixture(page, "?used=20");

    await expect(limit(page).locator("[data-ask-left]")).toHaveText(
      "0 questions left",
    );
    await expect(limit(page).locator("[data-ask-count]")).toHaveText("20 / 20");
  });

  test("one left is singular", async ({ page }) => {
    await openFixture(page, "?used=19");

    await expect(limit(page).locator("[data-ask-left]")).toHaveText(
      "1 question left",
    );
  });

  test("a count past the cap is a full meter, never a negative", async ({
    page,
  }) => {
    await openFixture(page, "?used=23");

    await expect(limit(page).locator("[data-ask-left]")).toHaveText(
      "0 questions left",
    );
    await expect(limit(page).locator("[data-ask-count]")).toHaveText("20 / 20");
    await expect(meter(page).locator('[data-ask-unit="used"]')).toHaveCount(20);
    await expect(meter(page)).toHaveAttribute(
      "aria-label",
      "20 of 20 questions used",
    );
  });

  test("a count that could not be read leaves the foot out entirely", async ({
    page,
  }) => {
    await openFixture(page, "?quota=none");

    await expect(limit(page)).toHaveCount(0);
    await expect(rail(page).getByRole("img")).toHaveCount(0);
    await expect(rail(page)).not.toContainText("questions left");
    await expect(rail(page)).not.toContainText("/ 20");
    await expect(rail(page)).not.toContainText("Resets");
    // The list is still there.
    await expect(rail(page).getByRole("link")).toHaveCount(4);
  });
});

test.describe("collapsing the rail", () => {
  const hide = (page: Page) =>
    rail(page).getByRole("button", { name: "Hide earlier questions" });
  const show = (page: Page) =>
    rail(page).getByRole("button", { name: "Show earlier questions" });

  test("a click leaves a strip of two labelled buttons, and a click brings it back", async ({
    page,
  }) => {
    await openFixture(page);

    await expect(hide(page)).toHaveAttribute("aria-expanded", "true");
    await hide(page).click();

    await expect(rail(page)).toHaveAttribute("data-ask-rail", "closed");
    await expect(rail(page).getByRole("button")).toHaveCount(2);
    await expect(show(page)).toHaveAttribute("aria-expanded", "false");
    await expect(newQuestion(page)).toBeVisible();
    // The list and the limit leave with it.
    await expect(rail(page).getByRole("link")).toHaveCount(0);
    await expect(limit(page)).toHaveCount(0);

    await show(page).click();

    await expect(rail(page)).toHaveAttribute("data-ask-rail", "open");
    await expect(rail(page).getByRole("link")).toHaveCount(4);
    await expect(limit(page)).toBeVisible();
  });

  // One hover per page: the bundle has no stylesheet to place the first
  // tooltip, so it can sit over the other button.
  test("New question's dark tooltip carries the shortcut", async ({ page }) => {
    await openFixture(page);
    await hide(page).click();

    await newQuestion(page).hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      /^New question(⇧⌘O|Ctrl ⇧ O)$/,
    );
  });

  test("the button that brings the rail back has a dark tooltip too", async ({
    page,
  }) => {
    await openFixture(page);
    await hide(page).click();

    await show(page).hover();
    await expect(page.getByRole("tooltip")).toHaveText(
      "Show earlier questions",
    );
  });

  test("New question still calls its handler from the strip", async ({
    page,
  }) => {
    await openFixture(page);
    await hide(page).click();

    await newQuestion(page).click();

    await expect(page.getByLabel("New questions")).toHaveText("1");
  });

  test("it opens on a click only, never under a passing cursor", async ({
    page,
  }) => {
    await openFixture(page);
    await hide(page).click();

    await rail(page).hover();
    await show(page).hover();
    await page.waitForTimeout(600);

    await expect(rail(page)).toHaveAttribute("data-ask-rail", "closed");
  });

  test("the choice is this browser's: it outlives a reload, both ways", async ({
    page,
  }) => {
    await openFixture(page);
    await hide(page).click();
    await expect(rail(page)).toHaveAttribute("data-ask-rail", "closed");

    await openFixture(page);
    await expect(rail(page)).toHaveAttribute("data-ask-rail", "closed");

    await show(page).click();
    await openFixture(page);
    await expect(rail(page)).toHaveAttribute("data-ask-rail", "open");
    await expect(rail(page).getByRole("link")).toHaveCount(4);
  });

  test("from the keyboard, focus follows to the button that replaced it", async ({
    page,
  }) => {
    await openFixture(page);

    await hide(page).focus();
    await page.keyboard.press("Enter");
    await expect(show(page)).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(hide(page)).toBeFocused();
  });
});

test.describe("deleting an earlier question", () => {
  const deleteButtons = (page: Page) =>
    rail(page).getByRole("button", { name: /^Delete / });

  test("the row action asks first, and Cancel deletes nothing", async ({
    page,
  }) => {
    await openFixture(page);

    await rail(page)
      .getByRole("button", {
        name: "Delete How do I do against left-handers?",
      })
      .click();

    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("Delete this question?");
    await expect(dialog(page)).toContainText(
      "How do I do against left-handers?",
    );
    // Opening the dialog is not a delete.
    expect(await deleted(page)).toEqual([]);

    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await expect(dialog(page)).toHaveCount(0);
    expect(await deleted(page)).toEqual([]);
    await expect(rail(page).getByRole("listitem")).toHaveCount(4);
  });

  test("the confirm never says deleting gives questions back", async ({
    page,
  }) => {
    await openFixture(page);

    await deleteButtons(page).first().click();

    await expect(dialog(page)).toContainText("stays used");
    await expect(dialog(page)).not.toContainText(
      /free|refund|get .* back|restore/i,
    );
  });

  test("confirming calls the action with that conversation's id", async ({
    page,
  }) => {
    await openFixture(page);

    await rail(page)
      .getByRole("button", {
        name: "Delete How do I do against left-handers?",
      })
      .click();
    await dialog(page).getByRole("button", { name: "Delete question" }).click();

    await expect.poll(() => deleted(page)).toEqual([SECOND]);
    await expect(dialog(page)).toHaveCount(0);
    // The row leaves and takes its month with it; the others and the count
    // do not move.
    await expect(rail(page).getByRole("link")).toHaveText([
      /^Why did my second serve/,
      /^First serve trend/,
      /^Break points saved/,
    ]);
    await expect(rail(page).getByRole("heading")).toHaveText([
      "October",
      "November 2025",
    ]);
    await expect(limit(page).locator("[data-ask-count]")).toHaveText("8 / 20");
  });

  test("a refused delete says so and keeps the row", async ({ page }) => {
    await openFixture(page, "?fail=1");

    await deleteButtons(page).first().click();
    await dialog(page).getByRole("button", { name: "Delete question" }).click();

    await expect(dialog(page)).toContainText(
      "That question could not be deleted. Try again.",
    );
    expect(await deleted(page)).toEqual([FIRST]);
    // By tag: behind an open dialog the rows have no role to be found by.
    await expect(page.locator("nav li")).toHaveCount(4);
  });

  test("while an answer is in flight the action is disabled", async ({
    page,
  }) => {
    await openFixture(page, "?busy=1");

    await expect(deleteButtons(page)).toHaveCount(4);
    for (const button of await deleteButtons(page).all()) {
      await expect(button).toBeDisabled();
    }
  });
});

test.describe("on the team page", () => {
  test("every earlier question opens on the team page, never the personal one", async ({
    page,
  }) => {
    await openFixture(page, "?scope=team");

    const links = await rail(page).getByRole("link").all();
    expect(links).toHaveLength(4);
    for (const link of links) {
      await expect(link).toHaveAttribute(
        "href",
        /^\/dashboard\/team\/ask\?c=[0-9a-f-]{36}$/,
      );
    }
  });

  test("the rail's own words are unchanged: the questions and the limit are still the asker's", async ({
    page,
  }) => {
    await openFixture(page, "?scope=team&earlier=none");

    await expect(rail(page)).toContainText("Questions you ask are kept here.");
    await expect(newQuestion(page)).toBeVisible();
    await expect(limit(page)).toBeVisible();
  });
});
