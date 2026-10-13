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
 * T22: `HintRunner` in a real browser over a fake shell
 * (`tests/fixtures/hint-runner-harness.tsx`), with `markTourDone` aliased to
 * a recording mock:
 *
 *   1. The hint opens anchored to its `data-tour` element, one card with no
 *      step bar and no counter, and stays open over its own `role="dialog"`.
 *   2. Done stamps the hint once and sets the guard; a remount and a reload
 *      do not reopen it.
 *   3. While another `role="dialog"` is in the document the hint waits, and
 *      opens once that dialog is gone.
 *   4. `when={false}` renders nothing.
 */

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "hint-runner-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/hint-runner-harness.tsx"),
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
            // The server action, replaced by a recorder.
            [resolve("src/app/dashboard/onboarding-actions.ts")]: resolve(
              "tests/fixtures/onboarding-actions-browser-mock.ts",
            ),
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

async function open(page: Page, query = "") {
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

/** A few frames: long enough for the runner to have opened if it were going to. */
async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => done())),
        ),
      ),
  );
}

const calls = (page: Page) => page.evaluate(() => window.__markTourDoneCalls);

test("the hint opens anchored to its data-tour element, with no step bar, and stays open", async ({
  page,
}) => {
  await open(page);

  const hint = page.getByRole("dialog", {
    name: "You're in Stanford Women's Tennis now.",
  });
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Switch back to your own matches here.");
  await expect(hint.locator("[data-step-segment]")).toHaveCount(0);
  await expect(hint).not.toContainText("1 of 1");
  await expect(hint.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(hint.getByRole("button", { name: "Back" })).toHaveCount(0);

  // Anchored: opens to the right of the switcher, beside it vertically.
  const anchor = await page
    .locator('[data-tour="workspace-switcher"]')
    .boundingBox();
  const box = await hint.boundingBox();
  expect(anchor && box).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(anchor!.x + anchor!.width);
  expect(box!.x).toBeLessThan(anchor!.x + anchor!.width + 40);
  expect(Math.abs(box!.y - anchor!.y)).toBeLessThan(40);

  // Its own popover is a `role="dialog"`; the quiet-moment wait gates opening
  // only, so the hint does not close itself over it.
  await settle(page);
  await settle(page);
  await expect(hint).toBeVisible();
  expect(await calls(page)).toEqual([]);
});

test("the tray hint opens below its anchor with its own copy", async ({
  page,
}) => {
  await open(page, "?hint=activity-tray");
  const hint = page.getByRole("dialog", { name: "Your upload keeps going." });
  await expect(hint).toContainText("Track it here.");
  const anchor = await page
    .locator('[data-tour="activity-tray"]')
    .boundingBox();
  const box = await hint.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(anchor!.y + anchor!.height);
});

test("Done stamps the hint once, and neither a remount nor a reload reopens it", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual(["workspace-switcher"]);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tour-done:workspace-switcher:viewer-1"),
    ),
  ).toBe("1");

  await page.getByRole("button", { name: "Remount runner" }).click();
  await settle(page);
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual(["workspace-switcher"]);

  await open(page);
  await settle(page);
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual([]);
});

test("Skip closes the hint and sets the guard", async ({ page }) => {
  await open(page, "?hint=activity-tray");
  await expect(
    page.getByRole("dialog", { name: "Your upload keeps going." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual(["activity-tray"]);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tour-done:activity-tray:viewer-1"),
    ),
  ).toBe("1");
});

test("opening the tray answers its hint: the box closes and is stamped once", async ({
  page,
}) => {
  await open(page, "?hint=activity-tray");
  await expect(
    page.getByRole("dialog", { name: "Your upload keeps going." }),
  ).toBeVisible();
  // The scrim takes no clicks, so the tray's own trigger is reachable.
  await page.locator('[data-tour="activity-tray"]').click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual(["activity-tray"]);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tour-done:activity-tray:viewer-1"),
    ),
  ).toBe("1");
});

test("the hint waits while another dialog is open, and opens once it closes", async ({
  page,
}) => {
  await open(page, "?dialog=1");
  await expect(page.getByRole("dialog", { name: "Welcome" })).toBeVisible();
  await settle(page);
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(1);

  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(
    page.getByRole("dialog", {
      name: "You're in Stanford Women's Tennis now.",
    }),
  ).toBeVisible();
});

test("when={false} renders nothing", async ({ page }) => {
  await open(page, "?when=0");
  await settle(page);
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-tour-spotlight]")).toHaveCount(0);
  expect(await calls(page)).toEqual([]);
});
