import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The admin header's team search when its server action fails.
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
  return page.getByRole("searchbox", { name: "Search teams" });
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
  await expect(page.getByText("Couldn't search teams.")).toBeVisible();
  await expect(page.getByText("Searching…")).toHaveCount(0);
});

test("the next keystroke after a failure searches again", async ({ page }) => {
  const errors: string[] = [];
  const field = await openSearch(page, errors);
  await page.evaluate(() => {
    window.__adminSearchFails = true;
  });
  await field.fill("Stan");
  await expect(page.getByText("Couldn't search teams.")).toBeVisible();

  await page.evaluate(() => {
    window.__adminSearchFails = false;
  });
  await field.pressSequentially("f");

  await expect(
    page.getByRole("link", { name: /Stanford Women's Tennis/ }),
  ).toHaveAttribute(
    "href",
    "/admin/teams/11111111-1111-4111-8111-111111111111",
  );
  await expect(page.getByText("Couldn't search teams.")).toHaveCount(0);
  expect(errors).toEqual([]);
});
