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
 * T9: a point's shot rows reveal with a staggered rise.
 *
 * `film-shot-row-reveal-harness.tsx` mounts the real `PointList` in the
 * room's dark tone with one playing point and a ten-shot feed on it — the
 * state that opens the shot well under the playing row. The reveal is
 * mount-driven, so what there is to assert is what the markup carries: the
 * `film-shot-row-in` class on every row and the inline `animationDelay` the
 * component computes. Row 10 is the interesting one: at a flat 25ms a step it
 * would start at 225ms, and the eight-step cap is what keeps a long rally
 * fully revealed inside 400ms.
 */
test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "film-shot-row-reveal-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/film-shot-row-reveal-harness.tsx"),
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

test("every shot row in an opened point carries the reveal", async ({
  page,
}) => {
  await page.goto(origin);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");

  const rows = page.locator("[data-shot-id]");
  await expect(rows).toHaveCount(10);

  const classed = await rows.evaluateAll((nodes) =>
    nodes.map((node) => node.classList.contains("film-shot-row-in")),
  );
  expect(classed).toEqual(Array.from({ length: 10 }, () => true));
});

test("the stagger steps 25ms a row and stops at the eight-step cap", async ({
  page,
}) => {
  await page.goto(origin);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");

  const delays = await page
    .locator("[data-shot-id]")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).style.animationDelay),
    );

  expect(delays[0]).toBe("0ms");
  expect(delays[1]).toBe("25ms");
  expect(delays[9]).toBe("200ms");
});
