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
const cards = (page: Page) => page.getByRole("list", { name: "Next steps" });
const card = (page: Page, kind: string) =>
  cards(page).locator(`[data-ask-action="${kind}"]`);

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

test.describe("the cards under an answer", () => {
  test("a saved answer with a figure, a block and one source offers the five", async ({
    page,
  }) => {
    await openFixture(page, "?c=1");

    await expect(cards(page).getByRole("listitem")).toHaveCount(5);
    await expect(
      cards(page)
        .locator("[data-ask-action]")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("data-ask-action")),
        ),
    ).resolves.toEqual(["watch", "pin", "visualize", "save_view", "export"]);

    await expect(card(page, "watch").getByRole("link")).toHaveAttribute(
      "href",
      /^\/dashboard\/matches\/match-sep-28\?tab=film&f=/,
    );
    await expect(card(page, "visualize").getByRole("link")).toHaveAttribute(
      "href",
      /^\/dashboard\/matches\/match-sep-28\?tab=shots&cut=serve/,
    );
    const download = card(page, "export").getByRole("link");
    await expect(download).toHaveAttribute("download", "ask-serve.csv");
    await expect(download).toHaveAttribute("href", /^data:text\/csv/);
    // Nothing ran on render.
    expect(await calls(page)).toEqual([]);
  });

  test("Pin to Home calls the action with the answer's id, then says where it is", async ({
    page,
  }) => {
    await openFixture(page, "?c=1");

    await card(page, "pin")
      .getByRole("button", { name: "Pin to Home" })
      .click();

    await expect
      .poll(() => calls(page))
      .toEqual([{ name: "pinAskAnswer", args: [ANSWER_ID, "personal"] }]);
    await expect(card(page, "pin").getByRole("status")).toHaveText(
      "On your Home page",
    );
    await expect(
      card(page, "pin").getByRole("link", { name: "Open Home" }),
    ).toHaveAttribute("href", "/dashboard");

    await card(page, "pin").getByRole("button", { name: "Unpin" }).click();
    await expect.poll(async () => (await calls(page)).length).toBe(2);
    await expect(
      card(page, "pin").getByRole("button", { name: "Pin to Home" }),
    ).toBeVisible();
  });

  test("an answer already pinned opens pinned; a refused pin says why", async ({
    page,
  }) => {
    await openFixture(page, "?c=1&pinned=1");
    await expect(card(page, "pin").getByRole("status")).toHaveText(
      "On your Home page",
    );

    await openFixture(page, "?c=1&pin=fail");
    await card(page, "pin")
      .getByRole("button", { name: "Pin to Home" })
      .click();
    await expect(card(page, "pin").getByRole("alert")).toHaveText(
      "This answer has no chart to pin.",
    );
  });

  test("Save view asks for a name in the confirm shell and saves on its action only", async ({
    page,
  }) => {
    await openFixture(page, "?c=1");

    await card(page, "save_view")
      .getByRole("button", { name: "Save view" })
      .click();
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
    await expect(card(page, "save_view").getByRole("status")).toHaveText(
      "Saved · Second serves, Marcus",
    );
    await expect(
      card(page, "save_view").getByRole("link", { name: "Open the view" }),
    ).toHaveAttribute("href", /&view=view-1$/);
  });

  test("a duplicate name is refused in the dialog", async ({ page }) => {
    await openFixture(page, "?c=1&view=duplicate");

    await card(page, "save_view")
      .getByRole("button", { name: "Save view" })
      .click();
    const dialog = page.getByRole("alertdialog");
    await dialog.getByRole("button", { name: "Save view" }).click();
    await expect(dialog).toContainText("A view with that name already exists.");
  });

  test("on the team page the pin is offered and lands on the team Home", async ({
    page,
  }) => {
    await openFixture(page, "?c=1&scope=team");
    await expect(card(page, "watch")).toHaveCount(1);
    await card(page, "pin")
      .getByRole("button", { name: "Pin to Home" })
      .click();
    await expect(card(page, "pin")).toContainText("On the team Home");
    await expect(
      card(page, "pin").getByRole("link", { name: "Open Home" }),
    ).toHaveAttribute("href", "/dashboard/team");
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
    // The line of next steps wraps on a phone; no action takes a width.
    expect((await cards(page).getAttribute("class"))?.split(/\s+/)).toEqual(
      expect.arrayContaining(["flex-wrap"]),
    );
  });
});
