import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

import { DEFAULT_FILM_FILTERS } from "@/components/dashboard/matches/match-detail/film/film-filters";

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
 * T8: the header's clear control is a labelled "Clear all" text button, not
 * a bare glyph, and it is drawn only while a cut is applied.
 *
 * `point-list-clear-all-harness.tsx` mounts the real `PointList` twice —
 * once with `DEFAULT_FILM_FILTERS` (no button), once with
 * `{ ...DEFAULT_FILM_FILTERS, pressure: "break" }` (exactly one button
 * named "Clear all") — through `MatchDataProvider` + `WorkspaceProvider`,
 * exactly as the Film tab does.
 */
test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "point-list-clear-all-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/point-list-clear-all-harness.tsx"),
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
      "<!doctype html><html><body>" +
        '<div id="no-filters-root"></div>' +
        '<div id="with-filters-root"></div>' +
        '<script src="/bundle.js"></script></body></html>',
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

test("no button named Clear all when nothing is applied", async ({ page }) => {
  await page.goto(origin);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");

  const header = page.locator("#no-filters-root");
  await expect(header.getByRole("button", { name: "Clear all" })).toHaveCount(
    0,
  );
});

test("exactly one Clear all button when a cut is applied, and it resets the filters", async ({
  page,
}) => {
  await page.goto(origin);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");

  const header = page.locator("#with-filters-root");
  const clearButton = header.getByRole("button", { name: "Clear all" });
  await expect(clearButton).toHaveCount(1);

  await clearButton.click();

  const clearedWith = await header.getAttribute("data-cleared-with");
  expect(clearedWith).not.toBeNull();
  expect(JSON.parse(clearedWith!)).toEqual(DEFAULT_FILM_FILTERS);
});
