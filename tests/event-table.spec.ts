import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The event-page table kit (`schedule/event-table.tsx`) and its selection
 * model (`schedule/use-row-selection.ts`), on the three-row harness in
 * `fixtures/event-table-harness.tsx`: row click, re-click, Esc, arrows, the
 * `?line=` mirror, the drawer counter, and a pill cut that drops the
 * selected row.
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
  const outputPath = mkdtempSync(join(tmpdir(), "event-table-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/event-table-harness.tsx"),
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
            "@/components/dashboard/matches/match-actions/match-actions-menu":
              resolve("tests/fixtures/match-drawer-deps-browser-mock.tsx"),
            "next/image": resolve(
              "tests/fixtures/match-drawer-deps-browser-mock.tsx",
            ),
            "@/lib/supabase/client": resolve(
              "tests/fixtures/supabase-client-browser-mock.ts",
            ),
            "next/navigation": resolve(
              "tests/fixtures/next-navigation-browser-mock.ts",
            ),
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
            "@": resolve("src"),
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

async function open(page: import("@playwright/test").Page, path = "") {
  await page.goto(`${origin}/${path}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

function row(page: Page, id: string) {
  return page.getByRole("row", { name: id, exact: true });
}

function lineParam(page: Page) {
  return page.evaluate(() => new URLSearchParams(location.search).get("line"));
}

test("a row click selects, mirrors ?line= and opens the counted drawer", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await row(page, "b").click();
  await expect(row(page, "b")).toHaveAttribute("aria-current", "true");
  await expect(row(page, "a")).not.toHaveAttribute("aria-current", /.*/);
  expect(await page.evaluate(() => location.search)).toBe("?line=b");

  const dialog = page.getByRole("dialog", { name: "Line S2" });
  await expect(dialog).toBeVisible();
  const counter = dialog.getByText("2 / 3", { exact: true }).locator("..");
  await expect(counter).toHaveText(/^Line\s*2 \/ 3$/);

  // ArrowDown steps to the next visible row.
  await page.keyboard.press("ArrowDown");
  await expect(row(page, "c")).toHaveAttribute("aria-current", "true");
  await expect(row(page, "b")).not.toHaveAttribute("aria-current", /.*/);
  expect(await lineParam(page)).toBe("c");
  await expect(page.getByRole("dialog", { name: "Line D1" })).toBeVisible();

  // Clicking the selected row again closes the drawer and clears the param.
  await row(page, "c").click();
  await expect(row(page, "c")).not.toHaveAttribute("aria-current", /.*/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await lineParam(page)).toBeNull();
});

test("Escape closes an open drawer", async ({ page }) => {
  await open(page);
  await row(page, "a").click();
  await expect(page.getByRole("dialog", { name: "Line S1" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(row(page, "a")).not.toHaveAttribute("aria-current", /.*/);
  expect(await lineParam(page)).toBeNull();
});

test("?line= lands open when it names a row", async ({ page }) => {
  await open(page, "?line=c");
  await expect(row(page, "c")).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("dialog", { name: "Line D1" })).toBeVisible();
});

test("a pill that hides the selected row closes the drawer", async ({
  page,
}) => {
  await open(page);
  await row(page, "b").click();
  await expect(page.getByRole("dialog", { name: "Line S2" })).toBeVisible();

  await page.getByRole("button", { name: "Doubles", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await lineParam(page)).toBeNull();
  await expect(row(page, "c")).toBeVisible();
  await expect(row(page, "a")).toHaveCount(0);
  await expect(row(page, "b")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Doubles", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
