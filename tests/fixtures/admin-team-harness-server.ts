import { expect, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import type { ActionFailure } from "./admin-team-actions-browser-mock";

/**
 * Bundles an Admin › Teams harness with webpack and serves it from a throwaway
 * port (the `admin-search.spec.ts` pattern), since what these specs pin is a
 * transition's promise chain, which a static render never runs.
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

const ACTIONS = resolve("tests/fixtures/admin-team-actions-browser-mock.ts");

export async function serveHarness(
  entry: string,
): Promise<{ origin: string; close: () => Promise<void> }> {
  const outputPath = mkdtempSync(join(tmpdir(), "admin-team-harness-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve(entry),
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
            "@/lib/services/programs/admin-team-actions$": ACTIONS,
            "@/lib/services/programs/admin-conference-actions$": ACTIONS,
            "@/components/dashboard/settings/team-actions$": ACTIONS,
            // By file: `add-self-dialog` reaches this one with a relative import.
            [resolve("src/components/dashboard/team/roster-actions.ts")]:
              ACTIONS,
            "@/lib/posthog-client$": resolve(
              "tests/fixtures/posthog-client-browser-mock.ts",
            ),
            "posthog-js$": resolve("tests/fixtures/posthog-browser-mock.ts"),
            "@": resolve("src"),
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
            "next/navigation$": resolve(
              "tests/fixtures/next-navigation-browser-mock.ts",
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
  const server: Server = createServer((request, response) => {
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
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((done, reject) =>
        server.close((error) => (error ? reject(error) : done())),
      ),
  };
}

/** Opens the harness, collecting uncaught errors into `errors`. */
export async function openHarness(
  page: Page,
  origin: string,
  errors: string[],
) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

/** From here on, every action on the page rejects this way. */
export const failActionsWith = (page: Page, failure: ActionFailure) =>
  page.evaluate((kind) => {
    window.__actionFailure = kind;
  }, failure);

export const boundaryErrors = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { boundaryErrors: string[] }).boundaryErrors,
  );

export const capturedExceptions = (page: Page) =>
  page.evaluate(() => window.capturedExceptions ?? []);
