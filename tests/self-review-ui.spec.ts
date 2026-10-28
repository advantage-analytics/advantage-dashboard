import { expect, test } from "@playwright/test";
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

let server: Server;
let origin: string;

/**
 * Fix points (Advantage Review step 2) on the real point list, offline:
 * `self-review-harness.tsx` mounts `PointList` and `FixModeNotice` under a
 * self-review context. In the mode, the flagged point leads in its own group,
 * every row trades its bookmark for Fix, the inline form changes who won and
 * how the point ended, and a saved fix shows the original struck through.
 */
test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "self-review-ui-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/self-review-harness.tsx"),
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

const SHOTS = process.env.SELF_REVIEW_SHOTS;

async function open(page: import("@playwright/test").Page, query = "") {
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

test("fixing: the flagged point leads, rows offer Fix, not a bookmark", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByText("Fixing points.")).toBeVisible();
  await expect(page.getByText("Worth a look")).toBeVisible();
  const flagged = page.locator('[data-point-id="flagged"]');
  await expect(flagged).toContainText("Was that ball in?");
  await expect(page.locator('[data-point-id="flagged"]')).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Bookmark this point" }),
  ).toHaveCount(0);
  await expect(flagged.getByRole("button", { name: "Fix" })).toHaveCount(1);
  const edited = page.locator('[data-point-id="edited"]');
  await expect(edited).toContainText("Edited by you");
  await expect(edited.getByRole("button", { name: "Edit fix" })).toHaveCount(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/fix-mode.png` });
});

test("the form fixes a point into a draft, and Undo fix drops it", async ({
  page,
}) => {
  await open(page);
  const row = page.locator('[data-point-id="plain"]');
  await row.hover();
  await row.getByRole("button", { name: "Fix" }).click();
  const form = page.getByRole("group", { name: "Fix point 1" });
  await expect(form).toBeVisible();
  await form.getByRole("button", { name: "Jordan Alvarez" }).click();
  await form.getByRole("button", { name: "Forced error", exact: true }).click();
  await expect(form).toContainText("This changes who won the point.");
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/fix-form.png` });
  await form.getByRole("button", { name: "Done" }).click();
  await expect(row).toContainText("Fixed, not saved");
  await expect(page.getByText("1 point fixed · Not saved yet")).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/fix-drafted.png` });

  await row.hover();
  await row.getByRole("button", { name: "Edit fix" }).click();
  await page.getByRole("button", { name: "Undo fix" }).click();
  await expect(row).not.toContainText("Fixed, not saved");
  await expect(page.getByText("Nothing changed yet")).toBeVisible();
});

test("an ace goes to the server by itself", async ({ page }) => {
  await open(page);
  const row = page.locator('[data-point-id="flagged"]');
  await row.hover();
  await row.getByRole("button", { name: "Fix" }).click();
  const form = page.getByRole("group", { name: "Fix point 2" });
  await form.getByRole("button", { name: "Ace" }).click();
  // Marcus Reid (player 1) served; the point was Jordan's.
  await expect(
    form.getByRole("button", { name: "Marcus Reid" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByRole("group", { name: "Last shot" })).toHaveCount(0);
});

test("a saved fix offers Reset back to the original", async ({ page }) => {
  await open(page);
  const row = page.locator('[data-point-id="edited"]');
  await row.hover();
  await row.getByRole("button", { name: "Edit fix" }).click();
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByText("1 point fixed · Not saved yet")).toBeVisible();
});

test("outside the mode: no Fix, the saved edit still marked", async ({
  page,
}) => {
  await open(page, "?mode=view");
  await expect(page.getByText("Fixing points.")).toHaveCount(0);
  await expect(page.getByText("Worth a look")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Fix" })).toHaveCount(0);
  const edited = page.locator('[data-point-id="edited"]');
  await expect(edited).toContainText("Edited by you");
  await expect(edited.locator(".line-through")).toHaveCount(1);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/view-mode.png` });
});
