import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

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

/**
 * A replayed let in the Video tab's list (`letPoints`): drawn among the
 * points as "Let · Replayed", naming nobody, and never counted. The harness
 * mounts the real `PointList` through `MatchDataProvider`.
 */
test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "point-list-let-row-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/point-list-let-row-harness.tsx"),
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
          alias: { "@": resolve("src") },
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

async function open(page: Page, query = "") {
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

test("the let is drawn where it was played, as Let · Replayed", async ({
  page,
}) => {
  await open(page);
  const ids = await page
    .locator("[data-point-id]")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-point-id")),
    );
  expect(ids).toEqual(["p1", "let-2", "p3", "p4", "p5"]);
  const row = page.locator('[data-point-id="let-2"]');
  await expect(row).toHaveText(/Let · Replayed/);
  await expect(row).toHaveAttribute("data-let-replayed", "");
});

test("the let names no winner and is no seek target", async ({ page }) => {
  await open(page);
  const row = page.locator('[data-point-id="let-2"]');
  await expect(row.locator("[data-mark]")).toHaveCount(0);
  await expect(row).not.toHaveAttribute("role", "button");
  await expect(row.getByRole("button")).toHaveCount(0);
});

test("the count is the points', the let left out", async ({ page }) => {
  await open(page);
  await expect(page.getByText(/^4\s*\/\s*4$/)).toBeVisible();
});

test("an applied cut leaves the let out of the list", async ({ page }) => {
  await open(page, "?filtered");
  await expect(page.locator('[data-point-id="let-2"]')).toHaveCount(0);
  await expect(page.locator('[data-point-id="p1"]')).toHaveCount(1);
});
