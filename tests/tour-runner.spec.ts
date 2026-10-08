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
 * T9: `TourRunner` in a real browser, over a fake report under the real
 * `MatchReportProvider` (`tests/fixtures/tour-runner-harness.tsx`), with
 * `markTourDone` aliased to a recording mock:
 *
 *   1. Next, Next, Done walks three present targets and stamps the tour once.
 *   2. An absent middle target drops its step — "1 of 2" then "2 of 2" — and
 *      Skip closes the tour even when the action rejects.
 *   3. Remounting the runner after Done, and reloading the page, do not
 *      reopen the tour: the `sessionStorage` guard holds.
 *   4. A step with a `tab` switches the view first and anchors once the
 *      target is in the document.
 *   5. Opened on Film (`?tab=film`), the Statistics steps are kept — their
 *      targets are out of view, not absent — and resolved after their step
 *      switches back to Statistics.
 *   6. A kept step whose target never appears after the switch is skipped,
 *      and the counter shrinks by one.
 *   7. The guard is the viewer's: `?tour=1` (`requested`) opens despite it,
 *      and another viewer id is not blocked by it.
 */

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "tour-runner-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/tour-runner-harness.tsx"),
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
            // The provider reads the view from the address bar; the mock
            // answers from `window.location`, which `pushState` keeps real.
            "next/navigation": resolve(
              "tests/fixtures/next-navigation-browser-mock.ts",
            ),
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

/** Two frames: the runner opens on one and anchors on the next. */
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

test("Next, Next, Done walks three steps and stamps the tour once", async ({
  page,
}) => {
  await open(page);

  const first = page.getByRole("dialog", { name: "Scoreboard" });
  await expect(first).toBeVisible();
  await expect(first).toContainText("1 of 3");

  await page.getByRole("button", { name: "Next" }).click();
  const second = page.getByRole("dialog", { name: "Match summary" });
  await expect(second).toContainText("2 of 3");

  await page.getByRole("button", { name: "Next" }).click();
  const third = page.getByRole("dialog", { name: "Head-to-head" });
  await expect(third).toContainText("3 of 3");

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual(["sample"]);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tour-done:sample:viewer-1"),
    ),
  ).toBe("1");

  // Remounting with `start` still true does not reopen it…
  await page.getByRole("button", { name: "Remount runner" }).click();
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // …and neither does the next visit in this session.
  await open(page);
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual([]);
});

test("an absent middle target drops its step, and Skip closes through a failing action", async ({
  page,
}) => {
  await open(page, "?targets=scoreboard,head-to-head&reject=1");

  const first = page.getByRole("dialog", { name: "Scoreboard" });
  await expect(first).toContainText("1 of 2");

  await page.getByRole("button", { name: "Next" }).click();
  const second = page.getByRole("dialog", { name: "Head-to-head" });
  await expect(second).toContainText("2 of 2");

  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual(["sample"]);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tour-done:sample:viewer-1"),
    ),
  ).toBe("1");
});

test("a step with a tab switches the view before anchoring", async ({
  page,
}) => {
  await open(page, "?targets=scoreboard&tabs=1");

  await expect(page.getByRole("dialog", { name: "Scoreboard" })).toContainText(
    "1 of 3",
  );
  expect(new URL(page.url()).searchParams.get("tab")).toBeNull();

  await page.getByRole("button", { name: "Next" }).click();
  const shots = page.getByRole("dialog", { name: "Serve placement" });
  await expect(shots).toContainText("2 of 3");
  expect(new URL(page.url()).searchParams.get("tab")).toBe("shots");
  await expect(page.locator('[data-view="shots"]')).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  const film = page.getByRole("dialog", { name: "Film" });
  await expect(film).toContainText("3 of 3");
  expect(new URL(page.url()).searchParams.get("tab")).toBe("film");
  await expect(page.locator('[data-view="film"]')).toBeVisible();

  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual(["sample"]);
});

test("opened on Film, the Statistics steps are kept and resolved after the switch back", async ({
  page,
}) => {
  // The viewer's "Match report opens at" preference, or a `?tab=film` link:
  // the insight and head-to-head sections are not in the document at open.
  await open(page, "?tabs=1&tab=film");
  await expect(page.locator('[data-view="film"]')).toBeVisible();
  await expect(page.locator('[data-tour="insight"]')).toHaveCount(0);

  const first = page.getByRole("dialog", { name: "Scoreboard" });
  await expect(first).toContainText("1 of 5");
  // The scoreboard is in the rail: no view switch for it.
  expect(new URL(page.url()).searchParams.get("tab")).toBe("film");

  await page.getByRole("button", { name: "Next" }).click();
  const second = page.getByRole("dialog", { name: "Match summary" });
  await expect(second).toContainText("2 of 5");
  // Statistics is the default view, so selecting it clears `tab`.
  expect(new URL(page.url()).searchParams.get("tab")).toBeNull();
  await expect(page.locator('[data-tour="insight"]')).toBeVisible();

  await page.getByRole("button", { name: "Next" }).click();
  await expect(
    page.getByRole("dialog", { name: "Head-to-head" }),
  ).toContainText("3 of 5");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(
    page.getByRole("dialog", { name: "Serve placement" }),
  ).toContainText("4 of 5");
  expect(new URL(page.url()).searchParams.get("tab")).toBe("shots");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "Film" })).toContainText(
    "5 of 5",
  );
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual(["sample"]);
});

test("a kept step whose target never appears is skipped, and the counter shrinks", async ({
  page,
}) => {
  // Opened on Film with a report that renders no insight and no head-to-head:
  // at open the two are only out of view, so they are kept ("1 of 5"); once
  // their step has switched to Statistics and waited, each is dropped in turn
  // and the count tells the truth from then on.
  await open(page, "?tabs=1&tab=film&targets=scoreboard");
  await expect(page.getByRole("dialog", { name: "Scoreboard" })).toContainText(
    "1 of 5",
  );

  await page.getByRole("button", { name: "Next" }).click();
  const shots = page.getByRole("dialog", { name: "Serve placement" });
  await expect(shots).toContainText("2 of 3", { timeout: 10_000 });
  expect(new URL(page.url()).searchParams.get("tab")).toBe("shots");

  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "Film" })).toContainText(
    "3 of 3",
  );
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await calls(page)).toEqual(["sample"]);
});

test("the this-session guard is the viewer's, and an explicit request bypasses it", async ({
  page,
}) => {
  await open(page);
  await expect(page.getByRole("dialog", { name: "Scoreboard" })).toBeVisible();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tour-done:sample:viewer-1"),
    ),
  ).toBe("1");

  // The same viewer, back on the page: still guarded…
  await open(page);
  await settle(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // …unless they asked for it by URL (`?tour=1` → `requested`).
  await open(page, "?requested=1");
  await expect(page.getByRole("dialog", { name: "Scoreboard" })).toBeVisible();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // Another viewer in the same tab is not blocked by the first one's guard.
  await open(page, "?viewer=viewer-2");
  await expect(page.getByRole("dialog", { name: "Scoreboard" })).toBeVisible();
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tour-done:sample:viewer-2"),
    ),
  ).toBeNull();
  await page.getByRole("button", { name: "Skip tour" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      sessionStorage.getItem("tour-done:sample:viewer-2"),
    ),
  ).toBe("1");
});
