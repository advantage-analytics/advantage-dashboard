import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

let server: Server;
let origin: string;
let outputPath: string;

test.beforeAll(async () => {
  outputPath = mkdtempSync(join(tmpdir(), "viz-stats-layout-"));
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
  const mock = resolve("tests/fixtures/viz-gallery-browser-mocks.tsx");
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/viz-stats-layout-harness.tsx"),
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
            "@/components/dashboard/matches/match-detail/shots/viz-bands-context":
              mock,
            "./viz-bands-context$": mock,
            "@/components/dashboard/matches/match-data-provider": mock,
            "@/components/dashboard/matches/match-detail/use-match-sides": mock,
            "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions":
              mock,
            "@/components/dashboard/matches/match-detail/shots/save-view-dialog":
              mock,
            "./save-view-dialog$": mock,
            "next/link": mock,
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
  expect(
    (result.errors ?? []).map(
      (error) => (error as { message: string }).message.split("\n")[0],
    ),
  ).toEqual([]);
  const bundle = readFileSync(join(outputPath, "bundle.js"));
  const globalCssPath = resolve("src/app/globals.css");
  const { css } = await postcss([tailwindcss()]).process(
    readFileSync(globalCssPath, "utf8"),
    { from: globalCssPath },
  );
  server = createServer((request, response) => {
    if (request.url === "/bundle.js") {
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.end(bundle);
    } else if (request.url === "/style.css") {
      response.setHeader("content-type", "text/css; charset=utf-8");
      response.end(css);
    } else {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><style>:root{--font-inter:Arial,sans-serif}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
      );
    }
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

test("populated and empty statistics align with the court and stay reachable on narrow screens", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 760, height: 800 });
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=long`);
  const card = page.getByText("Where the serve went").locator("../..");
  await expect(card).toBeVisible();
  await expect(page.getByText("No points match these filters")).toHaveCount(0);
  await expect(card.getByText("Deuce wide", { exact: true })).toBeVisible();
  await expect(card.getByText("100%", { exact: true })).toBeVisible();
  expect(await card.locator("li").first().ariaSnapshot()).toContain(
    "Deuce wide: 100% of 4 points won",
  );
  const wide = await page.evaluate(() => {
    const statsEl = document.querySelector(".viz-vt-stats-card");
    const courtEl = statsEl?.parentElement?.previousElementSibling;
    const court = courtEl?.getBoundingClientRect();
    const stats = statsEl?.getBoundingClientRect();
    return {
      courtTop: court?.top,
      courtBottom: court?.bottom,
      statsTop: stats?.top,
      statsBottom: stats?.bottom,
    };
  });
  expect(Math.abs((wide.courtTop ?? 0) - (wide.statsTop ?? 100))).toBeLessThan(
    1,
  );
  expect(
    Math.abs((wide.courtBottom ?? 0) - (wide.statsBottom ?? 100)),
  ).toBeLessThan(1);
  await page.screenshot({
    path: resolve("test-results/viz-stats-wide.png"),
    fullPage: true,
  });
  const scroll = await page
    .locator(".viz-vt-stats-card .overflow-y-auto")
    .evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      return {
        scrollHeight: element.scrollHeight,
        clientHeight: element.clientHeight,
        scrollTop: element.scrollTop,
      };
    });
  expect(scroll.scrollHeight).toBeGreaterThan(scroll.clientHeight);
  expect(scroll.scrollTop).toBeGreaterThan(0);

  for (const [cut, title] of [
    ["returnPlacement", "Where the return went"],
    ["rallyPlacement", "Where rally shots landed"],
    ["rallyPosition", "Where rally shots were struck"],
    ["returnContact", "Where the return was struck"],
  ]) {
    await page.goto(`${origin}/?tab=shots&cut=${cut}&fixture=long`);
    await expect(page.getByText(title, { exact: true })).toBeVisible();
    const rows = await page.locator(".viz-vt-stats-card li").count();
    const empty = await page.getByText("No points match these filters").count();
    expect(rows > 0 || empty > 0, cut).toBe(true);
  }

  await page.goto(`${origin}/?tab=shots&cut=serve&vset=3&fixture=long`);
  await expect(page.getByText("No points match these filters")).toBeVisible();
  await expect(page.getByText("Where the serve went")).toBeVisible();
  await page.screenshot({
    path: resolve("test-results/viz-stats-empty-wide.png"),
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
    card: document
      .querySelector(".viz-vt-stats-card")
      ?.getBoundingClientRect()
      .toJSON(),
    court: document
      .querySelector(".viz-vt-stats-card")
      ?.parentElement?.previousElementSibling?.getBoundingClientRect()
      .toJSON(),
  }));
  expect(narrow.width).toBeLessThanOrEqual(narrow.viewport);
  expect(narrow.card!.top).toBeGreaterThan(narrow.court!.bottom);
  await expect(page.getByText("No points match these filters")).toBeVisible();
  await page.screenshot({
    path: resolve("test-results/viz-stats-empty-narrow.png"),
    fullPage: true,
  });
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=long`);
  await expect(page.getByText("Where the serve went")).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: resolve("test-results/viz-stats-populated-narrow.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
