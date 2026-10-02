import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

import type { FileStepHarnessWindow } from "./fixtures/match-video-file-step-window";

/**
 * The attachment file step, in a real browser.
 *
 * Two things here can only be proven with a browser and are exactly the two
 * that would ship broken otherwise:
 *
 *   1. **Nothing uploads.** This is a selection step; transport belongs to a
 *      later one. The spec records every request the page makes after it
 *      hydrates and asserts there are none — "checked" beside a 6 GB file must
 *      not mean "sent".
 *   2. **A stale probe cannot win.** Picking a second file while the first is
 *      still being inspected must leave the second on screen, and must never
 *      announce the first as the selection.
 *
 * The decoded-frame/seek check is also browser-only by nature: the container
 * parse is pure and runs on the server too, but whether a decoder exists for
 * the codec is a property of this browser and nothing else.
 */

let server: Server;
let origin: string;

const FIXTURES = resolve("tests/fixtures/match-video");

/** Every generated clip is exactly sixty frames at 30 fps. */
const FIXTURE_DURATION_SECONDS = 2;

const FIXTURE_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
};

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "match-video-file-step-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/match-video-file-step-harness.tsx"),
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
      // The fixture directory is fixed and the name is matched against it, so
      // a traversal attempt simply fails to read.
      const extension = name.slice(name.lastIndexOf("."));
      try {
        const bytes = readFileSync(join(FIXTURES, name));
        response.setHeader(
          "content-type",
          FIXTURE_TYPES[extension] ?? "application/octet-stream",
        );
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

async function open(page: Page, mode: "add" | "replace" = "add") {
  await page.goto(`${origin}/?mode=${mode}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

/** Select a fixture through the hook, as a drop or a browse ultimately does. */
async function selectFixture(page: Page, fixture: string, name: string) {
  await page.evaluate(
    ([f, n]) => {
      const harness = window as unknown as FileStepHarnessWindow;
      harness.selectFile(harness.fileFrom(f, n));
    },
    [fixture, name] as const,
  );
}

function facts(page: Page) {
  return page.getByTestId("attachment-file-facts");
}

function errorStrip(page: Page) {
  return page.getByTestId("attachment-file-error");
}

async function selectionEvents(page: Page) {
  return page.evaluate(
    () => (window as unknown as FileStepHarnessWindow).selectionEvents,
  );
}

/* -------------------------------------------------------------------------
 * Choose, drop, remove, reselect
 * ---------------------------------------------------------------------- */

test("browsing to a playable file shows its name, size and duration, and clears prior alignment first", async ({
  page,
}) => {
  await open(page);

  await page
    .getByTestId("attachment-file-input")
    .setInputFiles(join(FIXTURES, "h264-faststart.mp4"));

  await expect(page.getByTestId("attachment-file-name")).toHaveText(
    "h264-faststart.mp4",
  );
  await expect(facts(page)).toContainText("0:00:02");
  await expect(facts(page)).toContainText("KB");
  await expect(facts(page)).toContainText("checked");
  await expect(page.getByRole("button", { name: "Remove video" })).toHaveCount(
    1,
  );

  // The null comes FIRST: the moment a new file is in play, an alignment
  // measured against the old one is void, not merely out of date.
  const events = await selectionEvents(page);
  expect(events[0]).toBeNull();
  expect(events[events.length - 1]).toMatchObject({
    filename: "h264-faststart.mp4",
    contentType: "video/mp4",
  });
  expect(events[events.length - 1]!.durationSeconds).toBeCloseTo(
    FIXTURE_DURATION_SECONDS,
    1,
  );
});

test("dropping a file selects it, and the zone lights while a file is over it", async ({
  page,
}) => {
  await open(page);
  const zone = page.getByTestId("attachment-drop-zone");

  const transfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(
      (window as unknown as FileStepHarnessWindow).fileFrom(
        "vp9.webm",
        "second-set.webm",
      ),
    );
    return dt;
  });

  await zone.dispatchEvent("dragover", { dataTransfer: transfer });
  await expect(zone).toHaveClass(/border-\[var\(--blue\)\]/);

  await zone.dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.getByTestId("attachment-file-name")).toHaveText(
    "second-set.webm",
  );
  await expect(facts(page)).toContainText("0:00:02");
});

test("removing clears the selection, and the same file can be chosen again", async ({
  page,
}) => {
  await open(page);
  const input = page.getByTestId("attachment-file-input");

  await input.setInputFiles(join(FIXTURES, "vp9.webm"));
  await expect(page.getByTestId("attachment-file-name")).toHaveText("vp9.webm");

  await page.getByRole("button", { name: "Remove video" }).click();
  await expect(page.getByTestId("attachment-drop-zone")).toBeVisible();
  await expect(page.getByTestId("attachment-file-name")).toHaveCount(0);
  expect((await selectionEvents(page)).at(-1)).toBeNull();

  // The input is cleared on change, so re-picking the identical file still
  // fires. Without that the second pick is silent and the step looks stuck.
  await input.setInputFiles(join(FIXTURES, "vp9.webm"));
  await expect(page.getByTestId("attachment-file-name")).toHaveText("vp9.webm");
});

/* -------------------------------------------------------------------------
 * Refusals
 * ---------------------------------------------------------------------- */

test("an AVI is refused on its extension alone, with the MP4 guidance", async ({
  page,
}) => {
  await open(page);
  await selectFixture(page, "h264-faststart.mp4", "match.avi");

  await expect(errorStrip(page)).toHaveAttribute(
    "data-error-code",
    "unsupported_media",
  );
  await expect(errorStrip(page)).toContainText("Export it as an MP4");
  // The zone stays: the retry is the control that failed.
  await expect(page.getByTestId("attachment-drop-zone")).toBeVisible();
});

test("the decoded-frame and seek check refuses media no decoder will take", async ({
  page,
}) => {
  await open(page);

  // Reached directly: every owned fixture both parses AND plays here, which
  // is what makes them fixtures. The gate exists for the file that does only
  // the first — the next step asks the athlete to scrub this recording, and a
  // container that parses into a black rectangle is found out too late there.
  const refused = await page.evaluate(() =>
    (window as unknown as FileStepHarnessWindow).confirmPlayable(
      new Blob([new Uint8Array(4096)], { type: "video/mp4" }),
    ),
  );
  expect(refused).toEqual({ ok: false, detail: "decode_unavailable" });

  const accepted = await page.evaluate(
    () =>
      (window as unknown as FileStepHarnessWindow).confirmPlayable(
        (window as unknown as FileStepHarnessWindow).fileFrom(
          "vp9.webm",
          "kept.webm",
        ),
      ),
    // A real clip decodes a frame AND completes the verification seek.
  );
  expect(accepted.ok).toBe(true);
});

test("a Matroska file gets its content type from the extension, not from the browser", async ({
  page,
}) => {
  await open(page);

  // Chromium reports `""` for a `.mkv`, and the reservation endpoint refuses
  // an empty content type with `content_type_format`. Substituting from the
  // already-validated extension is what keeps that round trip from happening.
  const reported = await page.evaluate(
    () =>
      (window as unknown as FileStepHarnessWindow).fileFrom(
        "vp9.mkv",
        "match.mkv",
      ).type,
  );
  expect(reported).toBe("");

  await selectFixture(page, "vp9.mkv", "match.mkv");
  await expect(page.getByTestId("attachment-file-name")).toHaveText(
    "match.mkv",
  );
  expect((await selectionEvents(page)).at(-1)).toMatchObject({
    contentType: "video/x-matroska",
  });
});

test("an audio-only file is refused: a readable container is not a video", async ({
  page,
}) => {
  await open(page);
  await selectFixture(page, "audio-only.webm", "match.webm");

  await expect(errorStrip(page)).toHaveAttribute(
    "data-error-code",
    "unsupported_media",
  );
});

test("an empty file and an oversized file are refused without reading the file", async ({
  page,
}) => {
  await open(page);

  await page.evaluate(() =>
    (window as unknown as FileStepHarnessWindow).selectFile(
      new File([], "match.mp4", { type: "video/mp4" }),
    ),
  );
  await expect(errorStrip(page)).toHaveAttribute(
    "data-error-code",
    "empty_file",
  );
  await expect(errorStrip(page)).toContainText("This file is empty");

  await page.evaluate(() => {
    const file = new File([new Uint8Array(16)], "match.mp4", {
      type: "video/mp4",
    });
    Object.defineProperty(file, "size", { value: 8_000_000_000 });
    (window as unknown as FileStepHarnessWindow).selectFile(file);
  });
  await expect(errorStrip(page)).toHaveAttribute(
    "data-error-code",
    "file_too_large",
  );
  await expect(errorStrip(page)).toContainText("under 8 GB");

  expect(await selectionEvents(page)).toEqual([null, null]);
});

/* -------------------------------------------------------------------------
 * Stale probes
 * ---------------------------------------------------------------------- */

test("a probe for an abandoned file can never populate the step", async ({
  page,
}) => {
  await open(page);

  // Two selections in one tick: the first is mid-inspection when the second
  // supersedes it. The first must never reach the screen or the callback.
  await page.evaluate(() => {
    const harness = window as unknown as FileStepHarnessWindow;
    harness.selectFile(harness.fileFrom("h264.mov", "abandoned.mov"));
    harness.selectFile(harness.fileFrom("vp9.webm", "kept.webm"));
  });

  await expect(page.getByTestId("attachment-file-name")).toHaveText(
    "kept.webm",
  );
  // Give the abandoned probe room to finish late and try to win.
  await page.waitForTimeout(500);
  await expect(page.getByTestId("attachment-file-name")).toHaveText(
    "kept.webm",
  );

  const events = await selectionEvents(page);
  expect(events.filter((e) => e !== null).map((e) => e!.filename)).toEqual([
    "kept.webm",
  ]);
});

test("a refusal for an abandoned file cannot overwrite a good selection", async ({
  page,
}) => {
  await open(page);

  await page.evaluate(() => {
    const harness = window as unknown as FileStepHarnessWindow;
    harness.selectFile(new File([], "abandoned.mp4", { type: "video/mp4" }));
    harness.selectFile(harness.fileFrom("vp9.webm", "kept.webm"));
  });

  await expect(page.getByTestId("attachment-file-name")).toHaveText(
    "kept.webm",
  );
  await page.waitForTimeout(500);
  await expect(errorStrip(page)).toHaveCount(0);
});

/* -------------------------------------------------------------------------
 * Keyboard and network
 * ---------------------------------------------------------------------- */

test("the drop zone and remove control are reachable and operable from the keyboard", async ({
  page,
}) => {
  await open(page);

  await page.evaluate(() => {
    const harness = window as unknown as FileStepHarnessWindow;
    harness.inputClicks = 0;
    document
      .querySelector('[data-testid="attachment-file-input"]')!
      .addEventListener("click", () => (harness.inputClicks! += 1));
  });

  const zone = page.getByTestId("attachment-drop-zone");
  await zone.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press(" ");
  expect(
    await page.evaluate(
      () => (window as unknown as FileStepHarnessWindow).inputClicks,
    ),
  ).toBe(2);

  await selectFixture(page, "vp9.webm", "kept.webm");
  await expect(page.getByTestId("attachment-file-name")).toBeVisible();

  const remove = page.getByRole("button", { name: "Remove video" });
  await remove.focus();
  await expect(remove).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("attachment-drop-zone")).toBeVisible();
});

test("selecting a file issues no network request at all", async ({ page }) => {
  await open(page);

  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));

  await selectFixture(page, "h264-faststart.mp4", "match.mp4");
  await expect(page.getByTestId("attachment-file-name")).toBeVisible();

  await selectFixture(page, "h264-faststart.mp4", "refused.avi");
  await expect(errorStrip(page)).toBeVisible();

  await page.getByTestId("attachment-drop-zone").click({ trial: true });
  await page.waitForTimeout(250);

  // `blob:` entries are the `<video>` elements reading the object URLs the
  // checks and the still open — those never leave the renderer. Anything with
  // a real scheme would be a transfer, and there must not be one: transport
  // belongs to the orchestration step, not to picking a file.
  expect(requests.filter((url) => !url.startsWith("blob:"))).toEqual([]);
  expect(requests.some((url) => url.startsWith("blob:"))).toBe(true);
});

/* -------------------------------------------------------------------------
 * No vendor gates
 * ---------------------------------------------------------------------- */

test("replace mode changes the copy and nothing else", async ({ page }) => {
  await open(page, "replace");
  await expect(page.getByTestId("attachment-drop-zone")).toHaveAttribute(
    "aria-label",
    "Drop the replacement video here, or browse",
  );

  // The checks are identical — a replacement is refused for the same reasons.
  await selectFixture(page, "audio-only.webm", "match.webm");
  await expect(errorStrip(page)).toHaveAttribute(
    "data-error-code",
    "unsupported_media",
  );
});

test("the step states no resolution or frame-rate requirement", async ({
  page,
}) => {
  await open(page);
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/1080p|fps|frame rate/i);
  expect(body).toContain("The whole match");
  expect(body).toContain("Under 8 GB");
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
