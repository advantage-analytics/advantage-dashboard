import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/** Production selector, preview, state provider and both court renderers,
 * backed by asymmetric role-resolved fixtures. No database edits. */
let server: Server;
let origin: string;
let outputPath: string;

test.beforeAll(async () => {
  outputPath = mkdtempSync(join(tmpdir(), "viz-rally-placement-"));
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
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/viz-rally-placement-harness.tsx"),
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
            "@": resolve("src"),
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
            "next/navigation": resolve(
              "tests/fixtures/viz-navigation-browser-mock.ts",
            ),
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

for (const cut of [
  "serve",
  "returnPlacement",
  "returnContact",
  "rallyPlacement",
  "rallyPosition",
]) {
  test(`${cut} Zones survives selection, subject, filters and changed bands across every court`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin}/?tab=shots&cut=${cut}`);
    if (cut === "serve") {
      await expect(
        page.getByTestId("preview").getByRole("img"),
      ).toHaveAttribute("aria-label", /points? shown/);
      await expect(
        page.getByTestId("focused").getByRole("img"),
      ).toHaveAttribute("aria-label", /points? shown/);
    }
    await page.getByRole("button", { name: "Scatter", exact: true }).click();
    await page.getByRole("menuitemradio", { name: /^Zones/ }).click();
    await expect(page).toHaveURL(/chart=zones/);
    const surfaces = [
      page.getByTestId("preview"),
      page.getByTestId("focused"),
      page.getByTestId("fullscreen"),
    ];
    const bandValues = (surface: (typeof surfaces)[number]) =>
      surface.locator("[data-viz-band]").evaluateAll((nodes) =>
        nodes
          .map((node) => ({
            key: node.getAttribute("data-viz-band"),
            count: Number(node.getAttribute("data-count")),
            winPct:
              node.getAttribute("data-win-pct") === ""
                ? null
                : Number(node.getAttribute("data-win-pct")),
          }))
          .sort((a, b) => a.key!.localeCompare(b.key!)),
      );
    async function consistent() {
      if (cut === "serve") {
        await expect(surfaces[0].getByRole("img")).toHaveAttribute(
          "aria-label",
          /six service-box zones/,
        );
        await expect(surfaces[1].getByRole("img")).toHaveAttribute(
          "aria-label",
          /six service-box zones/,
        );
      } else {
        const stats = JSON.parse(
          (await page.getByTestId("stats").textContent()) ?? "[]",
        )
          .map((r: { key: string; count: number; winPct: number | null }) => ({
            key: r.key,
            count: r.count,
            winPct: r.winPct,
          }))
          .sort((a: { key: string }, b: { key: string }) =>
            a.key.localeCompare(b.key),
          );
        for (const surface of surfaces)
          expect(await bandValues(surface)).toEqual(stats);
        for (const surface of surfaces.slice(0, 2))
          await expect(surface.locator("circle")).toHaveCount(0);
      }
      await expect(surfaces[2].locator("[data-viz-mark]")).toHaveCount(0);
    }
    await consistent();
    await page.getByRole("button", { name: "Switch player" }).click();
    await expect(page).toHaveURL(/player=opponent/);
    await consistent();
    await page.getByRole("button", { name: "Second set" }).click();
    await consistent();
    if (cut !== "serve") {
      const before = await bandValues(surfaces[1]);
      await page.getByRole("button", { name: "Change bands" }).click();
      await consistent();
      expect(await bandValues(surfaces[1])).not.toEqual(before);
      await page.screenshot({
        path: test.info().outputPath(`${cut}-zones.png`),
        fullPage: true,
      });
    }
    await page.getByRole("button", { name: "Empty set" }).click();
    await expect(page.locator("output")).toHaveText(/^0 of/);
    await consistent();
    if (cut.endsWith("Placement")) {
      await page.getByRole("button", { name: "No depth bands" }).click();
      await consistent();
      await expect(surfaces[1].getByRole("img")).toHaveAttribute(
        "aria-label",
        /no bands selected/,
      );
    }
    if (cut === "returnContact" || cut === "rallyPosition") {
      await page.getByRole("button", { name: "Toggle contact bands" }).click();
      for (const surface of surfaces)
        await expect(surface.locator("[data-viz-band]")).toHaveCount(0);
      await expect(
        surfaces[1].getByText("No contact bands selected"),
      ).toBeVisible();
      await page.getByRole("button", { name: "Toggle contact bands" }).click();
      await consistent();
    }
    expect(errors).toEqual([]);
  });
}

test("Zones stays selected when switching every visualization cut", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&chart=zones`);
  for (const [from, next, cut] of [
    ["Serve placement", "Return placement", "returnPlacement"],
    ["Return placement", "Return contact", "returnContact"],
    ["Return contact", "Rally placement", "rallyPlacement"],
    ["Rally placement", "Rally position", "rallyPosition"],
    ["Rally position", "Serve placement", "serve"],
  ]) {
    await page.getByRole("button", { name: from, exact: true }).click();
    await page
      .getByRole("menuitemradio", { name: new RegExp(`^${next}`) })
      .click();
    await expect(page).toHaveURL(new RegExp(`cut=${cut}`));
    await expect(page).toHaveURL(/chart=zones/);
    await expect(
      page.getByRole("button", { name: "Zones", exact: true }),
    ).toBeVisible();
  }
});
