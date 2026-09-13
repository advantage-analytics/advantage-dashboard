import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import {
  lineCoverageFrom,
  readyMatchIdsFrom,
} from "@/lib/schedule/entry-state";
import { entry } from "./fixtures/schedule-tournament-outcomes-data";

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
  const outputPath = mkdtempSync(
    join(tmpdir(), "schedule-tournament-outcomes-"),
  );
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve(
          "tests/fixtures/schedule-tournament-outcomes-harness.tsx",
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

async function open(page: import("@playwright/test").Page) {
  await page.goto(origin);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

function row(page: import("@playwright/test").Page, round: string) {
  return page.getByText(round, { exact: true }).locator("..");
}

async function chooseClear(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Result type" }).last().click();
  await page
    .getByRole("menuitemradio", { name: "Clear saved outcome", exact: true })
    .last()
    .click();
  await page.getByRole("button", { name: "Clear outcome" }).click();
}

test("renders played and outcome-only rounds in the established ladder order", async ({
  page,
}) => {
  await open(page);

  await expect(page.locator("span.mono")).toHaveText(["Q1", "R16", "QF"]);

  await expect(
    row(page, "Q1").getByText("Defaulted", { exact: true }),
  ).toBeVisible();
  await expect(row(page, "Q1").getByText("Won", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    row(page, "R16").getByText("6-2, 6-3", { exact: true }),
  ).toBeVisible();
  await expect(
    row(page, "R16").getByRole("link", { name: "Report" }),
  ).toHaveAttribute("href", "/dashboard/matches/played-r16");
  await expect(
    row(page, "QF").getByText("Withdrawn", { exact: true }),
  ).toBeVisible();
  await expect(row(page, "QF").getByText("Lost", { exact: true })).toHaveCount(
    1,
  );
});

test("keeps each outcome edit and clear action scoped to its own round", async ({
  page,
}) => {
  await open(page);

  await row(page, "Q1").getByRole("button", { name: "Edit result" }).click();
  await chooseClear(page);
  await expect
    .poll(() => page.evaluate(() => window.actionCalls))
    .toEqual([
      {
        action: "setOutcome",
        input: { entryId: "tournament-entry", round: "Q1", outcome: null },
      },
    ]);

  await row(page, "QF").getByRole("button", { name: "Edit result" }).click();
  await chooseClear(page);
  await expect
    .poll(() => page.evaluate(() => window.actionCalls))
    .toEqual([
      {
        action: "setOutcome",
        input: { entryId: "tournament-entry", round: "Q1", outcome: null },
      },
      {
        action: "setOutcome",
        input: { entryId: "tournament-entry", round: "QF", outcome: null },
      },
    ]);
});

test("outcome-only rounds never enter match analysis totals", () => {
  expect(lineCoverageFrom([entry])).toEqual({ analyzed: 1, total: 1 });
  expect(readyMatchIdsFrom([entry])).toEqual(["played-r16"]);
  expect(entry.matches).toHaveLength(1);
});
