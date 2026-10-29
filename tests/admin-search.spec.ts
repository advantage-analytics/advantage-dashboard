import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The admin header's Search: what it does when its server action fails, and
 * its keyboard (↑/↓ through the grouped options, Enter opens, ⌘K opens it
 * from the page but not from inside another field).
 *
 * PostHog issue 01a0f0a6: bursts of unhandled `TypeError: Load failed` on
 * /admin pages in Safari. Server actions are queued one at a time per
 * client, so a few keystrokes' searches can be waiting when the network
 * drops or the page reloads, and each of them rejects. The search had no
 * rejection handler, so every one became an unhandled rejection and the list
 * sat on "Searching…" for good.
 *
 * `tests/fixtures/admin-search-harness.tsx` is bundled with webpack and
 * served from a throwaway port — the `ask-rail.spec.ts` pattern — because
 * what is pinned is an effect's promise chain, which a static render never
 * runs. Playwright reports an unhandled rejection as a `pageerror`.
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

const FIELD = "Search teams, people, matches, conferences";

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "admin-search-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/admin-search-harness.tsx"),
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
          alias: {
            "@/lib/data/admin-search-server$": resolve(
              "tests/fixtures/admin-search-actions-browser-mock.ts",
            ),
            "@": resolve("src"),
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
            "next/navigation$": resolve(
              "tests/fixtures/next-navigation-browser-mock.ts",
            ),
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

async function openSearch(page: Page, errors: string[]) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
  await page.getByRole("button", { name: "Search" }).click();
  return page.getByRole("combobox", { name: FIELD });
}

test("a failed search says so instead of an unhandled rejection", async ({
  page,
}) => {
  const errors: string[] = [];
  const field = await openSearch(page, errors);
  await page.evaluate(() => {
    window.__adminSearchFails = true;
  });

  // Typed slowly enough that each keystroke clears the debounce, so several
  // searches are issued and every one of them rejects.
  await field.pressSequentially("Stan", { delay: 250 });

  // Past the last debounce and the stand-in's reply, so every search has
  // settled before asserting none of them rejected unhandled.
  await page.waitForTimeout(600);
  expect(errors).toEqual([]);
  await expect(page.getByText("Couldn't search.")).toBeVisible();
  await expect(page.getByText("Searching…")).toHaveCount(0);
});

test("the next keystroke after a failure searches again", async ({ page }) => {
  const errors: string[] = [];
  const field = await openSearch(page, errors);
  await page.evaluate(() => {
    window.__adminSearchFails = true;
  });
  await field.fill("Stan");
  await expect(page.getByText("Couldn't search.")).toBeVisible();

  await page.evaluate(() => {
    window.__adminSearchFails = false;
  });
  await field.pressSequentially("f");

  await expect(
    page.getByRole("option", { name: /Stanford University Women's/ }),
  ).toHaveAttribute(
    "href",
    "/admin/teams/11111111-1111-4111-8111-111111111111",
  );
  await expect(page.getByText("Couldn't search.")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("results group by kind and the keyboard walks them", async ({ page }) => {
  const errors: string[] = [];
  const field = await openSearch(page, errors);
  await field.fill("stan");

  const options = page.getByRole("option");
  await expect(options).toHaveCount(2);
  await expect(page.getByRole("group", { name: "Teams" })).toBeVisible();
  await expect(page.getByRole("group", { name: "People" })).toBeVisible();

  // The first row is active as soon as results land.
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await field.press("ArrowDown");
  await expect(options.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(field).toHaveAttribute(
    "aria-activedescendant",
    (await options.nth(1).getAttribute("id"))!,
  );
  // Wraps.
  await field.press("ArrowDown");
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  await field.press("ArrowUp");
  await field.press("Enter");

  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { routerPushes: string[] }).routerPushes,
      ),
    )
    .toEqual(["/admin/pilots"]);
  await expect(field).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("no results says so", async ({ page }) => {
  const field = await openSearch(page, []);
  await field.fill("zzzz");
  await expect(page.getByText("No results for “zzzz”")).toBeVisible();
});

test("⌘K opens it from the page, Esc closes, another field keeps ⌘K", async ({
  page,
}) => {
  await page.goto(`${origin}/`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
  const field = page.getByRole("combobox", { name: FIELD });

  await page.locator("body").press("ControlOrMeta+k");
  await expect(field).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(field).toHaveCount(0);

  await page.getByRole("textbox", { name: "Another field" }).focus();
  await page.keyboard.press("ControlOrMeta+k");
  await expect(field).toHaveCount(0);
});
