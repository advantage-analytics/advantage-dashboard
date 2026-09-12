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
  const outputPath = mkdtempSync(join(tmpdir(), "schedule-score-outcomes-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve(
          "tests/fixtures/schedule-score-flow-outcomes-harness.tsx",
        ),
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

async function openFlow(page: import("@playwright/test").Page, url = "") {
  await page.goto(`${origin}/${url}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

async function choose(page: import("@playwright/test").Page, label: string) {
  await page.getByRole("button", { name: "Result type" }).click();
  await page.getByRole("menuitemradio", { name: label, exact: true }).click();
}

async function changeLine(
  page: import("@playwright/test").Page,
  label: RegExp,
) {
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: label }).click();
}

test("all six non-played results resolve a line and advance without games", async ({
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
    await openFlow(page);
    await choose(page, label);
    await expect(page.getByLabel("Jordan Lee, set 1")).toHaveCount(0);
    await page.getByRole("button", { name: "Save and next line" }).click();
    await expect
      .poll(() => page.evaluate(() => window.actionCalls))
      .toEqual([
        {
          action: "setOutcome",
          input: {
            entryId: "entry-s1",
            round: null,
            outcome: { kind, side },
          },
        },
      ]);
    await expect(page.getByText("Line 2 of 3", { exact: true })).toBeVisible();
    await expect(page.getByText("1 line still needs a result")).toBeVisible();
  }
});

test("a saved outcome clears, preserves a conflicting score draft, then advances", async ({
  page,
}) => {
  await openFlow(page, "?saved=true");
  await expect(page.getByRole("button", { name: "Result type" })).toContainText(
    "We won — opponent defaulted",
  );
  await choose(page, "Clear saved outcome");
  await expect(
    page.getByRole("button", { name: "Save and close" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Clear outcome" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls))
    .toEqual([
      {
        action: "setOutcome",
        input: { entryId: "entry-s3", round: null, outcome: null },
      },
    ]);
  await expect(page.getByLabel("Alex Kim, set 1")).toBeVisible();
  await expect(page.getByText("3 lines still need a result")).toBeVisible();

  await changeLine(page, /S1Jordan Lee/);
  await changeLine(page, /S3Alex Kim/);
  await expect(page.getByRole("button", { name: "Result type" })).toContainText(
    "Played — enter score",
  );

  await page.getByLabel("Alex Kim, set 1").fill("6");
  await page.getByLabel("Robin Shah, set 1").fill("4");
  await page.evaluate(() => {
    window.failNextScore = "Clear the saved outcome before adding a score.";
  });
  await page.getByRole("button", { name: "Save and next line" }).click();
  await expect(
    page.getByText("Clear the saved outcome before adding a score."),
  ).toBeVisible();
  await expect(page.getByLabel("Alex Kim, set 1")).toHaveValue("6");
  await expect(page.getByLabel("Robin Shah, set 1")).toHaveValue("4");

  await page.getByRole("button", { name: "Save and next line" }).click();
  await expect(page.getByText("Line 1 of 3", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => window.actionCalls.map((call) => call.action)),
  ).toEqual(["setOutcome", "recordResult", "recordResult"]);
});

test("a player denied at save keeps the selected outcome and sees the refusal", async ({
  page,
}) => {
  await openFlow(page);
  await choose(page, "We lost — our side withdrew");
  await page.evaluate(() => {
    window.failNextOutcome = "Only a program's staff can change its schedule.";
  });
  await page.getByRole("button", { name: "Save and next line" }).click();

  await expect(
    page.getByText("Only a program's staff can change its schedule."),
  ).toBeVisible();
  await expect(page.getByText("Line 1 of 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Result type" })).toContainText(
    "We lost — our side withdrew",
  );
});

test("changing lines reseeds both result choice and score from that line", async ({
  page,
}) => {
  await openFlow(page);
  await page.getByLabel("Jordan Lee, set 1").fill("6");
  await page.getByLabel("Casey Chen, set 1").fill("4");
  await choose(page, "We won — opponent forfeited");

  await changeLine(page, /S2Morgan Reed/);
  await expect(page.getByText("Line 2 of 3", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Result type" })).toContainText(
    "Played — enter score",
  );
  await expect(page.getByLabel("Morgan Reed, set 1")).toHaveValue("");
  await expect(page.getByLabel("Taylor Park, set 1")).toHaveValue("");

  await changeLine(page, /S3Alex Kim/);
  await expect(page.getByRole("button", { name: "Result type" })).toContainText(
    "We won — opponent defaulted",
  );
  await expect(page.getByLabel("Alex Kim, set 1")).toHaveCount(0);
});
