import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
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
 * The Edit match dialog's format controls in a real browser, over
 * `tests/fixtures/edit-match-harness.tsx`. The spec's server answers the
 * dialog's GET as a failed, a completed or a hand-scored match, and records
 * what Save PATCHes. Nothing here touches a database, and a real retry to the
 * vendor is `tests/resubmit-authorization.spec.ts`'s, against fakes.
 */

const MATCH = {
  id: "m-1",
  tournament_name: "Open",
  round: null,
  date: "2026-10-01T00:00:00+00:00",
  match_type: "singles",
  court_type: null,
  player1_id: "owner",
  player1_name: "Ava Adams",
  player2_name: "Riley Rival",
  score: { player1: [6, 6], player2: [4, 4] },
  format: { best_of: 3, ad_scoring: false, play_on_lets: false },
  duration: null,
  player_hand: null,
  player_backhand: null,
  opponent_hand: null,
  opponent_backhand: null,
  program_id: null,
  event_entry_id: null,
  source_provider: null,
  opponent_program_id: null,
  opponent_school: null,
  opponent_program: null,
};

const LOADED = {
  match: MATCH,
  event: null,
  canAttach: false,
  canDetach: false,
  canEditRound: false,
  rebuild: null,
};

const FAILED = {
  ...LOADED,
  match: { ...MATCH, source_provider: "splitstep" },
  analysis: { status: "failed" },
  awaitingRetry: true,
};
const COMPLETED = {
  ...LOADED,
  match: { ...MATCH, source_provider: "splitstep" },
  analysis: { status: "completed" },
  awaitingRetry: false,
};
const HAND_SCORED = { ...LOADED, analysis: null, awaitingRetry: false };

let server: Server;
let origin: string;
let outputPath: string;
let answer: unknown = FAILED;
let patches: Record<string, unknown>[] = [];

test.beforeAll(async () => {
  outputPath = mkdtempSync(join(tmpdir(), "edit-match-"));
  const mocks = resolve("tests/fixtures/edit-match-browser-mocks.tsx");
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/edit-match-harness.tsx"),
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
            "next/navigation": mocks,
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
            "next/image": resolve(
              "tests/fixtures/match-drawer-deps-browser-mock.tsx",
            ),
            "@/lib/supabase/client": resolve(
              "tests/fixtures/supabase-client-browser-mock.ts",
            ),
            "@/lib/matches/edit-match-suggestions": mocks,
            "@/lib/schedule/attach-line": mocks,
            "@/lib/data/programs-server": mocks,
            "@/components/dashboard/matches/match-drawer": mocks,
            "@/components/dashboard/matches/match-detail/verified-fact": mocks,
            "@/components/dashboard/toast/toast-provider": mocks,
            "@/components/dashboard/workspace-provider": mocks,
            "@": resolve("src"),
          },
        },
      },
      (error, stats) => (error ? reject(error) : done(stats.toJson())),
    );
  });
  expect(result.errors ?? []).toEqual([]);

  const bundle = readFileSync(join(outputPath, "bundle.js"));
  const stylesheet = (
    await postcss([tailwindcss()]).process(
      readFileSync(resolve("src/app/globals.css"), "utf8"),
      { from: resolve("src/app/globals.css") },
    )
  ).css;

  server = createServer((request, response) => {
    const path = (request.url ?? "/").split("?")[0];
    if (path === "/api/matches/m-1") {
      response.setHeader("content-type", "application/json");
      if (request.method === "PATCH") {
        let body = "";
        request.on("data", (chunk) => (body += chunk));
        request.on("end", () => {
          patches.push(JSON.parse(body));
          response.end(JSON.stringify({ match: MATCH }));
        });
        return;
      }
      response.end(JSON.stringify(answer));
      return;
    }
    if (path === "/bundle.js") {
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.end(bundle);
      return;
    }
    if (path === "/style.css") {
      response.setHeader("content-type", "text/css; charset=utf-8");
      response.end(stylesheet);
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server?.listening)
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  if (outputPath) rmSync(outputPath, { recursive: true, force: true });
});

/** The dialog over `loaded`, ready; page errors collect in the returned list. */
async function open(page: Page, loaded: unknown): Promise<string[]> {
  answer = loaded;
  patches = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  return errors;
}

const menu = (page: Page, name: string) =>
  page.getByRole("button", { name, exact: false }).filter({ hasText: /./ });
const caption = (page: Page, name: string) =>
  page.locator("span", { hasText: new RegExp(`^${name}$`) });

async function save(page: Page) {
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(() => patches.length).toBe(1);
  return patches[0];
}

test.describe("Edit match's format controls", () => {
  test("a failed analysis offers Scoring alone, and Save sends only that", async ({
    page,
  }, testInfo) => {
    const errors = await open(page, FAILED);
    await expect(caption(page, "Scoring")).toBeVisible();
    await expect(caption(page, "Format")).toHaveCount(0);
    await expect(caption(page, "Lets")).toHaveCount(0);
    await expect(page.getByText(/^Analyzed as/)).toHaveCount(0);
    await caption(page, "Scoring").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: testInfo.outputPath("scoring-control.png"),
      animations: "disabled",
    });

    await menu(page, "Scoring").click();
    await page.getByRole("menuitemradio", { name: "Ad", exact: true }).click();
    expect((await save(page)).format).toEqual({ ad_scoring: true });
    expect(errors).toEqual([]);
  });

  test("a failed analysis with the scoring untouched sends no format", async ({
    page,
  }) => {
    await open(page, FAILED);
    expect(await save(page)).not.toHaveProperty("format");
  });

  test("a completed analysis offers no format control and sends no format", async ({
    page,
  }) => {
    await open(page, COMPLETED);
    await expect(caption(page, "Scoring")).toHaveCount(0);
    await expect(page.getByText(/^Analyzed as/)).toBeVisible();
    expect(await save(page)).not.toHaveProperty("format");
  });

  test("a hand-scored match keeps all three controls", async ({ page }) => {
    await open(page, HAND_SCORED);
    await expect(caption(page, "Format")).toBeVisible();
    await expect(caption(page, "Scoring")).toBeVisible();
    await expect(caption(page, "Lets")).toBeVisible();
    expect((await save(page)).format).toEqual(MATCH.format);
  });
});
