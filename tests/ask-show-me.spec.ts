import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * "Show me" under a saved answer (`ask-show.tsx`) in a real browser, through
 * `tests/fixtures/ask-show-harness.tsx`: one status region for the
 * component's whole life (busy, then the outcome), focus handed to the
 * result once the button unmounts, and the several-matches list capped as
 * the sources are. `ask-show.spec.ts` holds the route and `show.ts`.
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
const status = (page: Page) => region(page).locator("[data-ask-show-status]");

test("one status region from the start: busy while the points are found", async ({
  page,
}) => {
  await openFixture(page, "?case=slow");
  await expect(region(page).getByRole("status")).toHaveCount(1);
  await expect(status(page)).toHaveText("");
  await expect(region(page)).not.toHaveAttribute("aria-busy", /.*/);

  await page.getByRole("button", { name: "Show me these points" }).click();
  await expect(status(page)).toHaveText("Finding the points");
  await expect(region(page)).toHaveAttribute("aria-busy", "true");
  // The busy mark is the region's, not the button's, and still one status.
  await expect(
    page.getByRole("button", { name: "Show me these points" }),
  ).not.toHaveAttribute("aria-busy", /.*/);
  await expect(region(page).getByRole("status")).toHaveCount(1);
});

test("one match: the count is announced and focus moves to the point list", async ({
  page,
}) => {
  await openFixture(page, "?case=match");
  await page.getByRole("button", { name: "Show me these points" }).click();
  await expect(status(page)).toHaveText("3 points found");
  await expect(region(page)).not.toHaveAttribute("aria-busy", /.*/);
  await expect(
    page.getByRole("heading", { name: "All 3 points in this match" }),
  ).toBeFocused();
});

test("several matches: the first two, then All N opens the rest in place", async ({
  page,
}) => {
  await openFixture(page, "?case=matches");
  await page.getByRole("button", { name: "Show me these points" }).click();
  await expect(status(page)).toHaveText("Points in 17 matches");
  const list = page.locator("[data-ask-show-matches]");
  await expect(
    list.getByRole("heading", { name: "Points in 17 matches" }),
  ).toBeFocused();
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
