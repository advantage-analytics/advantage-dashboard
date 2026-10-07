import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

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
 * T4: `TourPopover`'s keyboard and focus contract, in a real browser — the
 * half no unit test can answer, because it is Radix's focus scope and
 * dismissable layer meeting the DOM:
 *
 *   1. Opening moves focus INTO the box, onto Next.
 *   2. Enter on Next advances the counter; the last step reads Done.
 *   3. Escape closes through `onSkip`, not some other path.
 *   4. On close, focus returns to what held it when the tour opened — here
 *      the anchor, which is outside React's tree, as the runner's will be.
 */

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "tour-popover-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/tour-popover-harness.tsx"),
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
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
});

async function openTour(page: Page) {
  await page.goto(origin);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
  const start = page.getByRole("button", { name: "Start tour" });
  await start.focus();
  await page.keyboard.press("Enter");
  const tour = page.getByRole("dialog", { name: "Add a match" });
  await expect(tour).toBeVisible();
  return { start, tour };
}

test("Enter on Next advances the counter, and the last step reads Done", async ({
  page,
}) => {
  const { tour } = await openTour(page);
  await expect(tour).toContainText("1 of 3");

  const next = page.getByRole("button", { name: "Next" });
  await expect(next).toBeFocused();

  await page.keyboard.press("Enter");
  const second = page.getByRole("dialog", { name: "Every match" });
  await expect(second).toContainText("2 of 3");
  await expect(next).toBeFocused();

  await page.keyboard.press("Enter");
  const third = page.getByRole("dialog", { name: "Make it yours" });
  await expect(third).toContainText("3 of 3");
  await expect(page.getByRole("button", { name: "Done" })).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-skipped", "0");
});

test("Escape closes through onSkip and focus returns to the anchor", async ({
  page,
}) => {
  const { start } = await openTour(page);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Every match" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-skipped", "1");
  await expect(start).toBeFocused();
});

test("Skip tour closes through onSkip and focus returns to the anchor", async ({
  page,
}) => {
  const { start } = await openTour(page);
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-skipped", "1");
  await expect(start).toBeFocused();
});
