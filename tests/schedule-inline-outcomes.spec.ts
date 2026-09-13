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

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "schedule-inline-outcomes-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/schedule-inline-outcomes-harness.tsx"),
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
            "@/lib/schedule/actions": resolve(
              "tests/fixtures/schedule-actions-browser-mock.ts",
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

async function openResult(page: import("@playwright/test").Page, url = "") {
  await page.goto(`${origin}/${url}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
  await page.getByRole("button", { name: /Add result|Edit result/ }).click();
}

async function choose(page: import("@playwright/test").Page, label: string) {
  await page.getByRole("button", { name: "Result type" }).click();
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
}

test("every non-played result submits from either side without score or analysis", async ({
  page,
}) => {
  const cases = [
    ["We won — opponent forfeited", "forfeit", "theirs"],
    ["We lost — our side forfeited", "forfeit", "ours"],
    ["We won — opponent defaulted", "default", "theirs"],
    ["We lost — our side defaulted", "default", "ours"],
    ["We won — opponent withdrew", "withdrawal", "theirs"],
    ["We lost — our side withdrew", "withdrawal", "ours"],
  ] as const;

  for (const [label, kind, side] of cases) {
    await openResult(page);
    await choose(page, label);
    await expect(page.getByLabel("Our games, set 1")).toHaveCount(0);
    await page.getByRole("button", { name: "Save result" }).click();
    await expect
      .poll(() => page.evaluate(() => window.actionCalls))
      .toEqual([
        {
          action: "setOutcome",
          input: {
            entryId: "entry-browser",
            round: null,
            outcome: { kind, side },
          },
        },
      ]);
    expect(
      await page.evaluate(() => window.actionCalls.map((call) => call.action)),
    ).not.toContain("processing_jobs");
  }
});

test("a saved tournament outcome clears at its round, then preserves a refused score draft", async ({
  page,
}) => {
  await openResult(page, "?round=QF&saved=true");
  await choose(page, "Clear saved outcome");
  await page.getByRole("button", { name: "Clear outcome" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls))
    .toEqual([
      {
        action: "setOutcome",
        input: { entryId: "entry-browser", round: "QF", outcome: null },
      },
    ]);

  await page.getByLabel("Our games, set 1").fill("6");
  await page.getByLabel("Opponent games, set 1").fill("4");
  await page.evaluate(() => {
    window.failNextScore =
      "Another coach saved this round. Refresh and review it.";
  });
  await page.getByRole("button", { name: "Save result" }).click();
  await expect(
    page.getByText("Another coach saved this round. Refresh and review it."),
  ).toBeVisible();
  await expect(page.getByLabel("Our games, set 1")).toHaveValue("6");
  await expect(page.getByLabel("Opponent games, set 1")).toHaveValue("4");

  await page.getByRole("button", { name: "Save result" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
    .toEqual({
      action: "recordResult",
      input: expect.objectContaining({
        entryId: "entry-browser",
        round: "QF",
        ourGames: [6],
        theirGames: [4],
      }),
    });
  expect(
    await page.evaluate(() => window.actionCalls.map((call) => call.action)),
  ).toEqual(["setOutcome", "recordResult", "recordResult"]);
});

test("a legacy forfeit is explicitly clearable through the shared outcome action", async ({
  page,
}) => {
  await openResult(page, "?legacy=true");
  await choose(page, "Clear saved outcome");
  await page.getByRole("button", { name: "Clear outcome" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls))
    .toEqual([
      {
        action: "setOutcome",
        input: { entryId: "entry-browser", round: null, outcome: null },
      },
    ]);
  await expect(page.getByLabel("Our games, set 1")).toBeVisible();
});
