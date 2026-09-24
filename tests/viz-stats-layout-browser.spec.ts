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
  await expect(card.getByText("Wide 100% · 4", { exact: true })).toBeVisible();
  const courtArt = page.locator("[data-viz-focused-art] > svg");
  const artSize = await courtArt.evaluate((svg) => {
    const rect = svg.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(artSize.width).toBeLessThanOrEqual(520);
  expect(artSize.height).toBeLessThanOrEqual(340);
  const artContainerWidth = await page
    .locator("[data-viz-focused-art]")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(artSize.width).toBeLessThanOrEqual(artContainerWidth * 0.89);
  expect(
    await card.locator("li").filter({ hasText: "Deuce wide" }).ariaSnapshot(),
  ).toContain("Deuce wide: 100% of 4 points won");
  await expect(card.getByText("Deuce court")).toBeVisible();
  await expect(card.getByText("Ad court")).toBeVisible();
  const serveBody = card.locator(".overflow-y-auto");
  const adValues = card.getByText("Wide 17% · 12", { exact: true });
  const adVisible = await Promise.all([
    serveBody.boundingBox(),
    adValues.boundingBox(),
  ]);
  expect(adVisible[0]).not.toBeNull();
  expect(adVisible[1]).not.toBeNull();
  expect(adVisible[1]!.y + adVisible[1]!.height).toBeLessThanOrEqual(
    adVisible[0]!.y + adVisible[0]!.height,
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
    const size = await courtArt.evaluate((svg) => {
      const rect = svg.getBoundingClientRect();
      return { width: rect.width, height: rect.height };
    });
    expect(size.width, cut).toBeLessThanOrEqual(520);
    expect(size.height, cut).toBeLessThanOrEqual(340);
    const rows = await page.locator(".viz-vt-stats-card li").count();
    const empty = await page.getByText("No points match these filters").count();
    expect(rows > 0 || empty > 0, cut).toBe(true);
  }

  await page.goto(`${origin}/?tab=shots&cut=rallyPlacement&fixture=long`);
  const courtSpacing = await page.evaluate(() => {
    const art = document.querySelector("[data-viz-focused-art]")!;
    const svg = art.querySelector("svg")!;
    const card = art.parentElement!;
    const header = card.firstElementChild!;
    const legend = card.lastElementChild!;
    return {
      apron:
        art.getBoundingClientRect().bottom - svg.getBoundingClientRect().bottom,
      headerInset: parseFloat(getComputedStyle(header).paddingLeft),
      legendInset: parseFloat(getComputedStyle(legend).paddingLeft),
    };
  });
  expect(courtSpacing.apron).toBeGreaterThanOrEqual(15);
  expect(courtSpacing.headerInset).toBe(20);
  expect(courtSpacing.legendInset).toBe(20);
  await page.screenshot({
    path: resolve("test-results/viz-stats-short-wide.png"),
    fullPage: true,
  });
  const shortRows = await page.locator(".viz-vt-stats-card li").count();
  if (shortRows > 0 && shortRows <= 4) {
    const bottomGap = await page.evaluate(() => {
      const body = document.querySelector(
        ".viz-vt-stats-card .overflow-y-auto",
      )!;
      const lastRow = body.querySelector("li:last-child")!;
      return (
        body.getBoundingClientRect().bottom -
        lastRow.getBoundingClientRect().bottom
      );
    });
    expect(bottomGap).toBeLessThan(50);
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
  const narrowControls = await page.evaluate(() => {
    const toolbar = document.querySelector(".viz-vt-toolbar")!;
    const applied = toolbar.querySelector('[aria-label="Applied filters"]')!;
    const filterButton = [...toolbar.querySelectorAll("button")].find(
      (button) => button.textContent?.includes("Filters"),
    )!;
    return {
      applied: applied.getBoundingClientRect().toJSON(),
      filters: filterButton.getBoundingClientRect().toJSON(),
      toolbar: toolbar.getBoundingClientRect().toJSON(),
    };
  });
  expect(narrowControls.applied.top).toBeGreaterThanOrEqual(
    narrowControls.filters.bottom,
  );
  expect(narrowControls.applied.right).toBeLessThanOrEqual(
    narrowControls.toolbar.right,
  );
  await expect(
    page.getByRole("button", { name: "Remove Set 3" }),
  ).toBeVisible();
  await page.screenshot({
    path: resolve("test-results/viz-stats-empty-narrow.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Remove Set 3" }).click();
  await expect(
    page.getByRole("group", { name: "Applied filters" }),
  ).toHaveCount(0);
  await expect(page.getByText("No points match these filters")).toHaveCount(0);
  for (const width of [320, 550, 560]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `toolbar at ${width}px`,
    ).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 390, height: 844 });
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

test("focused scatter points share the fullscreen readout and remain inspectable by pointer and keyboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 760, height: 800 });
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=long`);
  const art = page.locator("[data-viz-focused-art]");
  const marks = art.locator("[data-viz-mark]");
  expect(await marks.count()).toBeGreaterThan(1);
  await expect(marks.first()).toHaveAttribute("tabindex", "0");
  await expect(marks.nth(1)).toHaveAttribute("tabindex", "-1");

  const pointerMark = marks.last();
  await pointerMark.hover();
  const readout = art.locator("[data-viz-focused-readout]");
  await expect(readout).toBeVisible();
  const title = await readout.locator("span").first().textContent();
  expect(title).toMatch(/Avery (won|lost) the point/);
  await expect(pointerMark).toHaveAttribute(
    "aria-label",
    /Avery (won|lost) the point/,
  );

  await pointerMark.click();
  await page.mouse.move(745, 750);
  await expect(pointerMark).toHaveAttribute("aria-pressed", "true");
  await expect(readout).toBeVisible();
  await page.screenshot({
    path: resolve("test-results/viz-focused-point-readout.png"),
    fullPage: true,
  });
  await art.click({ position: { x: 10, y: 10 } });
  await expect(pointerMark).toHaveAttribute("aria-pressed", "false");
  await expect(readout).toHaveCount(0);

  await marks.first().focus();
  await expect(readout).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(marks.nth(1)).toBeFocused();
  await expect(marks.nth(1)).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Enter");
  await expect(marks.nth(1)).toHaveAttribute("aria-pressed", "true");

  await page.goto(`${origin}/?tab=shots&cut=serve&chart=heat&fixture=long`);
  await expect(art.locator("[data-viz-mark]")).toHaveCount(0);
  await expect(art.locator("[data-viz-focused-readout]")).toHaveCount(0);

  for (const cut of ["rallyPlacement", "rallyPosition"]) {
    await page.goto(`${origin}/?tab=shots&cut=${cut}&fixture=long`);
    const cutMarks = art.locator("[data-viz-mark]");
    expect(await cutMarks.count(), cut).toBeGreaterThan(0);
    await cutMarks.last().hover();
    await expect(readout).toBeVisible();
  }

  await page.goto(
    `${origin}/?tab=shots&cut=serve&player=opponent&fixture=long`,
  );
  await art.locator("[data-viz-mark]").last().hover();
  await expect(readout).toContainText(/Blake (won|lost) the point/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=long`);
  await art.locator("[data-viz-mark]").last().click();
  await expect(readout).toBeVisible();
  const mobile = await Promise.all([art.boundingBox(), readout.boundingBox()]);
  expect(mobile[0]).not.toBeNull();
  expect(mobile[1]).not.toBeNull();
  expect(mobile[1]!.x).toBeGreaterThanOrEqual(mobile[0]!.x);
  expect(mobile[1]!.x + mobile[1]!.width).toBeLessThanOrEqual(
    mobile[0]!.x + mobile[0]!.width,
  );

  await page.goto(`${origin}/?tab=shots&cut=serve&chart=zones&fixture=long`);
  await expect(art.locator("[data-viz-mark]")).toHaveCount(0);
  await expect(readout).toHaveCount(0);
});

test("a selected timed point offers Watch point only when video is available", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watch`);
  const art = page.locator("[data-viz-focused-art]");
  const timed = art.locator('[data-viz-mark="timed-point"]');
  const untimed = art.locator('[data-viz-mark="untimed-point"]');
  await timed.hover();
  await expect(art.getByRole("button", { name: "Watch point" })).toBeVisible();
  await art.getByRole("button", { name: "Watch point" }).click();
  await expect(page).toHaveURL(/tab=film.*point=timed-point/);

  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watch`);
  await untimed.click();
  await expect(art.getByRole("button", { name: "Watch point" })).toHaveCount(0);
  await timed.focus();
  await page.keyboard.press("Enter");
  await expect(art.getByRole("button", { name: "Watch point" })).toBeVisible();

  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watch&video=none`);
  await page.locator('[data-viz-mark="timed-point"]').click();
  await expect(page.getByRole("button", { name: "Watch point" })).toHaveCount(
    0,
  );
});
