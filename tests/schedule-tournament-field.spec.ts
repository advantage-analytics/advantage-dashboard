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
  const outputPath = mkdtempSync(join(tmpdir(), "schedule-tournament-field-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/schedule-tournament-field-harness.tsx"),
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

async function openField(
  page: import("@playwright/test").Page,
  mode: "new" | "edit",
) {
  await page.goto(`${origin}/?mode=${mode}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

/** Name → dates, site and format → the field: the flow's three steps. */
async function advanceToField(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: "When it's played, and where." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "The field." })).toBeVisible();
}

test("new tournament preserves real draft inclusion, draw, seed, and singles identity", async ({
  page,
}) => {
  await openField(page, "new");
  await page.getByPlaceholder("Buckeye Fall Classic").fill("Browser Open");
  await advanceToField(page);

  await page
    .getByRole("button", { name: "Add Ana Vasquez to tournament" })
    .click();
  await page.getByRole("button", { name: "Seed for Ana Vasquez" }).click();
  await page
    .getByRole("textbox", { name: "Seed for Ana Vasquez" })
    .fill("03rd");
  await page
    .getByRole("textbox", { name: "Seed for Ana Vasquez" })
    .press("Enter");

  // The production hook lives above both steps. Walking back and forward is
  // the persistence boundary that a field-only local-state harness skipped.
  // Back twice: the field, then the dates, then the name.
  await page.getByRole("button", { name: "Back" }).click();
  await page.getByRole("button", { name: "Back" }).click();
  await expect(page.getByPlaceholder("Buckeye Fall Classic")).toHaveValue(
    "Browser Open",
  );
  await advanceToField(page);
  // Entered: in the field with its own Remove, and gone from the bench.
  await expect(
    page.getByRole("button", { name: "Remove Ana Vasquez from tournament" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Ana Vasquez to tournament" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Draw for Ana Vasquez" }),
  ).toHaveText(/Main draw/);
  await expect(
    page.getByRole("button", { name: "Seed for Ana Vasquez" }),
  ).toHaveText("3");

  await page.getByRole("button", { name: "Draw for Ana Vasquez" }).click();
  await expect(
    page.getByText("The athlete starts in the tournament's main bracket."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The athlete must qualify before entering the main bracket.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("menuitemradio")).toHaveCount(2);
  await expect(
    page.getByRole("menuitemradio", { name: /Consolation/ }),
  ).toHaveCount(0);
  await page.getByRole("menuitemradio", { name: /Qualifying/ }).click();

  await page.getByRole("button", { name: "Create tournament" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
    .toEqual({
      action: "createTournament",
      input: expect.objectContaining({
        name: "Browser Open",
        entries: [
          expect.objectContaining({
            discipline: "singles",
            playerUserIds: ["athlete-ana"],
            playerLabels: ["Ana Vasquez"],
            draw: "Qualifying",
            seed: null,
          }),
        ],
      }),
    });
  await expect
    .poll(() => page.evaluate(() => window.routerPushes.at(-1)))
    .toBe("/dashboard/team/schedule/created-tournament");
});

test("edit preserves saved identity values, carried entries, and settled locks", async ({
  page,
}) => {
  await openField(page, "edit");
  await expect(page.getByPlaceholder("Buckeye Fall Classic")).toHaveValue(
    "Saved Fall Classic",
  );
  await advanceToField(page);

  const draw = page.getByRole("button", { name: "Draw for Ana Vasquez" });
  await expect(draw).toBeDisabled();
  // A settled row has no way out of the field: the lock stands where Remove
  // would be.
  await expect(
    page.getByRole("button", { name: "Remove Ana Vasquez from tournament" }),
  ).toHaveCount(0);

  const settledRow = draw.locator("xpath=..");
  const lock = settledRow.getByText("Played", { exact: true });
  await expect(lock).toBeVisible();
  await expect(
    settledRow.getByRole("button", { name: "Seed for Ana Vasquez" }),
  ).toHaveCount(0);
  const lockHandle = await lock.elementHandle();
  if (!lockHandle) throw new Error("Settled-row lock label did not render");
  expect(
    await draw.evaluate(
      (node, lockNode) =>
        Boolean(
          node.compareDocumentPosition(lockNode) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      lockHandle,
    ),
  ).toBe(true);

  await expect(draw).toHaveText(/Main draw/);
  await expect(settledRow).toContainText("3");
  await expect(
    page.getByRole("button", { name: "Remove Ben Cole from tournament" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Draw for Ben Cole" }),
  ).toHaveText(/Qualifying/);

  await page.getByRole("button", { name: "Save changes" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
    .toEqual({
      action: "updateTournament",
      input: expect.objectContaining({
        eventId: "event-browser",
        entries: [
          expect.objectContaining({
            id: "doubles-carry",
            discipline: "doubles",
            draw: "Consolation",
            playerUserIds: ["former-1", "former-2"],
          }),
          expect.objectContaining({
            id: "entry-ana",
            discipline: "singles",
            playerUserIds: ["athlete-ana"],
            draw: "Main draw",
            seed: 3,
            playerLabels: ["Ana Saved"],
          }),
          expect.objectContaining({
            id: "entry-ben",
            discipline: "singles",
            playerUserIds: ["athlete-ben"],
            draw: "Qualifying",
            seed: null,
          }),
        ],
      }),
    });
  await expect
    .poll(() => page.evaluate(() => window.routerPushes.at(-1)))
    .toBe("/dashboard/team/schedule/event-browser");
});
