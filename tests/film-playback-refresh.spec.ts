import { expect, test, type Page, type Route } from "@playwright/test";
import { createServer, type Server, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

import type { FilmRefreshHarnessWindow } from "./fixtures/film-playback-refresh-window";
import { REFOLLOW_JUMP_INSET_PX } from "../src/components/dashboard/matches/match-detail/film/point-list";

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
            // No router in a bare createRoot; `useSearchParams` answers null.
            "next/navigation": resolve(
              "tests/fixtures/next-navigation-browser-mock.ts",
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
/** The room's own lane — inside its bottom-block positioning layer. */
const ROOM_LANE = '[data-film-chrome] [role="slider"][aria-label="Seek"]';
const ROOM_PREVIEW = `${ROOM_LANE} [data-testid="film-seek-preview"]`;
const ROOM_PREVIEW_VIDEO = `${ROOM_LANE} [data-testid="film-seek-preview-video"]`;

/** Hover the room's lane at `fraction` of its width; returns the lane's box. */
async function hoverRoomLane(page: Page, fraction: number) {
  const box = await page.locator(ROOM_LANE).boundingBox();
  if (!box) throw new Error("no room lane");
  await page.mouse.move(box.x + fraction * box.width, box.y + box.height / 2);
  await expect(page.locator(ROOM_PREVIEW)).not.toHaveAttribute(
    "data-state",
    "closed",
  );
  return box;
}

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
  // `currentTime` reads the target the moment it is assigned, before the
  // seek has landed; `seeking` stays true until it has. Waiting on both is
  // what lets the next assertion read a row the `seeked` handler has lit,
  // rather than racing it under a loaded machine.
  await page.waitForFunction(
    ([sel, at]) => {
      const el = document.querySelector<HTMLVideoElement>(sel as string);
      return (
        !!el && !el.seeking && Math.abs(el.currentTime - (at as number)) < 0.02
      );
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
/**
 * Always read through `expect.poll`. `seekTo` waits for the ELEMENT's clock,
 * but the playing row is React state fed by `timeupdate`, a render behind it —
 * a one-shot read straight after a seek passes on a fast machine and reads
 * `null` on a loaded CI runner.
 */
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
  await expect.poll(() => playingRow(page)).toBe("b");

  await release(page, matchId);
  await awaitCredential(page, REPORT, 1);

  const after = await state(page, REPORT);
  expect(after?.paused).toBe(true);
  expect(after?.time).toBeCloseTo(0.3, 1);
  // Same alignment, so the row never moved either.
  await expect.poll(() => playingRow(page)).toBe("b");
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
  await expect.poll(() => playingRow(page)).toBeNull();

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
  await expect.poll(() => playingRow(page)).toBe("a");
});

test("a replacement lands on a stop rather than on the old second", async ({
  page,
}) => {
  const matchId = "replace-one";
  await open(page, matchId);

  // Inside the third point's window (0.45 on the rendered alignment).
  await seekTo(page, REPORT, 0.46);
  await expect.poll(() => playingRow(page)).toBe("c");

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
  await expect.poll(() => playingRow(page)).toBe("c");
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

  // The room's lane previews the room's credential (T4): hover it, mark the
  // element, and step off before the swap.
  const lane = await hoverRoomLane(page, 0.5);
  await expect(page.locator(ROOM_PREVIEW_VIDEO)).toHaveCount(1);
  expect(
    await page
      .locator(ROOM_PREVIEW_VIDEO)
      .evaluate((el) => (el as HTMLVideoElement).src),
  ).toBe((await state(page, ROOM))?.src);
  await page
    .locator(ROOM_PREVIEW_VIDEO)
    .evaluate((el) => ((el as HTMLElement).dataset.marker = "first"));
  await page.mouse.move(lane.x + lane.width / 2, lane.y - 200);

  await release(page, matchId);
  // One credential, both surfaces: the room and the player behind it move
  // together because they are reading one hook.
  await awaitCredential(page, ROOM, 1);
  await awaitCredential(page, REPORT, 1);

  // …and the preview moved with them: a new node on the new `cred=`.
  await hoverRoomLane(page, 0.6);
  await expect(page.locator(ROOM_PREVIEW_VIDEO)).toHaveCount(1);
  expect(
    await page
      .locator(ROOM_PREVIEW_VIDEO)
      .evaluate((el) => (el as HTMLVideoElement).src),
  ).toContain("cred=1");
  expect(
    await page
      .locator(ROOM_PREVIEW_VIDEO)
      .evaluate((el) => (el as HTMLElement).dataset.marker ?? null),
  ).toBeNull();
  await page.mouse.move(lane.x + lane.width / 2, lane.y - 200);

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

/* -------------------------------------------------------------------------
 * The transport does not fight the viewer
 * ---------------------------------------------------------------------- */

test("Loop never undoes a jump to another point", async ({ page }) => {
  const matchId = "loop-jump";
  await open(page, matchId);

  // Inside point a, so Loop adopts it as the point being repeated.
  await seekTo(page, REPORT, 0.25);
  await expect.poll(() => playingRow(page)).toBe("a");

  await page.getByRole("button", { name: "Loop this point — off" }).click();

  // Now ask to watch a DIFFERENT point. These fixtures sit about a tenth of a
  // second apart, so b's window opens inside a's end window — precisely the
  // shape that used to read as "the loop came round" rather than "the viewer
  // jumped", and sent them straight back to a.
  await page.click('[data-point-id="b"][role="button"]');

  // The viewer is where they asked to be. Point a begins at 0.2s, so the
  // regression this pins is unmistakable: it put them back there.
  const after = await state(page, REPORT);
  expect(after?.time).toBeGreaterThan(0.3);
});

test("a focused point row keeps the arrow keys", async ({ page }) => {
  const matchId = "keys-rows";
  await open(page, matchId);
  await seekTo(page, REPORT, 0.25);

  // A keyboard user tabs into the list. Arrows there mean "walk the list" and
  // "scroll the pane" — the tab may not take them, because unlike the
  // fullscreen room it sits beside a list that scrolls.
  await page.focus('[data-point-id="c"][role="button"]');
  await page.keyboard.press("ArrowDown");

  // Unmoved. Seeking five seconds would clamp to the clip's two.
  const after = await state(page, REPORT);
  expect(after?.time).toBeCloseTo(0.25, 1);
});

/* -------------------------------------------------------------------------
 * Bookmark toggle (T7) — "already in the desired state" counts as landed.
 * ---------------------------------------------------------------------- */

test("a save that hits the PK conflict (23505) stays saved", async ({
  page,
}) => {
  const matchId = "bookmark-conflict";
  await open(page, matchId, { bookmarkOutcome: "conflict" });

  // Point b starts unsaved.
  const button = page.locator(
    '[data-point-id="b"] button[aria-label="Bookmark this point"]',
  );
  await button.click();

  await expect(
    page.locator('[data-point-id="b"] button[aria-label="Remove bookmark"]'),
  ).toBeVisible();
});

test("an unsave that matches zero rows stays unsaved", async ({ page }) => {
  const matchId = "bookmark-zero-rows";
  await open(page, matchId);

  // Point a starts saved.
  const button = page.locator(
    '[data-point-id="a"] button[aria-label="Remove bookmark"]',
  );
  await button.click();

  await expect(
    page.locator(
      '[data-point-id="a"] button[aria-label="Bookmark this point"]',
    ),
  ).toBeVisible();
});

test("a save refused for a reason other than 23505 reverts", async ({
  page,
}) => {
  const matchId = "bookmark-refused";
  await open(page, matchId, { bookmarkOutcome: "refused" });

  // Point b starts unsaved.
  const button = page.locator(
    '[data-point-id="b"] button[aria-label="Bookmark this point"]',
  );
  await button.click();

  // The RLS refusal is not `23505`, so the optimistic save reverts.
  await expect(
    page.locator(
      '[data-point-id="b"] button[aria-label="Bookmark this point"]',
    ),
  ).toBeVisible();
});

/* -------------------------------------------------------------------------
 * A bookmark survives a view switch (T13)
 *
 * The Video view really is destroyed when the viewer goes to Statistics
 * (`MatchReportWhen` renders null for an inactive view), so the saved flags
 * cannot live inside it. `remountFilmTab()` does exactly that to the tab while
 * the providers above it stay mounted.
 * ---------------------------------------------------------------------- */

test("a bookmark survives the Video view being unmounted and rebuilt", async ({
  page,
}) => {
  const matchId = "bookmark-remount";
  await open(page, matchId);

  await page
    .locator('[data-point-id="b"] button[aria-label="Bookmark this point"]')
    .click();
  await expect(
    page.locator('[data-point-id="b"] button[aria-label="Remove bookmark"]'),
  ).toHaveAttribute("aria-pressed", "true");

  await page.evaluate(() =>
    (window as unknown as FilmRefreshHarnessWindow).remountFilmTab(),
  );

  // A fresh tab, the same saved point: the flag came back from the provider,
  // not from the harness's original server array.
  await expect(
    page.locator('[data-point-id="b"] button[aria-label="Remove bookmark"]'),
  ).toHaveAttribute("aria-pressed", "true");
});

test("a bookmark the database refused is still gone after a rebuild", async ({
  page,
}) => {
  const matchId = "bookmark-remount-refused";
  await open(page, matchId, { bookmarkOutcome: "refused" });

  await page
    .locator('[data-point-id="b"] button[aria-label="Bookmark this point"]')
    .click();
  // The revert lands before the remount, and the rebuilt tab must not resurrect
  // the optimistic value the revert threw away.
  await expect(
    page.locator(
      '[data-point-id="b"] button[aria-label="Bookmark this point"]',
    ),
  ).toHaveAttribute("aria-pressed", "false");

  await page.evaluate(() =>
    (window as unknown as FilmRefreshHarnessWindow).remountFilmTab(),
  );

  await expect(
    page.locator(
      '[data-point-id="b"] button[aria-label="Bookmark this point"]',
    ),
  ).toHaveAttribute("aria-pressed", "false");
});

test("a refreshed server array replaces the provider's points, a rebuild alone does not", async ({
  page,
}) => {
  const matchId = "bookmark-reseed";
  await open(page, matchId);

  // The tab toggles b on; the provider now carries that flag.
  await page
    .locator('[data-point-id="b"] button[aria-label="Bookmark this point"]')
    .click();
  await expect(
    page.locator('[data-point-id="b"] button[aria-label="Remove bookmark"]'),
  ).toHaveAttribute("aria-pressed", "true");

  // A view switch hands the provider the SAME array: the flag stays.
  await page.evaluate(() =>
    (window as unknown as FilmRefreshHarnessWindow).remountFilmTab(),
  );
  await expect(
    page.locator('[data-point-id="b"] button[aria-label="Remove bookmark"]'),
  ).toHaveAttribute("aria-pressed", "true");

  // A refresh hands it a NEW array in which the server says b is not saved
  // and a IS: both must show, because every consumer of `points` — the
  // scoreboard, the charts, this list — reads the server's copy after a
  // refresh, not the page's original render. Seeding once left them all
  // stale until a hard reload.
  await page.evaluate(() =>
    (window as unknown as FilmRefreshHarnessWindow).reseedPoints({
      b: false,
      a: true,
    }),
  );
  await expect(
    page.locator(
      '[data-point-id="b"] button[aria-label="Bookmark this point"]',
    ),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.locator('[data-point-id="a"] button[aria-label="Remove bookmark"]'),
  ).toHaveAttribute("aria-pressed", "true");

  // And the write path follows the re-seed: toggling b again saves from the
  // refreshed array, not the one the refresh replaced.
  await page
    .locator('[data-point-id="b"] button[aria-label="Bookmark this point"]')
    .click();
  await expect(
    page.locator('[data-point-id="b"] button[aria-label="Remove bookmark"]'),
  ).toHaveAttribute("aria-pressed", "true");
});

/* -------------------------------------------------------------------------
 * The court card moves like the board (T11)
 *
 * The geometry is `film-board-position.spec.ts`'s; what only a browser can
 * answer is whether a real mouse drag on the card reaches it, and whether
 * the corner is kept for the next visit. The whole card is the handle, the
 * way the whole board is ("moving the court should be as easy as moving the
 * scorecard", author 2026-09-22) — so the drag starts on the card's BODY,
 * in the padding below the court drawing, where no mark can sit.
 * ---------------------------------------------------------------------- */

test("dragging the court card by its body parks it in a corner of its own", async ({
  page,
}) => {
  const matchId = "court-drag";
  await open(page, matchId);
  // Inside the second point, so R11's "board, court and point name arrive
  // together" condition is met before the room opens.
  await seekTo(page, REPORT, 0.3);

  await page
    .getByRole("button", { name: "Open the film room fullscreen" })
    .click();
  await page.waitForSelector(ROOM);

  const card = page.locator("[data-court-anchor]");
  // A viewer who has never moved it: no corner of its own, stacked under the
  // board's.
  await expect(card).toHaveAttribute("data-court-anchor", "follow");

  const handle = page.locator("[data-film-court-handle]");
  // The handle is the card itself, not its header row.
  await expect(handle).toHaveAttribute("aria-label", "Shot placement");
  const box = await handle.boundingBox();
  if (!box) throw new Error("no court handle");
  // The card's bottom-left padding: below the drawing, left of the foot
  // note, so the press cannot land on a mark or a glyph.
  const fromX = box.x + 4;
  const fromY = box.y + box.height - 4;

  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  // Well past the 3px lift threshold, and far enough right that the nearest
  // corner is unambiguous.
  await page.mouse.move(fromX + 600, fromY - 100, { steps: 12 });

  // Under the pointer the card follows it directly: no glide, or every move
  // would be eased over 360ms and the card would trail the cursor (the board
  // has always done this; the court's first cut did not). Read on the
  // wrapper, which is what the hook positions.
  const duringDrag = await card.evaluate(
    (el) => getComputedStyle(el).transitionDuration,
  );
  expect(duringDrag).toBe("0s");
  const followed = await card.boundingBox();
  if (!followed) throw new Error("no card mid-drag");
  // Clamped to the room, so not exactly +600/-100 — but well away from where
  // it started, on the very frame the pointer got there.
  expect(followed.x).toBeGreaterThan(box.x + 300);

  await page.mouse.up();

  await expect(card).toHaveAttribute("data-court-anchor", "top-right");
  // Released, the glide into the corner is back on.
  expect(
    await card.evaluate((el) => getComputedStyle(el).transitionDuration),
  ).toBe("0.36s");
  expect(
    await page.evaluate(() => localStorage.getItem("film-room:court-anchor")),
  ).toBe("top-right");

  // The board did not come with it — they remember separate corners.
  await expect(page.locator("[data-board-anchor]")).toHaveAttribute(
    "data-board-anchor",
    "top-left",
  );
});

test("a click on the court's hide glyph still hides it, handle or no handle", async ({
  page,
}) => {
  const matchId = "court-glyph";
  await open(page, matchId);
  await seekTo(page, REPORT, 0.3);

  await page
    .getByRole("button", { name: "Open the film room fullscreen" })
    .click();
  await page.waitForSelector(ROOM);
  await expect(page.locator("[data-court-anchor]")).toHaveCount(1);

  // The glyph sits inside the drag handle; the press must stay the button's.
  await page.getByRole("button", { name: "Hide the court" }).click();
  await expect(page.locator("[data-court-anchor]")).toHaveCount(0);
});

test("T12: double-click no longer exits the room", async ({ page }) => {
  const matchId = "no-dblclick-exit";
  await open(page, matchId);
  await seekTo(page, REPORT, 0.3);

  await page
    .getByRole("button", { name: "Open the film room fullscreen" })
    .click();
  await page.waitForSelector(ROOM);

  // A genuine dblclick...
  await page.locator(ROOM).dblclick();
  // ...and a fast click burst (click, click, click ~50ms apart), which is
  // what a real double-click plus one more press dispatches at the browser
  // level and is exactly the gesture the author described as "pressing too
  // fast in succession".
  await page.locator(ROOM).click();
  await page.waitForTimeout(50);
  await page.locator(ROOM).click();
  await page.waitForTimeout(50);
  await page.locator(ROOM).click();

  await page.waitForTimeout(500);
  // The room is a fullscreen overlay over the report player, which stays
  // mounted underneath it the whole time it is open (see "the room swaps
  // with the report player" above) — so REPORT's count never goes to 0
  // while the room is open, exit or no exit. The room NOT exiting is what
  // `ROOM` staying at count 1 proves; that exit never ran is proved by the
  // report player's playhead staying exactly where it was before the room
  // opened, since `exit()` hands the room's current playhead back to it.
  await expect(page.locator(ROOM)).toHaveCount(1);
  const report = await state(page, REPORT);
  expect(report?.time).toBeCloseTo(0.3, 1);
});

/* -------------------------------------------------------------------------
 * A point jump is only a seek (T14)
 *
 * What the code already says — `seek` sets `currentTime` and nothing else —
 * pinned where only a browser can: no `/video` request, no remount, and the
 * element's own clock on each row's stop start. The credential is given an
 * hour so no scheduled refresh can land inside the test and be mistaken for
 * one the jumps caused.
 * ---------------------------------------------------------------------- */

/** The rendered alignment's stop starts (see "The film's geometry"). */
const STOP_START: Record<string, number> = { a: 0.2, b: 0.35, c: 0.45 };
const DRAWER_ROW = (id: string) =>
  `aside[aria-label="Points"] [data-point-id="${id}"][role="button"]`;

async function polled(page: Page, matchId: string): Promise<number> {
  const { polls: count } = await (
    await page.request.get(
      `${origin}/__polls?matchId=${encodeURIComponent(matchId)}`,
    )
  ).json();
  return count;
}

/** Open the room with its drawer, settled on the report's playhead. */
async function openRoomWithDrawer(
  page: Page,
  matchId: string,
  extra: Record<string, string> = {},
) {
  await page.addInitScript(() => {
    localStorage.setItem("film-room:drawer-open", "1");
  });
  await open(page, matchId, { ttl: String(60 * 60 * 1000), ...extra });
  await page
    .getByRole("button", { name: "Open the film room fullscreen" })
    .click();
  await page.waitForSelector(ROOM);
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector<HTMLVideoElement>(sel);
      return !!el && el.readyState >= 1;
    },
    ROOM,
    { timeout: 10_000 },
  );
  await page.locator(DRAWER_ROW("a")).waitFor();
}

/** Three different rows, 200 ms apart, each landing on its own stop. */
async function jumpRows(page: Page) {
  for (const id of ["c", "a", "b"]) {
    await page.click(DRAWER_ROW(id));
    await page.waitForFunction(
      ([sel, at]) => {
        const el = document.querySelector<HTMLVideoElement>(sel as string);
        return !!el && Math.abs(el.currentTime - (at as number)) < 0.1;
      },
      [ROOM, STOP_START[id]] as const,
      { timeout: 5000 },
    );
    await page.waitForTimeout(200);
    const time = (await state(page, ROOM))?.time ?? -1;
    expect(Math.abs(time - STOP_START[id])).toBeLessThan(0.1);
  }
}

test("T14: a point jump in the room issues no request and no remount", async ({
  page,
}) => {
  const matchId = "jump-rows";
  await openRoomWithDrawer(page, matchId);

  const pollsBefore = await polled(page, matchId);
  const generationBefore = await page
    .locator(ROOM)
    .getAttribute("data-generation");
  expect(generationBefore).not.toBeNull();
  // Tag the node itself: a remount would carry the same attribute value on a
  // different element only if the key had not moved, but this cannot lie.
  await page.evaluate((sel) => {
    const el = document.querySelector(sel) as
      (HTMLVideoElement & { __t14?: boolean }) | null;
    if (el) el.__t14 = true;
  }, ROOM);

  await jumpRows(page);

  expect(await polled(page, matchId)).toBe(pollsBefore);
  await expect(page.locator(ROOM)).toHaveAttribute(
    "data-generation",
    generationBefore!,
  );
  expect(
    await page.evaluate(
      (sel) =>
        (
          document.querySelector(sel) as
            (HTMLElement & { __t14?: boolean }) | null
        )?.__t14 === true,
      ROOM,
    ),
  ).toBe(true);
});

/** Count calls to the two things a trace would touch, before the app runs. */
async function spyOnTrace(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __traceCalls: { entries: number; tables: number };
    };
    w.__traceCalls = { entries: 0, tables: 0 };
    const getEntriesByType = performance.getEntriesByType.bind(performance);
    performance.getEntriesByType = (type: string) => {
      w.__traceCalls.entries += 1;
      return getEntriesByType(type);
    };
    const table = console.table.bind(console);
    console.table = (...args: Parameters<typeof console.table>) => {
      w.__traceCalls.tables += 1;
      table(...args);
    };
  });
}

async function traceCalls(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __traceCalls: { entries: number; tables: number };
        }
      ).__traceCalls,
  );
}

test("T14: with the trace flag unset, a jump touches neither performance nor console.table", async ({
  page,
}) => {
  await spyOnTrace(page);
  await openRoomWithDrawer(page, "trace-off");
  await jumpRows(page);
  expect(await traceCalls(page)).toEqual({ entries: 0, tables: 0 });
});

test("T14: with the trace flag set, each jump prints one table", async ({
  page,
}) => {
  await spyOnTrace(page);
  await page.addInitScript(() => {
    localStorage.setItem("film-room:trace", "1");
  });
  await openRoomWithDrawer(page, "trace-on");
  await jumpRows(page);
  // The first two seeks were flushed by the one after them; the third is
  // still inside its window until the room goes.
  await expect.poll(async () => (await traceCalls(page)).tables).toBe(2);
  expect((await traceCalls(page)).entries).toBe(2);
});

/* -------------------------------------------------------------------------
 * The frame says it is catching up (T16)
 *
 * A point jump moves the chrome on the click and the film when `seeked`
 * fires; on a real match that is up to 1.2 s later (the T14 trace). The
 * fixture is two seconds and buffers at once, so the lag is made here: the
 * `currentTime` setter announces `seeking` straight away and applies the real
 * assignment `HOLD_MS` later, so the native `seeking` / `seeked` follow it.
 *
 * Installed with `page.evaluate` AFTER the room is ready, never with
 * `addInitScript` — at mount it would defer `settle` / `land` too.
 * ---------------------------------------------------------------------- */

const HOLD_MS = 400;
const SEEKING = "data-film-seeking";

async function holdSeeks(page: Page, holdMs = HOLD_MS) {
  await page.evaluate((ms) => {
    const proto = HTMLMediaElement.prototype;
    const real = Object.getOwnPropertyDescriptor(proto, "currentTime")!;
    Object.defineProperty(proto, "currentTime", {
      configurable: true,
      enumerable: real.enumerable,
      get: real.get,
      set(this: HTMLMediaElement, value: number) {
        this.dispatchEvent(new Event("seeking"));
        setTimeout(() => real.set!.call(this, value), ms);
      },
    });
  }, holdMs);
}

/** Present within 200 ms of the click, then gone once the film lands on `c`. */
async function expectSeekingThenLanded(page: Page, selector: string) {
  await expect
    .poll(() => page.locator(selector).getAttribute(SEEKING), {
      timeout: 200,
      intervals: [20],
    })
    .toBe("true");
  await expect
    .poll(() => page.locator(selector).getAttribute(SEEKING), {
      timeout: 5000,
    })
    .toBeNull();
  const time = (await state(page, selector))?.time ?? -1;
  expect(Math.abs(time - STOP_START.c)).toBeLessThan(0.1);
}

test("T16: a held seek in the room dims the frame while the chrome is already on the point", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "hold-room");
  // Opened at time zero the room's element has decoded nothing yet (metadata
  // preload, no seek to force a frame), and the dim is withheld for a frame
  // nobody has seen. A real seek first, so there IS a frame on screen.
  await seekTo(page, ROOM, 0.3);
  await page.waitForFunction(
    (sel) =>
      (document.querySelector(sel) as HTMLVideoElement | null)?.readyState! >=
      2,
    ROOM,
  );
  await expect(page.locator(ROOM)).not.toHaveAttribute(SEEKING, /.*/);
  await holdSeeks(page);

  await page.click(DRAWER_ROW("c"));
  // Option A: the row lights on the click, not on `seeked`.
  await expect
    .poll(
      () =>
        page
          .locator(
            `aside[aria-label="Points"] [data-point-id="c"][data-playing="true"]`,
          )
          .count(),
      { timeout: 200, intervals: [20] },
    )
    .toBe(1);
  await expectSeekingThenLanded(page, ROOM);
});

test("T16: buffered jumps in the room never set the seeking attribute", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "hold-off");
  await page.evaluate(
    ([sel, attr]) => {
      const w = window as unknown as { __seekingSets: number };
      w.__seekingSets = 0;
      new MutationObserver((records) => {
        for (const r of records) {
          const el = r.target as Element;
          if (el.getAttribute(attr) !== null) w.__seekingSets += 1;
        }
      }).observe(document.querySelector(sel)!, {
        attributes: true,
        attributeFilter: [attr],
      });
    },
    [ROOM, SEEKING] as const,
  );

  await jumpRows(page);

  expect(
    await page.evaluate(
      () => (window as unknown as { __seekingSets: number }).__seekingSets,
    ),
  ).toBe(0);
});

test("T16: a held seek in the report player dims its frame the same way", async ({
  page,
}) => {
  await open(page, "hold-shell", { ttl: String(60 * 60 * 1000) });
  await expect(page.locator(REPORT)).not.toHaveAttribute(SEEKING, /.*/);
  await holdSeeks(page);

  await page.click(
    `[data-point-id="c"][role="button"]:not(aside[aria-label="Points"] *)`,
  );
  await expectSeekingThenLanded(page, REPORT);
});

test("the report player never dims a frame it has not shown yet", async ({
  page,
}) => {
  await open(page, "cold-open-no-dim", { ttl: String(60 * 60 * 1000) });

  // Hold every media request the NEXT element makes, so it can never reach
  // `loadeddata` until released — a cold open of a large cut, where the
  // first frame is seconds away.
  const heldRoutes: Route[] = [];
  await page.route("**/fixtures/**", (route) => {
    heldRoutes.push(route);
  });

  // A fresh player (the tab rebuilt), whose element has shown nothing.
  await page.evaluate(() =>
    (window as unknown as FilmRefreshHarnessWindow).remountFilmTab(),
  );
  // A seek on that element well past the grace — the mount nudge on a slow
  // file, or an early click — must not dim a frame nobody has seen.
  await page.evaluate((sel) => {
    document.querySelector(sel)?.dispatchEvent(new Event("seeking"));
  }, REPORT);
  await page.waitForTimeout(300);
  await expect(page.locator(REPORT)).not.toHaveAttribute(SEEKING, /.*/);
  expect(
    await page
      .locator(REPORT)
      .evaluate((el) => (el as HTMLVideoElement).readyState),
  ).toBe(0);

  // Released, the first frame lands and the same seek in flight now dims.
  // Continue the held ones before unrouting: `unroute` disposes of any
  // request still parked on the handler.
  for (const route of heldRoutes) await route.continue();
  await page.unroute("**/fixtures/**");
  await page.waitForFunction(
    (sel) =>
      (document.querySelector(sel) as HTMLVideoElement | null)?.readyState! >=
      2,
    REPORT,
  );
  await page.evaluate((sel) => {
    document.querySelector(sel)?.dispatchEvent(new Event("seeking"));
  }, REPORT);
  await expect(page.locator(REPORT)).toHaveAttribute(SEEKING, "true", {
    timeout: 1000,
  });
});

/* -------------------------------------------------------------------------
 * Follow the film, or hold the point you are reading (T18)
 *
 * The drawer's well reads the DISPLAYED point and the lit row the PLAYING
 * one (`docs/superpowers/specs/2026-09-22-film-follow-hold-design.md`). The
 * harness gives `a`/`b`/`c` two shots each so there is a well to hold, and
 * `pad=12` makes the list taller than the viewport so a wheel really scrolls.
 * Each case is one row of the design's enter/leave table: a row click holds;
 * a hand scroll holds and the next crossing leaves the scroller alone; a step
 * re-follows with the smooth scroll; a cut that drops the held point
 * re-follows without a click.
 * ---------------------------------------------------------------------- */

const DRAWER = 'aside[aria-label="Points"]';
const DRAWER_SCROLLER = `${DRAWER} .overflow-y-auto`;
const WELL_UNDER = (id: string) =>
  `${DRAWER} [data-point-id="${id}"] + [data-shot-well]`;

async function drawerScrollTop(page: Page): Promise<number> {
  return page.evaluate(
    (sel) => document.querySelector(sel)?.scrollTop ?? -1,
    DRAWER_SCROLLER,
  );
}

/**
 * A real wheel over a scroller (the drawer's, or the shell list's — T24).
 * The drawer slides in over 420ms and `openRoomWithDrawer` only waits for its
 * rows to exist, so on a loaded machine a box read straight away is
 * mid-travel and the pointer lands beside the drawer — the wheel then scrolls
 * nothing and every assertion after it is about the wrong state. Wait for the
 * box to stop moving first (the shell's scroller does not move; the wait is
 * one read long there).
 */
async function wheelScroller(page: Page, selector: string, deltaY: number) {
  const scrollTop = () =>
    page.evaluate(
      (sel) => document.querySelector(sel)?.scrollTop ?? -1,
      selector,
    );
  const scroller = page.locator(selector);
  // The harness stacks the shell's columns, so its list can sit below the
  // viewport, where a wheel lands on nothing.
  await scroller.scrollIntoViewIfNeeded();
  let box = await scroller.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(120);
    const next = await scroller.boundingBox();
    if (box && next && box.x === next.x && box.width === next.width) break;
    box = next;
  }
  if (!box) throw new Error(`no scroller at ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await expect.poll(scrollTop).toBeGreaterThan(0);
  // Chromium animates a wheel scroll; read the position only once it has
  // stopped moving, so a later comparison is not against a frame mid-travel.
  let last = await scrollTop();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const now = await scrollTop();
    if (now === last) break;
    last = now;
  }
}

async function wheelDrawer(page: Page, deltaY: number) {
  await wheelScroller(page, DRAWER_SCROLLER, deltaY);
}

/** Record every `scrollTo(options)` call, installed after the room opened. */
async function spyScrollTo(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __scrollTos: ScrollToOptions[] };
    w.__scrollTos = [];
    const real = Element.prototype.scrollTo;
    Element.prototype.scrollTo = function (this: Element, ...args: unknown[]) {
      if (args.length === 1 && typeof args[0] === "object" && args[0]) {
        w.__scrollTos.push(args[0] as ScrollToOptions);
      }
      return (real as (...a: unknown[]) => void).apply(this, args);
    } as typeof real;
  });
}

async function scrollTos(page: Page): Promise<ScrollToOptions[]> {
  return page.evaluate(
    () => (window as unknown as { __scrollTos: ScrollToOptions[] }).__scrollTos,
  );
}

test("T18: a row click holds its well while the lit row moves on", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "hold-click", { pad: "12" });

  // Nothing is playing at film zero, so the click holds `a` (and seeks it).
  await page.click(DRAWER_ROW("a"));
  await expect.poll(() => playingRow(page)).toBe("a");
  await expect(page.locator(WELL_UNDER("a"))).toHaveCount(1);

  await seekTo(page, ROOM, 0.4);
  await expect.poll(() => playingRow(page)).toBe("b");
  // The well stayed under the held row; the lit row is the playing one.
  await expect(page.locator(WELL_UNDER("a"))).toHaveCount(1);
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(0);
});

test("T18: a hand scroll holds, and the next crossing leaves the scroller alone", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "hold-wheel", { pad: "12" });
  await seekTo(page, ROOM, 0.4);
  await expect.poll(() => playingRow(page)).toBe("b");
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(1);

  // A real wheel over the drawer: intent, read from the event and not from
  // `scroll`.
  await wheelDrawer(page, 200);
  await page.waitForTimeout(400);
  const scrolled = await drawerScrollTop(page);

  await seekTo(page, ROOM, 0.5);
  await expect.poll(() => playingRow(page)).toBe("c");
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(1);
  await expect(page.locator(WELL_UNDER("c"))).toHaveCount(0);
  // Held: the keep-in-view effect did not fire on the crossing.
  await page.waitForTimeout(400);
  expect(await drawerScrollTop(page)).toBe(scrolled);
});

test("T18: a step re-follows — the well moves to the playing row on a smooth scroll", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "hold-step", { pad: "12" });
  await seekTo(page, ROOM, 0.4);
  await expect.poll(() => playingRow(page)).toBe("b");
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(1);

  await wheelDrawer(page, 200);
  await seekTo(page, ROOM, 0.5);
  await expect.poll(() => playingRow(page)).toBe("c");
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(1);
  // The wheel was the intent; how far it travelled depends on the machine.
  // Park the scroller a known distance down so the lit row is out of view
  // for certain — a programmatic scroll is not intent and changes no state.
  await page.evaluate((sel) => {
    const list = document.querySelector<HTMLElement>(sel);
    if (list) list.scrollTop = list.scrollHeight;
  }, DRAWER_SCROLLER);
  // The lit row sits above the scroller's top edge: out of view.
  await expect
    .poll(() =>
      page.evaluate((sel) => {
        const list = document.querySelector<HTMLElement>(sel);
        const lit = list?.querySelector<HTMLElement>('[data-playing="true"]');
        if (!list || !lit) return false;
        return (
          lit.getBoundingClientRect().bottom < list.getBoundingClientRect().top
        );
      }, DRAWER_SCROLLER),
    )
    .toBe(true);

  // Installed AFTER the room opened, like `holdSeeks`, so the room's own
  // mount scrolls are not in the record. `→` at the end of the cut has
  // nothing to step to; re-following still happens, and the effect scrolls
  // the lit row — pushed above the viewport — back into view.
  await spyScrollTo(page);
  await page.keyboard.press("ArrowRight");
  await expect(page.locator(WELL_UNDER("c"))).toHaveCount(1);
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(0);
  await expect
    .poll(async () =>
      (await scrollTos(page)).some((o) => o.behavior === "smooth"),
    )
    .toBe(true);
});

test("T18: a cut that drops the held point re-follows without a click", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "hold-cut", { pad: "12" });

  // The click holds `b` (its well opens) and seeks it. Not asserted on the
  // lit row: `b`'s start is 1.85 − 1.5 in floating point, a hair past the
  // 0.35 the element snaps to, so the boundary frame still lights `a`.
  await page.click(DRAWER_ROW("b"));
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(1);
  await seekTo(page, ROOM, 0.5);
  await expect.poll(() => playingRow(page)).toBe("c");
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(1);

  // "Saved only" keeps `a` alone: the held `b` has no row left to hold.
  const drawer = page.locator(DRAWER);
  const menu = page.getByRole("menu", { name: "Point filters" });
  await drawer.getByRole("button", { name: "Filters" }).click();
  await menu.getByText("Saved only").click();
  await expect(drawer.locator('[data-point-id="b"]')).toHaveCount(0);

  await drawer.getByRole("button", { name: "Filters" }).click();
  await menu.getByText("Clear all filters").click();
  await expect(drawer.locator('[data-point-id="b"]')).toHaveCount(1);
  // Back to following: the well is under the playing row, with no click.
  await expect(page.locator(WELL_UNDER("c"))).toHaveCount(1);
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(0);
});

/* -------------------------------------------------------------------------
 * The drawer's "Now playing" pill (T19)
 *
 * Shown only while held on a point other than the playing one AND the lit
 * row is not wholly inside the scroller's box; its words are
 * `followAffordance`'s, its number the counter's (`position.index`). It pins
 * to the edge the lit row is beyond (T21) with a chevron toward it — bottom
 * with none when the playing point has no row in the cut. Pressing it
 * follows: the T18 effect scrolls the list and the well unfolds under the
 * playing row. A click on `a` at film zero holds `a` (nothing is playing
 * yet); the list is then parked at its end, so `b` sits above the box, and
 * the seek to 0.4 plays `b`, which is what brings the pill in.
 * ---------------------------------------------------------------------- */

const PILL = `${DRAWER} button[aria-label^="Now playing:"]`;

/**
 * Wait for the drawer's slide-in to finish: its box moves for 420ms after
 * `openRoomWithDrawer` returns, and a read mid-travel is of the wrong place.
 */
async function drawerSettled(page: Page) {
  const scroller = page.locator(DRAWER_SCROLLER);
  let box = await scroller.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(120);
    const next = await scroller.boundingBox();
    if (box && next && box.x === next.x && box.height === next.height) break;
    box = next;
  }
}

/**
 * Park the drawer's scroller at `top` (`"end"` = `scrollHeight`, clamped by
 * the browser) and resolve once its `scroll` event has fired and a frame has
 * passed, so the pill has re-read its place. A programmatic scroll is not
 * intent (T18): it changes where the list is, never the held state. Used
 * instead of a wheel, whose travel is machine-dependent.
 */
async function parkDrawer(page: Page, top: number | "end") {
  await parkScroller(page, DRAWER_SCROLLER, top);
}

/** `parkDrawer` for any scroller (T23 parks the shell's list the same way). */
async function parkScroller(page: Page, scroller: string, top: number | "end") {
  await page.evaluate(
    ([sel, to]) =>
      new Promise<void>((resolve) => {
        const list = document.querySelector<HTMLElement>(sel as string);
        if (!list) return resolve();
        const frame = () =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        const before = list.scrollTop;
        list.addEventListener("scroll", frame, { once: true });
        list.scrollTop = to === "end" ? list.scrollHeight : (to as number);
        if (list.scrollTop === before) {
          list.removeEventListener("scroll", frame);
          frame();
        }
      }),
    [scroller, top] as const,
  );
}

/** The pill's edge, read from its classes: exactly one of the two. */
async function pillEdge(page: Page): Promise<string> {
  return page.locator(PILL).evaluate((el) => {
    const top = el.classList.contains("top-3");
    const bottom = el.classList.contains("bottom-3");
    return top && !bottom ? "top" : bottom && !top ? "bottom" : "both/none";
  });
}

/** Held on `a`, the film playing `b` above the box: the pill's first state. */
async function holdAThenPlayB(page: Page) {
  await page.click(DRAWER_ROW("a"));
  await expect.poll(() => playingRow(page)).toBe("a");
  await expect(page.locator(WELL_UNDER("a"))).toHaveCount(1);
  await expect(page.locator(PILL)).toHaveCount(0);
  // Held, so nothing scrolls the list back: `b` will light above the box.
  // (With `b` in view the pill would be unmounted — T21.)
  await drawerSettled(page);
  await parkDrawer(page, "end");
  await seekTo(page, ROOM, 0.4);
  await expect.poll(() => playingRow(page)).toBe("b");
  await expect(page.locator(PILL)).toHaveCount(1);
}

/** Whether the lit row sits wholly inside the drawer scroller's box. */
async function litRowInView(page: Page): Promise<boolean> {
  return page.evaluate((sel) => {
    const list = document.querySelector<HTMLElement>(sel);
    const lit = list?.querySelector<HTMLElement>(
      '[data-point-id][data-playing="true"]',
    );
    if (!list || !lit) return false;
    const box = list.getBoundingClientRect();
    const row = lit.getBoundingClientRect();
    return row.top >= box.top - 0.5 && row.bottom <= box.bottom + 0.5;
  }, DRAWER_SCROLLER);
}

test("T19: the pill names the playing point, and its chevron points up once the lit row scrolls above", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "pill-names", { pad: "12" });
  // Following: no pill at all, not merely a hidden one.
  await expect(page.locator(PILL)).toHaveCount(0);
  await holdAThenPlayB(page);

  const pill = page.locator(PILL);
  await expect(pill).toHaveText("Now playing · Point 2");
  await expect(pill).toHaveAttribute(
    "aria-label",
    "Now playing: point 2 — follow playback",
  );
  await expect(pill).toHaveAttribute("type", "button");
  await expect(pill).toHaveAttribute("data-film-chrome", /.*/);

  // A real wheel: the lit row goes above the scroller's box.
  await wheelDrawer(page, 600);
  await expect.poll(() => litRowInView(page)).toBe(false);
  await expect(pill.locator("svg")).toHaveClass(/lucide-chevron-up/);
  await expect(pill.locator("svg")).toHaveAttribute("aria-hidden", "true");
});

test("T19: pressing the pill follows — it leaves, the well is under the playing row, the list scrolls to it", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "pill-press", { pad: "12" });
  await holdAThenPlayB(page);
  await wheelDrawer(page, 600);
  await expect.poll(() => litRowInView(page)).toBe(false);
  const wheeled = await drawerScrollTop(page);

  await page.locator(PILL).click();
  await expect(page.locator(PILL)).toHaveCount(0);
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(1);
  await expect(page.locator(WELL_UNDER("a"))).toHaveCount(0);
  // The follow effect's smooth scroll brings row `b` back inside the box.
  await expect
    .poll(() =>
      page.evaluate((sel) => {
        const list = document.querySelector<HTMLElement>(sel);
        const row = list?.querySelector<HTMLElement>('[data-point-id="b"]');
        if (!list || !row) return false;
        const box = list.getBoundingClientRect();
        const r = row.getBoundingClientRect();
        return r.top >= box.top - 0.5 && r.bottom <= box.bottom + 0.5;
      }, DRAWER_SCROLLER),
    )
    .toBe(true);
  expect(await drawerScrollTop(page)).toBeLessThan(wheeled);
});

test("T19: no pill while the lit row is already fully in view", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "pill-in-view", { pad: "12" });
  await holdAThenPlayB(page);
  // Back to the top: `b` is wholly inside the box, nothing to return to.
  await parkDrawer(page, 0);
  await expect.poll(() => litRowInView(page)).toBe(true);
  await expect(page.locator(PILL)).toHaveCount(0);
});

test("T19: a playing point the cut excludes reads 'not in this cut', with no chevron", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "pill-cut", { pad: "12" });
  await holdAThenPlayB(page);

  // "Saved only" keeps `a` (the held point) and drops `b` (the playing one).
  const drawer = page.locator(DRAWER);
  const menu = page.getByRole("menu", { name: "Point filters" });
  await drawer.getByRole("button", { name: "Filters" }).click();
  await menu.getByText("Saved only").click();
  await expect(drawer.locator('[data-point-id="b"]')).toHaveCount(0);
  await page.keyboard.press("Escape");

  const pill = page.locator(PILL);
  await expect(pill).toHaveText("Now playing · not in this cut");
  await expect(pill).toHaveAttribute(
    "aria-label",
    "Now playing: a point outside this cut — follow playback",
  );
  await expect(pill.locator("svg")).toHaveCount(0);
});

test("T19: reduced motion — the pill's follow scrolls instantly and it fades in with no rise", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRoomWithDrawer(page, "pill-reduced", { pad: "12" });
  await holdAThenPlayB(page);
  // The opacity-only keyframe, not the rise: the pill still visibly arrives.
  await expect
    .poll(() =>
      page.locator(PILL).evaluate((el) => getComputedStyle(el).animationName),
    )
    .toBe("film-follow-pill-fade");

  await wheelDrawer(page, 600);
  await expect.poll(() => litRowInView(page)).toBe(false);
  await spyScrollTo(page);
  await page.locator(PILL).click();
  await expect(page.locator(PILL)).toHaveCount(0);
  await expect
    .poll(async () => (await scrollTos(page)).map((o) => o.behavior))
    .toContain("auto");
  expect((await scrollTos(page)).some((o) => o.behavior === "smooth")).toBe(
    false,
  );

  // The stylesheet half: reduced motion swaps the pill's animation for a
  // keyframe with no transform — never `animation: none`.
  const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
  const block = css.match(
    /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.film-follow-pill-in\s*\{([^}]*)\}\s*\}/,
  );
  expect(block).not.toBeNull();
  expect(block![1]).not.toMatch(/transform:/);
  expect(block![1]).not.toMatch(/animation:\s*none/);
  const fadeName = block![1].match(/animation:\s*([\w-]+)/)?.[1];
  expect(fadeName).toBeTruthy();
  const fade = css.match(
    new RegExp(`@keyframes ${fadeName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );
  expect(fade).not.toBeNull();
  expect(fade![1]).not.toMatch(/transform:/);
});

/* -------------------------------------------------------------------------
 * T21 — the pill pins to the edge the lit row is beyond, with hysteresis.
 *
 * The edge changes only once the lit row is WHOLLY beyond one of the
 * scroller's edges; while the row straddles an edge the pill keeps the edge
 * it had. The scroller is parked with `scrollTop`, never a wheel.
 * ---------------------------------------------------------------------- */

test("T21: the lit row above the box pins the pill to the top, chevron up, dropping in", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "pill-top", { pad: "12" });
  await holdAThenPlayB(page);
  await parkDrawer(page, "end");
  await expect.poll(() => litRowInView(page)).toBe(false);

  const pill = page.locator(PILL);
  await expect.poll(() => pillEdge(page)).toBe("top");
  await expect(pill).toHaveClass(/(^|\s)left-1\/2(\s|$)/);
  await expect(pill).toHaveClass(/(^|\s)-translate-x-1\/2(\s|$)/);
  await expect(pill.locator("svg.lucide-chevron-up")).toHaveCount(1);
  await expect(pill.locator("svg.lucide-chevron-down")).toHaveCount(0);
  // The rise comes from the edge side: pinned top it starts 4px ABOVE.
  expect(
    await pill.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--film-pill-rise").trim(),
    ),
  ).toBe("-4px");
});

test("T21: hysteresis — a lit row straddling the edge keeps the pill's edge; wholly above flips it", async ({
  page,
}) => {
  // A short room, so the drawer's scroller ends above row `c` and the lit
  // row can sit wholly BELOW the box with the list at its top.
  await page.setViewportSize({ width: 1280, height: 240 });
  await openRoomWithDrawer(page, "pill-hysteresis", { pad: "12" });
  await page.click(DRAWER_ROW("a"));
  await expect.poll(() => playingRow(page)).toBe("a");
  await drawerSettled(page);
  await parkDrawer(page, 0);
  await seekTo(page, ROOM, 0.5);
  await expect.poll(() => playingRow(page)).toBe("c");

  /** The lit row's box against the scroller's, as the pill reads it. */
  const litPlace = () =>
    page.evaluate((sel) => {
      const list = document.querySelector<HTMLElement>(sel);
      const lit = list?.querySelector<HTMLElement>(
        '[data-point-id][data-playing="true"]',
      );
      if (!list || !lit) return null;
      const box = list.getBoundingClientRect();
      const row = lit.getBoundingClientRect();
      if (row.top >= box.bottom) return "below";
      if (row.bottom <= box.top) return "above";
      if (row.top >= box.top && row.bottom <= box.bottom) return "inside";
      return row.bottom > box.bottom ? "straddles-bottom" : "straddles-top";
    }, DRAWER_SCROLLER);

  const pill = page.locator(PILL);
  await expect.poll(litPlace).toBe("below");
  await expect(pill).toHaveCount(1);
  await expect.poll(() => pillEdge(page)).toBe("bottom");
  await expect(pill.locator("svg.lucide-chevron-down")).toHaveCount(1);

  // Nudge the list so the row's top slides just inside the box's bottom edge.
  const nudge = await page.evaluate((sel) => {
    const list = document.querySelector<HTMLElement>(sel)!;
    const lit = list.querySelector<HTMLElement>('[data-playing="true"]')!;
    const box = list.getBoundingClientRect();
    const row = lit.getBoundingClientRect();
    return Math.ceil(row.top - box.bottom + row.height / 2);
  }, DRAWER_SCROLLER);
  await parkDrawer(page, nudge);
  await expect.poll(litPlace).toBe("straddles-bottom");
  await expect(pill).toHaveCount(1);
  expect(await pillEdge(page)).toBe("bottom");
  await expect(pill.locator("svg.lucide-chevron-down")).toHaveCount(1);

  // Straight to the end: the row is wholly above the box, and only now flips.
  await parkDrawer(page, "end");
  await expect.poll(litPlace).toBe("above");
  await expect.poll(() => pillEdge(page)).toBe("top");
  await expect(pill.locator("svg.lucide-chevron-up")).toHaveCount(1);
  await expect(pill.locator("svg.lucide-chevron-down")).toHaveCount(0);
});

/* -------------------------------------------------------------------------
 * T20, reverted by T22 — the shell's "This point" card follows the film.
 *
 * T20 made the card hold with the shell list; T22 returned it to always
 * showing the PLAYING point, like the scoreboard, court and transport counter
 * beside it. Only the shell list (and the room drawer) hold. So with the list
 * held on `a` and the film playing `b`, the card reads `b`, its counter stays,
 * and there is no header line. Every step — the card's, the transport's
 * glyphs, the arrow keys — still re-follows the LIST through
 * `FilmPlayer.onStep`.
 *
 * `a` is held by a click at film zero, where nothing is playing yet: a click
 * on the row that IS playing re-follows (design, "Enter and leave"), so a
 * click after seeking into `a` could never hold it.
 * ---------------------------------------------------------------------- */

const CARD = 'section[aria-label="This point"]';
const CARD_HEAD = `${CARD} > div:first-child`;
const SHELL_ROW = (id: string) =>
  `[data-point-id="${id}"][role="button"]:not(aside *)`;
/** T20's card header line — must never mount now. */
const LINE = `${CARD} button[aria-label^="Now playing:"]`;
const SHELL_LIST = 'section[aria-label="Point list"]:not(aside *)';
const SHELL_PILL = `${SHELL_LIST} button[aria-label^="Now playing:"]`;

/**
 * Where the tab's `pointFocus` points, read through the room: the shell list
 * opens no well (it takes no `onSelectShot`) and its keep-in-view has nothing
 * to scroll on four rows, so its hold draws nothing on the shell. The room's
 * drawer takes the tab's `pointFocus` and opens its well under the DISPLAYED
 * point — the held one while held — so entering the room shows whether the
 * shell is still holding `a` or has re-followed to the playing `b`.
 */
async function roomWellUnder(page: Page): Promise<string | null> {
  await page
    .getByRole("button", { name: "Open the film room fullscreen" })
    .click();
  await page.waitForSelector(ROOM);
  await page.locator(DRAWER_ROW("a")).waitFor();
  // The room's clock has no early-reach epsilon, so the shell's 0.3 is still
  // `a` in here: move it to 0.4 (inside `b`, the room cases' value) so a
  // well under `a` can only mean held, and one under `b` only following.
  await seekTo(page, ROOM, 0.4);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .querySelector('aside [data-point-id][data-playing="true"]')
            ?.getAttribute("data-point-id") ?? null,
      ),
    )
    .toBe("b");
  let under: string | null = null;
  await expect
    .poll(async () => {
      under = null;
      for (const id of ["a", "b", "c"])
        if ((await page.locator(WELL_UNDER(id)).count()) > 0) under = id;
      return under;
    })
    .not.toBeNull();
  return under;
}

async function cardShots(page: Page): Promise<(string | null)[]> {
  return page
    .locator(`${CARD} [data-shot-id]`)
    .evaluateAll((els) => els.map((el) => el.getAttribute("data-shot-id")));
}

/** Held on `a` from the shell's list, the film playing `b`. */
async function shellHoldAThenPlayB(page: Page) {
  await page.click(SHELL_ROW("a"));
  await expect.poll(() => playingRow(page)).toBe("a");
  await expect.poll(() => cardShots(page)).toEqual(["a-shot-1", "a-shot-2"]);
  await expect(page.locator(LINE)).toHaveCount(0);
  // 0.3, not the room cases' 0.4: on the shell a stop counts as reached
  // `REACHED_EPSILON_SECONDS` (0.1) early, so 0.4 is already inside `c`
  // (0.45); `b` (0.35) is the lit row from 0.25 (the file's own L425 case).
  await seekTo(page, REPORT, 0.3);
  await expect.poll(() => playingRow(page)).toBe("b");
}

/** `open`, with the room's drawer remembered open for `roomWellUnder`. */
async function openShell(
  page: Page,
  matchId: string,
  extra: Record<string, string> = {},
) {
  await page.addInitScript(() => {
    localStorage.setItem("film-room:drawer-open", "1");
  });
  await open(page, matchId, extra);
}

test("T22: with the list held, the card follows the playing point and draws no header line", async ({
  page,
}) => {
  await openShell(page, "card-hold");
  await expect(page.locator(SHELL_LIST)).toHaveCount(1);
  await expect(page.locator(SHELL_PILL)).toHaveCount(0);
  await shellHoldAThenPlayB(page);

  // The card reads the PLAYING point `b`, counter and all — no line.
  await expect.poll(() => cardShots(page)).toEqual(["b-shot-1", "b-shot-2"]);
  await expect(page.locator(`${CARD_HEAD} .mono`)).toHaveText("2 / 3");
  await expect(page.locator(LINE)).toHaveCount(0);
  await expect(page.locator(SHELL_PILL)).toHaveCount(0);

  // …while the list really is holding `a` — the room's drawer shows it.
  expect(await roomWellUnder(page)).toBe("a");
});

test("T22: the transport's Next point glyph re-follows the list through onStep", async ({
  page,
}) => {
  await openShell(page, "card-transport-step");
  await shellHoldAThenPlayB(page);
  await expect.poll(() => cardShots(page)).toEqual(["b-shot-1", "b-shot-2"]);

  // The player's own glyph — not the card's — which only `onStep` lets the
  // tab observe. The fixture's stops sit 0.1-0.15s apart, inside the step's
  // 0.5s cushion, so from `b` there is nothing to step to (as in T18's `→`
  // case): the step re-follows, which the room's drawer then shows — its
  // well under the PLAYING point — proving the notification fired.
  await page.locator(`button[aria-label="Next point"]:not(${CARD} *)`).click();
  await expect.poll(() => playingRow(page)).toBe("b");
  await expect.poll(() => cardShots(page)).toEqual(["b-shot-1", "b-shot-2"]);
  await expect(page.locator(`${CARD_HEAD} .mono`)).toHaveText("2 / 3");
  await expect(page.locator(LINE)).toHaveCount(0);
  expect(await roomWellUnder(page)).toBe("b");
});

test("T22: the card's own Next point step button re-follows the list", async ({
  page,
}) => {
  await openShell(page, "card-own-step");
  await shellHoldAThenPlayB(page);

  // Same cushion as above, so the proof is the room's well landing on the
  // playing point (`handleStep` calls `followPlayback` before the step).
  await page.locator(`${CARD} button[aria-label="Next point"]`).click();
  await expect.poll(() => playingRow(page)).toBe("b");
  await expect.poll(() => cardShots(page)).toEqual(["b-shot-1", "b-shot-2"]);
  await expect(page.locator(`${CARD_HEAD} .mono`)).toHaveText("2 / 3");
  await expect(page.locator(LINE)).toHaveCount(0);
  await expect(page.locator(SHELL_PILL)).toHaveCount(0);
  expect(await roomWellUnder(page)).toBe("b");
});

/* -------------------------------------------------------------------------
 * T23 — the shell's own point list gets the drawer's "Now playing" pill.
 *
 * The same `FollowPill`, gated by the same `followAffordance` rule, with
 * T21's edge pin and hysteresis; on the light tone it floats on
 * `--shadow-floating` instead of the drawer's inset hairline. These cases
 * hold the shell list by a click; T24 (below) adds the hand-scroll hold.
 *
 * The harness mounts `FilmTab` with no `@container`, so the columns stack
 * and the list's card grows to its content: nothing to scroll. In the app
 * the tab's column bounds it (`max-h-full` inside a pane-height column);
 * `boundShellList` gives the column that bound here, and `pad=12` makes the
 * rows outgrow it. The shell list opens no well (it takes no
 * `onSelectShot`), so "the well opens under the playing row" is read through
 * the room's drawer (`roomWellUnder`), which shares the tab's `pointFocus`.
 * ---------------------------------------------------------------------- */

const SHELL_SCROLLER = `${SHELL_LIST} .overflow-y-auto`;

/**
 * Give the shell list's column a height, as the tab's side-by-side layout
 * does in the app. The column's outer box is a `shrink-0` flex item, so a
 * height on it holds; the card inside is `max-h-full`.
 */
async function boundShellList(page: Page, px: number) {
  await page.evaluate(
    ([sel, h]) =>
      new Promise<void>((resolve) => {
        const column = document.querySelector<HTMLElement>(sel as string)
          ?.parentElement?.parentElement;
        if (column) column.style.height = `${h}px`;
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
    [SHELL_LIST, px] as const,
  );
  const { client, scroll } = await page.evaluate((sel) => {
    const list = document.querySelector<HTMLElement>(sel)!;
    return { client: list.clientHeight, scroll: list.scrollHeight };
  }, SHELL_SCROLLER);
  // The precondition every case below rests on: the list really scrolls.
  expect(scroll).toBeGreaterThan(client);
}

/** The shell pill's edge, read from its classes, as `pillEdge` does. */
async function shellPillEdge(page: Page): Promise<string> {
  return page.locator(SHELL_PILL).evaluate((el) => {
    const top = el.classList.contains("top-3");
    const bottom = el.classList.contains("bottom-3");
    return top && !bottom ? "top" : bottom && !top ? "bottom" : "both/none";
  });
}

/** The shell's lit row against its scroller's box. */
async function shellLitPlace(page: Page): Promise<string | null> {
  return page.evaluate((sel) => {
    const list = document.querySelector<HTMLElement>(sel);
    const lit = list?.querySelector<HTMLElement>(
      '[data-point-id][data-playing="true"]',
    );
    if (!list || !lit) return null;
    const box = list.getBoundingClientRect();
    const row = lit.getBoundingClientRect();
    if (row.top >= box.bottom) return "below";
    if (row.bottom <= box.top) return "above";
    if (row.top >= box.top - 0.5 && row.bottom <= box.bottom + 0.5)
      return "inside";
    return row.bottom > box.bottom ? "straddles-bottom" : "straddles-top";
  }, SHELL_SCROLLER);
}

async function shellScrollTop(page: Page): Promise<number> {
  return page.evaluate(
    (sel) => document.querySelector(sel)?.scrollTop ?? -1,
    SHELL_SCROLLER,
  );
}

/**
 * Held on `a` by the shell row's click, the list parked at its end so `b`
 * lights ABOVE the box, then the film moved into `b`: the pill's first state.
 */
async function shellHoldAThenPlayBAbove(page: Page) {
  await page.click(SHELL_ROW("a"));
  await expect.poll(() => playingRow(page)).toBe("a");
  // Held ≡ playing: nothing to return to yet.
  await expect(page.locator(SHELL_PILL)).toHaveCount(0);
  await parkScroller(page, SHELL_SCROLLER, "end");
  await seekTo(page, REPORT, 0.3);
  await expect.poll(() => playingRow(page)).toBe("b");
  await expect.poll(() => shellLitPlace(page)).toBe("above");
}

test("T23: the shell list's pill names the playing point with the drawer's words, pinned top over a floating shadow", async ({
  page,
}) => {
  await openShell(page, "shell-pill", { pad: "12", ttl: String(3600_000) });
  await boundShellList(page, 240);
  await expect(page.locator(SHELL_PILL)).toHaveCount(0);
  await shellHoldAThenPlayBAbove(page);

  const pill = page.locator(SHELL_PILL);
  await expect(pill).toHaveCount(1);
  await expect(pill).toHaveText("Now playing · Point 2");
  await expect(pill).toHaveAttribute(
    "aria-label",
    "Now playing: point 2 — follow playback",
  );
  await expect(pill).toHaveAttribute("type", "button");
  // T21's placement, reused: the edge the lit row is beyond, chevron to it.
  await expect.poll(() => shellPillEdge(page)).toBe("top");
  await expect(pill.locator("svg.lucide-chevron-up")).toHaveCount(1);
  await expect(pill.locator("svg.lucide-chevron-down")).toHaveCount(0);
  await expect(pill.locator("svg")).toHaveAttribute("aria-hidden", "true");
  expect(
    await pill.evaluate((el) =>
      getComputedStyle(el).getPropertyValue("--film-pill-rise").trim(),
    ),
  ).toBe("-4px");
  // The light tone's one difference: the floating shadow, not the hairline.
  await expect(pill).toHaveClass(
    /(^|\s)shadow-\[var\(--shadow-floating\)\](\s|$)/,
  );
  await expect(pill).not.toHaveClass(/inset_0_0_0_1px/);
  for (const cls of [
    "bg-[rgba(13,13,13,0.72)]",
    "text-white",
    "rounded-[var(--radius-button)]",
    "text-[11px]",
  ]) {
    expect(await pill.evaluate((el, c) => el.classList.contains(c), cls)).toBe(
      true,
    );
  }
});

test("T23: no shell pill while the lit row is fully in the shell list's view", async ({
  page,
}) => {
  await openShell(page, "shell-pill-in-view", {
    pad: "12",
    ttl: String(3600_000),
  });
  await boundShellList(page, 240);
  await shellHoldAThenPlayBAbove(page);
  await expect(page.locator(SHELL_PILL)).toHaveCount(1);

  // Back to the top: `b` is wholly inside the box, nothing to return to.
  await parkScroller(page, SHELL_SCROLLER, 0);
  await expect.poll(() => shellLitPlace(page)).toBe("inside");
  await expect(page.locator(SHELL_PILL)).toHaveCount(0);

  // Out of view again, and it is back — still held, nothing re-followed.
  await parkScroller(page, SHELL_SCROLLER, "end");
  await expect.poll(() => shellLitPlace(page)).toBe("above");
  await expect(page.locator(SHELL_PILL)).toHaveCount(1);
});

test("T23: the shell pill pins bottom below the box, keeps its edge while straddling, and flips only once wholly above", async ({
  page,
}) => {
  await openShell(page, "shell-pill-edge", {
    pad: "12",
    ttl: String(3600_000),
  });
  // A short column, so `b` sits wholly BELOW the box with the list at its top.
  await boundShellList(page, 140);
  await page.click(SHELL_ROW("a"));
  await expect.poll(() => playingRow(page)).toBe("a");
  await parkScroller(page, SHELL_SCROLLER, 0);
  await seekTo(page, REPORT, 0.3);
  await expect.poll(() => playingRow(page)).toBe("b");

  const pill = page.locator(SHELL_PILL);
  await expect.poll(() => shellLitPlace(page)).toBe("below");
  await expect(pill).toHaveCount(1);
  await expect.poll(() => shellPillEdge(page)).toBe("bottom");
  await expect(pill.locator("svg.lucide-chevron-down")).toHaveCount(1);

  const nudge = await page.evaluate((sel) => {
    const list = document.querySelector<HTMLElement>(sel)!;
    const lit = list.querySelector<HTMLElement>('[data-playing="true"]')!;
    const box = list.getBoundingClientRect();
    const row = lit.getBoundingClientRect();
    return Math.ceil(row.top - box.bottom + row.height / 2);
  }, SHELL_SCROLLER);
  await parkScroller(page, SHELL_SCROLLER, nudge);
  await expect.poll(() => shellLitPlace(page)).toBe("straddles-bottom");
  await expect(pill).toHaveCount(1);
  expect(await shellPillEdge(page)).toBe("bottom");

  await parkScroller(page, SHELL_SCROLLER, "end");
  await expect.poll(() => shellLitPlace(page)).toBe("above");
  await expect.poll(() => shellPillEdge(page)).toBe("top");
  await expect(pill.locator("svg.lucide-chevron-up")).toHaveCount(1);
  await expect(pill.locator("svg.lucide-chevron-down")).toHaveCount(0);
});

test("T23: pressing the shell pill re-follows — it leaves, the list scrolls to the playing row, the well opens under it", async ({
  page,
}) => {
  await openShell(page, "shell-pill-press", {
    pad: "12",
    ttl: String(3600_000),
  });
  await boundShellList(page, 240);
  await shellHoldAThenPlayBAbove(page);
  const parked = await shellScrollTop(page);

  await page.locator(SHELL_PILL).click();
  await expect(page.locator(SHELL_PILL)).toHaveCount(0);
  // Following again: the keep-in-view brings the lit row back into the box.
  await expect.poll(() => shellLitPlace(page)).toBe("inside");
  expect(await shellScrollTop(page)).toBeLessThan(parked);
  // The shell list draws no well; the drawer, on the same `pointFocus`,
  // shows the held well closed and the well under the playing row.
  expect(await roomWellUnder(page)).toBe("b");
});

/* -------------------------------------------------------------------------
 * T24 — a hand scroll holds the shell list too, and the pill shows whenever
 * held and the lit row is out of the box — including when the held point IS
 * the playing one (`followAffordance` no longer hides it then; `FollowPill`'s
 * T21 in-view rule does). A wheel or a scrolling key holds; the list is then
 * parked by assignment, which is not intent (T18), so "out of view" is
 * deterministic. `b` is lit at 0.3, as in `shellHoldAThenPlayB`: 0.25 sits
 * exactly on `b`'s early-reach edge (0.35 − 0.1) and reads `a`.
 * ---------------------------------------------------------------------- */

/** Wait until the shell scroller's `scrollTop` stops changing. */
async function shellScrollSettled(page: Page) {
  let last = await shellScrollTop(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const now = await shellScrollTop(page);
    if (now === last) break;
    last = now;
  }
}

test("T24: a wheel holds the shell list — the pill offers the playing point back, and the next crossing leaves the list alone", async ({
  page,
}) => {
  await openShell(page, "shell-wheel-hold", {
    pad: "12",
    ttl: String(3600_000),
  });
  await boundShellList(page, 240);
  await seekTo(page, REPORT, 0.3);
  await expect.poll(() => playingRow(page)).toBe("b");
  await shellScrollSettled(page);

  // A real wheel over the shell's scroller: intent, so it holds `b` — the
  // playing point — and the list is then parked with `b` above the box.
  await wheelScroller(page, SHELL_SCROLLER, 200);
  await parkScroller(page, SHELL_SCROLLER, "end");
  await expect.poll(() => shellLitPlace(page)).toBe("above");
  const pill = page.locator(SHELL_PILL);
  await expect(pill).toHaveCount(1);
  await expect(pill).toHaveText("Now playing · Point 2");
  const parked = await shellScrollTop(page);

  // Held: the crossing into `c` does not scroll the list back.
  await seekTo(page, REPORT, 0.5);
  await expect.poll(() => playingRow(page)).toBe("c");
  await page.waitForTimeout(400);
  expect(await shellScrollTop(page)).toBe(parked);
  await expect(pill).toHaveText("Now playing · Point 3");

  await pill.click();
  await expect(pill).toHaveCount(0);
  await expect.poll(() => shellLitPlace(page)).toBe("inside");
});

test("T24: an arrow on a focused shell row is a scroll that holds, not a step", async ({
  page,
}) => {
  await openShell(page, "shell-key-hold", {
    pad: "12",
    ttl: String(3600_000),
  });
  await boundShellList(page, 240);
  await seekTo(page, REPORT, 0.3);
  await expect.poll(() => playingRow(page)).toBe("b");
  await shellScrollSettled(page);

  // The list's native listener holds first; the tab's window handler then
  // returns early for a `[role=button]` target, so nothing re-follows. The
  // proof is the pill and the unmoved list, never the time.
  await page.focus(SHELL_ROW("b"));
  await page.keyboard.press("ArrowDown");
  await shellScrollSettled(page);
  await parkScroller(page, SHELL_SCROLLER, "end");
  const parked = await shellScrollTop(page);

  await seekTo(page, REPORT, 0.5);
  await expect.poll(() => playingRow(page)).toBe("c");
  await page.waitForTimeout(400);
  expect(await shellScrollTop(page)).toBe(parked);
  await expect(page.locator(SHELL_PILL)).toHaveCount(1);
});

test("T24: held on the playing point, scrolled out of view, the drawer's pill offers it back", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "pill-held-playing", { pad: "12" });
  // A click on `a` at film zero holds `a` and seeks it: held ≡ playing.
  await page.click(DRAWER_ROW("a"));
  await expect.poll(() => playingRow(page)).toBe("a");
  await drawerSettled(page);
  await parkDrawer(page, "end");

  const pill = page.locator(PILL);
  await expect(pill).toHaveCount(1);
  await expect(pill).toHaveText("Now playing · Point 1");
  await expect.poll(() => pillEdge(page)).toBe("top");

  await pill.click();
  await expect(pill).toHaveCount(0);
  await expect.poll(() => litRowInView(page)).toBe(true);
});

/* -------------------------------------------------------------------------
 * T25 — a hand scroll with nothing displayed still holds: `held` with
 * `pointId: null`, a hold with no well. The harness has no dead time between
 * `a`/`b`/`c` (`filmStops` clamps each window's end to the next start), so
 * the only gap it can reach is film 0 → 0.1 s, before the first point: every
 * case wheels there, and first proves nothing is lit and the film is still
 * at zero — otherwise the wheel would be an ordinary hold on a real point.
 * ---------------------------------------------------------------------- */

/**
 * A wheel over `scroller` at film zero, asserted to land before any point:
 * the film paused inside the 0 → 0.1 s gap (the report player parks a hair
 * past zero, 0.001, to paint its first frame) with no row lit, both before
 * and after the wheel.
 */
async function wheelAtFilmZero(page: Page, video: string, scroller: string) {
  const beforeFirstPoint = async () => {
    const s = await state(page, video);
    expect(s?.paused).toBe(true);
    expect(s?.time).toBeLessThan(0.1);
    expect(await playingRow(page)).toBeNull();
  };
  await beforeFirstPoint();
  await wheelScroller(page, scroller, 200);
  // Still nothing displayed: the hold the wheel made is a null one.
  await beforeFirstPoint();
}

test("T25: a wheel before the first point holds with no well, and the next point does not scroll the drawer", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "null-hold-drawer", { pad: "12" });
  await drawerSettled(page);
  await wheelAtFilmZero(page, ROOM, DRAWER_SCROLLER);
  await parkDrawer(page, "end");
  const parked = await drawerScrollTop(page);

  await seekTo(page, ROOM, 0.4);
  await expect.poll(() => playingRow(page)).toBe("b");
  await page.waitForTimeout(400);
  // Held: the crossing did not scroll the list to `b`, and the hold opened
  // no well of its own.
  expect(await drawerScrollTop(page)).toBe(parked);
  await expect(page.locator(`${DRAWER} [data-shot-well]`)).toHaveCount(0);
  const pill = page.locator(PILL);
  await expect(pill).toHaveCount(1);
  await expect(pill).toHaveText("Now playing · Point 2");

  await pill.click();
  await expect(pill).toHaveCount(0);
  await expect(page.locator(WELL_UNDER("b"))).toHaveCount(1);
  await expect.poll(() => litRowInView(page)).toBe(true);
});

test("T25: a null hold survives a cut change — the pill says the playing point is not in this cut", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "null-hold-cut", { pad: "12" });
  await drawerSettled(page);
  await wheelAtFilmZero(page, ROOM, DRAWER_SCROLLER);

  // "Saved only" keeps `a`; `b` is unsaved. A held point the cut dropped
  // would re-follow here — a null hold has no row to drop, so it stays.
  const drawer = page.locator(DRAWER);
  const menu = page.getByRole("menu", { name: "Point filters" });
  await drawer.getByRole("button", { name: "Filters" }).click();
  await menu.getByText("Saved only").click();
  await expect(drawer.locator('[data-point-id="b"]')).toHaveCount(0);
  await page.keyboard.press("Escape");

  await seekTo(page, ROOM, 0.4);
  await expect(page.locator(PILL)).toHaveCount(1);
  await expect(page.locator(PILL)).toHaveText("Now playing · not in this cut");
});

test("T25: a row click replaces a null hold with a real one", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "null-hold-click", { pad: "12" });
  await drawerSettled(page);
  await wheelAtFilmZero(page, ROOM, DRAWER_SCROLLER);

  await page.locator(DRAWER_ROW("a")).scrollIntoViewIfNeeded();
  await page.click(DRAWER_ROW("a"));
  await expect.poll(() => playingRow(page)).toBe("a");
  await expect(page.locator(WELL_UNDER("a"))).toHaveCount(1);
});

test("T25: a wheel before the first point holds the shell list, and the next point does not scroll it", async ({
  page,
}) => {
  await openShell(page, "null-hold-shell", {
    pad: "12",
    ttl: String(3600_000),
  });
  await boundShellList(page, 240);
  await wheelAtFilmZero(page, REPORT, SHELL_SCROLLER);
  await parkScroller(page, SHELL_SCROLLER, "end");
  const parked = await shellScrollTop(page);

  await seekTo(page, REPORT, 0.3);
  await expect.poll(() => playingRow(page)).toBe("b");
  await page.waitForTimeout(400);
  expect(await shellScrollTop(page)).toBe(parked);
  await expect(page.locator(SHELL_PILL)).toHaveCount(1);
});

/* -------------------------------------------------------------------------
 * T26 — a re-follow is a JUMP: the playing row goes to the top of the box,
 * `REFOLLOW_JUMP_INSET_PX` in, clamped at the end of the list. Continuous
 * follow keeps the minimal scroll. A step re-follows before its seek lands,
 * so the jump is a window (`REFOLLOW_JUMP_WINDOW_MS`) and the crossing that
 * follows inside it is part of the same jump.
 * ---------------------------------------------------------------------- */

/** The row's edges against its scroller's box: `top` ≥ 0 and `bottom` ≤ 0 is inside. */
async function rowOffset(
  page: Page,
  scroller: string,
  id: string,
): Promise<{ top: number; bottom: number } | null> {
  return page.evaluate(
    ([sel, pointId]) => {
      const list = document.querySelector<HTMLElement>(sel as string);
      const row = list?.querySelector<HTMLElement>(
        `[data-point-id="${pointId}"]`,
      );
      if (!list || !row) return null;
      const box = list.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      return { top: r.top - box.top, bottom: r.bottom - box.bottom };
    },
    [scroller, id] as const,
  );
}

/** `rowOffset(…).top`, NaN when the row is missing, for `expect.poll`. */
async function rowTop(page: Page, scroller: string, id: string) {
  return (await rowOffset(page, scroller, id))?.top ?? Number.NaN;
}

test("T26: pressing the shell pill with the lit row below jumps it to the top of the box", async ({
  page,
}) => {
  await openShell(page, "jump-shell-below", {
    pad: "12",
    ttl: String(3600_000),
  });
  await boundShellList(page, 140);
  await page.click(SHELL_ROW("a"));
  await expect.poll(() => playingRow(page)).toBe("a");
  await parkScroller(page, SHELL_SCROLLER, 0);
  await seekTo(page, REPORT, 0.3);
  await expect.poll(() => playingRow(page)).toBe("b");
  await expect.poll(() => shellLitPlace(page)).toBe("below");

  await page.locator(SHELL_PILL).click();
  await expect(page.locator(SHELL_PILL)).toHaveCount(0);
  // Not the minimal scroll (which would leave `b` at the box's bottom).
  await expect
    .poll(() => rowTop(page, SHELL_SCROLLER, "b"))
    .toBeGreaterThanOrEqual(REFOLLOW_JUMP_INSET_PX - 1);
  await expect
    .poll(() => rowTop(page, SHELL_SCROLLER, "b"))
    .toBeLessThanOrEqual(REFOLLOW_JUMP_INSET_PX + 1);
});

test("T26: pressing the shell pill with the lit row above jumps it to the top of the box", async ({
  page,
}) => {
  await openShell(page, "jump-shell-above", {
    pad: "12",
    ttl: String(3600_000),
  });
  await boundShellList(page, 240);
  await shellHoldAThenPlayBAbove(page);

  await page.locator(SHELL_PILL).click();
  await expect(page.locator(SHELL_PILL)).toHaveCount(0);
  await expect
    .poll(() => rowTop(page, SHELL_SCROLLER, "b"))
    .toBeGreaterThanOrEqual(REFOLLOW_JUMP_INSET_PX - 1);
  await expect
    .poll(() => rowTop(page, SHELL_SCROLLER, "b"))
    .toBeLessThanOrEqual(REFOLLOW_JUMP_INSET_PX + 1);
});

test("T26: pressing the drawer pill jumps the playing row to the top on a smooth scroll", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "jump-drawer-pill", { pad: "12" });
  await holdAThenPlayB(page);
  await spyScrollTo(page);

  await page.locator(PILL).click();
  await expect(page.locator(PILL)).toHaveCount(0);
  await expect
    .poll(() => rowTop(page, DRAWER_SCROLLER, "b"))
    .toBeGreaterThanOrEqual(REFOLLOW_JUMP_INSET_PX - 1);
  await expect
    .poll(() => rowTop(page, DRAWER_SCROLLER, "b"))
    .toBeLessThanOrEqual(REFOLLOW_JUMP_INSET_PX + 1);
  expect((await scrollTos(page)).some((o) => o.behavior === "smooth")).toBe(
    true,
  );
});

test("T26: a step from held jumps to the point it lands on — the crossing is inside the window", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "jump-drawer-step", { pad: "12" });
  await holdAThenPlayB(page);

  // What `step` does, in its order: re-follow, then seek. A real `→` cannot
  // be the trigger here — the harness's stops sit 0.1–0.15s apart and
  // `nextStop` skips anything within its 0.5s cushion, so from `b` there is
  // nothing to step to. The pill's re-follow, then a seek into `c` in the same
  // task: `b` jumps first, `c` lights a tick later inside the window, and the
  // jump that wins is `c`'s.
  await page.evaluate(
    ([pill, video]) => {
      document.querySelector<HTMLElement>(pill as string)?.click();
      const el = document.querySelector<HTMLVideoElement>(video as string);
      if (el) el.currentTime = 0.5;
    },
    [PILL, ROOM] as const,
  );
  await expect.poll(() => playingRow(page)).toBe("c");
  await expect
    .poll(() => rowTop(page, DRAWER_SCROLLER, "c"))
    .toBeGreaterThanOrEqual(REFOLLOW_JUMP_INSET_PX - 1);
  await expect
    .poll(() => rowTop(page, DRAWER_SCROLLER, "c"))
    .toBeLessThanOrEqual(REFOLLOW_JUMP_INSET_PX + 1);
});

test("T26: continuous follow keeps the minimal scroll — the crossing lands the row at the box's bottom, not its top", async ({
  page,
}) => {
  await openShell(page, "jump-continuous", {
    pad: "12",
    ttl: String(3600_000),
  });
  await boundShellList(page, 140);
  // Following from the start: no hold, so no transition and no window.
  await seekTo(page, REPORT, 0.3);
  await expect.poll(() => playingRow(page)).toBe("b");
  await seekTo(page, REPORT, 0.5);
  await expect.poll(() => playingRow(page)).toBe("c");

  await expect
    .poll(async () =>
      Math.abs(
        (await rowOffset(page, SHELL_SCROLLER, "c"))?.bottom ?? Number.NaN,
      ),
    )
    .toBeLessThanOrEqual(1);
  await shellScrollSettled(page);
  expect(await rowTop(page, SHELL_SCROLLER, "c")).toBeGreaterThan(
    REFOLLOW_JUMP_INSET_PX + 1,
  );
});

test("T26: a jump near the end of the list clamps to the end, the row inside the box", async ({
  page,
}) => {
  // Measured: at pad 0 the list is 240px tall and `c` starts 136px down, so
  // aligning it needs 128px of travel; a 200px column leaves a 135px box and
  // only 105px of travel (the task's guess, pad 0 at 140px, has 165px and
  // aligns without clamping). `c` (136–188px) is wholly below the 135px box.
  await openShell(page, "jump-clamp", { pad: "0", ttl: String(3600_000) });
  await boundShellList(page, 200);
  await page.click(SHELL_ROW("a"));
  await expect.poll(() => playingRow(page)).toBe("a");
  await parkScroller(page, SHELL_SCROLLER, 0);
  await seekTo(page, REPORT, 0.5);
  await expect.poll(() => playingRow(page)).toBe("c");
  await expect.poll(() => shellLitPlace(page)).toBe("below");
  // The precondition the case rests on: `c` aligned to the top would need
  // more travel than the list has.
  const { aligned, end } = await page.evaluate(
    ([sel, inset]) => {
      const list = document.querySelector<HTMLElement>(sel as string)!;
      const row = list.querySelector<HTMLElement>('[data-point-id="c"]')!;
      const box = list.getBoundingClientRect();
      return {
        aligned:
          list.scrollTop +
          row.getBoundingClientRect().top -
          box.top -
          (inset as number),
        end: list.scrollHeight - list.clientHeight,
      };
    },
    [SHELL_SCROLLER, REFOLLOW_JUMP_INSET_PX] as const,
  );
  expect(aligned).toBeGreaterThan(end + 1);

  await page.locator(SHELL_PILL).click();
  await expect(page.locator(SHELL_PILL)).toHaveCount(0);
  await expect.poll(() => shellScrollTop(page)).toBeGreaterThanOrEqual(end - 1);
  await shellScrollSettled(page);
  expect(Math.abs((await shellScrollTop(page)) - end)).toBeLessThanOrEqual(1);
  const c = await rowOffset(page, SHELL_SCROLLER, "c");
  expect(c!.top).toBeGreaterThanOrEqual(-0.5);
  expect(c!.bottom).toBeLessThanOrEqual(0.5);
  expect(
    c!.top >= REFOLLOW_JUMP_INSET_PX - 1 &&
      c!.top <= REFOLLOW_JUMP_INSET_PX + 1,
  ).toBe(false);
});

/* -------------------------------------------------------------------------
 * The seek lane's hover frame (handoff T2)
 *
 * The report lane floats a second, muted `<video>` on the player's own
 * credential over the pointer. What only a browser can settle: that it opens
 * for a mouse and a scrub but not for focus or a passing touch, that it seeks
 * to the lane time under the pointer without a seek per move, and that a
 * refreshed credential remounts it rather than swapping its `src`.
 *
 * The fixture is 2.000 s, so 75% of the lane is 1.5 s and 70% is 1.4 s —
 * both read "0:01" on the clock.
 * ---------------------------------------------------------------------- */

const LANE = `div:has(> ${REPORT}) [role="slider"][aria-label="Seek"]`;
const PREVIEW = '[data-testid="film-seek-preview"]';
const PREVIEW_VIDEO = '[data-testid="film-seek-preview-video"]';
const PREVIEW_TIME = '[data-testid="film-seek-preview-time"]';
/** `PREVIEW_SEEK_INTERVAL_MS`, written out so a retune fails here first. */
const PREVIEW_SEEK_INTERVAL_MS = 120;

async function laneBox(page: Page) {
  const box = await page.locator(LANE).boundingBox();
  if (!box) throw new Error("no report lane");
  return {
    ...box,
    at: (fraction: number) => box.x + fraction * box.width,
    y: box.y + box.height / 2,
  };
}

async function previewTime(page: Page) {
  return page.evaluate(
    (sel) =>
      document.querySelector<HTMLVideoElement>(sel)?.currentTime ?? Number.NaN,
    PREVIEW_VIDEO,
  );
}

test("T2 (a): hovering the report lane opens a live frame at the pointer's time, and leaving closes it", async ({
  page,
}) => {
  await open(page, "preview-hover", { ttl: String(60 * 60 * 1000) });
  const lane = await laneBox(page);

  await page.mouse.move(lane.at(0.75), lane.y);
  await expect(page.locator(PREVIEW)).not.toHaveAttribute(
    "data-state",
    "closed",
  );
  await expect(page.locator(PREVIEW_TIME)).toHaveText("0:01");
  const hover = await page
    .locator(LANE)
    .evaluate((el) =>
      Number((el as HTMLElement).style.getPropertyValue("--film-hover")),
    );
  expect(Math.abs(hover - 1.5)).toBeLessThan(0.05);

  await expect
    .poll(() => page.locator(PREVIEW).getAttribute("data-state"), {
      timeout: 5000,
    })
    .toBe("live");
  await expect
    .poll(async () => Math.abs((await previewTime(page)) - 1.5))
    .toBeLessThan(0.1);

  await page.mouse.move(lane.at(0.75), lane.y + 40);
  await expect(page.locator(PREVIEW)).toHaveAttribute("data-state", "closed");
  await expect(page.locator(PREVIEW)).toBeHidden();
});

test("T2 (b): keyboard focus opens nothing, and the arrows still seek", async ({
  page,
}) => {
  await open(page, "preview-focus", { ttl: String(60 * 60 * 1000) });
  await page.mouse.move(2, 2);

  const slider = page.locator(LANE);
  await slider.focus();
  const state = await page.locator(PREVIEW).getAttribute("data-state");
  expect(state === null || state === "closed").toBe(true);

  const before = Number(await slider.getAttribute("aria-valuenow"));
  await page.keyboard.press("ArrowRight");
  // 5 s on, or to the end of a 2 s film.
  await expect(slider).toHaveAttribute(
    "aria-valuenow",
    String(Math.min(2, before + 5)),
  );
  const after = await page.locator(PREVIEW).getAttribute("data-state");
  expect(after === null || after === "closed").toBe(true);
  await expect(page.locator(PREVIEW_VIDEO)).toHaveCount(0);
});

test("T2 (c): a scrub keeps the preview on the thumb off the lane, and releasing there closes it", async ({
  page,
}) => {
  await open(page, "preview-scrub", { ttl: String(60 * 60 * 1000) });
  const lane = await laneBox(page);

  await page.mouse.move(lane.at(0.3), lane.y);
  await page.mouse.down();
  await page.mouse.move(lane.at(0.7), lane.y, { steps: 5 });
  await page.mouse.move(lane.at(0.7), lane.y + 40);

  await expect(page.locator(PREVIEW)).not.toHaveAttribute(
    "data-state",
    "closed",
  );
  await expect(page.locator(PREVIEW_TIME)).toHaveText("0:01");
  await expect
    .poll(async () => Math.abs(((await state(page, REPORT))?.time ?? 0) - 1.4))
    .toBeLessThan(0.1);

  await page.mouse.up();
  await expect(page.locator(PREVIEW)).toHaveAttribute("data-state", "closed");
});

test("T2 (d): a touch opens the preview only while it drags", async ({
  page,
}) => {
  await open(page, "preview-touch", { ttl: String(60 * 60 * 1000) });
  const lane = await laneBox(page);
  const slider = page.locator(LANE);
  const at = { clientX: lane.at(0.5), clientY: lane.y, isPrimary: true };

  await slider.dispatchEvent("pointermove", { pointerType: "touch", ...at });
  // Past the rest a hover would have waited for.
  await page.waitForTimeout(300);
  await expect(page.locator(PREVIEW_VIDEO)).toHaveCount(0);
  await expect(page.locator(PREVIEW)).toHaveAttribute("data-state", "closed");

  await slider.dispatchEvent("pointerdown", { pointerType: "touch", ...at });
  await expect(page.locator(PREVIEW)).not.toHaveAttribute(
    "data-state",
    "closed",
  );

  await page.evaluate(() =>
    window.dispatchEvent(
      new PointerEvent("pointerup", { pointerType: "touch", bubbles: true }),
    ),
  );
  await expect(page.locator(PREVIEW)).toHaveAttribute("data-state", "closed");
});

test("T2 (e): a sweep across the lane coalesces the preview's seeks and lands on the last one", async ({
  page,
}) => {
  await open(page, "preview-sweep", { ttl: String(60 * 60 * 1000) });
  const lane = await laneBox(page);

  // A first hover mounts the element; wait until it has metadata.
  await page.mouse.move(lane.at(0.5), lane.y);
  await page.waitForFunction(
    (sel) =>
      (document.querySelector<HTMLVideoElement>(sel)?.readyState ?? 0) >= 1,
    PREVIEW_VIDEO,
    { timeout: 5000 },
  );
  await page.mouse.move(lane.at(0) + 1, lane.y);
  await page.waitForTimeout(300);

  // The `holdSeeks` idiom, on this one element and passing straight through:
  // count every `currentTime` set and keep the last value and when it was.
  await page.evaluate((sel) => {
    const el = document.querySelector<HTMLVideoElement>(sel)!;
    const real = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "currentTime",
    )!;
    const w = window as unknown as {
      __previewSets: {
        count: number;
        last: number;
        lastAt: number;
        start: number;
      };
    };
    w.__previewSets = {
      count: 0,
      last: -1,
      lastAt: 0,
      start: performance.now(),
    };
    Object.defineProperty(el, "currentTime", {
      configurable: true,
      get() {
        return real.get!.call(this);
      },
      set(this: HTMLMediaElement, value: number) {
        w.__previewSets.count += 1;
        w.__previewSets.last = value;
        w.__previewSets.lastAt = performance.now();
        real.set!.call(this, value);
      },
    });
  }, PREVIEW_VIDEO);

  const endX = lane.at(1) - 1;
  await page.mouse.move(endX, lane.y, { steps: 30 });
  const finalTime = ((endX - lane.x) / lane.width) * 2;

  const sets = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __previewSets: {
              count: number;
              last: number;
              lastAt: number;
              start: number;
            };
          }
        ).__previewSets,
    );
  await expect
    .poll(async () => Math.abs((await sets()).last - finalTime), {
      timeout: 5000,
    })
    .toBeLessThan(0.1);
  // Let any trailing timer fire, so a late extra set would be counted.
  await page.waitForTimeout(PREVIEW_SEEK_INTERVAL_MS * 3);
  const { count, last, lastAt, start } = await sets();
  expect(Math.abs(last - finalTime)).toBeLessThan(0.1);
  expect(count).toBeGreaterThan(0);
  expect(count).toBeLessThanOrEqual(
    Math.ceil((lastAt - start) / PREVIEW_SEEK_INTERVAL_MS) + 2,
  );
});

test("T2 (f): a refreshed credential remounts the preview element on the new URL", async ({
  page,
}) => {
  const matchId = "ok-preview-refresh";
  await open(page, matchId);
  const lane = await laneBox(page);

  await page.mouse.move(lane.at(0.5), lane.y);
  await expect(page.locator(PREVIEW_VIDEO)).toHaveCount(1);
  await page
    .locator(PREVIEW_VIDEO)
    .evaluate((el) => ((el as HTMLElement).dataset.marker = "first"));
  await page.mouse.move(lane.at(0.5), lane.y + 40);

  await release(page, matchId);
  await awaitCredential(page, REPORT, 1);

  await page.mouse.move(lane.at(0.6), lane.y);
  await expect(page.locator(PREVIEW)).not.toHaveAttribute(
    "data-state",
    "closed",
  );
  const preview = page.locator(PREVIEW_VIDEO);
  await expect(preview).toHaveCount(1);
  expect(
    await preview.evaluate((el) => (el as HTMLVideoElement).src),
  ).toContain("cred=1");
  expect(
    await preview.evaluate((el) => (el as HTMLElement).dataset.marker ?? null),
  ).toBeNull();
});

/* -------------------------------------------------------------------------
 * The room's lane preview (T4)
 *
 * The room passes its own credential to the lane, which draws the 256×144
 * size with no overhang — clamped to the slider, which the drawer shortens —
 * and paints above the scoreboard and the court. `elementFromPoint` skips
 * `pointer-events: none`, so the paint-order probe turns the box's pointer
 * events on for exactly one call.
 * ---------------------------------------------------------------------- */

async function previewRect(page: Page) {
  const box = await page.locator(ROOM_PREVIEW).boundingBox();
  const frame = await page
    .locator(`${ROOM_PREVIEW} [data-testid="film-seek-preview-frame"]`)
    .boundingBox();
  if (!box || !frame) throw new Error("no room preview");
  return { box, frame };
}

/** Whether the preview box paints above `selector` where the two overlap. */
async function paintsAbove(page: Page, selector: string) {
  return page.evaluate(
    ([previewSel, otherSel]) => {
      const box = document.querySelector<HTMLElement>(previewSel);
      const other = document.querySelector<HTMLElement>(otherSel);
      if (!box || !other) return { overlap: false, above: false };
      const a = box.getBoundingClientRect();
      const b = other.getBoundingClientRect();
      const left = Math.max(a.left, b.left);
      const right = Math.min(a.right, b.right);
      const top = Math.max(a.top, b.top);
      const bottom = Math.min(a.bottom, b.bottom);
      if (right - left < 2 || bottom - top < 2)
        return { overlap: false, above: false };
      const was = box.style.pointerEvents;
      box.style.pointerEvents = "auto";
      try {
        const hit = document.elementFromPoint(
          (left + right) / 2,
          (top + bottom) / 2,
        );
        return { overlap: true, above: !!hit && box.contains(hit) };
      } finally {
        box.style.pointerEvents = was;
      }
    },
    [ROOM_PREVIEW, selector] as const,
  );
}

/** Drag a room overlay by its body into the room's bottom-left corner. */
async function dragToBottomLeft(page: Page, selector: string) {
  const handle = await page.locator(selector).boundingBox();
  const room = await page.locator(ROOM).boundingBox();
  if (!handle || !room) throw new Error(`nothing to drag at ${selector}`);
  const fromX = handle.x + 4;
  const fromY = handle.y + handle.height - 4;
  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  await page.mouse.move(room.x + 40, room.y + room.height - 160, {
    steps: 12,
  });
  await page.mouse.up();
}

test("T4: the room lane previews at 256×144, clamped inside the drawer-shortened lane", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "room-preview-geometry");
  const slider = await page.locator(ROOM_LANE).boundingBox();
  if (!slider) throw new Error("no room lane");

  await hoverRoomLane(page, 0.999);
  const right = await previewRect(page);
  expect(right.frame.width).toBeCloseTo(256, 0);
  expect(right.frame.height).toBeCloseTo(144, 0);
  expect(right.box.x + right.box.width).toBeLessThanOrEqual(
    slider.x + slider.width + 0.5,
  );

  await hoverRoomLane(page, 0.001);
  const left = await previewRect(page);
  expect(left.frame.width).toBeCloseTo(256, 0);
  expect(left.frame.height).toBeCloseTo(144, 0);
  expect(left.box.x).toBeGreaterThanOrEqual(slider.x - 0.5);
});

test("T4: the room preview paints above the scoreboard and the court", async ({
  page,
}) => {
  await open(page, "room-preview-paint");
  // Inside a point, so the board and the court are both drawn.
  await seekTo(page, REPORT, 0.3);
  await page
    .getByRole("button", { name: "Open the film room fullscreen" })
    .click();
  await page.waitForSelector(ROOM);
  await expect(page.locator("[data-court-anchor]")).toHaveCount(1);

  // The court first, while the board is still top-left: a court dropped in
  // the board's own corner stacks above it, out of the preview's reach.
  await dragToBottomLeft(page, "[data-film-court-handle]");
  await expect(page.locator("[data-court-anchor]")).toHaveAttribute(
    "data-court-anchor",
    "bottom-left",
  );
  await hoverRoomLane(page, 0.001);
  expect(await paintsAbove(page, "[data-court-anchor]")).toEqual({
    overlap: true,
    above: true,
  });

  await dragToBottomLeft(page, "[data-board-anchor]");
  await expect(page.locator("[data-board-anchor]")).toHaveAttribute(
    "data-board-anchor",
    "bottom-left",
  );
  await hoverRoomLane(page, 0.001);
  expect(await paintsAbove(page, "[data-board-anchor]")).toEqual({
    overlap: true,
    above: true,
  });
});

test("T4: only the hovered lane mounts a preview, and none of it takes the pointer", async ({
  page,
}) => {
  await openRoomWithDrawer(page, "room-preview-one");
  await hoverRoomLane(page, 0.5);

  await expect(page.locator(PREVIEW_VIDEO)).toHaveCount(1);
  await expect(page.locator(ROOM_PREVIEW_VIDEO)).toHaveCount(1);

  const events = await page
    .locator(ROOM_PREVIEW)
    .evaluate((box) =>
      [box, ...Array.from(box.querySelectorAll("*"))].map(
        (el) => getComputedStyle(el).pointerEvents,
      ),
    );
  expect(events.length).toBeGreaterThan(1);
  expect(new Set(events)).toEqual(new Set(["none"]));
});

// ── Type column (2026-09-23): the shot's role — First · Second · Return ·
// Rally — from `shotType` rather than row position (the stroke itself is the
// Stroke column's). The fixture's points are a bare `Serve` then a `Forehand`:
// the serve reads First (the legacy fallback) and the Forehand is the point's
// return, so it reads Return.
// The Type cell is `@min-[880px]` only and the harness has no container, so it
// is read by `textContent`, which a hidden cell still carries.

test("the card's Type cells read First and Return for the playing point", async ({
  page,
}) => {
  await openShell(page, "card-type");
  await seekTo(page, REPORT, 0.3);
  await expect.poll(() => cardShots(page)).toEqual(["b-shot-1", "b-shot-2"]);
  const types = await page
    .locator(`${CARD} [data-shot-id]`)
    .evaluateAll((rows) =>
      rows.map((row) => row.children[4]?.textContent?.trim() ?? null),
    );
  expect(types).toEqual(["First", "Return"]);
});
