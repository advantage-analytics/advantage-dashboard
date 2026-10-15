import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

import {
  clipAdvance,
  clipPositionLabel,
  clipWindows,
} from "@/components/dashboard/ask/ask-clip-sequence";
import type { AskShowPoint } from "@/lib/services/ask/show";

/**
 * The inline clip strip (`ask-clip-strip.tsx`): its timeline offline
 * (`ask-clip-sequence.ts`), then the component in a real browser through
 * `tests/fixtures/ask-clip-strip-harness.tsx` — the transport over three
 * points, an attachment playing the route's own URL and renewing it once
 * when it fails (with the strip's skeleton meanwhile), and the three ways a
 * film is not there: removed, refused, expired.
 */

const point = (
  pointNumber: number,
  videoTime: number | null,
  duration: number | null = null,
): AskShowPoint => ({
  pointNumber,
  setNumber: 1,
  gameNumber: 1,
  pointScore: null,
  gameScore: null,
  resultType: null,
  iWon: null,
  iServed: null,
  videoTime,
  duration,
});

test.describe("the timeline", () => {
  test("windows: the offset applied once, the room's buffer, untimed points dropped, film order", () => {
    const windows = clipWindows(
      [point(12, 160, 6), point(3, 100, 4), point(7, 130), point(20, null)],
      { offset: 90, duration: null },
    );
    expect(windows).toEqual([
      { pointNumber: 3, start: 8.5, end: 15.5 },
      { pointNumber: 7, start: 38.5, end: 51.5 },
      { pointNumber: 12, start: 68.5, end: 77.5 },
    ]);
  });

  test("windows never run past the film's end or before its start", () => {
    expect(clipWindows([point(1, 0.5, 4)], { offset: 0, duration: 3 })).toEqual(
      [{ pointNumber: 1, start: 0, end: 3 }],
    );
  });

  test("advance: keep playing inside a window, the next index once it has run out, end after the last", () => {
    const windows = clipWindows([point(3, 100, 4), point(7, 130)], {
      offset: 90,
      duration: null,
    });
    expect(clipAdvance(windows, 0, 9)).toBeNull();
    expect(clipAdvance(windows, 0, 15.45)).toBe(1);
    expect(clipAdvance(windows, 1, 40)).toBeNull();
    expect(clipAdvance(windows, 1, 60)).toBe("end");
    expect(clipAdvance(windows, 5, 0)).toBe("end");
    expect(clipPositionLabel(0, 3)).toBe("Point 1 of 3");
  });
});

/* ── The component ────────────────────────────────────────────────────────── */

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
/** `/hang.mp4` requests, held open so the element never errors; destroyed on close. */
const hanging: ServerResponse[] = [];

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "ask-clip-strip-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/ask-clip-strip-harness.tsx"),
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
    if (request.url?.startsWith("/broken.mp4")) {
      response.statusCode = 404;
      response.end();
      return;
    }
    if (request.url?.startsWith("/hang.mp4")) {
      hanging.push(response);
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
  for (const response of hanging) response.destroy();
  server.closeAllConnections?.();
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
});

async function openFixture(page: Page, query = "") {
  await page.goto(`${origin}/${query}`, { waitUntil: "domcontentloaded" });
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const strip = (page: Page) => page.locator("[data-ask-clip-strip]");
const position = (page: Page) => page.locator("[data-ask-clip-position]");

test("the job lineage plays the route's own URL: three points, a counter, the point's line", async ({
  page,
}) => {
  await openFixture(page, "?case=job");
  await expect(strip(page)).toBeVisible();
  await expect(strip(page).locator("video")).toHaveAttribute(
    "src",
    /\/hang\.mp4$/,
  );
  await expect(position(page)).toHaveText("Point 1 of 3");
  await expect(page.locator("[data-ask-clip-point]")).toHaveText(
    "Set 1 · Game 1 · 30-15 · Ace",
  );
  await expect(
    page.getByRole("button", { name: "Previous point" }),
  ).toBeDisabled();

  await page.getByRole("button", { name: "Next point" }).click();
  await expect(position(page)).toHaveText("Point 2 of 3");
  await expect(page.locator("[data-ask-clip-point]")).toHaveText(
    "Set 1 · Game 2 · 15-0 · Backhand Winner",
  );
  await page.getByRole("button", { name: "Next point" }).click();
  await expect(position(page)).toHaveText("Point 3 of 3");
  await expect(page.getByRole("button", { name: "Next point" })).toBeDisabled();

  // The way out, on these points.
  await expect(
    strip(page).getByRole("link", { name: "Film room" }),
  ).toHaveAttribute(
    "href",
    `/dashboard/matches/${MATCH_ID}?tab=film&pn=3%2C7%2C12`,
  );
  // No credential was fetched: the job lineage has no refresh route.
  expect(
    await page.evaluate(
      () => (window as unknown as { __clipFetches?: string[] }).__clipFetches,
    ),
  ).toBeUndefined();
});

const clipFetches = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __clipFetches?: string[] }).__clipFetches,
  );

test("an attachment plays the URL the show route signed: no second credential fetch", async ({
  page,
}) => {
  await openFixture(page, "?case=attachment");
  await expect(strip(page)).toBeVisible();
  await expect(strip(page).locator("video")).toHaveAttribute(
    "src",
    /\/hang\.mp4$/,
  );
  await expect(position(page)).toHaveText("Point 1 of 3");
  expect(await clipFetches(page)).toBeUndefined();
});

test("an attachment whose signed URL fails renews it once from the match's playback route", async ({
  page,
}) => {
  await openFixture(page, "?case=renew");
  await expect(strip(page).locator("video")).toHaveAttribute(
    "src",
    /\/hang\.mp4$/,
  );
  await expect(position(page)).toHaveText("Point 1 of 3");
  expect(await clipFetches(page)).toEqual([`/api/matches/${MATCH_ID}/video`]);
});

test("while the credential renews, the strip's own frame holds its place as one status", async ({
  page,
}) => {
  await openFixture(page, "?case=pending");
  const pending = page.locator("[data-ask-clip-loading]");
  await expect(pending).toBeAttached();
  await expect(
    pending.getByRole("status", { name: "Loading the film" }),
  ).toHaveCount(1);
  await expect(pending.locator("[role=status]")).toHaveCount(1);
  // The loaded card's frame (the harness carries no stylesheet, so the
  // classes are the contract): the 420px card, a 16:9 film bar, every bar
  // silent under the one status.
  await expect(pending).toHaveClass(/max-w-\[420px\]/);
  await expect(pending.locator(".surface-card")).toHaveCount(1);
  await expect(
    pending.locator(".surface-card [data-pending-bar]").first(),
  ).toHaveClass(/aspect-video/);
  await expect(
    pending.locator("[role=status] > [aria-hidden=true]"),
  ).toHaveCount(1);
  await expect(page.locator("video")).toHaveCount(0);
});

test("a video that is gone says so and hands over to the film room, never a broken player", async ({
  page,
}) => {
  await openFixture(page, "?case=removed");
  await expect(
    page.locator("[data-ask-clip-unavailable='removed']"),
  ).toContainText("This video is no longer attached to the match.");
  await expect(
    page.getByRole("link", { name: "Open the film room" }),
  ).toHaveAttribute(
    "href",
    `/dashboard/matches/${MATCH_ID}?tab=film&pn=3%2C7%2C12`,
  );
  await expect(page.locator("video")).toHaveCount(0);

  await openFixture(page, "?case=denied");
  await expect(
    page.locator("[data-ask-clip-unavailable='unavailable']"),
  ).toContainText("The video could not be loaded.");
  await expect(page.locator("video")).toHaveCount(0);

  await openFixture(page, "?case=untimed");
  await expect(
    page.locator("[data-ask-clip-unavailable='untimed']"),
  ).toBeVisible();
  await expect(page.locator("video")).toHaveCount(0);
});

test("an expired video is the Video tab's expired state in short", async ({
  page,
}) => {
  await openFixture(page, "?case=expired");
  const expired = page.locator("[data-ask-clip-expired]");
  await expect(expired).toContainText("This video was removed");
  await expect(expired).toContainText(
    "Nobody watched it for a year, so it was removed on",
  );
  await expect(expired).toContainText(
    "The statistics and the point list are unchanged.",
  );
  await expect(
    expired.getByRole("link", { name: "Open the match" }),
  ).toHaveAttribute(
    "href",
    `/dashboard/matches/${MATCH_ID}?tab=film&pn=3%2C7%2C12`,
  );
  await expect(page.locator("video")).toHaveCount(0);
});
