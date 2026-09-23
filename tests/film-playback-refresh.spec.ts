import { expect, test, type Page, type Route } from "@playwright/test";
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
 * A real wheel over the drawer's scroller. The drawer slides in over 420ms
 * and `openRoomWithDrawer` only waits for its rows to exist, so on a loaded
 * machine a box read straight away is mid-travel and the pointer lands beside
 * the drawer — the wheel then scrolls nothing and every assertion after it is
 * about the wrong state. Wait for the box to stop moving first.
 */
async function wheelDrawer(page: Page, deltaY: number) {
  const scroller = page.locator(DRAWER_SCROLLER);
  let box = await scroller.boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(120);
    const next = await scroller.boundingBox();
    if (box && next && box.x === next.x && box.width === next.width) break;
    box = next;
  }
  if (!box) throw new Error("no drawer scroller");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, deltaY);
  await expect.poll(() => drawerScrollTop(page)).toBeGreaterThan(0);
  // Chromium animates a wheel scroll; read the position only once it has
  // stopped moving, so a later comparison is not against a frame mid-travel.
  let last = await drawerScrollTop(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const now = await drawerScrollTop(page);
    if (now === last) break;
    last = now;
  }
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
