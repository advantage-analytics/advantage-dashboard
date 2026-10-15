import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The Ask answer's point list (`ask-point-list.tsx`), rendered in a real
 * browser — `tests/fixtures/ask-point-list-harness.tsx` bundled with webpack
 * and served from a throwaway port, the harness pattern of
 * `ask-answer-view.spec.ts`. The rows are links (a position, an href), the
 * mark is the point's winner, an untimed point is drawn and not linked, and
 * inside the film room's drawer a row seeks instead of navigating.
 */

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

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "ask-point-list-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/ask-point-list-harness.tsx"),
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
          },
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

async function openFixture(page: Page, query = "") {
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

const list = (page: Page) => page.locator("[data-ask-point-list]");
const row = (page: Page, n: number) => page.locator(`[data-ask-point="${n}"]`);

test("a row per point under its game, linked into the film on that point", async ({
  page,
}) => {
  await openFixture(page, "?case=page");

  await expect(list(page).getByRole("heading")).toHaveText(
    "3 points in this match",
  );
  await expect(
    list(page).getByRole("link", { name: "Watch all" }),
  ).toHaveAttribute(
    "href",
    "/dashboard/matches/match-sep-28?tab=film&pn=3%2C7%2C40",
  );
  // Grouped by set and game, the game score beside the header.
  await expect(list(page).locator("text=Set 1 · Game 1")).toBeVisible();
  await expect(list(page).locator("text=Set 1 · Game 2")).toBeVisible();
  await expect(list(page).locator("text=Set 2 · Game 3")).toBeVisible();

  const ace = row(page, 3);
  await expect(ace).toHaveAttribute(
    "href",
    "/dashboard/matches/match-sep-28?tab=film&pn=3",
  );
  await expect(ace).toContainText("Ace");
  await expect(ace).toContainText("Point 3 · You served");
  await expect(ace).toContainText("30-15");
  await expect(ace.locator("[data-mark]")).toHaveAttribute("data-mark", "you");

  const error = row(page, 7);
  await expect(error).toContainText("Lindqvist served");
  await expect(error.locator("[data-mark]")).toHaveAttribute(
    "data-mark",
    "opp",
  );

  // The untimed point reads but is no link, and is drawn muted.
  const untimed = row(page, 40);
  await expect(untimed).toHaveAttribute("data-seekable", "false");
  await expect(untimed).not.toHaveAttribute("href", /.*/);
  await expect(untimed).toContainText("Forehand Winner");
});

test("the measure's cut rides every row's link, and the team's player serves", async ({
  page,
}) => {
  await openFixture(page, "?case=page&scope=team&f=sp.y_st.2&truncated=1");
  await expect(row(page, 3)).toHaveAttribute(
    "href",
    "/dashboard/matches/match-sep-28?tab=film&f=sp.y_st.2&pn=3",
  );
  await expect(row(page, 3)).toContainText("Sokolov served");
  await expect(page.locator("[data-ask-point-list-truncated]")).toHaveText(
    "Showing the first 3 points.",
  );
});

test("inside the film room's drawer a row seeks the player and never navigates", async ({
  page,
}) => {
  await openFixture(page, "?case=seek");
  // No "Watch all": the film is already on screen.
  await expect(list(page).getByRole("link", { name: "Watch all" })).toHaveCount(
    0,
  );

  await row(page, 7).click();
  const watched = await page.evaluate(
    () => (window as unknown as { __askWatched?: unknown[] }).__askWatched,
  );
  expect(watched).toEqual([{ kind: "point", pointNumber: 7 }]);
  expect(new URL(page.url()).search).toBe("?case=seek");
});
