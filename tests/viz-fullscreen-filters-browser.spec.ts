import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

let server: Server;
let origin: string;
let outputPath: string;

test.beforeAll(async () => {
  outputPath = mkdtempSync(join(tmpdir(), "viz-fullscreen-filters-"));
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
        entry: resolve("tests/fixtures/viz-fullscreen-filters-harness.tsx"),
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
            "@/app/dashboard/matches/(detail)/[matchId]/viz-bands-actions":
              resolve("tests/fixtures/viz-fullscreen-actions-browser-mock.ts"),
            "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions":
              resolve("tests/fixtures/viz-fullscreen-actions-browser-mock.ts"),
            "next/navigation": resolve(
              "tests/fixtures/viz-navigation-browser-mock.ts",
            ),
            "@": resolve("src"),
          },
        },
      },
      (error, stats) => (error ? reject(error) : done(stats.toJson())),
    );
  });
  expect(result.errors ?? []).toEqual([]);
  const bundle = readFileSync(join(outputPath, "bundle.js"));
  const stylesheet = (
    await postcss([tailwindcss()]).process(
      readFileSync(resolve("src/app/globals.css"), "utf8"),
      { from: resolve("src/app/globals.css") },
    )
  ).css;
  server = createServer((request, response) => {
    const path = request.url ?? "/";
    response.setHeader(
      "content-type",
      path.startsWith("/bundle.js")
        ? "text/javascript; charset=utf-8"
        : path.startsWith("/style.css")
          ? "text/css; charset=utf-8"
          : "text/html; charset=utf-8",
    );
    response.end(
      path.startsWith("/bundle.js")
        ? bundle
        : path.startsWith("/style.css")
          ? stylesheet
          : '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
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

test("fullscreen chips scroll in one line, preserve controls and follow both subjects after reopening", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(
    `${origin}/?tab=shots&cut=serve&ball=first&ball=second&court=deuce&court=ad&zone=t&zone=body&zone=wide&result=won&result=lost&vset=1&vset=2`,
  );
  await page.getByRole("button", { name: "Open fullscreen" }).click();
  const avatar = page.getByTestId("fullscreen-subject-avatar");
  await expect(avatar).toHaveText("AK");
  const scoreboardBox = await page
    .getByTestId("fullscreen-scoreboard")
    .boundingBox();
  const exitBox = await page
    .getByRole("button", { name: "Exit fullscreen" })
    .boundingBox();
  expect(scoreboardBox).not.toBeNull();
  expect(exitBox).not.toBeNull();
  expect(exitBox?.y ?? 0).toBeGreaterThan(
    (scoreboardBox?.y ?? 0) + (scoreboardBox?.height ?? 0),
  );
  expect((exitBox?.x ?? 0) + (exitBox?.width ?? 0)).toBeLessThanOrEqual(320);
  const strip = page.getByRole("group", { name: "Applied filters" });
  const viewport = page.getByLabel("Applied filters, scroll horizontally");
  await expect(strip.locator("button").first()).toBeVisible();
  const chipLayout = await strip.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    scrollWidth: node.parentElement?.scrollWidth,
    clientWidth: node.parentElement?.clientWidth,
  }));
  expect(chipLayout.height).toBeLessThan(30);
  expect(chipLayout.scrollWidth).toBeGreaterThan(chipLayout.clientWidth ?? 0);
  await viewport.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => viewport.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  await strip.getByRole("button", { name: "Remove Wide" }).focus();
  await expect(
    strip.getByRole("button", { name: "Remove Wide" }),
  ).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(strip.getByRole("button", { name: "Remove Wide" })).toHaveCount(
    0,
  );
  for (const name of [
    "Serve placement",
    "Scatter",
    "Zoom out",
    "Zoom in",
    "Fit the court",
    "Exit fullscreen",
  ]) {
    const control = page.getByRole("button", { name });
    await control.focus();
    await expect(control).toBeInViewport();
  }
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await page.getByRole("button", { name: "Open fullscreen" }).click();
  await expect(avatar).toHaveText("AK");
  await page.locator('[aria-haspopup="dialog"]').click();
  await page.getByRole("button", { name: /Blake Rivera/ }).click();
  await expect(avatar).toHaveText("BR");
  const scoreRows = page.getByTestId("fullscreen-scoreboard");
  await expect(scoreRows.getByText("Avery Kim", { exact: true })).toBeVisible();
  await expect(
    scoreRows.getByText("Blake Rivera", { exact: true }),
  ).toBeVisible();
  await expect(scoreRows.getByText("6", { exact: true })).toBeVisible();
  await expect(scoreRows.getByText("4", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});
