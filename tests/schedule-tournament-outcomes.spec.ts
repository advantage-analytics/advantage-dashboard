import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import {
  lineCoverageFrom,
  readyMatchIdsFrom,
} from "@/lib/schedule/entry-state";
import { entry } from "./fixtures/schedule-tournament-outcomes-data";

/**
 * The tournament's event page (`schedule/tournament-detail.tsx`) as an
 * entry-grouped match table on the event-table kit: header, summary strip,
 * group heads, rows, pills and footer, on `fixtures/schedule-tournament-
 * outcomes-*` — one qualifying run (Q1 default won, R16 played, QF withdrawn)
 * and one main-draw entry with nothing played yet.
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
  const outputPath = mkdtempSync(
    join(tmpdir(), "schedule-tournament-outcomes-"),
  );
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve(
          "tests/fixtures/schedule-tournament-outcomes-harness.tsx",
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

/** A table row by its round — scoped to the table, since the drawer's run
 * list prints the same round labels. */
function row(page: Page, round: string) {
  return matchRows(page).filter({
    has: page.getByText(round, { exact: true }),
  });
}

/** Every match row on screen (the header row carries no `event-row-` id). */
function matchRows(page: Page) {
  return page.locator('[role="row"][id^="event-row-"]');
}

/** A summary-strip cell, by its eyebrow. */
function cell(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator("..");
}

test("renders played and outcome-only rounds in the established ladder order", async ({
  page,
}) => {
  await open(page);

  await expect(matchRows(page).locator("span.mono")).toHaveText([
    "Q1",
    "R16",
    "QF",
  ]);

  await expect(
    row(page, "Q1").getByText("Defaulted", { exact: true }),
  ).toBeVisible();
  await expect(row(page, "Q1").getByText("Won", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    row(page, "R16").getByText("6-2, 6-3", { exact: true }),
  ).toBeVisible();
  await expect(row(page, "R16").getByText("Won", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    row(page, "QF").getByText("Withdrawn", { exact: true }),
  ).toBeVisible();
  await expect(row(page, "QF").getByText("Lost", { exact: true })).toHaveCount(
    1,
  );

  // The played round carries its match date; an outcome-only round has no
  // match, so no date of its own.
  await expect(row(page, "R16")).toContainText("Sep 11");
  await expect(row(page, "Q1").getByText("No date")).toHaveCount(1);

  // Rows carry no actions any more. "Edit result" (each round, into the score
  // flow at that round), "View report" and the entry's next-round "Add
  // result" move into the match drawer, and T12 re-asserts them there.
  await expect(matchRows(page).getByRole("link")).toHaveCount(0);
  expect(await page.evaluate(() => window.actionCalls)).toEqual([]);
});

test("the header, strip, columns, group heads and footer", async ({ page }) => {
  await open(page);

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Fall Invitational",
  );
  await expect(page.getByText("2 entries", { exact: true })).toBeVisible();
  // T16: the subline is icon facts in the match-metadata register — one
  // glyph per fact, no `·` separators between them.
  const header = page.getByRole("heading", { level: 1 }).locator("..");
  await expect(header.locator("svg.lucide-calendar")).toHaveCount(1);
  await expect(header.locator("svg.lucide-map-pin")).toHaveCount(1);
  await expect(header.locator("svg.lucide-users")).toHaveCount(1);
  await expect(header.getByText("·", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Edit tournament" }),
  ).toHaveAttribute(
    "href",
    "/dashboard/team/schedule/tournament-outcomes/edit",
  );
  await expect(page.getByRole("link", { name: "Add result" })).toHaveAttribute(
    "href",
    "/dashboard/team/schedule/tournament-outcomes/score",
  );

  await expect(cell(page, "Record")).toContainText("1–0across 1 match");
  await expect(cell(page, "Deepest run")).toContainText("R16Lee");
  // No totals: nothing measured is a dash, never 0%.
  await expect(cell(page, "First serve in")).toContainText("—");
  await expect(cell(page, "Reports")).toContainText("1 of 1ready");

  await expect(page.getByRole("columnheader")).toHaveText([
    "Date",
    "Round",
    "Opponent",
    "Result",
    "Score",
    "Analysis",
  ]);

  // The first entry's head: name linked to the roster (its lineup id is a
  // roster player), draw words, and the run's record on the right.
  const lee = page.getByRole("link", { name: "Jordan Lee" });
  await expect(lee).toHaveAttribute(
    "href",
    "/dashboard/team/roster/player-browser",
  );
  const leeHead = lee.locator("../..");
  await expect(leeHead).toContainText("Qualifying");
  await expect(leeHead).toContainText("1–0");

  // The second entry has played nothing: its head still draws, unlinked,
  // because its lineup id resolves to nobody on the roster.
  await expect(page.getByRole("link", { name: "Sam Park" })).toHaveCount(0);
  const parkHead = page.getByText("Sam Park", { exact: true }).locator("..");
  await expect(parkHead).toContainText("Main draw · Seed 1");
  await expect(parkHead).toContainText("No matches yet");

  await expect(
    page.getByText("3 matches · 2 entries · Best of 3 sets, no-ad scoring", {
      exact: true,
    }),
  ).toBeVisible();
});

test("the pills cut rows by draw, and a row click selects it", async ({
  page,
}) => {
  await open(page);

  await expect(
    page.getByRole("button", {
      name: /^(All matches|Main draw|Qualifying|Needs video)$/,
    }),
  ).toHaveText(["All matches", "Main draw", "Qualifying", "Needs video"]);

  await page.getByRole("button", { name: "Qualifying", exact: true }).click();
  await expect(matchRows(page).locator("span.mono")).toHaveText(["Q1"]);
  // An entry the cut leaves empty drops out with its head.
  await expect(page.getByText("Sam Park", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "Main draw", exact: true }).click();
  await expect(matchRows(page).locator("span.mono")).toHaveText(["R16", "QF"]);

  await page.getByRole("button", { name: "All matches", exact: true }).click();
  await row(page, "R16").click();
  await expect(row(page, "R16")).toHaveAttribute("aria-current", "true");
  await expect.poll(() => page.url()).toContain("match=played-r16");
});

test("?match= opens with that round selected", async ({ page }) => {
  await open(page, "?match=outcome-qf");
  await expect(row(page, "QF")).toHaveAttribute("aria-current", "true");
});

test("outcome-only rounds never enter match analysis totals", () => {
  expect(lineCoverageFrom([entry])).toEqual({ analyzed: 1, total: 1 });
  expect(readyMatchIdsFrom([entry])).toEqual(["played-r16"]);
  expect(entry.matches).toHaveLength(1);
});

/* ── The match drawer (T12) ─────────────────────────────────────────────── */

function drawer(page: Page) {
  return page.getByRole("dialog");
}

const SCORE = "/dashboard/team/schedule/tournament-outcomes/score";
// `nextRound(entry)`: the round after the run's last match, R16.
const NEXT = `${SCORE}?entry=tournament-entry&round=QF`;

test("a played round opens the match drawer with its report and facts", async ({
  page,
}) => {
  await open(page);
  await row(page, "R16").click();

  const panel = drawer(page);
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Match", { exact: true })).toBeVisible();
  await expect(panel.getByText("2 / 3", { exact: true })).toBeVisible();

  const report = "/dashboard/matches/played-r16";
  await expect(panel.locator("h2 a")).toHaveAttribute("href", report);
  await expect(
    panel.getByRole("link", { name: "View match", exact: true }),
  ).toHaveAttribute("href", report);
  await expect(panel.locator("dl").first()).toContainText(
    "Fall Invitational · R16",
  );
  // A coach sees ⋯ on a played round, and the entry's next-round result.
  await expect(
    panel.getByRole("button", { name: "Match actions" }),
  ).toHaveCount(1);
  await expect(
    panel.getByRole("link", { name: "Add result", exact: true }),
  ).toHaveAttribute("href", NEXT);
  expect(await page.evaluate(() => window.actionCalls)).toEqual([]);
});

test("?match=played-r16 opens the drawer on load", async ({ page }) => {
  await open(page, "?match=played-r16");
  const panel = drawer(page);
  await expect(panel).toBeVisible();
  await expect(panel.locator("h2 a")).toHaveAttribute(
    "href",
    "/dashboard/matches/played-r16",
  );
});

test("the drawer lists the player's run, outcome-only rounds included", async ({
  page,
}) => {
  await open(page, "?match=played-r16");

  const list = drawer(page).getByRole("region", { name: "Lee's run" });
  await expect(list.getByText("Lee's run", { exact: true })).toBeVisible();
  // `runRecord`: matches only, so the default and the withdrawal do not count.
  await expect(list.getByText("Seed 3 · 1–0", { exact: true })).toBeVisible();

  const rounds = list.getByRole("button");
  await expect(rounds.locator("span.mono")).toHaveText(["Q1", "R16", "QF"]);
  await expect(rounds.nth(1)).toHaveAttribute("aria-current", "true");
  await expect(rounds.nth(0)).not.toHaveAttribute("aria-current", "true");
  await expect(rounds.nth(0)).toContainText("Defaulted");
  await expect(rounds.nth(1)).toContainText("6-2, 6-3");
  await expect(rounds.nth(2)).toContainText("Withdrawn");

  // Choosing a round moves the drawer and the table's selection with it.
  await rounds.nth(2).click();
  await expect(rounds.nth(2)).toHaveAttribute("aria-current", "true");
  await expect(row(page, "QF")).toHaveAttribute("aria-current", "true");
  await expect.poll(() => page.url()).toContain("match=outcome-qf");
});

for (const round of ["Q1", "QF"]) {
  test(`the outcome-only ${round} round offers Edit result, not a snapshot`, async ({
    page,
  }) => {
    await open(page);
    await row(page, round).click();

    const panel = drawer(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText("Snapshot", { exact: true })).toHaveCount(0);
    await expect(
      panel.getByRole("link", { name: "Edit result", exact: true }),
    ).toHaveAttribute("href", `${SCORE}?entry=tournament-entry&round=${round}`);
    await expect(
      panel.getByRole("link", { name: "Add result", exact: true }),
    ).toHaveAttribute("href", NEXT);
    // No match, so nothing to view or manage.
    await expect(
      panel.getByRole("link", { name: "View match", exact: true }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("button", { name: "Match actions" }),
    ).toHaveCount(0);
    expect(await page.evaluate(() => window.actionCalls)).toEqual([]);
  });
}

test("a member who cannot edit sees no writes in the drawer", async ({
  page,
}) => {
  await open(page, "?viewer=player&match=played-r16");
  const panel = drawer(page);
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "View match", exact: true }),
  ).toHaveAttribute("href", "/dashboard/matches/played-r16");
  await expect(
    panel.getByRole("button", { name: "Match actions" }),
  ).toHaveCount(0);
  await expect(
    panel.getByRole("link", { name: /^(Add|Edit) result$/ }),
  ).toHaveCount(0);

  await row(page, "QF").click();
  await expect(panel.getByText("3 / 3", { exact: true })).toBeVisible();
  await expect(
    panel.getByRole("link", { name: /^(Add|Edit) result$/ }),
  ).toHaveCount(0);
  // Nor does the waiting entry's head offer its first result.
  await expect(
    page.getByRole("link", { name: "Add first result" }),
  ).toHaveCount(0);
});

test("an entry with nothing played offers its first result from its head", async ({
  page,
}) => {
  await open(page);
  const parkHead = page.getByText("Sam Park", { exact: true }).locator("..");
  // Main draw, nothing recorded: `nextRound` starts the run at R32.
  await expect(
    parkHead.getByRole("link", { name: "Add first result", exact: true }),
  ).toHaveAttribute(
    "href",
    `${SCORE}?entry=tournament-entry-waiting&round=R32`,
  );
});
