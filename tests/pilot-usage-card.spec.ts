import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The Admin › Teams Pilot card: what its writes do when the request never
 * comes back.
 *
 * PostHog issue 01a14f7d: `TypeError: Load failed` on /admin/teams/[id] in
 * Safari, right after an admin confirmed the card's Grant / Revoke team pool
 * dialog, and a full reload of the page six seconds later. The actions answer
 * refusals as `{ ok: false }`, but a fetch that fails rejects instead, and the
 * card awaited it inside `startTransition` with no handler — so the rejection
 * was thrown to the error boundary and the page was replaced by an error
 * screen.
 *
 * `tests/fixtures/pilot-usage-card-harness.tsx` is bundled with webpack and
 * served from a throwaway port (the `admin-search.spec.ts` pattern), since
 * what is pinned is a transition's promise chain, which a static render never
 * runs. The harness' boundary records whatever reaches it.
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

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "pilot-usage-card-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/pilot-usage-card-harness.tsx"),
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
            "@/lib/services/programs/admin-team-actions$": resolve(
              "tests/fixtures/pilot-usage-card-actions-browser-mock.ts",
            ),
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

async function openCard(page: Page, errors: string[]) {
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
  await page.evaluate(() => {
    window.__pilotActionsFail = true;
  });
}

const boundaryErrors = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { boundaryErrors: string[] }).boundaryErrors,
  );

const UNREACHABLE =
  "Couldn't reach the server. Reload the page to see whether the change was saved.";

for (const { trigger, confirm } of [
  { trigger: "Grant team pool", confirm: "Grant pool" },
  { trigger: "End pilot", confirm: "End pilot" },
]) {
  test(`a dropped request on "${trigger}" stays in the dialog instead of the error screen`, async ({
    page,
  }) => {
    const errors: string[] = [];
    await openCard(page, errors);

    await page.getByRole("button", { name: trigger }).click();
    const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await dialog.getByRole("button", { name: confirm }).click();

    await expect(dialog.getByText(UNREACHABLE)).toBeVisible();
    expect(await boundaryErrors(page)).toEqual([]);
    expect(errors).toEqual([]);
    // The card is still there behind the dialog — nothing replaced the page.
    await expect(
      page.getByRole("alert").filter({ hasText: "Page error" }),
    ).toHaveCount(0);
  });
}
