import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import {
  dualScore,
  lineCoverageFrom,
  readyMatchIdsFrom,
} from "@/lib/schedule/entry-state";
import { isSettled } from "@/lib/schedule/entry-plan";
import { OUTCOME_ENTRIES } from "./fixtures/schedule-dual-outcomes-data";

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
  const outputPath = mkdtempSync(join(tmpdir(), "schedule-dual-outcomes-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/schedule-dual-outcomes-harness.tsx"),
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

async function open(page: import("@playwright/test").Page, path = "") {
  await page.goto(`${origin}/${path}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

function line(page: import("@playwright/test").Page, slot: string) {
  return page.getByText(slot, { exact: true }).locator("..");
}

test("dual outcomes render their shared kind and side vocabulary with the pure 4-3 result", async ({
  page,
}) => {
  expect(dualScore(OUTCOME_ENTRIES)).toEqual({ us: 4, them: 3, decided: true });
  expect(lineCoverageFrom(OUTCOME_ENTRIES)).toEqual({ analyzed: 1, total: 3 });
  expect(readyMatchIdsFrom(OUTCOME_ENTRIES)).toEqual(["ready-played-match"]);
  expect(OUTCOME_ENTRIES.slice(0, 6).every(isSettled)).toBe(true);

  await open(page);

  await expect(page.getByText("4–3", { exact: true })).toBeVisible();
  await expect(page.getByText("Final", { exact: true })).toBeVisible();
  await expect(page.getByText("1 of 3 lines", { exact: true })).toBeVisible();

  for (const [slot, kind, result] of [
    ["S1", "Forfeited", "Won"],
    ["S2", "Forfeited", "Lost"],
    ["S3", "Defaulted", "Won"],
    ["S4", "Defaulted", "Lost"],
    ["S5", "Withdrawn", "Won"],
    ["S6", "Withdrawn", "Lost"],
  ] as const) {
    const row = line(page, slot);
    await expect(row.getByText(kind, { exact: true })).toBeVisible();
    await expect(row.getByText(result, { exact: true })).toHaveCount(1);
    await expect(
      row.getByRole("button", { name: "Edit result" }),
    ).toBeVisible();
    await expect(row.getByRole("link", { name: "Report" })).toHaveCount(0);
  }
});

test("played report navigation and unanswered scoring remain intact", async ({
  page,
}) => {
  await open(page, "?normal");

  await expect(
    line(page, "S1").getByRole("button", { name: "Add result" }),
  ).toBeVisible();
  await expect(
    line(page, "S2").getByRole("link", { name: "Report" }),
  ).toHaveAttribute("href", "/dashboard/matches/normal-ready-match");
});
