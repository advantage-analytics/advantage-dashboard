import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

import { TOUR_TARGETS } from "@/lib/onboarding/tours";

const webpack = (
  nextWebpack as unknown as {
    webpack: (
      config: unknown,
      callback: (error: Error | null, stats: WebpackStats) => void,
    ) => void;
  }
).webpack;

type WebpackStats = { toJson(): { errors?: unknown[] } };

/**
 * T12: the sample report (`/dashboard/matches/sample`) in a real browser,
 * from the committed fixture, over `tests/fixtures/sample-page-harness.tsx`
 * — the page's client composition under the real providers.
 *
 *   1. Every one of the five `data-tour` targets is in the document once the
 *      viewer has been round the views and back, and `?tour=1` opens the
 *      tour on the scoreboard at "1 of 5".
 *   2. The banner is still in view with the pane scrolled to its bottom.
 *   3. No Delete, Share, Compare or Review-score control exists on any view.
 *   4. Nothing under `/api/matches/` is ever asked for — the Video view's
 *      credential renewal goes to `/api/sample-match/video` instead.
 *
 * The harness server answers the sample route with `storage_unavailable`:
 * the film then lands on its unavailable state, which is what a deployment
 * without the clip shows and all this spec needs. The one playback request
 * is counted, never served a file.
 */

const SAMPLE_ENDPOINT = "/api/sample-match/video";

let server: Server;
let origin: string;
let outputPath: string;
/** Every request path the harness server saw, in order. */
const requests: string[] = [];

test.beforeAll(async () => {
  outputPath = mkdtempSync(join(tmpdir(), "sample-page-"));
  const mocks = resolve("tests/fixtures/sample-page-browser-mocks.tsx");
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/sample-page-harness.tsx"),
        output: {
          path: outputPath,
          filename: "bundle.js",
          chunkFilename: "[name].chunk.js",
        },
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
            "next/navigation": resolve(
              "tests/fixtures/viz-navigation-browser-mock.ts",
            ),
            "next/dynamic": resolve(
              "tests/fixtures/next-dynamic-browser-mock.tsx",
            ),
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
            "next/image": resolve(
              "tests/fixtures/match-drawer-deps-browser-mock.tsx",
            ),
            "@/lib/supabase/client": resolve(
              "tests/fixtures/supabase-client-browser-mock.ts",
            ),
            [resolve("src/app/dashboard/onboarding-actions.ts")]: resolve(
              "tests/fixtures/onboarding-actions-browser-mock.ts",
            ),
            "@/app/dashboard/matches/(detail)/[matchId]/viz-bands-actions":
              resolve("tests/fixtures/viz-fullscreen-actions-browser-mock.ts"),
            "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions":
              resolve("tests/fixtures/viz-fullscreen-actions-browser-mock.ts"),
            "@/components/dashboard/matches/match-actions/edit-match-dialog":
              mocks,
            "@/components/dashboard/matches/match-actions/delete-match-dialog":
              mocks,
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
    const path = (request.url ?? "/").split("?")[0];
    requests.push(path);
    if (path === SAMPLE_ENDPOINT) {
      response.statusCode = 503;
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({
          error: "The video store is unavailable right now.",
          code: "storage_unavailable",
        }),
      );
      return;
    }
    if (path.startsWith("/api/")) {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (path === "/bundle.js") {
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.end(bundle);
      return;
    }
    if (path.endsWith(".js")) {
      const chunk = join(outputPath, path.slice(1));
      if (existsSync(chunk)) {
        response.setHeader("content-type", "text/javascript; charset=utf-8");
        response.end(readFileSync(chunk));
        return;
      }
      response.statusCode = 404;
      response.end();
      return;
    }
    if (path === "/style.css") {
      response.setHeader("content-type", "text/css; charset=utf-8");
      response.end(stylesheet);
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
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

/**
 * Opens the harness and returns every uncaught page error from then on. A
 * module that throws at load, or a render that throws, must fail a case
 * rather than leave a half-drawn report that still happens to satisfy it.
 */
async function open(page: Page, query = ""): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
  return errors;
}

const tab = (page: Page, name: "Statistics" | "Visualizations" | "Video") =>
  page.getByRole("tab", { name });

async function selectView(
  page: Page,
  name: "Statistics" | "Visualizations" | "Video",
) {
  await tab(page, name).click();
  await expect(tab(page, name)).toHaveAttribute("aria-selected", "true");
}

/** Every request the page itself attempted under `/api/matches/`. */
function watchMatchesApi(page: Page): string[] {
  const hits: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/matches/")) hits.push(url.pathname);
  });
  return hits;
}

/** Forbidden on the sample: anything that acts on or hands out the match. */
const FORBIDDEN_CONTROL = /\b(delete|share|compare|review score)\b/i;

async function expectNoWriters(page: Page) {
  await expect(
    page.getByRole("button", { name: FORBIDDEN_CONTROL }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: FORBIDDEN_CONTROL }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: FORBIDDEN_CONTROL })).toHaveCount(
    0,
  );
  await expect(page.getByText(/review score|delete match/i)).toHaveCount(0);
}

test("every tour target is present once the views have been visited", async ({
  page,
}) => {
  const hits = watchMatchesApi(page);
  const errors = await open(page);

  // Statistics first: the rail's two targets and the body's two.
  for (const target of [
    "scoreboard",
    "insight",
    "head-to-head",
    "shots",
    "film",
  ])
    await expect(page.locator(`[data-tour="${target}"]`)).toHaveCount(1);

  await selectView(page, "Visualizations");
  await expect(page.locator('[data-tour="shots"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await selectView(page, "Video");
  await expect(page.locator('[data-tour="film"]')).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await selectView(page, "Statistics");

  for (const target of TOUR_TARGETS)
    await expect(page.locator(`[data-tour="${target}"]`)).toHaveCount(1);
  expect(TOUR_TARGETS).toHaveLength(5);
  expect(hits).toEqual([]);
  expect(errors).toEqual([]);
});

test("?tour=1 opens the sample tour on the scoreboard, five steps long", async ({
  page,
}) => {
  await open(page, "?tour=1");
  const first = page.getByRole("dialog", { name: "Scoreboard" });
  await expect(first).toBeVisible();
  await expect(first).toContainText("1 of 5");
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => window.__markTourDoneCalls)).toEqual([
    "sample",
  ]);
});

test("the banner stays in view at the bottom of the pane", async ({ page }) => {
  await open(page);
  const banner = page.getByText("Sample match · Not your data");
  await expect(banner).toBeInViewport();

  const pane = page.locator("#match-report-pane");
  const scrolled = await pane.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return element.scrollTop;
  });
  // The Statistics view really overflows a 720px viewport.
  expect(scrolled).toBeGreaterThan(0);
  await expect(banner).toBeInViewport();
  await expect(
    page.getByRole("link", { name: "Send your own match" }),
  ).toBeInViewport();
});

test("no Delete, Share, Compare or Review-score control on any view, and nothing asks /api/matches", async ({
  page,
}) => {
  const hits = watchMatchesApi(page);
  const before = requests.length;
  const errors = await open(page);
  await expectNoWriters(page);

  await selectView(page, "Visualizations");
  await expectNoWriters(page);

  await selectView(page, "Video");
  // The credential renewal goes to the sample route and nowhere else.
  await expect
    .poll(() => requests.slice(before).filter((p) => p === SAMPLE_ENDPOINT))
    .not.toEqual([]);
  // A refused store lands on the film's unavailable state — the shape a
  // deployment without the clip shows — with no video-management offer.
  await expect(
    page.getByRole("button", { name: "Try again" }).first(),
  ).toBeVisible();
  await expectNoWriters(page);

  await selectView(page, "Statistics");
  expect(hits).toEqual([]);
  expect(
    requests.slice(before).filter((path) => path.startsWith("/api/matches")),
  ).toEqual([]);
  expect(errors).toEqual([]);
});
