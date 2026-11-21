import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The Match step's score card survives a page translator. Chrome's
 * translation wraps every text node React rendered in a `<font>` of its own,
 * so when the card's "Type in the dashed column to add a set" clause goes —
 * the score that decides the match, or a shorter format — React removes a
 * text node that is no longer its parent's child and `removeChild` throws
 * NotFoundError. That took the whole wizard down mid-save for a zh-CN Google
 * Translate user: PostHog issues 01a1fd9f-347e-7b81-a723-62107c618541 and
 * 01a1fd9f-347f-7822-8776-974f6bc97933 on /dashboard/matches/new. Each
 * optional clause is now one element, which React can remove whatever
 * happened to the text inside it. Prior art: tests/drop-zone-translation.spec.ts.
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
  const outputPath = mkdtempSync(join(tmpdir(), "score-block-translation-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/score-block-translation-harness.tsx"),
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
  server.closeAllConnections?.();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
});

/** What a page translator does: every text node becomes a `<font>` of its own. */
async function translate(page: Page) {
  await page.evaluate(() => {
    const root = document.getElementById("root")!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const texts: Text[] = [];
    while (walker.nextNode()) texts.push(walker.currentNode as Text);
    for (const text of texts) {
      if (!text.nodeValue?.trim()) continue;
      const font = document.createElement("font");
      font.textContent = text.nodeValue;
      text.replaceWith(font);
    }
  });
}

const reactErrors = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { reactErrors: string[] }).reactErrors,
  );

const nextFrame = (page: Page) =>
  page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => done(null))),
  );

async function open(page: Page) {
  await page.goto(origin, { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
  await expect(page.getByText(/column to add a set/)).toBeVisible();
}

test("a deciding score after a translation drops the hint and throws nothing", async ({
  page,
}) => {
  await open(page);
  await translate(page);
  await page.evaluate(() =>
    (
      window as unknown as {
        setGames: (p: (number | null)[], o: (number | null)[]) => void;
      }
    ).setGames([6, 6, null], [4, 4, null]),
  );
  await nextFrame(page);

  expect(await reactErrors(page)).toEqual([]);
  await expect(page.getByText(/column to add a set/)).toHaveCount(0);
});

test("switching to Best of 1 after a translation drops the hint and throws nothing", async ({
  page,
}) => {
  await open(page);
  await translate(page);
  await page.evaluate(() =>
    (window as unknown as { setBestOf: (b: string) => void }).setBestOf("1"),
  );
  await nextFrame(page);

  expect(await reactErrors(page)).toEqual([]);
  await expect(page.getByText(/column to add a set/)).toHaveCount(0);
});
