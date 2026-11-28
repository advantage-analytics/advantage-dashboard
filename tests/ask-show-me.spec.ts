import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * "Watch the points" under a saved answer (`ask-show.tsx`) in a real
 * browser, through `tests/fixtures/ask-show-harness.tsx`: the points load
 * with the answer, so one click goes into the film; the line holds its place
 * while they load; a refusal keeps a retry and a way into the film; and the
 * several-matches list opens from one line, capped as the sources are.
 * `ask-show.spec.ts` holds the route and `show.ts`.
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
  const outputPath = mkdtempSync(join(tmpdir(), "ask-show-me-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/ask-show-harness.tsx"),
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

async function openFixture(page: Page, query: string) {
  await page.goto(`${origin}/${query}`, { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

const region = (page: Page) => page.locator("[data-ask-show]");

test("loads with the answer: busy, the line held in place and dimmed, no button to press", async ({
  page,
}) => {
  await openFixture(page, "?case=slow");
  await expect(region(page)).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("[data-ask-show-placeholder]")).toHaveText(
    "Watch these points",
  );
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("link")).toHaveCount(0);
});

test("one match: one link straight into the film, no second click", async ({
  page,
}) => {
  await openFixture(page, "?case=match");
  const watch = page.getByRole("link", { name: /^Watch .*3 points/ });
  await expect(watch).toHaveAttribute(
    "href",
    "/dashboard/matches/match-1?tab=film&pn=3%2C7%2C12",
  );
  await expect(region(page)).not.toHaveAttribute("aria-busy", /.*/);
  await expect(page.locator("[data-ask-show-placeholder]")).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("an answer far down the conversation asks for nothing until it scrolls near", async ({
  page,
}) => {
  await openFixture(page, "?case=far");
  const posts = () =>
    page.evaluate(
      () => (window as unknown as { __askShowPosts: number }).__askShowPosts,
    );
  await expect(page.locator("[data-ask-show-placeholder]")).toHaveCount(1);
  await expect(region(page)).not.toHaveAttribute("aria-busy", /.*/);
  expect(await posts()).toBe(0);
  await region(page).scrollIntoViewIfNeeded();
  await expect(
    page.getByRole("link", { name: /^Watch .*3 points/ }),
  ).toBeVisible();
  expect(await posts()).toBe(1);
});

test("a refusal: the alert, Try again, and a way into the match's film", async ({
  page,
}) => {
  await openFixture(page, "?case=fail");
  await expect(page.getByRole("alert")).toHaveText(
    "The points could not be read. Try again.",
  );
  const retry = page.getByRole("button", { name: "Try again" });
  await expect(retry).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "Open the match's video" }),
  ).toHaveAttribute("href", "/dashboard/matches/match-1?tab=film");

  // Trying again asks once more; refused again, it says so again.
  await retry.click();
  await expect(page.getByRole("alert")).toHaveText(
    "The points could not be read. Try again.",
  );
});

test("several matches: one line counts the points, opens the first two, then All N", async ({
  page,
}) => {
  await openFixture(page, "?case=matches");
  const line = page.getByRole("button", {
    name: "Watch 170 points across 17 matches",
  });
  await expect(line).toHaveAttribute("aria-expanded", "false");
  const list = page.locator("[data-ask-show-matches]");
  await expect(list.getByRole("listitem")).toHaveCount(0);

  await line.click();
  await expect(line).toHaveAttribute("aria-expanded", "true");
  await expect(list.getByRole("listitem")).toHaveCount(2);

  const all = list.getByRole("button", { name: "All 17" });
  await expect(all).toHaveAttribute("aria-expanded", "false");
  await all.click();
  await expect(list.getByRole("listitem")).toHaveCount(17);
  const first = list.getByRole("button", { name: "First 2" });
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await first.click();
  await expect(list.getByRole("listitem")).toHaveCount(2);
});

test("three matches open whole: every row, no All N", async ({ page }) => {
  await openFixture(page, "?case=three");
  const line = page.getByRole("button", {
    name: "Watch 9 points across 3 matches",
  });
  await line.click();
  const list = page.locator("[data-ask-show-matches]");
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(list.getByRole("button", { name: /^All / })).toHaveCount(0);
});
