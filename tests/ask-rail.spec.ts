import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The Ask page's right rail, driven in a real browser.
 *
 * `tests/fixtures/ask-rail-harness.tsx` is bundled with webpack and served
 * from a throwaway port — the same harness pattern as `ask-composer.spec.ts`
 * — because the delete is a dialog: a row action opens the repo's
 * `ConfirmDialog`, and only its confirm may reach the handler. A static
 * render could assert none of that.
 *
 * The harness stands in for the page: its delete handler records the id it
 * was called with, where the page's calls the `deleteAskConversation` server
 * action with that same argument.
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
  page.getByRole("complementary", { name: "Question context" });
const heading = (page: Page, name: string) =>
  rail(page).getByRole("heading", { name });
const tagged = (page: Page) => page.locator('[data-ask-rail="tags"]');
const limit = (page: Page) => page.locator('[data-ask-rail="limit"]');
const earlier = (page: Page) => page.locator('[data-ask-rail="earlier"]');
const meter = (page: Page) => limit(page).getByRole("img");
const dialog = (page: Page) => page.getByRole("alertdialog");

async function deleted(page: Page) {
  return JSON.parse(
    (await page.getByLabel("Deleted").textContent()) ?? "[]",
  ) as string[];
}

test.describe("the three sections", () => {
  test("tags, the limit and earlier questions, in that order", async ({
    page,
  }) => {
    await openFixture(page);

    await expect(rail(page).getByRole("heading")).toHaveText([
      "Tagged in this question",
      "Questions this month",
      "Earlier questions",
    ]);
  });

  test("no “Bring your own model” link, and no link out of the page", async ({
    page,
  }) => {
    await openFixture(page);

    await expect(rail(page)).not.toContainText(/bring your own/i);
    await expect(rail(page)).not.toContainText(/model/i);
    // Every link in the rail is an earlier question.
    for (const link of await rail(page).getByRole("link").all()) {
      await expect(link).toHaveAttribute("href", /^\/dashboard\/ask\?c=/);
    }
  });
});

test.describe("tagged in this question", () => {
  test("one row per tag: its name and a line saying what it is", async ({
    page,
  }) => {
    await openFixture(page);

    const rows = tagged(page).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    // The meta line is the tag menu's own, behind the kind of thing it is.
    await expect(rows.nth(0)).toHaveText(
      "Theo LindqvistOpponent · 4 matches · Left-handed",
    );
    await expect(rows.nth(1)).toHaveText(
      "Sep 14 · Marcus HaleMatch · Fall Open · 6-4 3-6 7-5",
    );
    // A match deleted since it was tagged still says what it was.
    await expect(rows.nth(2)).toHaveText("Aug 2 · Daniel OkaforMatch");
  });

  test("absent when no tag is set", async ({ page }) => {
    await openFixture(page, "?tags=none");

    await expect(tagged(page)).toHaveCount(0);
    await expect(heading(page, "Tagged in this question")).toHaveCount(0);
    // The other two sections are unaffected.
    await expect(limit(page)).toBeVisible();
    await expect(earlier(page)).toBeVisible();
  });
});

test.describe("the limit", () => {
  test("what is left, a 20-unit meter and the count", async ({ page }) => {
    await openFixture(page, "?used=8");

    await expect(limit(page).locator("[data-ask-left]")).toHaveText(
      "12 questions left",
    );
    await expect(meter(page)).toHaveAttribute(
      "aria-label",
      "8 of 20 questions used",
    );
    await expect(limit(page).locator("[data-ask-count]")).toHaveText(
      "8 / 20 · Resets on the 1st",
    );
  });

  for (const used of [0, 1, 8, 19, 20]) {
    test(`the meter fills exactly ${used} of 20 units`, async ({ page }) => {
      await openFixture(page, `?used=${used}`);

      const units = meter(page).locator("[data-ask-unit]");
      await expect(units).toHaveCount(20);
      await expect(meter(page).locator('[data-ask-unit="used"]')).toHaveCount(
        used,
      );
      // Filled from the left: every used unit comes before every free one.
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
    await expect(limit(page).locator("[data-ask-count]")).toHaveText(
      "20 / 20 · Resets on the 1st",
    );
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
    await expect(meter(page).locator('[data-ask-unit="used"]')).toHaveCount(20);
    await expect(meter(page)).toHaveAttribute(
      "aria-label",
      "20 of 20 questions used",
    );
  });

  test("a count that could not be read shows no numbers at all", async ({
    page,
  }) => {
    await openFixture(page, "?quota=none");

    await expect(limit(page)).toHaveCount(0);
    await expect(rail(page)).not.toContainText("questions left");
    await expect(rail(page)).not.toContainText("/ 20");
  });
});

test.describe("earlier questions", () => {
  test("title and date, newest first, each a link to its conversation", async ({
    page,
  }) => {
    await openFixture(page);

    const links = earlier(page).getByRole("link");
    await expect(links).toHaveText([
      "Why did my second serve hold up against Marcus?Oct 9",
      "How do I do against left-handers?Sep 28",
      // Not this year's, so it carries its year.
      "Break points saved last season" + "Nov 2, 2025",
    ]);
    await expect(links.nth(0)).toHaveAttribute(
      "href",
      `/dashboard/ask?c=${FIRST}`,
    );
    await expect(links.nth(1)).toHaveAttribute(
      "href",
      `/dashboard/ask?c=${SECOND}`,
    );
    await expect(links.nth(2)).toHaveAttribute(
      "href",
      `/dashboard/ask?c=${THIRD}`,
    );
    // The open conversation says so.
    await expect(links.nth(1)).toHaveAttribute("aria-current", "page");
    await expect(links.nth(0)).not.toHaveAttribute("aria-current", "page");
  });

  test("absent when the list is empty", async ({ page }) => {
    await openFixture(page, "?earlier=none");

    await expect(earlier(page)).toHaveCount(0);
    await expect(heading(page, "Earlier questions")).toHaveCount(0);
    await expect(rail(page).getByRole("link")).toHaveCount(0);
    await expect(rail(page).getByRole("button")).toHaveCount(0);
  });

  test("each row has a named delete action, revealed on hover and focus-within", async ({
    page,
  }) => {
    await openFixture(page);

    const rows = earlier(page).getByRole("listitem");
    await expect(rows).toHaveCount(3);
    const button = rows.nth(0).getByRole("button");
    await expect(button).toHaveAttribute(
      "aria-label",
      "Delete Why did my second serve hold up against Marcus?",
    );

    // The row is the group the reveal hangs on.
    expect((await rows.nth(0).getAttribute("class"))?.split(/\s+/)).toContain(
      "group",
    );
    const classes = (await button.getAttribute("class"))?.split(/\s+/);
    expect(classes).toEqual(
      expect.arrayContaining([
        "opacity-0",
        "group-hover:opacity-100",
        "group-focus-within:opacity-100",
      ]),
    );

    // And it answers hover with the dark tooltip.
    await button.hover();
    await expect(page.getByRole("tooltip")).toHaveText("Delete");
  });
});

test.describe("deleting an earlier question", () => {
  test("the row action asks first, and Cancel deletes nothing", async ({
    page,
  }) => {
    await openFixture(page);

    await earlier(page)
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
    await expect(earlier(page).getByRole("listitem")).toHaveCount(3);
  });

  test("the confirm never says deleting gives questions back", async ({
    page,
  }) => {
    await openFixture(page);

    await earlier(page).getByRole("button").first().click();

    await expect(dialog(page)).toContainText("stays used");
    await expect(dialog(page)).not.toContainText(
      /free|refund|get .* back|restore/i,
    );
  });

  test("confirming calls the action with that conversation's id", async ({
    page,
  }) => {
    await openFixture(page);

    await earlier(page)
      .getByRole("button", {
        name: "Delete How do I do against left-handers?",
      })
      .click();
    await dialog(page).getByRole("button", { name: "Delete question" }).click();

    await expect.poll(() => deleted(page)).toEqual([SECOND]);
    await expect(dialog(page)).toHaveCount(0);
    // The row leaves; the other two and the count do not move.
    await expect(earlier(page).getByRole("link")).toHaveText([
      /^Why did my second serve/,
      /^Break points saved/,
    ]);
    await expect(limit(page).locator("[data-ask-count]")).toHaveText(
      "8 / 20 · Resets on the 1st",
    );
  });

  test("a refused delete says so and keeps the row", async ({ page }) => {
    await openFixture(page, "?fail=1");

    await earlier(page).getByRole("button").first().click();
    await dialog(page).getByRole("button", { name: "Delete question" }).click();

    await expect(dialog(page)).toContainText(
      "That question could not be deleted. Try again.",
    );
    expect(await deleted(page)).toEqual([FIRST]);
    // By tag: behind an open dialog the rows have no role to be found by.
    await expect(earlier(page).locator("li")).toHaveCount(3);
  });

  test("while an answer is in flight the action is disabled", async ({
    page,
  }) => {
    await openFixture(page, "?busy=1");

    for (const button of await earlier(page).getByRole("button").all()) {
      await expect(button).toBeDisabled();
    }
  });
});
