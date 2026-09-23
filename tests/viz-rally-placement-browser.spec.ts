import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/** Production selector, preview, state provider and both court renderers,
 * backed by asymmetric role-resolved fixtures. No database edits. */
let server: Server;
let origin: string;
let outputPath: string;

test.beforeAll(async () => {
  outputPath = mkdtempSync(join(tmpdir(), "viz-rally-placement-"));
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
        entry: resolve("tests/fixtures/viz-rally-placement-harness.tsx"),
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

test("Rally placement selector projects Scatter and Heat consistently in preview, focused and fullscreen courts", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/?view=shots&cut=rallyPosition`);
  await page
    .getByRole("button", { name: "Rally position", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: /^Rally placement/ }).click();
  await expect(page).toHaveURL(/cut=rallyPlacement/);
  const preview = page.getByTestId("preview");
  const focused = page.getByTestId("focused");
  const fullscreen = page.getByTestId("fullscreen");
  await expect(page.locator("output")).toHaveText("6 of 6");
  await expect(preview.getByRole("img")).toHaveAttribute(
    "aria-label",
    "rally placement court, 6 points shown",
  );
  await expect(focused.getByRole("img")).toHaveAttribute(
    "style",
    "transform: rotate(180deg);",
  );
  await expect(fullscreen.locator("[data-viz-mark]")).toHaveCount(6);
  // Same render source and positions at tile and focused scales.
  const coordinates = async (section: typeof focused) =>
    section
      .locator("circle")
      .evaluateAll((nodes) =>
        nodes.map((n) => [n.getAttribute("cx"), n.getAttribute("cy")]),
      );
  expect(await coordinates(preview)).toEqual(await coordinates(focused));
  const low = fullscreen
    .locator('[data-viz-mark="low-p1-deep"] circle')
    .first();
  const high = fullscreen
    .locator('[data-viz-mark="high-p1-deep"] circle')
    .first();
  expect(await low.getAttribute("cx")).toBe(await high.getAttribute("cx"));
  expect(Number(await low.getAttribute("cy"))).toBeCloseTo(
    Number(await high.getAttribute("cy")),
  );
  expect(Number(await low.getAttribute("cy"))).toBeLessThan(330);
  for (const subject of ["you", "opponent"]) {
    if (subject === "opponent") {
      await page.getByRole("button", { name: "Switch player" }).click();
      await expect(page).toHaveURL(/player=opponent/);
    }
    await page.getByRole("button", { name: "Scatter", exact: true }).click();
    await page.getByRole("menuitemradio", { name: /^Heat/ }).click();
    // Two net shots stay counted, but cannot create an artificial density
    // hotspot at the gutter; each court's shared heat layer excludes them.
    for (const surface of [preview, focused, fullscreen])
      await expect(surface.locator("g[filter] circle")).toHaveCount(4);
    expect(await coordinates(preview)).toEqual(await coordinates(focused));
    await expect(preview.getByRole("img")).toHaveAttribute(
      "aria-label",
      "Rally placement heat map, 6 shots",
    );
    await expect(focused.getByRole("img")).toHaveAttribute(
      "aria-label",
      "Rally placement heat map, 6 shots",
    );
    await page.getByRole("button", { name: "Heat", exact: true }).click();
    await page.getByRole("menuitemradio", { name: /^Scatter/ }).click();
    await expect(fullscreen.locator("[data-viz-mark]")).toHaveCount(6);
  }
  await page.getByRole("button", { name: "Second set" }).click();
  await expect(page.locator("output")).toHaveText("3 of 6");
  await expect(fullscreen.locator("[data-viz-mark]")).toHaveCount(3);
  expect(await coordinates(preview)).toEqual(await coordinates(focused));
  await page.screenshot({
    path: test.info().outputPath("rally-placement.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
