import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

import type { TrimHarnessWindow } from "./fixtures/trim-step-window";

/**
 * Getting around the trim step, in a real browser.
 *
 * The step's navigation is three things a pure test cannot reach, because all
 * three are the video element's own behaviour:
 *
 *   1. **A jump is a seek, and a seek is clamped.** `+10s` asks the element for
 *      a position ten seconds on and the step clamps it to the clip. The
 *      fixture is two seconds long, so every jump here lands on the clamp —
 *      which is the assertion, not a compromise: the bug being guarded is a
 *      jump that runs past the media and leaves the player on a frame that
 *      does not exist.
 *   2. **`I` and `O` write the playhead into the form.** The cut takes the
 *      position the video is already at, with the other cut untouched. They
 *      are keys only — the step names them in a row of `Kbd` chips.
 *   3. **A key is refused on the far side of the other cut**, rather than
 *      clamped one frame off it, and refused from inside a camera question,
 *      whose arrows and letters are its own.
 *
 * The clip is 64x64, 30fps and exactly 2.000s; one frame is a thirtieth of a
 * second. The declared probe duration is the harness's, not the clip's, so the
 * clamp can be aimed at a number the media alone would not produce.
 */

let server: Server;
let origin: string;

const FIXTURES = resolve("tests/fixtures/match-video");

/** The fixture clip's real length, in seconds. */
const CLIP_SECONDS = 2;

/** One frame of it, which is the step's own `frameStep`. */
const FRAME = 1 / 30;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "trim-step-navigation-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/trim-step-harness.tsx"),
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

interface Options {
  /** What the probe declares, which is what every seek is clamped to. */
  duration?: number;
  start?: number;
  end?: number;
}

async function open(page: Page, options: Options = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) params.set(key, String(value));
  }
  await page.goto(`${origin}/?${params.toString()}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
  // Nothing is seekable until the element knows how long the file is.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const el = document.querySelector("video");
        return el && Number.isFinite(el.duration) ? el.duration : null;
      }),
    )
    .toBeCloseTo(CLIP_SECONDS, 1);
}

function playhead(page: Page) {
  return page.evaluate(() =>
    (window as unknown as TrimHarnessWindow).playheadSeconds(),
  );
}

/** Park the playhead and wait for the element to actually be there. */
async function park(page: Page, seconds: number) {
  await page.evaluate(
    (value) => (window as unknown as TrimHarnessWindow).seekTo(value),
    seconds,
  );
  await expect.poll(() => playhead(page)).toBeCloseTo(seconds, 2);
}

function trimEvents(page: Page) {
  return page.evaluate(
    () => (window as unknown as TrimHarnessWindow).trimEvents,
  );
}

/** The rail: the ink-900 track the filmstrip and the bracket sit on. */
function rail(page: Page) {
  return page.locator("div.relative.cursor-pointer.touch-none").first();
}

/** Press the rail at a fraction of its width. */
async function pressRail(page: Page, ratio: number) {
  const box = await rail(page).boundingBox();
  if (!box) throw new Error("the rail has no box");
  await page.mouse.click(box.x + box.width * ratio, box.y + box.height / 2);
}

function paused(page: Page) {
  return page.evaluate(() => document.querySelector("video")?.paused ?? true);
}

/** The step root. `tabIndex={-1}`, and the keys only fire from inside it. */
function stepRoot(page: Page) {
  return page.locator('div[tabindex="-1"]').first();
}

/* -------------------------------------------------------------------------
 * The jump buttons
 * ---------------------------------------------------------------------- */

test("the ten-second jump moves the playhead and stops at the end of the clip", async ({
  page,
}) => {
  await open(page);

  // The step paints its first frame at 0.001s, so the playhead starts at the
  // very top of the file.
  await expect.poll(() => playhead(page)).toBeLessThan(0.1);

  // A frame step is a thirtieth of a second: the jump below has to be visibly
  // a different order of movement, not a nudge that happens to go far.
  await page.getByRole("button", { name: "Forward one frame" }).click();
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.02);
  await expect.poll(() => playhead(page)).toBeLessThan(0.2);

  // +10s against a two-second clip: the seek clamps to the media rather than
  // running past it, which still proves the jump happened and which way.
  await page.getByRole("button", { name: "Forward ten seconds" }).click();
  await expect.poll(() => playhead(page)).toBeGreaterThan(1.5);
  await expect.poll(() => playhead(page)).toBeLessThanOrEqual(CLIP_SECONDS);

  // And back the other way, clamped at zero rather than negative.
  await page.getByRole("button", { name: "Back ten seconds" }).click();
  await expect.poll(() => playhead(page)).toBeLessThan(0.1);
  await expect.poll(() => playhead(page)).toBeGreaterThanOrEqual(0);
});

test("the jump clamps to the duration the step was told, not the media's", async ({
  page,
}) => {
  // A probe that declares one second of a two-second file. The clamp under
  // test is the step's own — if it were the element's, the playhead would run
  // on to 2.000 and the cut readouts would describe time nobody can trim.
  await open(page, { duration: 1, end: 1 });

  await page.getByRole("button", { name: "Forward ten seconds" }).click();
  await expect.poll(() => playhead(page)).toBeCloseTo(1, 1);
});

test("the arrow keys jump the same ten seconds, and Shift jumps a minute", async ({
  page,
}) => {
  await open(page);
  await stepRoot(page).focus();

  await page.keyboard.press("ArrowRight");
  await expect.poll(() => playhead(page)).toBeGreaterThan(1.5);

  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => playhead(page)).toBeLessThan(0.1);

  // A minute is past the end of anything this short; it must clamp, not fail.
  await page.keyboard.press("Shift+ArrowRight");
  await expect.poll(() => playhead(page)).toBeGreaterThan(1.5);
});

/* -------------------------------------------------------------------------
 * Setting a cut to the playhead
 * ---------------------------------------------------------------------- */

test("I and O set start and end to the playhead, each leaving the other cut alone", async ({
  page,
}) => {
  await open(page, { start: 0, end: CLIP_SECONDS });
  await stepRoot(page).focus();

  await park(page, 0.8);
  await page.keyboard.press("i");
  await expect.poll(async () => (await trimEvents(page)).length).toBe(1);
  let events = await trimEvents(page);
  expect(events[0].startSeconds).toBeCloseTo(0.8, 2);
  expect(events[0].endSeconds).toBe(CLIP_SECONDS);

  // O measures against the start the I key just wrote, not the initial props —
  // which is only true if the write went through the form and came back.
  await park(page, 1.4);
  await page.keyboard.press("o");
  await expect.poll(async () => (await trimEvents(page)).length).toBe(2);
  events = await trimEvents(page);
  expect(events[1].startSeconds).toBeCloseTo(0.8, 2);
  expect(events[1].endSeconds).toBeCloseTo(1.4, 2);
});

/* -------------------------------------------------------------------------
 * The far side of the other cut
 * ---------------------------------------------------------------------- */

test("I is refused once the playhead reaches the end handle, and works again inside the window", async ({
  page,
}) => {
  // An end cut at one second, with a second of clip left beyond it to get the
  // playhead past.
  await open(page, { start: 0, end: 1 });
  await stepRoot(page).focus();

  // Exactly on the end handle is already too far: a start there would be the
  // same instant as the end, and the step refuses rather than clamping.
  await park(page, 1);
  await page.keyboard.press("i");
  await park(page, 1.5);
  await page.keyboard.press("i");
  await page.waitForTimeout(250);
  expect(await trimEvents(page)).toEqual([]);

  // Back inside the window it writes, so the refusal is a fact about the
  // playhead and not a latch.
  await park(page, 0.5);
  await page.keyboard.press("i");
  await expect.poll(async () => (await trimEvents(page)).length).toBe(1);
  expect((await trimEvents(page))[0].startSeconds).toBeCloseTo(0.5, 2);
});

test("O is refused once the playhead reaches the start handle", async ({
  page,
}) => {
  await open(page, { start: 1, end: CLIP_SECONDS });
  await stepRoot(page).focus();

  await park(page, 1);
  await page.keyboard.press("o");
  await park(page, 0.5);
  await page.keyboard.press("o");
  await page.waitForTimeout(250);
  expect(await trimEvents(page)).toEqual([]);
});

test("the step's keys stay out of a camera question", async ({ page }) => {
  await open(page, { start: 0, end: CLIP_SECONDS });
  await park(page, 1);

  // A radio card is inside the step root, so its keydown bubbles to the step
  // handler — which must leave a radiogroup's arrows and letters alone.
  await page.getByRole("radio").first().focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("i");
  await page.waitForTimeout(250);

  expect(await playhead(page)).toBeCloseTo(1, 1);
  expect(await trimEvents(page)).toEqual([]);
});

/* -------------------------------------------------------------------------
 * The rail plays; the bracket does not drag
 * ---------------------------------------------------------------------- */

test("dragging along the rail walks the playhead, and releasing plays", async ({
  page,
}) => {
  await open(page, { start: 0, end: CLIP_SECONDS });
  const box = await rail(page).boundingBox();
  if (!box) throw new Error("the rail has no box");
  const y = box.y + box.height / 2;

  // Press near the head and sweep to three-quarters, holding throughout: the
  // playhead is expected to follow the pointer, not wait for the release.
  await page.mouse.move(box.x + box.width * 0.1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, y, { steps: 12 });
  await expect.poll(() => playhead(page)).toBeGreaterThan(1);
  // Still a look, not a play — and no cut has moved.
  expect(await paused(page)).toBe(true);
  expect(await trimEvents(page)).toEqual([]);

  await page.mouse.up();
  await expect.poll(() => paused(page)).toBe(false);
  expect(await trimEvents(page)).toEqual([]);
});

test("a press on the rail plays from there", async ({ page }) => {
  await open(page, { start: 0, end: CLIP_SECONDS });
  expect(await paused(page)).toBe(true);

  await pressRail(page, 0.5);

  // A click is a scrub of zero distance: it lands there and plays. Halfway
  // along a two-second clip, and playing moves it on, so the assertion is a
  // floor rather than an equality.
  await expect.poll(() => playhead(page)).toBeGreaterThan(0.7);
  await expect.poll(() => paused(page)).toBe(false);
});

test("a press INSIDE the kept window plays too, and moves neither cut", async ({
  page,
}) => {
  // The window covers the middle of the clip, so the press below lands inside
  // the bracket — where grabbing it used to drag both cuts together.
  await open(page, { start: 0.5, end: 1.5 });

  await pressRail(page, 0.5);

  await expect.poll(() => paused(page)).toBe(false);
  expect(await trimEvents(page)).toEqual([]);
});

test("dragging across the kept window moves nothing", async ({ page }) => {
  await open(page, { start: 0.5, end: 1.5 });
  const box = await rail(page).boundingBox();
  if (!box) throw new Error("the rail has no box");
  const y = box.y + box.height / 2;

  // A press in the middle of the bracket, dragged well to the left: the whole
  // window used to follow the pointer. Nothing but the two handles drags now.
  await page.mouse.move(box.x + box.width * 0.5, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, y, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(250);

  expect(await trimEvents(page)).toEqual([]);
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
