import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The upload drop zones survive a page translator. Safari's and Chrome's
 * translation swap the text nodes React rendered for their own (Chrome wraps
 * them in `<font>`), so when the zone flips to "Checking the video…" React
 * goes to remove a text node that is no longer there and `removeChild`
 * throws NotFoundError — PostHog issues 01a173c3-72f3-7de0-8b19-19ca90ffdc4d
 * and 01a173c3-72f4-7ab2-8799-6023704b891c on /dashboard/matches/new.
 * Each branch of the label is now its own element, which React can remove
 * whatever happened to the text inside it.
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
  const outputPath = mkdtempSync(join(tmpdir(), "drop-zone-translation-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/drop-zone-translation-harness.tsx"),
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
      font.textContent = text.nodeValue.toUpperCase();
      text.replaceWith(font);
    }
  });
}

const reactErrors = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { reactErrors: string[] }).reactErrors,
  );

for (const zone of ["wizard", "attachment"] as const) {
  test(`${zone} drop zone: flipping to busy after a translation throws nothing`, async ({
    page,
  }) => {
    await page.goto(`${origin}/?zone=${zone}`, {
      waitUntil: "domcontentloaded",
    });
    await expect
      .poll(() => page.locator("html").getAttribute("data-hydrated"))
      .toBe("true");
    await expect(page.getByText("browse", { exact: true })).toBeVisible();

    await translate(page);
    await page.evaluate(() =>
      (window as unknown as { setBusy: (b: boolean) => void }).setBusy(true),
    );
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => done(null))),
    );
    expect(await reactErrors(page)).toEqual([]);
    await expect(
      page.getByText(/Checking the video…|Reading the export…/),
    ).toBeVisible();
    await page.evaluate(() =>
      (window as unknown as { setBusy: (b: boolean) => void }).setBusy(false),
    );
    await expect(page.getByText("browse", { exact: true })).toBeVisible();

    expect(await reactErrors(page)).toEqual([]);
  });
}
