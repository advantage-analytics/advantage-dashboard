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

test("default and saved gallery navigation omits only the selected identity", async ({
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
  await expect(page.getByRole("list", { name: "Default views" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Saved serve/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("list", { name: "Saved views" }).getByRole("listitem"),
  ).toHaveCount(3);
  await expect(page.getByRole("link", { name: "Create view" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved views" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Default" }).click();
  const gallery = page.getByRole("list").last();
  const defaultServe = page.locator(
    'a[href*="cut=serve"][href*="ball=first"]:not([href*="player="])',
  );
  await defaultServe.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("focused")).toBeVisible();
  await expect(defaultServe).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Saved serve/ })).toBeVisible();
  await expect(gallery.getByRole("listitem")).toHaveCount(10);
  await page.getByRole("button", { name: "Filter set" }).click();
  await expect(gallery.getByRole("listitem")).toHaveCount(10);
  await page.getByRole("link", { name: /Saved serve/ }).click();
  await expect(page.getByTestId("focused")).toContainText("saved-serve");
  await page.getByRole("button", { name: "Back to wall" }).click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: /Saved serve/ })).toBeVisible();
  await page.getByRole("link", { name: /Saved serve/ }).click();
  await page.screenshot({
    path: test.info().outputPath("gallery-focused-saved.png"),
    fullPage: true,
  });
  await expect(page.getByRole("link", { name: /Saved serve/ })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Second saved serve/ }),
  ).toBeVisible();
  await expect(defaultServe).toBeVisible();
  await page.getByRole("link", { name: /Second saved serve/ }).click();
  await expect(page.getByTestId("focused")).toContainText("saved-serve-2");
  await expect(
    page.getByRole("link", { name: /Second saved serve/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Saved serve/ })).toBeVisible();
  await page.getByRole("link", { name: /Saved serve/ }).click();
  await expect(page.getByTestId("focused")).toContainText("saved-serve");
  await page
    .getByRole("button", { name: "Open First serves, every zone fullscreen" })
    .first()
    .click();
  await expect(page.getByTestId("fullscreen")).toBeVisible();
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await expect(page.getByTestId("fullscreen")).toHaveCount(0);
  await page.getByRole("link", { name: /Saved serve/ }).click();
  await expect(page.getByTestId("focused")).toContainText("saved-serve");
  await page.evaluate(() => {
    window.history.pushState(null, "", "/?tab=shots&cut=serve&ball=first");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(defaultServe).toHaveCount(0);
  await page.goBack();
  await expect(page.getByTestId("focused")).toContainText("saved-serve");
  await expect(defaultServe).toBeVisible();
  await page.goForward();
  await expect(defaultServe).toHaveCount(0);
  await page.getByRole("button", { name: "Back to wall" }).click();
  await expect(defaultServe).toBeVisible();
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await expect(page.getByRole("link", { name: /Saved serve/ })).toBeVisible();
  await page.getByRole("button", { name: "Default" }).click();
  await page.screenshot({
    path: test.info().outputPath("gallery-overview.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
