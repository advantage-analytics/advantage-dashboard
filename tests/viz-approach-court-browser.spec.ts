import { expect, test, type Locator } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/** `CourtArt` on the Approaches cut — pairs, apron labels and the two
 *  viewBoxes — from hand-built dots. No database edits. */
let server: Server;
let origin: string;
let outputPath: string;

test.beforeAll(async () => {
  outputPath = mkdtempSync(join(tmpdir(), "viz-approach-court-"));
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
        entry: resolve("tests/fixtures/viz-approach-court-harness.tsx"),
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
            "@/lib/posthog-client$": resolve(
              "tests/fixtures/posthog-client-off-mock.ts",
            ),
            "@/app/dashboard/matches/(detail)/[matchId]/viz-bands-actions":
              resolve("tests/fixtures/viz-fullscreen-actions-browser-mock.ts"),
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

const NET_Y = 104.5;

/** A mark's centre in viewBox units: a circle's cx/cy, or a triangle's
 *  centroid. */
async function centreOf(mark: Locator): Promise<{ x: number; y: number }> {
  return mark.evaluate((g) => {
    const circle = g.querySelector("circle");
    if (circle)
      return {
        x: Number(circle.getAttribute("cx")),
        y: Number(circle.getAttribute("cy")),
      };
    const pts = g
      .querySelector("polygon")!
      .getAttribute("points")!
      .split(" ")
      .map((p) => p.split(",").map(Number));
    return {
      x: pts.reduce((s, p) => s + p[0], 0) / pts.length,
      y: pts.reduce((s, p) => s + p[1], 0) / pts.length,
    };
  });
}

async function viewBoxOf(svg: Locator) {
  const [minX, minY, w, h] = (await svg.getAttribute("viewBox"))!
    .split(" ")
    .map(Number);
  return { minX, minY, w, h };
}

test("Approaches court draws each pair as two unjoined marks, and a dot without a pair as its placement alone", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  for (const id of ["opened", "card"]) {
    const court = page.getByTestId(id);
    await expect(court.getByRole("img")).toHaveAttribute(
      "aria-label",
      "approaches court, 4 points shown",
    );

    for (const pairId of ["pair-fh", "pair-bh"]) {
      const pair = court.locator(`[data-approach-pair="${pairId}"]`);
      const marks = pair.locator(`[data-approach-mark="${pairId}"]`);
      await expect(marks).toHaveCount(2);
      await expect(marks.nth(0)).toHaveAttribute(
        "data-approach-part",
        "contact",
      );
      await expect(marks.nth(1)).toHaveAttribute(
        "data-approach-part",
        "placement",
      );
      // Nothing joins the two: no line, path or polyline inside the pair.
      await expect(pair.locator("line, path, polyline")).toHaveCount(0);
      // Contact in the subject's (near, lower) half; placement in the far.
      const contact = await centreOf(marks.nth(0));
      const placement = await centreOf(marks.nth(1));
      expect(contact.y).toBeGreaterThan(NET_Y);
      expect(placement.y).toBeLessThan(NET_Y);
    }

    const solo = court.locator('[data-approach-pair="solo"]');
    await expect(solo.locator("[data-approach-mark]")).toHaveCount(1);
    await expect(solo.locator("[data-approach-mark]")).toHaveAttribute(
      "data-approach-part",
      "placement",
    );
    await expect(solo.locator("[data-approach-mark]")).toHaveAttribute(
      "data-approach-mark",
      "solo",
    );

    // A backhand triangle is drawn apex-up in screen space.
    const tri = await court
      .locator('[data-approach-pair="pair-bh"] polygon')
      .first()
      .getAttribute("points");
    const ys = tri!.split(" ").map((p) => Number(p.split(",")[1]));
    expect(ys[0]).toBeLessThan(Math.min(ys[1], ys[2]));

    // Every mark stays inside the viewBox that is drawn, the wild one too.
    const vb = await viewBoxOf(court.locator("svg"));
    for (const mark of await court.locator("[data-approach-mark]").all()) {
      const c = await centreOf(mark);
      expect(c.x).toBeGreaterThanOrEqual(vb.minX);
      expect(c.x).toBeLessThanOrEqual(vb.minX + vb.w);
      expect(c.y).toBeGreaterThanOrEqual(vb.minY);
      expect(c.y).toBeLessThanOrEqual(vb.minY + vb.h);
    }
  }
  expect(errors).toEqual([]);
});

test("labels name Contact, Placement and the three wings on the opened view only", async ({
  page,
}) => {
  await page.goto(origin);
  const opened = page.getByTestId("opened");
  const card = page.getByTestId("card");
  const texts = (court: Locator) =>
    court
      .locator("svg text")
      .evaluateAll((nodes) => nodes.map((n) => n.textContent));

  // Hand unknown (every dot `handAssumed`): no one known hand sides the
  // apron, so the thirds are named from the hitter's side.
  expect(await texts(opened)).toEqual([
    "Placement",
    "Contact",
    "Left",
    "Middle",
    "Right",
  ]);
  for (const name of ["Placement", "Contact", "Left", "Middle", "Right"])
    await expect(opened.getByText(name, { exact: true })).toBeVisible();
  // Lane names left to right across the far baseline, above the court.
  const laneX = await opened
    .locator("[data-approach-lane]")
    .evaluateAll((nodes) => nodes.map((n) => Number(n.getAttribute("x"))));
  expect(laneX).toEqual([...laneX].sort((a, b) => a - b));
  // Dark ink from a token, Roboto Mono.
  const group = opened.locator("[data-approach-labels]");
  await expect(group).toHaveAttribute("fill", "var(--surface-dark)");
  await expect(group).toHaveAttribute("font-family", "var(--font-mono)");

  // The wall card carries no text at all.
  expect(await texts(card)).toEqual([]);
  for (const name of [
    "Placement",
    "Contact",
    "Their FH",
    "Their BH",
    "Left",
    "Middle",
    "Right",
  ])
    await expect(card.getByText(name, { exact: true })).toHaveCount(0);

  // A known left-hander names their wings, backhand on the hitter's left.
  const lefty = page.getByTestId("lefty");
  await expect(lefty.locator('[data-approach-lane="left"]')).toHaveText(
    "Their BH",
  );
  await expect(lefty.locator('[data-approach-lane="right"]')).toHaveText(
    "Their FH",
  );
});

test("the wall card art uses a tighter viewBox than the labelled opened view", async ({
  page,
}) => {
  await page.goto(origin);
  const openedSvg = page.getByTestId("opened").locator("svg");
  const cardSvg = page.getByTestId("card").locator("svg");
  await expect(openedSvg).toHaveAttribute("data-approach-frame", "opened");
  await expect(cardSvg).toHaveAttribute("data-approach-frame", "card");
  const opened = await viewBoxOf(openedSvg);
  const card = await viewBoxOf(cardSvg);
  expect(opened).toEqual({ minX: 118, minY: -142, w: 244, h: 482 });
  expect(card).toEqual({ minX: 130, minY: -104, w: 220, h: 418 });
  // Strictly inside the opened window on every side.
  expect(card.minX).toBeGreaterThan(opened.minX);
  expect(card.minY).toBeGreaterThan(opened.minY);
  expect(card.minX + card.w).toBeLessThan(opened.minX + opened.w);
  expect(card.minY + card.h).toBeLessThan(opened.minY + opened.h);
  await page.screenshot({
    path: test.info().outputPath("approach-court.png"),
    fullPage: true,
  });
});
