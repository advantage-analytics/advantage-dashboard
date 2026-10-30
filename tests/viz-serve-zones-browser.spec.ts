import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/** Production ChartMenu + VizStateProvider and the two production court
 * renderers, backed by offline world-coordinate fixtures. No database edits. */
let server: Server;
let origin: string;
let outputPath: string;

test.beforeAll(async () => {
  outputPath = mkdtempSync(join(tmpdir(), "viz-serve-zones-"));
  const webpack = (
    nextWebpack as unknown as {
      webpack: (
        config: unknown,
        cb: (
          error: Error | null,
          stats: { toJson(): { errors?: unknown[] } },
        ) => void,
      ) => void;
    }
  ).webpack;
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/viz-serve-zones-harness.tsx"),
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
            "next/navigation": resolve(
              "tests/fixtures/viz-navigation-browser-mock.ts",
            ),
          },
        },
      },
      (error, stats) => (error ? reject(error) : done(stats.toJson())),
    );
  });
  expect(result.errors ?? []).toEqual([]);
  const bundle = readFileSync(join(outputPath, "bundle.js"));
  server = createServer((request, response) => {
    response.setHeader(
      "content-type",
      request.url?.startsWith("/bundle.js")
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8",
    );
    response.end(
      request.url?.startsWith("/bundle.js")
        ? bundle
        : '<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server?.listening)
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  if (outputPath) rmSync(outputPath, { recursive: true, force: true });
});

test("Serve placement → Zones renders six cells and agrees with scatter, player and filtered populations", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/?view=shots&cut=serve`);
  const focused = page.getByTestId("focused");
  const fullscreen = page.getByTestId("fullscreen");
  await expect(fullscreen.locator("[data-viz-mark]")).toHaveCount(42);
  // Both court renderers project the asymmetric deuce-wide dot left of centre.
  const marker = fullscreen
    .locator('[data-viz-mark="p1-low-0-0"] circle')
    .first();
  const x = Number(await marker.getAttribute("cx"));
  expect(x).toBeLessThan(197.5);
  const focusedXs = await focused
    .locator("circle")
    .evaluateAll((dots) => dots.map((d) => Number(d.getAttribute("cx"))));
  expect(focusedXs).toContain(x);
  await page.getByRole("button", { name: "Scatter", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /Zones/ }).click();
  await expect(focused.locator("[data-serve-zone]")).toHaveCount(6);
  await expect(fullscreen.locator("[data-serve-zone-cell]")).toHaveCount(6);
  await expect(focused.locator("circle")).toHaveCount(0);
  await expect(fullscreen.locator("[data-viz-mark]")).toHaveCount(0);
  const deuce = '[data-serve-zone="deuce-wide"]';
  await expect(focused.locator(`${deuce} text`)).toHaveText(["2", "100%"]);
  await expect(fullscreen.locator(`${deuce} text`)).toHaveText(["100%", "2"]);
  await page.getByRole("button", { name: "Switch player" }).click();
  await expect(focused.locator(`${deuce} text`)).toHaveText(["12", "17%"]);
  await expect(fullscreen.locator(`${deuce} text`)).toHaveText(["17%", "12"]);
  await page.getByRole("button", { name: "Deuce wide, second set" }).click();
  await expect(page.locator("output")).toHaveText("6 of 42");
  await expect(focused.locator(`${deuce} text`)).toHaveText(["6", "17%"]);
  await expect(fullscreen.locator(`${deuce} text`)).toHaveText(["17%", "6"]);
  await expect(focused.locator('[data-serve-zone="ad-wide"] text')).toHaveCount(
    0,
  );
  await expect(fullscreen.locator('[data-serve-zone="ad-wide"]')).toHaveCount(
    0,
  );
  // The native `<title>` is gone: a zone answers with the dark readout, by
  // hover and by a tap that pins it until the next press.
  const zoneReadout = fullscreen.locator("[data-viz-readout]");
  const zone = fullscreen.locator(deuce);
  await expect(fullscreen.locator("[data-serve-zone] title")).toHaveCount(0);
  await expect(zone).toHaveAttribute(
    "aria-label",
    "Selected player — deuce wide: 17% of 6 points won",
  );
  await fullscreen.locator('[data-serve-zone-cell="deuce-wide"]').hover();
  await expect(zoneReadout).toContainText("Selected player — deuce wide");
  await expect(zoneReadout).toContainText("17% of 6 points won");
  await fullscreen.locator('[data-serve-zone-cell="deuce-wide"]').click();
  await page.mouse.move(0, 0);
  await expect(zoneReadout).toBeVisible();
  await page.mouse.down();
  await page.mouse.up();
  await expect(zoneReadout).toHaveCount(0);
  await page.screenshot({
    path: test.info().outputPath("filtered-serve-zones.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Empty set" }).click();
  await expect(page.locator("output")).toHaveText("0 of 42");
  await expect(focused.locator("[data-serve-zone]")).toHaveCount(6);
  await expect(fullscreen.locator("[data-serve-zone-cell]")).toHaveCount(6);
  await expect(focused.locator("[data-serve-zone] text")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a mark pinned on Scatter does not stop the fullscreen zones answering on Zones", async ({
  page,
}) => {
  await page.goto(`${origin}/?view=shots&cut=serve`);
  const fullscreen = page.getByTestId("fullscreen");
  const readout = fullscreen.locator("[data-viz-readout]");
  await fullscreen.locator('[data-viz-mark="p1-high-0-0"]').click();
  await expect(readout).toContainText("Watch point");
  await page.getByRole("button", { name: "Scatter", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /Zones/ }).click();
  await expect(fullscreen.locator("[data-viz-mark]")).toHaveCount(0);
  await expect(readout).toHaveCount(0);
  await fullscreen.locator('[data-serve-zone-cell="deuce-wide"]').hover();
  await expect(readout).toContainText("deuce wide");
  await expect(readout).not.toContainText("Watch point");
});

test("Zones with only faults keeps the six empty cells instead of falling back to scatter", async ({
  page,
}) => {
  await page.goto(`${origin}/?view=shots&cut=serve&chart=zones&faults=1`);
  await expect(page.locator("output")).toHaveText("1 of 1");
  await expect(
    page.getByTestId("focused").locator("[data-serve-zone]"),
  ).toHaveCount(6);
  await expect(page.getByTestId("focused").locator("circle")).toHaveCount(0);
  await expect(
    page.getByTestId("fullscreen").locator("[data-serve-zone-cell]"),
  ).toHaveCount(6);
  await expect(page.locator("[data-serve-zone] text")).toHaveCount(0);
});
