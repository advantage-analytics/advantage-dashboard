import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

import type { AlignmentHarnessWindow } from "./fixtures/match-video-alignment-step-window";

/**
 * The attachment alignment step, in a real browser.
 *
 * Four things here can only be proven with one, and each of them is a way the
 * step would ship wrong without looking wrong:
 *
 *   1. **Nothing is sent.** The confirmed time is reported upward and no
 *      further. Transport and the write belong to the orchestration step.
 *   2. **A rejected `play()` is not a media error.** Browsers reject the
 *      promise for autoplay policy and for interrupted loads; only the
 *      element's own `error` event means the file is unusable. Both are driven
 *      here, separately.
 *   3. **Zero is confirmed.** Typing `00:00:00.000` and landing on it with Use
 *      current time both have to reach the same acknowledgement.
 *   4. **A too-short file keeps the time.** The refusal is about the recording,
 *      and losing a carefully scrubbed position to it is the frustration the
 *      whole step exists to avoid.
 *
 * The scenario arithmetic lives in the harness; the boundary numbers used
 * below are derived there and repeated in each test's comment.
 */

let server: Server;
let origin: string;

const FIXTURES = resolve("tests/fixtures/match-video");

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "match-video-alignment-step-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/match-video-alignment-step-harness.tsx"),
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
          alias: { "@": resolve("src") },
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
    const url = request.url ?? "/";
    if (url.startsWith("/bundle.js")) {
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.end(bundle);
      return;
    }
    if (url.startsWith("/fixtures/")) {
      const name = url.slice("/fixtures/".length).split("?")[0];
      try {
        const bytes = readFileSync(join(FIXTURES, name));
        response.setHeader("content-type", "video/mp4");
        response.setHeader("accept-ranges", "bytes");
        response.end(bytes);
      } catch {
        response.statusCode = 404;
        response.end();
      }
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

/* -------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------- */

async function open(
  page: Page,
  {
    scenario = "main",
    mode = "add",
    source = "local",
  }: { scenario?: string; mode?: string; source?: "local" | "saved" } = {},
) {
  await page.goto(
    `${origin}/?scenario=${scenario}&mode=${mode}&source=${source}`,
  );
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
  // Metadata has to land before any control is live.
  await expect(page.getByTestId("alignment-media-loading")).toHaveCount(0);
}

function field(page: Page) {
  return page.getByTestId("alignment-time-input");
}

async function enter(page: Page, text: string) {
  await field(page).fill(text);
}

function ready(page: Page) {
  return page.getByTestId("alignment-ready");
}

function errorStrip(page: Page) {
  return page.getByTestId("alignment-error");
}

async function events(page: Page) {
  return page.evaluate(
    () => (window as unknown as AlignmentHarnessWindow).alignmentEvents,
  );
}

/* -------------------------------------------------------------------------
 * Offset, both directions
 * ---------------------------------------------------------------------- */

test("a first point later in the video than in the source gives a positive offset", async ({
  page,
}) => {
  await open(page);

  // Anchor 10s in the source, marked at 5s in the file: the file starts ten
  // seconds after SwingVision's recording did, so the offset is +5.
  await enter(page, "00:00:05.000");

  await expect(ready(page)).toHaveAttribute("data-offset-seconds", "5");
  expect((await events(page)).at(-1)).toMatchObject({
    offsetSeconds: 5,
    confirmedVideoTimeSeconds: 5,
  });
});

test("a first point earlier in the video than in the source gives a negative offset", async ({
  page,
}) => {
  await open(page);

  // Marked at 12s against a 10s anchor: the file begins BEFORE the source's
  // clock did. A negative offset is valid and must not be clamped to zero.
  await enter(page, "00:00:12.000");

  await expect(ready(page)).toHaveAttribute("data-offset-seconds", "-2");
  expect((await events(page)).at(-1)!.offsetSeconds).toBeLessThan(0);
});

test("a correction recomputes from the anchor, so repeating one never drifts", async ({
  page,
}) => {
  await open(page);

  // The same position entered three times, with detours in between, has to
  // produce one offset — the pure module derives it from the source anchor and
  // never from the offset it produced last time.
  const offsets: (string | null)[] = [];
  for (const time of ["00:00:06.000", "00:00:09.000", "00:00:06.000"]) {
    await enter(page, time);
    await expect(ready(page)).toBeVisible();
    offsets.push(await ready(page).getAttribute("data-offset-seconds"));
  }
  expect(offsets[0]).toBe(offsets[2]);
  expect(offsets[0]).toBe("4");
});

/* -------------------------------------------------------------------------
 * Zero
 * ---------------------------------------------------------------------- */

test("a TYPED zero is held back until it is confirmed", async ({ page }) => {
  await open(page, { scenario: "zeroable" });

  await enter(page, "00:00:00.000");
  await expect(page.getByTestId("alignment-zero-confirm")).toBeVisible();
  await expect(ready(page)).toHaveCount(0);
  expect((await events(page)).at(-1)).toBeNull();

  await page.getByTestId("alignment-zero-yes").click();
  await expect(page.getByTestId("alignment-zero-confirm")).toHaveCount(0);
  await expect(ready(page)).toBeVisible();
  expect((await events(page)).at(-1)).toMatchObject({
    confirmedVideoTimeSeconds: 0,
  });
});

test("a SELECTED zero goes through the same confirmation", async ({ page }) => {
  await open(page, { scenario: "zeroable" });

  // Home on the scrub rail parks the playhead on frame zero; Use current time
  // then writes a zero nobody typed. It must not be a shortcut past the ask.
  await page.getByTestId("alignment-scrub").focus();
  await page.keyboard.press("Home");
  await page.getByTestId("alignment-use-current").click();

  await expect(field(page)).toHaveValue("00:00:00.000");
  await expect(page.getByTestId("alignment-zero-confirm")).toBeVisible();
  expect((await events(page)).at(-1)).toBeNull();

  await page.getByTestId("alignment-zero-yes").click();
  await expect(ready(page)).toBeVisible();
});

test("editing away from a confirmed zero and back asks again", async ({
  page,
}) => {
  await open(page, { scenario: "zeroable" });

  await enter(page, "00:00:00.000");
  await page.getByTestId("alignment-zero-yes").click();
  await expect(ready(page)).toBeVisible();

  await enter(page, "00:00:00.400");
  await expect(page.getByTestId("alignment-zero-confirm")).toHaveCount(0);

  await enter(page, "00:00:00.000");
  await expect(page.getByTestId("alignment-zero-confirm")).toBeVisible();
  expect((await events(page)).at(-1)).toBeNull();
});

/* -------------------------------------------------------------------------
 * Coverage and the end boundaries
 * ---------------------------------------------------------------------- */

test("the exact end boundary is covered, and one step past it is not", async ({
  page,
}) => {
  await open(page);

  // videoEnd = confirmed + 85 against a 100s file: 15.000 lands exactly on the
  // last frame, 15.050 is inside the tenth-of-a-second tolerance, 16.000 is
  // genuinely past the end.
  await enter(page, "00:00:15.000");
  await expect(ready(page)).toBeVisible();

  await enter(page, "00:00:15.050");
  await expect(ready(page)).toBeVisible();

  await enter(page, "00:00:16.000");
  await expect(errorStrip(page)).toHaveAttribute(
    "data-error-code",
    "insufficient_coverage",
  );
});

test("the start boundary is covered to the tolerance and refused beyond it", async ({
  page,
}) => {
  await open(page);

  // videoStart = confirmed - 5: the earliest known source instant is a shot
  // five seconds before the first point, so 5.000 puts it exactly on frame
  // zero and 4.950 inside tolerance. 4.500 would need half a second of video
  // that does not exist.
  await enter(page, "00:00:05.000");
  await expect(ready(page)).toBeVisible();

  await enter(page, "00:00:04.950");
  await expect(ready(page)).toBeVisible();

  await enter(page, "00:00:04.500");
  await expect(errorStrip(page)).toHaveAttribute(
    "data-error-code",
    "insufficient_coverage",
  );
});

test("the too-short refusal keeps the time that was entered", async ({
  page,
}) => {
  await open(page);

  await enter(page, "00:00:16.123");
  await expect(errorStrip(page)).toHaveAttribute(
    "data-error-code",
    "insufficient_coverage",
  );
  await expect(errorStrip(page)).toContainText("not long enough");

  // The whole point: a carefully scrubbed position survives the refusal, so
  // the fix is a nudge rather than starting the hunt again.
  await expect(field(page)).toHaveValue("00:00:16.123");

  await enter(page, "00:00:15.000");
  await expect(errorStrip(page)).toHaveCount(0);
  await expect(ready(page)).toBeVisible();
});

test("a malformed time is an alignment refusal, never a coverage one", async ({
  page,
}) => {
  await open(page);

  await enter(page, "00:90:00.000");
  await expect(errorStrip(page)).toHaveAttribute(
    "data-error-code",
    "invalid_alignment",
  );
  await expect(errorStrip(page)).not.toContainText("not long enough");
});

test("the last point can be previewed at the position the alignment implies", async ({
  page,
}) => {
  await open(page);

  await enter(page, "00:00:05.000");
  const preview = page.getByTestId("alignment-preview-last");
  // requiredVideoEnd = 5 + 85 = 90; the preview starts six seconds earlier.
  await expect(preview).toHaveAttribute("data-target-seconds", "84");

  await preview.click();
  // The clip is two seconds long, so the seek clamps to its end — which still
  // proves the seek happened and went where the alignment pointed.
  expect(
    await page.evaluate(() =>
      (window as unknown as AlignmentHarnessWindow).playheadSeconds(),
    ),
  ).toBeGreaterThan(1.5);
});

/* -------------------------------------------------------------------------
 * Correction
 * ---------------------------------------------------------------------- */

test("correction preloads the saved time and refuses to save a no-op", async ({
  page,
}) => {
  await open(page, { scenario: "correction", mode: "align" });

  await expect(field(page)).toHaveValue("00:00:05.000");
  await expect(page.getByTestId("alignment-no-change")).toBeVisible();
  await expect(ready(page)).toHaveCount(0);
  expect(await events(page)).toEqual([null]);

  // Re-typing the identical value is still a no-op. So is leaving and
  // returning to it.
  await enter(page, "00:00:05.000");
  await expect(page.getByTestId("alignment-no-change")).toBeVisible();

  await enter(page, "00:00:06.000");
  await expect(page.getByTestId("alignment-no-change")).toHaveCount(0);
  await expect(ready(page)).toBeVisible();

  await enter(page, "00:00:05.000");
  await expect(page.getByTestId("alignment-no-change")).toBeVisible();
  expect((await events(page)).at(-1)).toBeNull();
});

/* -------------------------------------------------------------------------
 * Source timing
 * ---------------------------------------------------------------------- */

test("a match with no first-point timestamp says so and invents nothing", async ({
  page,
}) => {
  await open(page, { scenario: "missing" });

  const notice = page.getByTestId("alignment-timing-missing");
  await expect(notice).toHaveAttribute(
    "data-error-code",
    "missing_source_timing",
  );
  await expect(notice).toContainText("missing the timing data");
  // The data problem must never borrow the short-file copy.
  await expect(notice).not.toContainText("not long enough");

  // Nothing can be submitted, and no timestamp appears anywhere on the step.
  await enter(page, "00:00:05.000");
  await expect(ready(page)).toHaveCount(0);
  await expect(page.getByTestId("alignment-anchor-source")).toHaveCount(0);
  expect((await events(page)).at(-1) ?? null).toBeNull();
});

test("untimed interior points and shots are counted, named, and not blocking", async ({
  page,
}) => {
  await open(page, { scenario: "untimed" });

  const notice = page.getByTestId("alignment-untimed");
  await expect(notice).toHaveAttribute("data-untimed-points", "1");
  await expect(notice).toHaveAttribute("data-untimed-shots", "1");
  await expect(notice).toContainText("no timestamp");

  await enter(page, "00:00:05.000");
  await expect(ready(page)).toBeVisible();
});

/* -------------------------------------------------------------------------
 * Playback
 * ---------------------------------------------------------------------- */

test("keyboard seeking moves the playhead by a fine step, a second, and a jump", async ({
  page,
}) => {
  await open(page);

  const scrub = page.getByTestId("alignment-scrub");
  await scrub.focus();
  await expect(scrub).toBeFocused();

  await page.keyboard.press("Home");
  const start = await page.evaluate(() =>
    (window as unknown as AlignmentHarnessWindow).playheadSeconds(),
  );
  expect(start).toBeCloseTo(0, 2);

  // Ten fine steps at a thirtieth each is a third of a second.
  for (let i = 0; i < 10; i += 1) await page.keyboard.press("ArrowRight");
  const fine = await page.evaluate(() =>
    (window as unknown as AlignmentHarnessWindow).playheadSeconds(),
  );
  expect(fine).toBeGreaterThan(0.2);
  expect(fine).toBeLessThan(0.5);

  // Shift is the coarse step, and the clip is two seconds long.
  await page.keyboard.press("Shift+ArrowRight");
  const coarse = await page.evaluate(() =>
    (window as unknown as AlignmentHarnessWindow).playheadSeconds(),
  );
  expect(coarse).toBeGreaterThan(fine + 0.9);

  // End clamps to the media rather than running past it.
  await page.keyboard.press("End");
  const end = await page.evaluate(() =>
    (window as unknown as AlignmentHarnessWindow).playheadSeconds(),
  );
  expect(end).toBeGreaterThan(1.5);

  await page.keyboard.press("PageDown");
  expect(
    await page.evaluate(() =>
      (window as unknown as AlignmentHarnessWindow).playheadSeconds(),
    ),
  ).toBeCloseTo(0, 2);

  // The scrub control reports itself to a screen reader in the same clock the
  // field uses, not in raw seconds.
  await expect(scrub).toHaveAttribute("aria-valuetext", /^00:00:00\.\d{3}$/);
});

test("a rejected play() is a notice, not a media error", async ({ page }) => {
  await open(page);

  for (const name of ["NotAllowedError", "AbortError"] as const) {
    await page.evaluate(
      (reason) =>
        (window as unknown as AlignmentHarnessWindow).rejectPlay(reason),
      name,
    );
    await page.getByTestId("alignment-play").click();

    const notice = page.getByTestId("alignment-play-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Press play again");
    // The file is fine, and the step must not say otherwise.
    await expect(page.getByTestId("alignment-media-error")).toHaveCount(0);
    await expect(notice).not.toContainText("can't be played");
  }

  // Recovering is the same control, and the alignment field never noticed.
  await page.evaluate(() =>
    (window as unknown as AlignmentHarnessWindow).restorePlay(),
  );
  await page.getByTestId("alignment-play").click();
  await expect(page.getByTestId("alignment-play-notice")).toHaveCount(0);
});

test("a media error is an alert, and does not masquerade as a play refusal", async ({
  page,
}) => {
  await open(page);

  await page.evaluate(() =>
    (window as unknown as AlignmentHarnessWindow).failMedia(),
  );

  const alert = page.getByTestId("alignment-media-error");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("can't be played here");
  await expect(page.getByTestId("alignment-play-notice")).toHaveCount(0);
  // A dead element cannot be scrubbed or sampled.
  await expect(page.getByTestId("alignment-use-current")).toBeDisabled();
  await expect(page.getByTestId("alignment-play")).toBeDisabled();
});

test("a saved attachment plays from its URL with the same labelled controls", async ({
  page,
}) => {
  await open(page, { scenario: "correction", mode: "align", source: "saved" });

  await expect(page.getByTestId("alignment-video")).toHaveAttribute(
    "src",
    "/fixtures/h264-faststart.mp4",
  );
  await expect(page.getByRole("button", { name: "Play" })).toBeEnabled();
  await expect(
    page.getByRole("slider", { name: "Scrub the video" }),
  ).toHaveCount(1);
  await expect(field(page)).toHaveValue("00:00:05.000");
});

/* -------------------------------------------------------------------------
 * Network
 * ---------------------------------------------------------------------- */

test("marking a first point issues no network request at all", async ({
  page,
}) => {
  await open(page);

  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await enter(page, "00:00:05.000");
  await expect(ready(page)).toBeVisible();
  await page.getByTestId("alignment-preview-last").click();
  await enter(page, "00:00:16.000");
  await expect(errorStrip(page)).toBeVisible();
  await page.waitForTimeout(250);

  // `blob:` is the element reading the local file's object URL, which never
  // leaves the renderer. Anything with a real scheme would be a transfer or a
  // write, and both belong to the orchestration step.
  expect(requests.filter((url) => !url.startsWith("blob:"))).toEqual([]);
});

/* -------------------------------------------------------------------------
 * webpack plumbing
 * ---------------------------------------------------------------------- */

const webpack = (
  nextWebpack as unknown as {
    webpack: (
      config: unknown,
      callback: (error: Error | null, stats: WebpackStats) => void,
    ) => void;
  }
).webpack;

type WebpackStats = { toJson(): { errors?: unknown[] } };
