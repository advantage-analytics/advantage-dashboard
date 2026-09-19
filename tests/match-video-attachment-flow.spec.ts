import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

import type { AttachmentFlowHarnessWindow } from "./fixtures/match-video-attachment-flow-window";

/**
 * The attachment wizard, composed, in a real browser.
 *
 * The two step harnesses next door prove that neither step touches the
 * network. This one proves the opposite half: that the orchestration does,
 * exactly once, exactly when a person confirmed, and to exactly four
 * endpoints. Every test here runs the REAL transport over real
 * `XMLHttpRequest` against a server that implements this feature's contract —
 * nothing on the browser side is stubbed, because the claims worth making are
 * about what leaves the tab.
 *
 * The four that could not be made any other way:
 *
 *   1. **No side effects.** The whole set of requests an add makes is
 *      enumerated and compared. A match insert, a draft write, a processing
 *      job or an analysis call would appear in it.
 *   2. **One logical attempt.** A failed completion and a lost completion are
 *      driven separately; neither may reserve twice, and a retry must carry the
 *      id the first reservation carried.
 *   3. **Commit navigation is held.** `onSaved` is recorded with a timestamp
 *      against the completion response, so "saved" cannot precede saved.
 *   4. **Leaving cancels.** Cancel, unmount and a closed tab each have to
 *      retire the pending attempt, and the closed tab is the one the flow's own
 *      cleanup cannot see.
 *
 * The scenario lives in the MATCH ID (`ok-…`, `slow-…`, `failonce-…`), so the
 * server holds no state two parallel tests could share.
 */

let server: Server;
let origin: string;

const FIXTURES = resolve("tests/fixtures/match-video");
const CLIP = join(FIXTURES, "h264-faststart.mp4");
const OTHER_CLIP = join(FIXTURES, "h264.mov");

/** Every request the server saw, per match. */
const seen = new Map<string, RecordedRequest[]>();
/** Completion polls per match, so "fail the first one" is expressible. */
const polls = new Map<string, number>();
/** One attachment id per match, so a retry finds the attempt it reserved. */
const attachmentIds = new Map<string, string>();

interface RecordedRequest {
  method: string;
  path: string;
  body: string;
  at: number;
}

function scenarioOf(matchId: string): string {
  return matchId.split("-")[0];
}

function attachmentIdFor(matchId: string): string {
  let id = attachmentIds.get(matchId);
  if (!id) {
    id = randomUUID();
    attachmentIds.set(matchId, id);
  }
  return id;
}

function record(matchId: string, entry: RecordedRequest) {
  const list = seen.get(matchId) ?? [];
  list.push(entry);
  seen.set(matchId, list);
}

test.beforeAll(async () => {
  const outputPath = mkdtempSync(
    join(tmpdir(), "match-video-attachment-flow-"),
  );
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve(
          "tests/fixtures/match-video-attachment-flow-harness.tsx",
        ),
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
            // The shell's Cancel is a `next/link`; the browser only needs an
            // anchor, and the real module drags the router in.
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

  // The real stylesheet, because two of these tests are about layout. Without
  // it a 390px viewport proves nothing at all.
  const styles = (
    await postcss([tailwind()]).process(
      readFileSync("src/app/globals.css", "utf8"),
      { from: resolve("src/app/globals.css") },
    )
  ).css;

  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const path = url.pathname;

    if (path === "/bundle.js") {
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.end(bundle);
      return;
    }
    if (path === "/app.css") {
      response.setHeader("content-type", "text/css; charset=utf-8");
      response.end(styles);
      return;
    }
    if (path === "/__requests") {
      const matchId = url.searchParams.get("matchId") ?? "";
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(seen.get(matchId) ?? []));
      return;
    }
    if (path.startsWith("/fixtures/")) {
      const name = path.slice("/fixtures/".length);
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

    // Azure's block endpoint. The query carries the (fake) credential, so only
    // the path is ever recorded — the same rule the transport follows.
    const blob = /^\/azure\/([^/]+)$/.exec(path);
    if (blob) {
      const matchId = decodeURIComponent(blob[1]);
      const isCommit = url.searchParams.get("comp") === "blocklist";
      record(matchId, {
        method: request.method ?? "",
        path: isCommit ? "/azure/blocklist" : "/azure/block",
        body: "",
        at: Date.now(),
      });
      request.resume();
      request.on("end", () => {
        const finish = () => {
          response.statusCode = 201;
          response.end();
        };
        if (scenarioOf(matchId) === "slow") setTimeout(finish, 600);
        else finish();
      });
      return;
    }

    const api = /^\/api\/matches\/([^/]+)\/video(\/.*)?$/.exec(path);
    if (!api) {
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end(
        '<!doctype html><html><head><link rel="stylesheet" href="/app.css"></head>' +
          '<body><div id="root"></div><script src="/bundle.js"></script></body></html>',
      );
      return;
    }

    const matchId = decodeURIComponent(api[1]);
    const rest = api[2] ?? "";
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      const method = request.method ?? "";
      record(matchId, { method, path: `/video${rest}`, body, at: Date.now() });

      const json = (status: number, payload: unknown) => {
        response.statusCode = status;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify(payload));
      };
      const parsed: Record<string, unknown> = body ? JSON.parse(body) : {};

      // Reserve
      if (method === "POST" && rest === "/uploads") {
        json(200, {
          attachmentId: attachmentIdFor(matchId),
          uploadUrl: `${origin}/azure/${encodeURIComponent(matchId)}?sig=REDACTED`,
          uploadExpiresAt: new Date(Date.now() + 6 * 3_600_000).toISOString(),
        });
        return;
      }

      // Complete
      if (method === "POST" && rest.endsWith("/complete")) {
        const count = (polls.get(matchId) ?? 0) + 1;
        polls.set(matchId, count);
        const scenario = scenarioOf(matchId);
        if (scenario === "fail" || (scenario === "failonce" && count === 1)) {
          json(422, {
            code: "invalid_alignment",
            error: "Enter a time inside this video, as hh:mm:ss.sss.",
            detail: "confirmed_after_duration",
          });
          return;
        }
        if (scenario === "lost" && count === 1) {
          // The answer never arrives. The only recovery that is correct is to
          // ask the SAME question again — never to reserve and re-upload.
          response.destroy();
          return;
        }
        const confirmed = Number(parsed.confirmedVideoTimeSeconds ?? 0);
        json(200, {
          status: "committed",
          attachment: {
            id: attachmentIdFor(matchId),
            version: 4,
            offsetSeconds: 1 - confirmed,
            confirmedVideoTimeSeconds: confirmed,
            durationSeconds: 2,
            contentType: "video/mp4",
            filename: "match.mp4",
          },
        });
        return;
      }

      // Cancel
      if (method === "DELETE" && rest.startsWith("/uploads/")) {
        json(200, {
          attachmentId: attachmentIdFor(matchId),
          state: "retired",
        });
        return;
      }

      // Correct the alignment — the ONLY request an adjust may make.
      if (method === "PATCH" && rest === "/alignment") {
        if (scenarioOf(matchId) === "alignfail") {
          json(409, {
            code: "stale_attachment",
            error: "The video changed. Reload and try again.",
            detail: "version_mismatch",
          });
          return;
        }
        const confirmed = Number(parsed.confirmedVideoTimeSeconds ?? 0);
        json(200, {
          attachment: {
            id: String(parsed.attachmentId ?? ""),
            version: Number(parsed.expectedVersion ?? 0) + 1,
            offsetSeconds: 1 - confirmed,
            confirmedVideoTimeSeconds: confirmed,
            durationSeconds: 100,
            contentType: "video/mp4",
            filename: "roland-garros-r1.mp4",
          },
        });
        return;
      }

      json(404, { code: "match_not_found", error: "No such route" });
    });
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

let counter = 0;

/** A match id nobody else in this run will use, carrying its scenario. */
function matchIdFor(scenario: string): string {
  counter += 1;
  return `${scenario}-${process.pid}-${counter}`;
}

async function open(
  page: Page,
  {
    mode = "add",
    matchId,
    vanished = false,
  }: { mode?: string; matchId: string; vanished?: boolean },
) {
  await page.goto(
    `${origin}/?mode=${mode}&matchId=${matchId}${vanished ? "&vanished=1" : ""}`,
  );
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

async function pickFile(page: Page, file = CLIP) {
  await page.getByTestId("attachment-file-input").setInputFiles(file);
  await expect(page.getByTestId("attachment-file-name")).toBeVisible();
}

function continueButton(page: Page) {
  return page.locator("[data-wizard-continue]");
}

function timeField(page: Page) {
  return page.getByTestId("alignment-time-input");
}

async function requests(page: Page, matchId: string) {
  return page.evaluate(async (id: string) => {
    const response = await fetch(
      `/__requests?matchId=${encodeURIComponent(id)}`,
    );
    return (await response.json()) as {
      method: string;
      path: string;
      body: string;
      at: number;
    }[];
  }, matchId);
}

async function savedEvents(page: Page) {
  return page.evaluate(
    () => (window as unknown as AttachmentFlowHarnessWindow).savedEvents,
  );
}

/** Pick a file, step forward, mark the first point. Leaves Save armed. */
async function armAdd(page: Page, matchId: string, time = "00:00:00.500") {
  await open(page, { matchId });
  await pickFile(page);
  await continueButton(page).click();
  await expect(page.getByTestId("alignment-media-loading")).toHaveCount(0);
  await timeField(page).fill(time);
  await expect(page.getByTestId("alignment-ready")).toBeVisible();
}

/* -------------------------------------------------------------------------
 * Shape
 * ---------------------------------------------------------------------- */

test("add runs two steps inside the wizard shell, with the match pinned", async ({
  page,
}) => {
  const matchId = matchIdFor("ok");
  await open(page, { matchId });

  // The shell's own chrome, not a second one: the step eyebrow, the pinned
  // subject, and a footer whose primary is the only blue object on the row.
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await expect(page.getByTestId("attachment-pinned-match")).toContainText(
    "Marcus Reid",
  );
  await expect(page.getByTestId("attachment-pinned-match")).toContainText(
    "Jordan Alvarez",
  );
  await expect(continueButton(page)).toBeDisabled();
  await expect(page.getByRole("link", { name: "Cancel" })).toHaveAttribute(
    "href",
    "/dashboard/matches/m1",
  );

  await pickFile(page);
  await expect(continueButton(page)).toBeEnabled();
  await continueButton(page).click();

  await expect(page.getByText("Step 2 of 2")).toBeVisible();
  await expect(continueButton(page)).toHaveText("Upload and save");
});

test("adjust is one step and never offers a file", async ({ page }) => {
  const matchId = matchIdFor("ok");
  await open(page, { mode: "align", matchId });

  await expect(page.getByText("Step 1 of 1")).toBeVisible();
  await expect(page.getByTestId("attachment-drop-zone")).toHaveCount(0);
  await expect(continueButton(page)).toHaveText("Save the alignment");
  // Opened on the saved value, which is a no-op until it is moved.
  await expect(timeField(page)).toHaveValue("00:00:00.500");
  await expect(page.getByTestId("alignment-no-change")).toBeVisible();
  await expect(continueButton(page)).toBeDisabled();
});

test("a mode opened without the attachment it needs says so and draws nothing else", async ({
  page,
}) => {
  const matchId = matchIdFor("ok");
  await open(page, { mode: "align", matchId, vanished: true });

  // Never a blank column and never an invitation to add one: the worst
  // outcome here is a second attachment created by accident.
  await expect(page.getByTestId("attachment-blocked")).toBeVisible();
  await expect(page.getByTestId("attachment-blocked")).toContainText(
    "no video to adjust",
  );
  await expect(page.getByTestId("alignment-video")).toHaveCount(0);
  await expect(page.getByTestId("attachment-drop-zone")).toHaveCount(0);
  await expect(continueButton(page)).toBeDisabled();
  expect(await requests(page, matchId)).toEqual([]);
});

/* -------------------------------------------------------------------------
 * Only the final confirmation starts anything
 * ---------------------------------------------------------------------- */

test("nothing is uploaded until the final confirmation, and the result is awaited", async ({
  page,
}) => {
  const matchId = matchIdFor("ok");
  await armAdd(page, matchId);

  // Everything up to here — a verified 15 KB file and a validated position —
  // and not one byte has left the tab.
  expect(await requests(page, matchId)).toEqual([]);

  await continueButton(page).click();
  await expect(page.getByTestId("attachment-saved")).toBeVisible();

  const sent = await requests(page, matchId);
  expect(
    sent.map(
      (entry) =>
        `${entry.method} ${entry.path.replace(/\/uploads\/[^/]+\//, "/uploads/{id}/")}`,
    ),
  ).toEqual([
    "POST /video/uploads",
    "PUT /azure/block",
    "PUT /azure/blocklist",
    "POST /video/uploads/{id}/complete",
  ]);

  // The commit navigation waited for the answer: the caller is told once, with
  // a published attachment, and never optimistically.
  const events = await savedEvents(page);
  expect(events).toHaveLength(1);
  expect(events[0].confirmedVideoTimeSeconds).toBeCloseTo(0.5, 3);
  expect(events[0].version).toBe(4);
});

test("add claims no attachment; replace claims the one it was given", async ({
  page,
}) => {
  const addId = matchIdFor("ok");
  await armAdd(page, addId);
  await continueButton(page).click();
  await expect(page.getByTestId("attachment-saved")).toBeVisible();

  const addReserve = (await requests(page, addId)).find(
    (entry) => entry.path === "/video/uploads",
  )!;
  // An explicit null, never an omitted key: a client that simply forgot the
  // field must not be able to clobber a replacement another tab committed.
  expect(JSON.parse(addReserve.body).expectedActive).toBeNull();

  const replaceId = matchIdFor("ok");
  await open(page, { mode: "replace", matchId: replaceId });
  await pickFile(page);
  await continueButton(page).click();
  await expect(page.getByTestId("alignment-media-loading")).toHaveCount(0);
  await timeField(page).fill("00:00:00.500");
  await continueButton(page).click();
  await expect(page.getByTestId("attachment-saved")).toBeVisible();

  const replaceReserve = (await requests(page, replaceId)).find(
    (entry) => entry.path === "/video/uploads",
  )!;
  expect(JSON.parse(replaceReserve.body).expectedActive).toEqual({
    id: "6f1d4a7e-2c83-4a51-9f0e-1b7c5d3e9a42",
    version: 3,
  });
});

test("a correction calls the alignment endpoint and nothing else", async ({
  page,
}) => {
  const matchId = matchIdFor("ok");
  await open(page, { mode: "align", matchId });
  await expect(page.getByTestId("alignment-media-loading")).toHaveCount(0);

  await timeField(page).fill("00:00:00.900");
  await expect(continueButton(page)).toBeEnabled();
  await continueButton(page).click();
  await expect(page.getByTestId("attachment-saved")).toBeVisible();

  const sent = await requests(page, matchId);
  // No reservation, no block, no completion: a correction has no upload to
  // authorize and must not create a pending attempt a second tab is refused
  // against.
  expect(sent.map((entry) => `${entry.method} ${entry.path}`)).toEqual([
    "PATCH /video/alignment",
  ]);
  expect(JSON.parse(sent[0].body)).toEqual({
    attachmentId: "6f1d4a7e-2c83-4a51-9f0e-1b7c5d3e9a42",
    expectedVersion: 3,
    confirmedVideoTimeSeconds: 0.9,
  });
  expect((await savedEvents(page))[0].version).toBe(4);
});

/* -------------------------------------------------------------------------
 * No draft, no match, no analysis
 * ---------------------------------------------------------------------- */

test("the flow creates no match, draft, job or analysis request", async ({
  page,
}) => {
  const matchId = matchIdFor("ok");

  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));

  await armAdd(page, matchId);
  await continueButton(page).click();
  await expect(page.getByTestId("attachment-saved")).toBeVisible();

  const sameOrigin = urls
    .filter((url) => url.startsWith(origin))
    .map((url) => new URL(url).pathname)
    .filter(
      (path) =>
        path !== "/" &&
        path !== "/bundle.js" &&
        path !== "/app.css" &&
        path !== "/__requests" &&
        !path.startsWith("/fixtures/"),
    );

  // Enumerated rather than pattern-matched: a `processing_jobs` insert, a
  // draft write, a `/api/splitstep/*` call or a match creation would all have
  // to appear in this list, and none of them can.
  const shapes = new Set(
    sameOrigin.map((path) =>
      path
        .replace(/^\/azure\/.*$/, "/azure/block")
        .replace(/\/uploads\/[^/]+\/complete$/, "/uploads/{id}/complete"),
    ),
  );
  expect([...shapes].sort()).toEqual(
    [
      "/azure/block",
      `/api/matches/${matchId}/video/uploads`,
      `/api/matches/${matchId}/video/uploads/{id}/complete`,
    ].sort(),
  );

  expect(urls.some((url) => url.includes("splitstep"))).toBe(false);
  // The new-match wizard's localStorage is the draft surface; an attachment
  // must not touch it.
  const storage = await page.evaluate(
    () => Object.keys(window.localStorage).length,
  );
  expect(storage).toBe(0);
});

/* -------------------------------------------------------------------------
 * Failure, lost responses, double submit
 * ---------------------------------------------------------------------- */

test("a refused completion keeps the file and the time, and Try again reuses the attempt", async ({
  page,
}) => {
  const matchId = matchIdFor("failonce");
  await armAdd(page, matchId);
  await continueButton(page).click();

  await expect(page.getByTestId("attachment-save-error")).toHaveAttribute(
    "data-error-code",
    "invalid_alignment",
  );
  // The whole point of the state: nothing has to be found or typed again.
  await expect(timeField(page)).toHaveValue("00:00:00.500");
  await expect(continueButton(page)).toHaveText("Try again");
  expect(await savedEvents(page)).toEqual([]);

  await continueButton(page).click();
  await expect(page.getByTestId("attachment-saved")).toBeVisible();

  const reserves = (await requests(page, matchId)).filter(
    (entry) => entry.path === "/video/uploads",
  );
  expect(reserves).toHaveLength(2);
  // ONE logical attempt across the retry. A fresh id on the second reservation
  // would collide with the pending attempt the first one created rather than
  // finding it.
  expect(JSON.parse(reserves[0].body).clientRequestId).toBe(
    JSON.parse(reserves[1].body).clientRequestId,
  );
});

test("a lost completion response is replayed, never re-uploaded", async ({
  page,
}) => {
  const matchId = matchIdFor("lost");
  await armAdd(page, matchId);
  await continueButton(page).click();

  await expect(page.getByTestId("attachment-saved")).toBeVisible({
    timeout: 15_000,
  });

  const sent = await requests(page, matchId);
  expect(sent.filter((entry) => entry.path === "/video/uploads")).toHaveLength(
    1,
  );
  expect(sent.filter((entry) => entry.path === "/azure/block")).toHaveLength(1);
  // The recovery for a completion whose answer never arrived is the SAME
  // question again — a second reservation would publish a second copy of a
  // video that is already the match's.
  expect(
    sent.filter((entry) => entry.path.endsWith("/complete")).length,
  ).toBeGreaterThanOrEqual(2);
  expect(await savedEvents(page)).toHaveLength(1);
});

test("a second confirmation while one is in flight is held", async ({
  page,
}) => {
  const matchId = matchIdFor("slow");
  await armAdd(page, matchId);

  const button = continueButton(page);
  await button.click();
  // The footer's primary is asleep the instant the commit starts, and the
  // guard behind it is what catches Enter and a double tap as well.
  await expect(button).toBeDisabled();
  await page.keyboard.press("Enter");
  await page.evaluate(() => {
    document
      .querySelector<HTMLElement>("[data-wizard-continue]")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  await expect(page.getByTestId("attachment-saved")).toBeVisible({
    timeout: 15_000,
  });
  expect(
    (await requests(page, matchId)).filter(
      (entry) => entry.path === "/video/uploads",
    ),
  ).toHaveLength(1);
  expect(await savedEvents(page)).toHaveLength(1);
});

/* -------------------------------------------------------------------------
 * Progress
 * ---------------------------------------------------------------------- */

test("progress reads real bytes and then names the publication", async ({
  page,
}) => {
  const matchId = matchIdFor("slow");
  await armAdd(page, matchId);
  await continueButton(page).click();

  const strip = page.getByTestId("attachment-saving");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Uploading the video");
  // A percentage exists only while bytes are actually moving.
  await expect(strip).toHaveAttribute("data-percent", /\d/);

  // Once the blocks are in, the publication is an Azure server-side copy this
  // browser cannot observe. It is named, never given an invented percentage.
  await expect(strip).toContainText("Saving video", { timeout: 15_000 });
  await expect(strip).not.toHaveAttribute("data-percent", /\d/);
  await expect(page.getByTestId("attachment-saved")).toBeVisible({
    timeout: 15_000,
  });
});

/* -------------------------------------------------------------------------
 * Cancel, unmount, and a closed tab
 * ---------------------------------------------------------------------- */

test("cancelling aborts the upload, retires the attempt, and shows no error", async ({
  page,
}) => {
  const matchId = matchIdFor("slow");
  await armAdd(page, matchId);
  await continueButton(page).click();
  await expect(page.getByTestId("attachment-saving")).toBeVisible();

  await page.getByTestId("attachment-cancel-upload").click();

  // `aborted` carries an error code only so the result shape stays uniform.
  // Branching on it and rendering that message would be apologising for what
  // the person just asked for.
  await expect(page.getByTestId("attachment-save-error")).toHaveCount(0);
  await expect(page.getByTestId("attachment-saving")).toHaveCount(0);
  await expect(continueButton(page)).toBeEnabled();
  await expect(timeField(page)).toHaveValue("00:00:00.500");

  await expect
    .poll(async () =>
      (await requests(page, matchId)).some(
        (entry) => entry.method === "DELETE",
      ),
    )
    .toBe(true);
  expect(await savedEvents(page)).toEqual([]);
});

test("unmounting mid-upload cancels the attempt", async ({ page }) => {
  const matchId = matchIdFor("slow");
  await armAdd(page, matchId);
  await continueButton(page).click();
  await expect(page.getByTestId("attachment-saving")).toBeVisible();

  await page.evaluate(() =>
    (window as unknown as AttachmentFlowHarnessWindow).unmount(),
  );

  await expect
    .poll(async () =>
      (await requests(page, matchId)).some(
        (entry) => entry.method === "DELETE",
      ),
    )
    .toBe(true);
  expect(await savedEvents(page)).toEqual([]);
});

test("a tab closing mid-upload still retires the attempt", async ({ page }) => {
  const matchId = matchIdFor("slow");
  await armAdd(page, matchId);
  await continueButton(page).click();
  await expect(page.getByTestId("attachment-saving")).toBeVisible();

  // No unmount, no `finally`, no cleanup of any kind runs when a document goes
  // away — which is why this is a `keepalive` request fired from `pagehide`.
  await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));

  await expect
    .poll(async () =>
      (await requests(page, matchId)).some(
        (entry) => entry.method === "DELETE",
      ),
    )
    .toBe(true);
});

/* -------------------------------------------------------------------------
 * Back, file changes, reload
 * ---------------------------------------------------------------------- */

test("Back keeps the file and the time; a different file clears the confirmation", async ({
  page,
}) => {
  const matchId = matchIdFor("ok");
  await armAdd(page, matchId);

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByTestId("attachment-file-name")).toHaveText(
    "h264-faststart.mp4",
  );

  await continueButton(page).click();
  await expect(page.getByTestId("alignment-media-loading")).toHaveCount(0);
  // Stepping back to check a filename must not throw away a scrubbed position.
  await expect(timeField(page)).toHaveValue("00:00:00.500");

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await pickFile(page, OTHER_CLIP);
  await expect(page.getByTestId("attachment-file-name")).toHaveText("h264.mov");

  await continueButton(page).click();
  await expect(page.getByTestId("alignment-media-loading")).toHaveCount(0);
  // A time measured against a different recording is not a head start; it is a
  // wrong answer already typed in.
  await expect(timeField(page)).toHaveValue("");
  await expect(page.getByTestId("alignment-ready")).toHaveCount(0);
  await expect(continueButton(page)).toBeDisabled();
  expect(await requests(page, matchId)).toEqual([]);
});

test("a reload returns to step one with nothing picked", async ({ page }) => {
  const matchId = matchIdFor("ok");
  await armAdd(page, matchId);

  await page.reload();
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");

  // A browser cannot restore a `File`, and pretending otherwise would send a
  // person to the alignment step with nothing behind the player.
  await expect(page.getByText("Step 1 of 2")).toBeVisible();
  await expect(page.getByTestId("attachment-drop-zone")).toBeVisible();
  await expect(page.getByTestId("attachment-file-name")).toHaveCount(0);
  expect(await requests(page, matchId)).toEqual([]);
});

/* -------------------------------------------------------------------------
 * Keyboard and focus
 * ---------------------------------------------------------------------- */

test("the keyboard drives the flow without submitting out from under a field", async ({
  page,
}) => {
  const matchId = matchIdFor("ok");
  await open(page, { matchId });
  await pickFile(page);

  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Enter");
  await expect(page.getByText("Step 2 of 2")).toBeVisible();

  await expect(page.getByTestId("alignment-media-loading")).toHaveCount(0);
  await timeField(page).fill("00:00:00.500");
  // Enter inside the time field belongs to the field; it must not commit.
  await timeField(page).press("Enter");
  await expect(page.getByTestId("attachment-saving")).toHaveCount(0);
  expect(await requests(page, matchId)).toEqual([]);

  // Esc is the step-back, exactly as it is in the new-match wizard.
  await page.locator("body").click({ position: { x: 4, y: 4 } });
  await page.keyboard.press("Escape");
  await expect(page.getByText("Step 1 of 2")).toBeVisible();

  await continueButton(page).focus();
  await expect(continueButton(page)).toBeFocused();
});

/* -------------------------------------------------------------------------
 * Layout
 * ---------------------------------------------------------------------- */

for (const viewport of [
  { name: "390px", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
]) {
  test(`the flow lays out at ${viewport.name} without horizontal overflow`, async ({
    page,
  }) => {
    await page.setViewportSize({
      width: viewport.width,
      height: viewport.height,
    });
    const matchId = matchIdFor("ok");
    await armAdd(page, matchId);

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    // Nothing inside the column — the player, the note strips, the footer row
    // — reaches past the viewport, so none of it needs a sideways scroll.
    const widest = await page.evaluate(() =>
      Math.max(
        ...[...document.querySelectorAll<HTMLElement>("div, span, p, button")]
          .map((node) => node.getBoundingClientRect().right)
          .filter((right) => Number.isFinite(right)),
      ),
    );
    expect(widest).toBeLessThanOrEqual(viewport.width + 1);

    // The chrome the shell owns is all present and legible at this width: the
    // pinned subject, the step eyebrow, the player and the footer's primary.
    // (Whether the footer PINS is the host page's scroll container's business,
    // not this flow's — the shell is used exactly as the new-match wizard uses
    // it, and this harness has no dashboard chrome around it.)
    await expect(page.getByTestId("attachment-pinned-match")).toBeVisible();
    await expect(page.getByText(`Step 2 of 2`)).toBeVisible();
    await expect(page.getByTestId("alignment-video")).toBeVisible();
    await expect(continueButton(page)).toBeVisible();
    await expect(continueButton(page)).toBeEnabled();
  });
}

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
