import { expect, test } from "@playwright/test";
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
 * T2: the point-row mark is the point's WINNER, not the last hitter.
 *
 * `point-list-winner-mark-harness.tsx` mounts the real `PointList` (through
 * `MatchDataProvider` + `WorkspaceProvider`, exactly as the Film tab does)
 * with two points that share `player: "player2"` and differ only in
 * `wonByPlayer1`. Reading the mark off `point.player` — the bug this task
 * fixes — would draw the same thing on both rows; reading it off
 * `wonByPlayer1` vs the viewer's side draws the workspace mark on one and the
 * initials chip on the other. `data-mark="you"|"opp"` on the row's mark slot
 * is what this spec asserts on, since a workspace with no icon and a chip can
 * otherwise render similar-looking initials text.
 */
test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "point-list-winner-mark-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/point-list-winner-mark-harness.tsx"),
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

test("a point the viewer won carries the workspace mark, even hit by the opponent", async ({
  page,
}) => {
  await page.goto(origin);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");

  const row = page.locator('[data-point-id="won-by-you"]');
  await expect(row.locator('[data-mark="you"]')).toBeVisible();
  await expect(row.locator('[data-mark="opp"]')).toHaveCount(0);
});

test("a point the opponent won carries the initials chip, though they also hit it last", async ({
  page,
}) => {
  await page.goto(origin);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");

  const row = page.locator('[data-point-id="won-by-opp"]');
  await expect(row.locator('[data-mark="opp"]')).toBeVisible();
  await expect(row.locator('[data-mark="you"]')).toHaveCount(0);
});
