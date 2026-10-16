import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The Ask answer's points line (`ask-point-list.tsx`), rendered in a real
 * browser — `tests/fixtures/ask-point-list-harness.tsx` bundled with webpack
 * and served from a throwaway port, the harness pattern of
 * `ask-answer-view.spec.ts`. One link into the film on every point, words
 * that say whose points they are, and the stretch and running time in grey;
 * no row per point.
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

const line = (page: Page) => page.locator("[data-ask-point-list]");
const watch = (page: Page) => page.locator("[data-ask-point-list-watch]");
const meta = (page: Page) => page.locator("[data-ask-point-list-meta]");

test("one line: a link into the film on every point, the stretch and time beside it", async ({
  page,
}) => {
  await openFixture(page, "?case=page");

  // No cut: the whole match, and the words say so.
  await expect(watch(page)).toHaveText("Watch all 3 points");
  await expect(watch(page)).toHaveAttribute(
    "href",
    "/dashboard/matches/match-sep-28?tab=film&pn=3%2C7%2C40",
  );
  await expect(watch(page)).toHaveAttribute(
    "aria-label",
    "Watch all 3 points in this match",
  );
  // Across two sets; 3s + 9s of timed film, the untimed point adds nothing.
  await expect(meta(page)).toHaveText("Sets 1–2 · Under a minute");

  // A link, not a list: no row per point, and the one link is the line's.
  await expect(page.locator("[data-ask-point]")).toHaveCount(0);
  await expect(line(page).getByRole("link")).toHaveCount(1);
});

test("a counted cut is the answer's points, and a capped one says it is the first of more", async ({
  page,
}) => {
  await openFixture(page, "?case=page&f=sp.y_st.2&truncated=1&counted=1");
  await expect(watch(page)).toHaveText("Watch the 3 points");
  await expect(watch(page)).toHaveAttribute(
    "aria-label",
    "Watch the 3 points behind this answer",
  );
  await expect(meta(page)).toHaveText("Sets 1–2 · Under a minute · First 3");
  await expect(line(page)).toHaveAttribute(
    "aria-label",
    "Points behind this answer",
  );
});

test("a cut broader than the figure (every serve for an ace count): the match's points, not the answer's", async ({
  page,
}) => {
  await openFixture(page, "?case=page&f=sv.y");
  await expect(watch(page)).toHaveText("Watch 3 points in this match");
  await expect(watch(page)).toHaveAttribute(
    "aria-label",
    "Watch 3 points in this match",
  );
});

test('no cut and a capped list: the match\'s points, never "all"', async ({
  page,
}) => {
  await openFixture(page, "?case=page&truncated=1");
  await expect(watch(page)).toHaveText("Watch 3 points in this match");
  await expect(meta(page)).toContainText("First 3");
});
