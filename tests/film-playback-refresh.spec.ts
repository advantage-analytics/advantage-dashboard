import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

import type { FilmRefreshHarnessWindow } from "./fixtures/film-playback-refresh-window";

/**
 * The credential refresh, in the two players (T26).
 *
 * `film-attachment-playback.spec.ts` owns the decisions: when to refresh, what
 * a replacement means, what may never loop. None of that has an element in it.
 * This spec owns the half that only a browser can answer — whether the
 * `<video>` follows, and whether the viewer notices:
 *
 *   1. **A silent refresh moves nobody.** Paused at 0.30 is still paused at
 *      0.30 afterwards, and playing is still playing — on a different URL.
 *   2. **A correction moves the SELECTION, not just the playhead.** A viewer
 *      sitting before the first point has no row lit; after the correction the
 *      film is on that point's new start and the row is lit. Preserving the raw
 *      second would have left both wrong.
 *   3. **A replacement lands on a stop**, not on a second that meant something
 *      in footage nobody is playing any more.
 *   4. **A terminal state is a sentence, and a retry only where one helps.**
 *      Removed and denied offer no button; an unreachable store does, and
 *      pressing it recovers.
 *   5. **Both surfaces, one credential.** The room and the report player swap
 *      together, the room keeps its playhead through the swap, and the exit
 *      hand-off still lands.
 *   6. **The Advantage Intelligence lineage is untouched.** No request leaves
 *      the tab, and its reload panel is still what a media error draws.
 *   7. **Leaving cancels.** An unmounted tab asks for nothing.
 *
 * The scenario lives in the MATCH ID, so two parallel tests never share server
 * state, and every refresh response is HELD until the spec releases it — the
 * schedule's floor is one second and a test that had to finish its setup
 * inside that would be a flake waiting to happen.
 */

let server: Server;
let origin: string;

const FIXTURES = resolve("tests/fixtures/match-video");

/** Every `/video` request the server saw, per match. */
const polls = new Map<string, number>();
/** Responses parked until the spec releases them, per match. */
const held = new Map<string, (() => void)[]>();
/**
 * Matches the spec has released. A LATCH, not an event: the schedule fires a
 * second after mount and a test's setup can finish either side of that, so a
 * release that only flushed what had already arrived would park the next
 * request forever roughly half the time.
 */
const released = new Set<string>();

/* -------------------------------------------------------------------------
 * The film's geometry
 *
 * Source times 1.7 / 1.85 / 1.95 on a 2.000s file. `POINT_BUFFER_SECONDS` is
 * 1.5, so the padded windows start at:
 *
 *   offset  0      (as rendered)   0.20 · 0.35 · 0.45
 *   offset -0.05   (corrected)     0.25 · 0.40 · 0.50
 *   offset  0.05   (replacement)   0.15 · 0.30 · 0.40
 *
 * A stop counts as reached `REACHED_EPSILON_SECONDS` (0.1) early, so film time
 * below 0.10 is before every window and lights no row — which is the state the
 * correction test starts from.
 *
 * Written out rather than computed with `filmStops`, so a change to the
 * timeline's arithmetic fails this spec instead of moving with it.
 * ---------------------------------------------------------------------- */

const ATTACHMENT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_ATTACHMENT = "ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee";
/** A refreshed credential's own lifetime — long enough that one pass is one pass. */
const FRESH_TTL_MS = 30 * 60 * 1000;

interface Answer {
  status: number;
  body: unknown;
}

function credential(
  poll: number,
  overrides: { id?: string; version?: number; offsetSeconds?: number } = {},
): Answer {
  return {
    status: 200,
    body: {
      attachment: {
        id: overrides.id ?? ATTACHMENT,
        version: overrides.version ?? 1,
        offsetSeconds: overrides.offsetSeconds ?? 0,
        confirmedVideoTimeSeconds: 0,
        durationSeconds: 2,
        contentType: "video/mp4",
        filename: "spring-invitational-r1.mp4",
        playbackUrl: `/fixtures/h264-faststart.mp4?cred=${poll}`,
        playbackExpiresAt: new Date(Date.now() + FRESH_TTL_MS).toISOString(),
      },
    },
  };
}

/** What each scenario answers on its nth poll (1-based). */
function answerFor(matchId: string, poll: number): Answer {
  switch (matchId.split("-")[0]) {
    case "correct":
      return credential(poll, { version: 2, offsetSeconds: -0.05 });
    case "replace":
      return credential(poll, { id: OTHER_ATTACHMENT, offsetSeconds: 0.05 });
    case "removed":
      return { status: 200, body: { attachment: null } };
    case "denied":
      return { status: 403, body: { error: "forbidden" } };
    case "flaky":
      // The store could not be asked, once. The credential in hand has already
      // expired by then, so the hook goes straight to its terminal state with
      // the button — and the button is what the second poll answers.
      return poll === 1
        ? { status: 503, body: { error: "storage_unavailable" } }
        : credential(poll);
    default:
      return credential(poll);
  }
}

/* -------------------------------------------------------------------------
 * Server
 * ---------------------------------------------------------------------- */

type WebpackStats = { toJson: () => { errors?: unknown[] } };
const webpack = (
  nextWebpack as unknown as {
    webpack: (
      config: unknown,
      callback: (error: Error | null, stats: WebpackStats) => void,
    ) => void;
  }
).webpack;

function serveClip(
  response: ServerResponse,
  name: string,
  range: string | undefined,
) {
  let bytes: Buffer;
  try {
    bytes = readFileSync(join(FIXTURES, name));
  } catch {
    response.statusCode = 404;
    response.end();
    return;
  }
  response.setHeader("content-type", "video/mp4");
  response.setHeader("accept-ranges", "bytes");
  // Chromium asks for ranges the moment it decides to seek, and a server that
  // answers 200 to every one of them makes seeking unreliable in a way that
  // would look like a bug in the code under test.
  const match = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
  if (match) {
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Number(match[2]) : bytes.length - 1;
    response.statusCode = 206;
    response.setHeader(
      "content-range",
      `bytes ${start}-${end}/${bytes.length}`,
    );
    response.end(bytes.subarray(start, end + 1));
    return;
  }
  response.end(bytes);
}

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "film-playback-refresh-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/film-playback-refresh-harness.tsx"),
        output: {
          path: outputPath,
          filename: "bundle.js",
          chunkFilename: "[name].chunk.js",
          publicPath: "/",
        },
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
            // Next's own runtime, not this feature's. The room still arrives in
            // its own chunk, which is the only property the tab depends on.
            "next/dynamic": resolve(
              "tests/fixtures/next-dynamic-browser-mock.tsx",
            ),
            // Two `NEXT_PUBLIC_` reads a plain bundle never substitutes.
            [resolve("src/lib/supabase/client.ts")]: resolve(
              "tests/fixtures/supabase-client-browser-mock.ts",
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

  // The real stylesheet: the centre play affordance is an absolutely
  // positioned overlay, and a click that lands somewhere else proves nothing.
  const styles = (
    await postcss([tailwind()]).process(
      readFileSync("src/app/globals.css", "utf8"),
      { from: resolve("src/app/globals.css") },
    )
  ).css;

  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    if (path.endsWith(".js")) {
      let bundle: Buffer;
      try {
        bundle = readFileSync(join(outputPath, path.slice(1)));
      } catch {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.end(bundle);
      return;
    }
    if (path === "/app.css") {
      response.setHeader("content-type", "text/css; charset=utf-8");
      response.end(styles);
      return;
    }
    if (path === "/__polls") {
      const matchId = url.searchParams.get("matchId") ?? "";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ polls: polls.get(matchId) ?? 0 }));
      return;
    }
    if (path === "/__release") {
      const matchId = url.searchParams.get("matchId") ?? "";
      released.add(matchId);
      for (const send of held.get(matchId) ?? []) send();
      held.set(matchId, []);
      response.end("ok");
      return;
    }
    if (path.startsWith("/fixtures/")) {
      serveClip(
        response,
        path.slice("/fixtures/".length),
        request.headers.range,
      );
      return;
    }

    const video = /^\/api\/matches\/([^/]+)\/video$/.exec(path);
    if (video) {
      const matchId = decodeURIComponent(video[1]);
      const poll = (polls.get(matchId) ?? 0) + 1;
      polls.set(matchId, poll);
      const answer = answerFor(matchId, poll);
      const send = () => {
        response.statusCode = answer.status;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(answer.body));
      };
      if (released.has(matchId)) send();
      else held.set(matchId, [...(held.get(matchId) ?? []), send]);
      return;
    }

    if (path === "/") {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(
        `<!doctype html><meta charset="utf-8"><title>film</title>` +
          `<link rel="stylesheet" href="/app.css">` +
          `<div id="root"></div><script src="/bundle.js"></script>`,
      );
      return;
    }

    response.statusCode = 404;
    response.end();
  });

  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no address");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

/* -------------------------------------------------------------------------
 * Page helpers
 * ---------------------------------------------------------------------- */

const REPORT = '[data-testid="film-player-video"]';
const ROOM = '[data-testid="film-room-video"]';

async function open(
  page: Page,
  matchId: string,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({ matchId, ...extra });
  await page.goto(`${origin}/?${params}`);
  await page.waitForSelector("[data-hydrated]");
  await page.waitForFunction(
    (selector) => {
      const el = document.querySelector<HTMLVideoElement>(selector);
      return !!el && el.readyState >= 1;
    },
    REPORT,
    { timeout: 10_000 },
  );
}

/** Move the playhead the way a viewer would end up somewhere: a real seek. */
async function seekTo(page: Page, selector: string, seconds: number) {
  await page.evaluate(
    ([sel, at]) => {
      const el = document.querySelector<HTMLVideoElement>(sel as string);
      if (el) el.currentTime = at as number;
    },
    [selector, seconds] as const,
  );
  await page.waitForFunction(
    ([sel, at]) => {
      const el = document.querySelector<HTMLVideoElement>(sel as string);
      return !!el && Math.abs(el.currentTime - (at as number)) < 0.02;
    },
    [selector, seconds] as const,
  );
}

async function release(page: Page, matchId: string) {
  await page.request.get(
    `${origin}/__release?matchId=${encodeURIComponent(matchId)}`,
  );
}

/** Wait for the element to be playing the credential from poll `n`. */
async function awaitCredential(page: Page, selector: string, poll: number) {
  await page.waitForFunction(
    ([sel, want]) => {
      const el = document.querySelector<HTMLVideoElement>(sel as string);
      return !!el && el.src.includes(`cred=${want}`) && el.readyState >= 1;
    },
    [selector, poll] as const,
    { timeout: 10_000 },
  );
}

async function state(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector<HTMLVideoElement>(sel);
    return el ? { time: el.currentTime, paused: el.paused, src: el.src } : null;
  }, selector);
}

/** The point row the list is lighting, if any. */
async function playingRow(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const row = document.querySelector('[data-point-id][data-playing="true"]');
    return row?.getAttribute("data-point-id") ?? null;
  });
}

/* -------------------------------------------------------------------------
 * A silent refresh
 * ---------------------------------------------------------------------- */

test("a paused viewer is in the same place on the new credential", async ({
  page,
}) => {
  const matchId = "ok-paused";
  await open(page, matchId);

  await seekTo(page, REPORT, 0.3);
  expect(await playingRow(page)).toBe("b");

  await release(page, matchId);
  await awaitCredential(page, REPORT, 1);

  const after = await state(page, REPORT);
  expect(after?.paused).toBe(true);
  expect(after?.time).toBeCloseTo(0.3, 1);
  // Same alignment, so the row never moved either.
  expect(await playingRow(page)).toBe("b");
});

test("a playing viewer keeps playing across the swap", async ({ page }) => {
  const matchId = "ok-playing";
  await open(page, matchId);

  await seekTo(page, REPORT, 0.05);
  await page.getByRole("button", { name: "Play", exact: true }).first().click();
  await page.waitForFunction(
    (sel) => document.querySelector<HTMLVideoElement>(sel)?.paused === false,
    REPORT,
  );

  await release(page, matchId);
  await awaitCredential(page, REPORT, 1);

  // The intent survived: the element is playing again without a second click,
  // and it did not restart from the top.
  await page.waitForFunction(
    (sel) => document.querySelector<HTMLVideoElement>(sel)?.paused === false,
    REPORT,
    { timeout: 5000 },
  );
  const after = await state(page, REPORT);
  expect(after?.time).toBeGreaterThan(0.04);
});

/* -------------------------------------------------------------------------
 * A correction made somewhere else
 * ---------------------------------------------------------------------- */

test("a correction in another tab moves the playhead AND the selection", async ({
  page,
}) => {
  const matchId = "correct-tab";
  await open(page, matchId);

  // Before the first point's window opens (0.05): nothing is playing yet.
  await seekTo(page, REPORT, 0.02);
  expect(await playingRow(page)).toBeNull();

  await release(page, matchId);
  await awaitCredential(page, REPORT, 1);

  // The corrected stops start at 0.25 / 0.40 / 0.50, and the viewer had not
  // reached a point, so the first one is where they belong.
  await page.waitForFunction(
    (sel) =>
      Math.abs(
        (document.querySelector<HTMLVideoElement>(sel)?.currentTime ?? 0) -
          0.25,
      ) < 0.03,
    REPORT,
    { timeout: 5000 },
  );
  expect(await playingRow(page)).toBe("a");
});

test("a replacement lands on a stop rather than on the old second", async ({
  page,
}) => {
  const matchId = "replace-one";
  await open(page, matchId);

  // Inside the third point's window (0.45 on the rendered alignment).
  await seekTo(page, REPORT, 0.46);
  expect(await playingRow(page)).toBe("c");

  await release(page, matchId);
  await awaitCredential(page, REPORT, 1);

  // The new footage puts that point's window at 0.40. The raw 0.46 is a second
  // in a file nobody is playing any more.
  await page.waitForFunction(
    (sel) =>
      Math.abs(
        (document.querySelector<HTMLVideoElement>(sel)?.currentTime ?? 0) - 0.4,
      ) < 0.03,
    REPORT,
    { timeout: 5000 },
  );
  expect(await playingRow(page)).toBe("c");
});

/* -------------------------------------------------------------------------
 * Terminal states
 * ---------------------------------------------------------------------- */

test("a deleted video says so, and offers no button that would not work", async ({
  page,
}) => {
  const matchId = "removed-one";
  await open(page, matchId);
  await release(page, matchId);

  const panel = page.locator('[data-testid="film-playback-problem"]');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-film-problem", "removed");
  await expect(panel.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expect(page.locator(REPORT)).toHaveCount(0);
});

test("a refused refresh is a lost-access sentence, not a reload prompt", async ({
  page,
}) => {
  const matchId = "denied-one";
  await open(page, matchId);
  await release(page, matchId);

  const panel = page.locator('[data-testid="film-playback-problem"]');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-film-problem", "denied");
  await expect(panel.getByRole("button", { name: "Try again" })).toHaveCount(0);
  // The provider lineage's panel is a different sentence and must not appear
  // on a match that has an attachment.
  await expect(page.locator('[data-testid="film-reload-panel"]')).toHaveCount(
    0,
  );
});

test("an unreachable store offers a retry, and the retry recovers", async ({
  page,
}) => {
  const matchId = "flaky-one";
  await open(page, matchId);
  await release(page, matchId);

  const panel = page.locator('[data-testid="film-playback-problem"]');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute("data-film-problem", "unreachable");

  await panel.getByRole("button", { name: "Try again" }).click();
  await release(page, matchId);

  await awaitCredential(page, REPORT, 2);
  await expect(
    page.locator('[data-testid="film-playback-problem"]'),
  ).toHaveCount(0);
});

/* -------------------------------------------------------------------------
 * The fullscreen room
 * ---------------------------------------------------------------------- */

test("the room swaps with the report player and hands the playhead back", async ({
  page,
}) => {
  const matchId = "ok-room";
  await open(page, matchId);
  await seekTo(page, REPORT, 0.3);

  await page
    .getByRole("button", { name: "Open the film room fullscreen" })
    .click();
  await page.waitForSelector(ROOM);
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector<HTMLVideoElement>(sel);
      return !!el && el.readyState >= 1 && Math.abs(el.currentTime - 0.3) < 0.1;
    },
    ROOM,
    { timeout: 10_000 },
  );

  await release(page, matchId);
  // One credential, both surfaces: the room and the player behind it move
  // together because they are reading one hook.
  await awaitCredential(page, ROOM, 1);
  await awaitCredential(page, REPORT, 1);

  const room = await state(page, ROOM);
  expect(room?.time).toBeCloseTo(0.3, 1);
  // The report player is the background surface: it kept the playhead and
  // stayed silent.
  const report = await state(page, REPORT);
  expect(report?.paused).toBe(true);
  expect(report?.time).toBeCloseTo(0.3, 1);

  // Leave. The room hands the playhead back as its exit starts.
  await seekTo(page, ROOM, 0.5);
  await page.keyboard.press("Escape");
  await expect(page.locator(ROOM)).toHaveCount(0);
  const handed = await state(page, REPORT);
  expect(handed?.time).toBeCloseTo(0.5, 1);
});

test("a room that is PLAYING keeps playing across the swap, and the player behind it stays silent", async ({
  page,
}) => {
  // T26 asserted the paused room only; this is the other half of `land()`.
  const matchId = "ok-room-playing";
  await open(page, matchId);
  await seekTo(page, REPORT, 0.05);

  await page
    .getByRole("button", { name: "Open the film room fullscreen" })
    .click();
  await page.waitForSelector(ROOM);
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector<HTMLVideoElement>(sel);
      return (
        !!el && el.readyState >= 1 && Math.abs(el.currentTime - 0.05) < 0.1
      );
    },
    ROOM,
    { timeout: 10_000 },
  );

  // The room's own transport, not the report player's.
  await page.getByRole("button", { name: "Play", exact: true }).last().click();
  await page.waitForFunction(
    (sel) => document.querySelector<HTMLVideoElement>(sel)?.paused === false,
    ROOM,
  );

  await release(page, matchId);
  await awaitCredential(page, ROOM, 1);
  await awaitCredential(page, REPORT, 1);

  // The intent survived the element swap: playing again with no second
  // press, and not from the top.
  await page.waitForFunction(
    (sel) => document.querySelector<HTMLVideoElement>(sel)?.paused === false,
    ROOM,
    { timeout: 5000 },
  );
  const room = await state(page, ROOM);
  expect(room?.time).toBeGreaterThan(0.04);

  // One sound track: the background player did not start playing too.
  const report = await state(page, REPORT);
  expect(report?.paused).toBe(true);
});

/* -------------------------------------------------------------------------
 * The lineage that has no refresh, and the tab that left
 * ---------------------------------------------------------------------- */

test("the Advantage Intelligence lineage asks for nothing at all", async ({
  page,
}) => {
  const matchId = "provider-quiet";
  await open(page, matchId, { lineage: "vendor-copy" });

  await seekTo(page, REPORT, 0.3);
  // Well past the schedule's one-second floor for a credential that, on the
  // attachment path, would already have been refreshed twice over.
  await page.waitForTimeout(2500);

  const { polls: count } = await (
    await page.request.get(`${origin}/__polls?matchId=${matchId}`)
  ).json();
  expect(count).toBe(0);
  expect((await state(page, REPORT))?.time).toBeCloseTo(0.3, 1);
});

test("the provider lineage still answers a media error with Reload", async ({
  page,
}) => {
  const matchId = "provider-broken";
  const params = new URLSearchParams({
    matchId,
    lineage: "vendor-copy",
    file: "not-a-file.mp4",
  });
  await page.goto(`${origin}/?${params}`);
  await page.waitForSelector("[data-hydrated]");

  const panel = page.locator('[data-testid="film-reload-panel"]');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Reload" })).toBeVisible();
  // And it is emphatically not the hook's panel: nothing on this path has a
  // credential to refresh.
  await expect(
    page.locator('[data-testid="film-playback-problem"]'),
  ).toHaveCount(0);

  const { polls: count } = await (
    await page.request.get(`${origin}/__polls?matchId=${matchId}`)
  ).json();
  expect(count).toBe(0);
});

test("an unmounted tab stops asking", async ({ page }) => {
  const matchId = "idle-unmount";
  // A credential with two and a half seconds to run before its lead window,
  // so there IS a scheduled refresh to cancel and the test is not just racing
  // the one-second floor.
  await open(page, matchId, { ttl: String(122_500) });

  await page.evaluate(() =>
    (window as unknown as FilmRefreshHarnessWindow).unmount(),
  );
  await expect(page.locator(REPORT)).toHaveCount(0);

  // Twice the schedule's floor, and then some.
  await page.waitForTimeout(2500);
  const { polls: count } = await (
    await page.request.get(`${origin}/__polls?matchId=${matchId}`)
  ).json();
  expect(count).toBe(0);
});
