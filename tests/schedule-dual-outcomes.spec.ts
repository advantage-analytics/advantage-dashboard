import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import {
  dualScore,
  entryPlayed,
  lineCoverageFrom,
  readyMatchIdsFrom,
} from "@/lib/schedule/entry-state";
import { isSettled } from "@/lib/schedule/entry-plan";
import { dualPrimaryAction } from "@/lib/schedule/dual-primary-action";
import {
  NORMAL_ENTRIES,
  OUTCOME_ENTRIES,
} from "./fixtures/schedule-dual-outcomes-data";

/**
 * The dual's event page (`schedule/dual-detail.tsx`) as a line table on the
 * event-table kit: header, summary strip, grouped rows, pills and footer, on
 * the outcome and in-progress fixtures in `fixtures/schedule-dual-outcomes-*`.
 */

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

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "schedule-dual-outcomes-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/schedule-dual-outcomes-harness.tsx"),
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
            "@/lib/schedule/actions": resolve(
              "tests/fixtures/schedule-actions-browser-mock.ts",
            ),
            // `use-row-selection.ts` reads `DRAWER_ATTR` from the Matches
            // drawer, which brings its menu, image and client imports along.
            "@/components/dashboard/matches/match-actions/match-actions-menu":
              resolve("tests/fixtures/match-drawer-deps-browser-mock.tsx"),
            "next/image": resolve(
              "tests/fixtures/match-drawer-deps-browser-mock.tsx",
            ),
            "@/lib/supabase/client": resolve(
              "tests/fixtures/supabase-client-browser-mock.ts",
            ),
            "next/navigation": resolve(
              "tests/fixtures/next-navigation-browser-mock.ts",
            ),
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
            "@": resolve("src"),
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

async function open(page: import("@playwright/test").Page, path = "") {
  await page.goto(`${origin}/${path}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

type Page = import("@playwright/test").Page;

/** One line's row, by its slot — the row's accessible name leads with it. */
function line(page: Page, slot: string) {
  return page.getByRole("row", { name: new RegExp(`^${slot} · `) });
}

/** Every line row on screen (the header row carries no `event-row-` id). */
function lineRows(page: Page) {
  return page.locator('[role="row"][id^="event-row-"]');
}

/** A summary-strip cell, by its eyebrow. */
function cell(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("..");
}

const PRIMARY_CLASS = /bg-\[var\(--blue\)\]/;

test("dual outcomes render their shared kind and side vocabulary with the pure 4-3 result", async ({
  page,
}) => {
  expect(dualScore(OUTCOME_ENTRIES)).toEqual({ us: 4, them: 3, decided: true });
  expect(lineCoverageFrom(OUTCOME_ENTRIES)).toEqual({ analyzed: 1, total: 3 });
  expect(readyMatchIdsFrom(OUTCOME_ENTRIES)).toEqual(["ready-played-match"]);
  expect(OUTCOME_ENTRIES.slice(0, 6).every(isSettled)).toBe(true);

  await open(page);

  const result = cell(page, "Result").first();
  await expect(result.getByText("Won 4–3", { exact: true })).toBeVisible();
  await expect(result.getByText("Final", { exact: true })).toBeVisible();

  for (const [slot, kind, outcome] of [
    ["S1", "Forfeited", "Won"],
    ["S2", "Forfeited", "Lost"],
    ["S3", "Defaulted", "Won"],
    ["S4", "Defaulted", "Lost"],
    ["S5", "Withdrawn", "Won"],
    ["S6", "Withdrawn", "Lost"],
  ] as const) {
    const row = line(page, slot);
    await expect(row.getByText(kind, { exact: true })).toBeVisible();
    await expect(row.getByText(outcome, { exact: true })).toHaveCount(1);
    // Rows carry no actions any more: the drawer T10 adds beside the table
    // re-homes Add result / Edit result / View report, and re-asserts their
    // hrefs there. Nothing is scored in place, so no row has a button either.
    await expect(row.getByRole("link")).toHaveCount(0);
    await expect(row.getByRole("button")).toHaveCount(0);
  }

  for (const [slot, outcome] of [
    ["D1", "Won"],
    ["D2", "Won"],
    ["D3", "Lost"],
  ] as const) {
    await expect(
      line(page, slot).getByText(outcome, { exact: true }),
    ).toHaveCount(1);
  }
});

test("the header, strip and primary follow the dual's state", async ({
  page,
}) => {
  await open(page);

  const header = page.locator("h1").locator("../../..");
  await expect(page.locator("h1")).toHaveText("vs Meridian State");
  await expect(header.getByText("Thu, Sep 10", { exact: true })).toBeVisible();
  await expect(header.getByText("Home", { exact: true })).toBeVisible();
  await expect(header.getByText("Hard", { exact: true })).toBeVisible();
  await expect(header.getByText("Big Ten", { exact: true })).toBeVisible();

  // The retired score band: no 40px score, no double-size ticks.
  await expect(page.locator(".text-\\[40px\\]")).toHaveCount(0);
  await expect(page.locator(".h-6.w-\\[5px\\]")).toHaveCount(0);

  // Lines: nine ticks and the lines won. Analysis: every singles line has an
  // outcome, so none of them has stats.
  const lines = cell(page, "Lines");
  await expect(lines.locator("span[aria-hidden] > span[style]")).toHaveCount(9);
  await expect(lines.getByText("5 of 9 won", { exact: true })).toBeVisible();
  const analysis = cell(page, "Analysis").first();
  await expect(analysis.getByText("0 of 6", { exact: false })).toBeVisible();
  await expect(
    analysis.getByText("singles have stats", { exact: true }),
  ).toBeVisible();

  // Every line is decided and no singles line owes a video: Edit dual only.
  expect(dualPrimaryAction(OUTCOME_ENTRIES, "dual-outcomes")).toBeNull();
  await expect(page.getByRole("link", { name: "Edit dual" })).toHaveAttribute(
    "href",
    "/dashboard/team/schedule/dual-outcomes/edit",
  );
  await expect(page.locator("a").filter({ hasText: /^Add / })).toHaveCount(0);
});

test("an in-progress dual counts what is decided and asks for a result", async ({
  page,
}) => {
  await open(page, "?normal");

  const decided = NORMAL_ENTRIES.filter(entryPlayed).length;
  const result = cell(page, "Result").first();
  await expect(result.getByText("In progress", { exact: true })).toBeVisible();
  await expect(
    result.getByText(`${decided} of 9 decided`, { exact: true }),
  ).toBeVisible();
  await expect(
    cell(page, "Lines").getByText("1 of 9 won", { exact: true }),
  ).toBeVisible();
  await expect(
    cell(page, "Analysis").first().getByText("1 of 6"),
  ).toBeVisible();

  const primary = dualPrimaryAction(NORMAL_ENTRIES, "dual-outcomes")!;
  expect(primary).toEqual({
    label: "Add result",
    href: "/dashboard/team/schedule/dual-outcomes/score",
  });
  const link = page.getByRole("link", { name: primary.label, exact: true });
  await expect(link).toHaveAttribute("href", primary.href);
  await expect(link).toHaveAttribute("class", PRIMARY_CLASS);
  await expect(page.getByRole("link", { name: "Edit dual" })).toHaveCount(1);

  // The singles analysis word comes off the match's own status.
  await expect(
    line(page, "S2").getByText("Imported", { exact: true }),
  ).toBeVisible();
  await expect(line(page, "S2").getByRole("link")).toHaveCount(0);
});

test("a member who cannot manage the schedule sees no header actions", async ({
  page,
}) => {
  await open(page, "?normal&viewer=player");
  await expect(page.getByRole("link", { name: "Edit dual" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Add result" })).toHaveCount(0);
});

test("the line table: columns, groups, doubles, footer and pills", async ({
  page,
}) => {
  await open(page);

  const headerRow = page
    .getByRole("row")
    .filter({ has: page.getByRole("columnheader") });
  await expect(page.getByRole("columnheader")).toHaveText([
    "Line",
    "Player",
    "Opponent",
    "Result",
    "Score",
    "Analysis",
  ]);
  await expect(headerRow).toHaveClass(
    /grid-cols-\[28px_minmax\(170px,250px\)_minmax\(140px,220px\)_52px_120px_minmax\(96px,1fr\)\]/,
  );

  await expect(lineRows(page).locator("span.mono")).toHaveText([
    "S1",
    "S2",
    "S3",
    "S4",
    "S5",
    "S6",
    "D1",
    "D2",
    "D3",
  ]);

  const singlesHead = page.getByText("Singles", { exact: true }).last();
  await expect(singlesHead.locator("..")).toContainText("3–3");
  const doublesHead = page
    .locator("span.eyebrow")
    .filter({ hasText: /^Doubles$/ })
    .locator("..");
  await expect(doublesHead).toContainText("2–1");
  await expect(doublesHead).toContainText("point ours");

  for (const slot of ["D1", "D2", "D3"]) {
    await expect(
      line(page, slot).getByText("Score only", { exact: true }),
    ).toBeVisible();
  }

  await expect(
    page.getByText("Doubles lines record a score only.", { exact: true }),
  ).toBeVisible();
  // The fixture records no doubles format, so doubles plays the default set
  // and inherits the singles scoring — `lineFormat`'s rule, which the score
  // flow uses too.
  await expect(
    page.getByText("Singles best of 3, no-ad · Doubles one set to 6, no-ad", {
      exact: true,
    }),
  ).toBeVisible();

  const pills = page.locator("button[aria-pressed]");
  await expect(pills).toHaveText([
    "All lines",
    "Singles",
    "Doubles",
    "Needs a result",
  ]);

  await page.getByRole("button", { name: "Doubles", exact: true }).click();
  await expect(lineRows(page)).toHaveCount(3);
  await expect(lineRows(page).locator("span.mono")).toHaveText([
    "D1",
    "D2",
    "D3",
  ]);
});

test("a row click selects the line and mirrors ?line=", async ({ page }) => {
  await open(page, "?normal");
  await line(page, "S2").click();
  await expect(line(page, "S2")).toHaveAttribute("aria-current", "true");
  expect(await page.evaluate(() => location.search)).toContain("line=entry-s2");

  // Landing with ?line= preselects it.
  await open(page, "?normal&line=entry-s1");
  await expect(line(page, "S1")).toHaveAttribute("aria-current", "true");
});

/* ── The line drawer (`event-line-drawer.tsx`) ─────────────────────────── */

/** The open line drawer — `PeekDrawerFrame`'s dialog. */
function drawer(page: Page) {
  return page.getByRole("dialog");
}

const SCORE = "/dashboard/team/schedule/dual-outcomes/score";

test("a played singles line opens the drawer with its match, facts and follow-ups", async ({
  page,
}) => {
  await open(page, "?normal");
  await line(page, "S2").click();

  const panel = drawer(page);
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Line", { exact: true })).toBeVisible();
  await expect(panel.getByText("2 / 9", { exact: true })).toBeVisible();

  // The title and the footer both lead to the report.
  const report = "/dashboard/matches/normal-ready-match";
  await expect(panel.locator("h2 a")).toHaveAttribute("href", report);
  await expect(
    panel.getByRole("link", { name: "View match", exact: true }),
  ).toHaveAttribute("href", report);
  await expect(panel.locator("dl").first()).toContainText(
    "vs Meridian State · S2",
  );
  // The line has its video, and a coach sees ⋯.
  await expect(panel.getByRole("link", { name: "Add video" })).toHaveCount(0);
  await expect(
    panel.getByRole("button", { name: "Match actions" }),
  ).toHaveCount(1);
  // The snapshot read finds no stats row, so the skeleton gives way.
  await expect(
    panel.getByRole("status", { name: "Loading snapshot" }),
  ).toHaveCount(0);

  // A scored singles line with nothing sent offers the video, preset on its
  // entry and match — the old row action's link.
  await line(page, "S3").click();
  await expect(panel.getByText("3 / 9", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "Add video", exact: true }),
  ).toHaveAttribute(
    "href",
    "/dashboard/team/upload?entry=entry-s3&match=normal-manual-loss",
  );
  await expect(
    panel.getByRole("link", { name: "View match", exact: true }),
  ).toHaveAttribute("href", "/dashboard/matches/normal-manual-loss");
});

test("the drawer's This dual list names all nine lines and steps between them", async ({
  page,
}) => {
  await open(page);
  await line(page, "S2").click();

  const list = drawer(page).getByRole("region", { name: "This dual" });
  await expect(list.getByText("This dual", { exact: true })).toBeVisible();
  await expect(list.getByText("Won 4–3", { exact: true })).toBeVisible();
  const rows = list.getByRole("button");
  await expect(rows).toHaveCount(9);
  await expect(rows.locator("span.mono")).toHaveText([
    "S1",
    "S2",
    "S3",
    "S4",
    "S5",
    "S6",
    "D1",
    "D2",
    "D3",
  ]);
  await expect(rows.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(list.locator('[aria-current="true"]')).toHaveCount(1);

  await rows.nth(4).click();
  await expect(rows.nth(4)).toHaveAttribute("aria-current", "true");
  await expect(line(page, "S5")).toHaveAttribute("aria-current", "true");
  await expect(drawer(page).getByText("5 / 9", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => location.search)).toContain("line=entry-s5");

  // A line the toolbar hides lifts the cut rather than losing the selection.
  await page.getByRole("button", { name: "Singles", exact: true }).click();
  await drawer(page)
    .getByRole("region", { name: "This dual" })
    .getByRole("button")
    .nth(6)
    .click();
  await expect(line(page, "D1")).toHaveAttribute("aria-current", "true");
  await expect(lineRows(page)).toHaveCount(9);
});

test("a doubles line is score only; an unplayed line asks for a result; outcomes edit", async ({
  page,
}) => {
  await open(page);
  await line(page, "D1").click();
  const panel = drawer(page);
  await expect(panel.getByText("7 / 9", { exact: true })).toBeVisible();
  await expect(panel.getByText("Snapshot")).toHaveCount(0);
  await expect(panel.getByRole("link", { name: "Add video" })).toHaveCount(0);
  await expect(
    panel.getByText(
      "Doubles lines record a score only. Statistics and video analysis are singles only for now.",
    ),
  ).toBeVisible();
  const edit = panel.getByRole("link", { name: "Edit result", exact: true });
  await expect(edit).toHaveAttribute("href", `${SCORE}?entry=entry-d1`);
  await expect(edit).toHaveAttribute("class", PRIMARY_CLASS);

  for (let n = 1; n <= 6; n++) {
    await line(page, `S${n}`).click();
    await expect(
      panel.getByRole("link", { name: "Edit result", exact: true }),
    ).toHaveAttribute("href", `${SCORE}?entry=entry-s${n}`);
    await expect(panel.getByRole("link", { name: "View report" })).toHaveCount(
      0,
    );
    // The outcome is authoritative — S1's contradictory match is not linked.
    await expect(panel.getByRole("link", { name: "View match" })).toHaveCount(
      0,
    );
  }

  await open(page, "?normal");
  await line(page, "S1").click();
  const add = drawer(page).getByRole("link", {
    name: "Add result",
    exact: true,
  });
  await expect(add).toHaveAttribute("href", /\/score\?entry=/);
  await expect(add).toHaveAttribute("href", `${SCORE}?entry=entry-s1`);
  await expect(
    drawer(page).getByRole("button", { name: "Match actions" }),
  ).toHaveCount(0);

  // An unscored doubles line: "Add result" into the same flow.
  await line(page, "D2").click();
  await expect(
    drawer(page).getByRole("link", { name: "Add result", exact: true }),
  ).toHaveAttribute("href", `${SCORE}?entry=entry-d2`);
});

test("a member who cannot manage the schedule reads the drawer without actions", async ({
  page,
}) => {
  await open(page, "?normal&viewer=player");
  for (const slot of ["S1", "S2", "S3", "D1"]) {
    await line(page, slot).click();
    const panel = drawer(page);
    await expect(panel).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Match actions" }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("link", { name: /^(Add result|Edit result|Add video)$/ }),
    ).toHaveCount(0);
  }
  await line(page, "S2").click();
  await expect(
    drawer(page).getByRole("link", { name: "View match", exact: true }),
  ).toHaveAttribute("href", "/dashboard/matches/normal-ready-match");
});
