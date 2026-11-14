import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

let server: Server;
let origin: string;
let outputPath: string;

test.beforeAll(async () => {
  outputPath = mkdtempSync(join(tmpdir(), "viz-gallery-"));
  const webpack = (
    nextWebpack as unknown as {
      webpack: (
        config: unknown,
        cb: (
          error: Error | null,
          stats: { toJson(): { errors?: unknown[] } },
        ) => void,
      ) => void;
    }
  ).webpack;
  const mock = resolve("tests/fixtures/viz-gallery-browser-mocks.tsx");
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/viz-gallery-browser-harness.tsx"),
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
            "@/components/dashboard/matches/match-detail/shots/viz-bands-context":
              mock,
            "@/components/dashboard/matches/match-data-provider": mock,
            "@/components/dashboard/matches/match-detail/use-match-sides": mock,
            "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions":
              mock,
            "@/components/dashboard/matches/match-detail/shots/save-view-dialog":
              mock,
            "@/components/dashboard/matches/match-detail/shots/manageable-saved-view-tile":
              mock,
            "next/link": mock,
            "next/navigation": resolve(
              "tests/fixtures/viz-navigation-browser-mock.ts",
            ),
            "@": resolve("src"),
          },
        },
      },
      (error, stats) => (error ? reject(error) : done(stats.toJson())),
    );
  });
  expect(result.errors ?? []).toEqual([]);
  const bundle = readFileSync(join(outputPath, "bundle.js"));
  server = createServer((request, response) => {
    response.setHeader(
      "content-type",
      request.url?.startsWith("/bundle.js")
        ? "text/javascript; charset=utf-8"
        : "text/html; charset=utf-8",
    );
    response.end(
      request.url?.startsWith("/bundle.js")
        ? bundle
        : '<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
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

test("the wall's Default and Saved collections open cards over the wall", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${origin}/?tab=shots`);
  await expect(page.getByRole("button", { name: "Default" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const defaults = page.getByRole("list", { name: "Default views" });
  await expect(defaults).toBeVisible();
  // One player at a time (the fixture only holds serves, so one card each);
  // the switch is URL-backed.
  await expect(defaults.getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "You" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Blake" }).click();
  await expect(page).toHaveURL(/player=opponent/);
  await expect(
    defaults.locator('a[href*="cut=serve"][href*="player=opponent"]'),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "You" }).click();
  await expect(page).not.toHaveURL(/player=opponent/);

  // The Saved collection.
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(
    page.getByRole("list", { name: "Saved views" }).getByRole("listitem"),
  ).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Create view" })).toBeVisible();

  // A saved view opens over the wall, and closing lands back on Saved.
  await page
    .getByRole("link", { name: /Saved serve/ })
    .first()
    .click();
  await expect(page.getByTestId("lightbox")).toContainText("saved-serve");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("lightbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  // A default card opens over the wall with the keyboard; the wall stays.
  await page.getByRole("button", { name: "Default" }).click();
  const defaultServe = defaults.locator(
    'a[href*="cut=serve"]:not([href*="ball="]):not([href*="player="])',
  );
  await defaultServe.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("lightbox")).toContainText("you:serve");
  await expect(defaults).toBeVisible();

  // Back and forward move between the wall and the opened card.
  await page.goBack();
  await expect(page.getByTestId("lightbox")).toHaveCount(0);
  await page.goForward();
  await expect(page.getByTestId("lightbox")).toContainText("you:serve");
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("lightbox")).toHaveCount(0);
  expect(errors).toEqual([]);
});
