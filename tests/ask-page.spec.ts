import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The whole Ask page in a real browser — `tests/fixtures/ask-page-harness.tsx`,
 * bundled with webpack and served from a throwaway port, the harness pattern
 * of `ask-rail.spec.ts`. What the rail and the answer cannot say alone:
 *
 * - arriving with a tag (`?match=` / `?opponent=` on the route) puts it on
 *   the composer;
 * - a finished answer draws its action cards, and the cards that write do
 *   so only on a click, through the page's actions (recorded by the mock);
 * - under 768px the frame stacks: the rail is a bar, the sheet holds the
 *   list, and the thread and composer carry the phone's classes.
 *
 * The bundle carries no stylesheet, so nothing here measures a width: what
 * is pinned at 390px is the markup and the behaviour the media query turns
 * on, plus the classes the layout hangs on (`max-md:…`). Seeing the page at
 * 390px is the dev server's job.
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

const ANSWER_ID = "aaaaaaaa-0000-4000-8000-000000000002";

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "ask-page-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/ask-page-harness.tsx"),
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
          // The page's server-reaching imports first, then `@`: webpack
          // takes the first alias that matches.
          alias: {
            "@/app/dashboard/ask/actions": resolve(
              "tests/fixtures/ask-page-actions-browser-mock.ts",
            ),
            "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions":
              resolve("tests/fixtures/ask-page-actions-browser-mock.ts"),
            "next/navigation": resolve(
              "tests/fixtures/next-navigation-browser-mock.ts",
            ),
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
            "@/lib/posthog-client$": resolve(
              "tests/fixtures/posthog-client-browser-mock.ts",
            ),
            "posthog-js$": resolve("tests/fixtures/posthog-browser-mock.ts"),
            "@": resolve("src"),
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

async function calls(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          askActionCalls?: { name: string; args: unknown[] }[];
        }
      ).askActionCalls ?? [],
  );
}

// An unnamed `<form>` has no accessible role; the composer is the one with
// the question's textarea.
const composer = (page: Page) => page.locator("form:has(textarea)").first();
// What the answer offers beyond watching its points: one ⋯ on the
// signature's row, opening a menu.
const actionsRow = (page: Page) => page.locator("[data-ask-actions]");
const more = (page: Page) =>
  page.getByRole("button", { name: "More for this answer" });
const menu = (page: Page) =>
  page.getByRole("menu", { name: "More for this answer" });
async function openMenu(page: Page) {
  await more(page).click();
  await expect(menu(page)).toBeVisible();
}
const item = (page: Page, name: string) =>
  menu(page).getByRole("menuitem", { name });

test.describe("arriving with a tag", () => {
  test("?match= puts the match on the composer as a chip; nothing is sent", async ({
    page,
  }) => {
    await openFixture(page, "?tags=match");

    await expect(
      composer(page)
        .getByRole("list", { name: "Tagged" })
        .getByRole("listitem"),
    ).toHaveText(["vs Marcus Hale"]);
    expect(await calls(page)).toEqual([]);
    // The page is otherwise the empty page: the title and the starters.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ask");
    await expect(
      page
        .getByRole("list", { name: "Questions to start with" })
        .getByRole("button"),
    ).toHaveCount(3);
  });

  test("?opponent= does the same with the opponent", async ({ page }) => {
    await openFixture(page, "?tags=opponent");
    await expect(
      composer(page)
        .getByRole("list", { name: "Tagged" })
        .getByRole("listitem"),
    ).toHaveText(["Marcus Hale"]);
  });

  test("with a conversation open the tag is ignored", async ({ page }) => {
    await openFixture(page, "?tags=match&c=1");
    await expect(
      composer(page).getByRole("list", { name: "Tagged" }),
    ).toHaveCount(0);
  });
});

test.describe("the actions under an answer", () => {
  test("a saved answer keeps its actions behind one ⋯ on the signature's row; nothing runs", async ({
    page,
  }) => {
    await openFixture(page, "?c=1");

    // One control on the signature's row, not a row of its own.
    await expect(actionsRow(page)).toHaveCount(1);
    await expect(
      page.locator("[data-ask-provenance] [data-ask-actions]"),
    ).toHaveCount(1);
    await expect(page.getByRole("list", { name: "Next steps" })).toHaveCount(0);

    await openMenu(page);
    await expect(menu(page).getByRole("menuitem")).toHaveText([
      "Pin to Home",
      "See it on the court",
      "Save as a view",
      "Download CSV",
      "Share this match",
    ]);
    // Saved, so the film is reached through the Watch line, not the menu;
    // and the match is the signature's link, not an action.
    await expect(item(page, "Watch on video")).toHaveCount(0);
    await expect(item(page, "Open the match")).toHaveCount(0);

    await expect(item(page, "See it on the court")).toHaveAttribute(
      "href",
      /^\/dashboard\/matches\/match-sep-28\?tab=shots&cut=serve/,
    );
    const download = item(page, "Download CSV");
    await expect(download).toHaveAttribute("download", "ask-serve.csv");
    await expect(download).toHaveAttribute("href", /^data:text\/csv/);
    // Nothing ran on render, or on opening the menu.
    expect(await calls(page)).toEqual([]);
  });

  test("Pin to Home calls the action with the answer's id, then offers Open Home and Unpin", async ({
    page,
  }) => {
    await openFixture(page, "?c=1");

    await openMenu(page);
    await item(page, "Pin to Home").click();
    await expect
      .poll(() => calls(page))
      .toEqual([{ name: "pinAskAnswer", args: [ANSWER_ID, "personal"] }]);
    await expect(actionsRow(page).getByRole("status")).toHaveText(
      "Pinned to your Home page",
    );

    await openMenu(page);
    await expect(item(page, "Open Home")).toHaveAttribute("href", "/dashboard");
    await item(page, "Unpin from Home").click();
    await expect.poll(async () => (await calls(page)).length).toBe(2);
    await openMenu(page);
    await expect(item(page, "Pin to Home")).toBeVisible();
  });

  test("an answer already pinned opens pinned; a refused pin says why", async ({
    page,
  }) => {
    await openFixture(page, "?c=1&pinned=1");
    // A pin read from the saved conversation is not news: silent.
    await expect(actionsRow(page).getByRole("status")).toHaveText("");
    await openMenu(page);
    await expect(item(page, "Open Home")).toBeVisible();
    await expect(item(page, "Unpin from Home")).toBeVisible();

    await openFixture(page, "?c=1&pin=fail");
    await openMenu(page);
    await item(page, "Pin to Home").click();
    await expect(actionsRow(page).getByRole("alert")).toHaveText(
      "This answer has no chart to pin.",
    );
  });

  test("Save as a view asks for a name in the confirm shell and saves on its action only", async ({
    page,
  }) => {
    await openFixture(page, "?c=1");

    await openMenu(page);
    await item(page, "Save as a view").click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Save this view?");
    const name = dialog.getByRole("textbox", { name: "View name" });
    await expect(name).toHaveValue("Second serves won");
    expect(await calls(page)).toEqual([]);

    await name.fill("Second serves, Marcus");
    await dialog.getByRole("button", { name: "Save view" }).click();

    await expect
      .poll(async () => (await calls(page)).map((c) => c.name))
      .toEqual(["createSavedView"]);
    const [saved] = await calls(page);
    expect(saved.args[0]).toMatchObject({
      name: "Second serves, Marcus",
      cut: "serve",
      chart: "scatter",
    });
    await expect(dialog).toHaveCount(0);
    await expect(actionsRow(page).getByRole("status")).toHaveText(
      "Saved · Second serves, Marcus",
    );
    await openMenu(page);
    await expect(item(page, "Open the saved view")).toHaveAttribute(
      "href",
      /&view=view-1$/,
    );
  });

  test("a duplicate name is refused in the dialog", async ({ page }) => {
    await openFixture(page, "?c=1&view=duplicate");

    await openMenu(page);
    await item(page, "Save as a view").click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Save view" }).click();
    await expect(dialog).toContainText("A view with that name already exists.");
  });

  test("on the team page the pin is offered and lands on the team Home", async ({
    page,
  }) => {
    await openFixture(page, "?c=1&scope=team");
    await openMenu(page);
    await expect(item(page, "Watch on video")).toHaveCount(0);
    await item(page, "Pin to Home").click();
    await expect(actionsRow(page).getByRole("status")).toHaveText(
      "Pinned to the team Home",
    );
    await openMenu(page);
    await expect(item(page, "Open Home")).toHaveAttribute(
      "href",
      "/dashboard/team",
    );
  });
});

test.describe("under 768px", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the frame stacks: a bar for the rail, the sheet for the list, the composer at the foot", async ({
    page,
  }) => {
    await openFixture(page);

    const bar = page.locator('nav[data-ask-rail="bar"]');
    await expect(bar).toBeVisible();
    await expect(page.locator('nav[data-ask-rail="open"]')).toHaveCount(0);
    await expect(
      bar.getByRole("button", { name: "Earlier questions · 2" }),
    ).toBeVisible();

    // The frame, the gutter and the intro carry the phone's classes.
    const frame = page.locator("nav[data-ask-rail]").locator("..");
    expect((await frame.getAttribute("class"))?.split(/\s+/)).toEqual(
      expect.arrayContaining(["max-md:flex-col"]),
    );
    const intro = page.getByRole("heading", { level: 1 }).locator("../../..");
    expect((await intro.getAttribute("class"))?.split(/\s+/)).toEqual(
      expect.arrayContaining(["max-md:px-4", "max-md:pt-6"]),
    );

    // The composer and the starters are there, in document order after the bar.
    await expect(composer(page)).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Questions to start with" })
        .getByRole("button"),
    ).toHaveCount(3);

    // The sheet opens the list; a row is a link to its conversation.
    await bar.getByRole("button", { name: "Earlier questions · 2" }).click();
    const sheet = page.getByRole("dialog", { name: "Earlier questions" });
    await expect(sheet.getByRole("link")).toHaveCount(2);
    // The sheet's own title is the first heading; the groups follow.
    await expect(sheet.getByRole("heading", { level: 2 })).toHaveText([
      "Earlier questions",
      "Pinned",
      "October",
    ]);
  });

  test("a thread's composer stays outside the scroller, and the prompt takes the phone's measure", async ({
    page,
  }) => {
    await openFixture(page, "?c=1");

    await expect(composer(page)).toBeVisible();
    const prompt = page.locator("[data-ask-prompt] p").first();
    expect((await prompt.getAttribute("class"))?.split(/\s+/)).toEqual(
      expect.arrayContaining(["max-md:max-w-[92%]"]),
    );
    // The ⋯ rides the signature's row, which wraps on a phone.
    await expect(more(page)).toBeVisible();
  });
});
