import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * A draft that fills a listed match folds onto that match's row
 * (`foldDrafts`, `MatchesPageContent`), on the harness in
 * `fixtures/matches-drafts-harness.tsx`: one scored match `m-scored` with a
 * video draft `d-folded` targeting it, an older `m-plain`, and a standalone
 * draft `d-new`. `?job=1` gives `m-scored` a video job, which retires
 * `d-folded`; `?manual=1` gives it a score-only analysis, which does not.
 * The same harness draws the title row, for its subtitle.
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
  const outputPath = mkdtempSync(join(tmpdir(), "matches-drafts-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/matches-drafts-harness.tsx"),
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
            "@/components/dashboard/matches/match-actions/match-actions-menu":
              resolve("tests/fixtures/match-drawer-deps-browser-mock.tsx"),
            "next/image": resolve(
              "tests/fixtures/match-drawer-deps-browser-mock.tsx",
            ),
            "@/lib/supabase/client": resolve(
              "tests/fixtures/supabase-client-browser-mock.ts",
            ),
            "@/lib/wizard/actions": resolve(
              "tests/fixtures/matches-page-actions-browser-mock.ts",
            ),
            "@/components/dashboard/team/roster-table": resolve(
              "tests/fixtures/matches-page-actions-browser-mock.ts",
            ),
            "next/navigation": resolve(
              "tests/fixtures/matches-page-navigation-browser-mock.ts",
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

async function open(page: Page, query = "") {
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
  await expect(page.locator("#match-row-m-scored")).toHaveCount(1);
}

/** A table row by the record id it carries (`matchRowId`). */
function row(page: Page, id: string) {
  return page.locator(`[role="row"]#match-row-${id}`);
}

function drawer(page: Page) {
  return page.getByRole("dialog");
}

for (const scope of ["personal", "team"] as const) {
  test(`${scope}: the targeted match keeps one row, carrying the outlined Draft pill`, async ({
    page,
  }) => {
    await open(page, scope === "team" ? "?scope=team" : "");

    // One row for the match, none for the draft that fills it; the draft
    // that will create a match still lists on its own.
    await expect(row(page, "m-scored")).toHaveCount(1);
    await expect(row(page, "d-folded")).toHaveCount(0);
    await expect(row(page, "d-new")).toHaveCount(1);
    await expect(page.locator('[role="row"][id^="match-row-"]')).toHaveCount(3);

    // The pill: DraftRow's own outlined variant — no fill, the hairline ring.
    const pill = row(page, "m-scored").getByText("Draft", { exact: true });
    await expect(pill).toHaveCount(1);
    const draftRowPill = row(page, "d-new").getByText("Draft", { exact: true });
    expect(await pill.getAttribute("class")).toBe(
      await draftRowPill.getAttribute("class"),
    );
    expect(await pill.getAttribute("style")).toBe(
      await draftRowPill.getAttribute("style"),
    );
    expect(await pill.getAttribute("style")).toContain("inset 0 0 0 1px");

    // Beside the row's primary name: the player on a team table, the
    // opponent on a personal one.
    const name = scope === "team" ? "Dana Brooks" : "Avery Stone";
    await expect(
      pill.locator("..").getByText(name, { exact: true }),
    ).toHaveCount(1);

    // A match with no folded draft carries no pill.
    await expect(
      row(page, "m-plain").getByText("Draft", { exact: true }),
    ).toHaveCount(0);
  });

  test(`${scope}: the drawer of a match with a draft offers Continue upload`, async ({
    page,
  }) => {
    await open(page, scope === "team" ? "?scope=team" : "");
    const href =
      scope === "team"
        ? "/dashboard/team/upload?draft=d-folded"
        : "/dashboard/matches/new?draft=d-folded";

    await row(page, "m-scored").click();
    const panel = drawer(page);
    await expect(panel).toBeVisible();
    const cont = panel.getByRole("link", {
      name: "Continue upload",
      exact: true,
    });
    await expect(cont).toHaveAttribute("href", href);
    // The one primary is the draft's; the report link stays, as the ghost.
    const view = panel.getByRole("link", { name: "View match", exact: true });
    await expect(view).toHaveAttribute("href", "/dashboard/matches/m-scored");
    await expect(cont).toHaveClass(/bg-\[var\(--blue\)\]/);
    await expect(view).not.toHaveClass(/bg-\[var\(--blue\)\]/);
    await expect(view).toHaveClass(/bg-transparent/);

    // A match without a folded draft: no Continue upload, View match primary.
    await row(page, "m-plain").click();
    await expect(
      panel.getByRole("link", { name: "View match", exact: true }),
    ).toHaveAttribute("href", "/dashboard/matches/m-plain");
    await expect(
      panel.getByRole("link", { name: "Continue upload" }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("link", { name: "View match", exact: true }),
    ).toHaveClass(/bg-\[var\(--blue\)\]/);
  });
}

test("↑/↓ walk the standalone drafts, then the matches, never the folded draft", async ({
  page,
}) => {
  await open(page);
  const selected = () =>
    page.locator('[role="row"][aria-current="true"]').getAttribute("id");

  await row(page, "d-new").click();
  await expect(drawer(page)).toBeVisible();
  expect(await selected()).toBe("match-row-d-new");
  await expect(drawer(page).getByText("1 / 1", { exact: true })).toBeVisible();

  await page.keyboard.press("ArrowDown");
  await expect(row(page, "m-scored")).toHaveAttribute("aria-current", "true");
  await expect(
    drawer(page).getByRole("link", { name: "Continue upload" }),
  ).toHaveCount(1);

  await page.keyboard.press("ArrowDown");
  await expect(row(page, "m-plain")).toHaveAttribute("aria-current", "true");
  await expect(
    drawer(page).getByRole("button", { name: "Next" }),
  ).toBeDisabled();

  await page.keyboard.press("ArrowUp");
  await expect(row(page, "m-scored")).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowUp");
  await expect(row(page, "d-new")).toHaveAttribute("aria-current", "true");
  await expect(
    drawer(page).getByRole("button", { name: "Previous" }),
  ).toBeDisabled();
  expect(await page.evaluate(() => location.search)).toBe("?draft=d-new");
});

test("?draft= naming a folded draft lands on the match it fills", async ({
  page,
}) => {
  await open(page, "?draft=d-folded");
  await expect(row(page, "m-scored")).toHaveAttribute("aria-current", "true");
  await expect(
    drawer(page).getByRole("link", { name: "Continue upload" }),
  ).toHaveAttribute("href", "/dashboard/matches/new?draft=d-folded");
  // Stepping away mirrors the match's own id, not the folded draft's.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await expect(row(page, "m-scored")).toHaveAttribute("aria-current", "true");
  expect(await page.evaluate(() => location.search)).toBe("?match=m-scored");
});

test("a draft whose match already has a video job shows nowhere", async ({
  page,
}) => {
  await open(page, "?job=1");

  // Neither folded onto the match nor listed on its own.
  await expect(
    row(page, "m-scored").getByText("Draft", { exact: true }),
  ).toHaveCount(0);
  await expect(row(page, "d-folded")).toHaveCount(0);
  await expect(row(page, "d-new")).toHaveCount(1);

  await row(page, "m-scored").click();
  const panel = drawer(page);
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "Continue upload" }),
  ).toHaveCount(0);
  const view = panel.getByRole("link", { name: "View match", exact: true });
  await expect(view).toHaveAttribute("href", "/dashboard/matches/m-scored");
  await expect(view).toHaveClass(/bg-\[var\(--blue\)\]/);
});

test("a score-only match (manual analysis, no job) still folds its draft", async ({
  page,
}) => {
  await open(page, "?manual=1");
  await expect(
    row(page, "m-scored").getByText("Draft", { exact: true }),
  ).toHaveCount(1);
  await expect(row(page, "d-folded")).toHaveCount(0);
  await row(page, "m-scored").click();
  await expect(
    drawer(page).getByRole("link", { name: "Continue upload" }),
  ).toHaveAttribute("href", "/dashboard/matches/new?draft=d-folded");
});

test("the draft rail's ⋯ asks before discarding, and a refusal keeps the rail", async ({
  page,
}) => {
  await open(page, "?discard=refused");
  await row(page, "d-new").click();
  const panel = drawer(page);
  await expect(panel).toBeVisible();

  // The ⋯ opens the product's float menu: one action row, grey at rest, the
  // consequence as its second line — nothing is deleted from here.
  const trigger = panel.getByRole("button", { name: "Draft actions" });
  await trigger.click();
  const menu = page.getByRole("menu", { name: "Draft actions" });
  await expect(menu).toBeVisible();
  const item = menu.getByRole("menuitem", { name: /Discard draft/ });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText("Clears your saved answers");
  await expect(item.getByText("Discard draft", { exact: true })).toHaveClass(
    /text-\[var\(--ink-900\)\]/,
  );
  expect(await page.evaluate(() => window.draftDiscards ?? [])).toEqual([]);

  await item.click();
  const confirm = page.getByRole("alertdialog", {
    name: "Discard this draft?",
  });
  await expect(confirm).toBeVisible();
  await expect(menu).toHaveCount(0);
  await expect(confirm).toContainText(
    "Throws away the answers saved for the match vs Sam Ortiz so far. The file you picked stays on your device, and nothing in your match library changes.",
  );

  // Refused: the problem line, the dialog held open, the draft still listed.
  await confirm.getByRole("button", { name: "Discard draft" }).click();
  await expect(confirm.getByRole("alert")).toHaveText(
    "Couldn’t discard this draft. Try again.",
  );
  expect(await page.evaluate(() => window.draftDiscards)).toEqual(["d-new"]);
  await expect(
    confirm.getByRole("button", { name: "Discard draft" }),
  ).toBeEnabled();

  // Keep draft: back to the ⋯, the rail and the row as they were.
  await confirm.getByRole("button", { name: "Keep draft" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(row(page, "d-new")).toHaveAttribute("aria-current", "true");
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(() => window.routerRefreshes ?? 0)).toBe(0);
});

test("confirming Discard draft deletes it, slides the rail out, then refreshes", async ({
  page,
}) => {
  await open(page);
  await row(page, "d-new").click();
  const panel = drawer(page);
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Draft actions" }).click();
  await page.getByRole("menuitem", { name: /Discard draft/ }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Discard this draft?",
  });
  await confirm.getByRole("button", { name: "Discard draft" }).click();

  await expect(confirm).toHaveCount(0);
  // The rail leaves the way Esc closes it; the list refresh waits for that.
  await expect(panel).toHaveCount(0);
  await expect(row(page, "d-new")).not.toHaveAttribute("aria-current", "true");
  expect(await page.evaluate(() => window.draftDiscards)).toEqual(["d-new"]);
  await expect
    .poll(() => page.evaluate(() => window.routerRefreshes ?? 0))
    .toBe(1);
});

test("a draft row and its rail read back what was answered", async ({
  page,
}) => {
  await open(page);
  const draftRow = row(page, "d-new");

  // Date is the match day; the opponent carries the pill (the player is the
  // viewer on a personal list); the sets typed so far read one ink quieter;
  // the event label fills Event; the lifecycle cell names the step and leads
  // back into the wizard.
  await expect(draftRow).toContainText("Sep 18");
  await expect(draftRow.getByText("Sam Ortiz", { exact: true })).toHaveCount(1);
  await expect(draftRow.getByText("Jordan Park")).toHaveCount(0);
  await expect(draftRow.getByText("6-4, 3-6", { exact: true })).toHaveClass(
    /text-\[var\(--ink-600\)\]/,
  );
  await expect(draftRow).toContainText("Fall Classic · R16");
  await expect(draftRow.getByText("Video check", { exact: true })).toHaveCount(
    1,
  );
  await expect(
    draftRow.getByRole("link", { name: "Continue", exact: true }),
  ).toHaveAttribute("href", "/dashboard/matches/new?draft=d-new");

  // The rail: named like a match, the step named and measured, the facts as
  // the match rail draws them, the file honest about having to be picked
  // again, and no sentence.
  await draftRow.click();
  const panel = drawer(page);
  await expect(panel).toBeVisible();
  await expect(
    panel.getByRole("link", { name: "vs Sam Ortiz", exact: true }),
  ).toHaveAttribute("href", "/dashboard/matches/new?draft=d-new");
  await expect(
    panel.getByText("Stopped at Video check", { exact: true }),
  ).toBeVisible();
  await expect(panel.getByText("3 / 4", { exact: true })).toBeVisible();
  await expect(panel.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "3",
  );
  await expect(panel).toContainText("Sep 18");
  await expect(panel).toContainText("Hard");
  await expect(panel).toContainText("Advantage Intelligence");
  await expect(panel).toContainText("match.mp4 · Pick again on Continue");
  await expect(panel).toContainText("Edited Sep 22");
  await expect(panel.getByText("step 3 of 4")).toHaveCount(0);
  await expect(
    panel.getByText(/It isn.t a match until you save it/),
  ).toHaveCount(0);
});

test("team: the draft row puts the player under Player and the opponent under Opponent", async ({
  page,
}) => {
  await open(page, "?scope=team");
  const draftRow = row(page, "d-new");
  const pill = draftRow.getByText("Draft", { exact: true });
  await expect(
    pill.locator("..").getByText("Jordan Park", { exact: true }),
  ).toHaveCount(1);
  await expect(draftRow.getByText("Sam Ortiz", { exact: true })).toHaveCount(1);
  await draftRow.click();
  await expect(
    drawer(page).getByRole("link", {
      name: "Jordan Park vs Sam Ortiz",
      exact: true,
    }),
  ).toHaveCount(1);
});

/** The harness loaded, for a cut that may have left no match row to wait on. */
async function openCut(page: Page, query: string) {
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

function listedRows(page: Page) {
  return page.locator('[role="row"][id^="match-row-"]');
}

/** The table's own card; the cards below `lg` are a separate layout. */
function tableCard(page: Page) {
  return page.locator(".surface-card.overflow-x-auto");
}

function strip(page: Page) {
  return page.getByText(/^\d+ of \d+/);
}

function footer(page: Page) {
  return page.getByRole("navigation", { name: "Pages" });
}

test.describe("the counts add up to the rows on screen", () => {
  test("at rest the footer states the draft above its matches", async ({
    page,
  }) => {
    await open(page);
    await expect(listedRows(page)).toHaveCount(3);
    await expect(strip(page)).toHaveCount(0);
    await expect(footer(page)).toContainText("1–2 of 2 · 1 draft");
  });

  test("a search no draft answers leaves only the matches it found", async ({
    page,
  }) => {
    await openCut(page, "?q=Riley");
    await expect(listedRows(page)).toHaveCount(1);
    await expect(row(page, "m-plain")).toHaveCount(1);
    await expect(row(page, "d-new")).toHaveCount(0);
    await expect(strip(page)).toHaveText("1 of 2");
    await expect(footer(page)).toHaveText("1–1 of 1");
  });

  test("a search a draft answers keeps it and counts it", async ({ page }) => {
    // The event label reaches `d-new`, the tournament name both matches.
    await openCut(page, "?q=Fall");
    await expect(listedRows(page)).toHaveCount(3);
    await expect(strip(page)).toHaveText("2 of 2 · 1 draft");
    await expect(footer(page)).toContainText("1–2 of 2 · 1 draft");
  });

  test("a search only a draft answers says so, with no empty sentence", async ({
    page,
  }) => {
    await openCut(page, "?q=Sam%20Ortiz");
    await expect(listedRows(page)).toHaveCount(1);
    await expect(row(page, "d-new")).toHaveCount(1);
    await expect(strip(page)).toHaveText("0 of 2 · 1 draft");
    await expect(footer(page)).toHaveCount(0);
    await expect(tableCard(page).getByText(/^No matches for/)).toHaveCount(0);
  });

  test("a search nothing answers says so", async ({ page }) => {
    await openCut(page, "?q=Nobody");
    await expect(listedRows(page)).toHaveCount(0);
    await expect(strip(page)).toHaveText("0 of 2");
    await expect(
      tableCard(page).getByText("No matches for “Nobody”"),
    ).toHaveCount(1);
  });

  for (const [label, query] of [
    ["a facet", "?result=Won"],
    ["the New view", "?lifecycle=new"],
    ["the In progress view", "?lifecycle=in-progress&queued=1"],
  ]) {
    test(`${label} leaves the drafts out`, async ({ page }) => {
      await openCut(page, query);
      await expect(row(page, "d-new")).toHaveCount(0);
      expect(await listedRows(page).count()).toBeGreaterThan(0);
      await expect(footer(page)).not.toContainText("draft");
    });
  }

  test("clearing the cut brings the draft back", async ({ page }) => {
    await openCut(page, "?q=Riley");
    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect(row(page, "d-new")).toHaveCount(1);
    await expect(listedRows(page)).toHaveCount(3);
  });
});

test.describe("stepping stays in step with the rows shown", () => {
  test("a search no draft answers has nothing above its first match", async ({
    page,
  }) => {
    await openCut(page, "?q=Riley");
    await row(page, "m-plain").click();
    const panel = drawer(page);
    await expect(
      panel.getByRole("button", { name: "Previous" }),
    ).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Next" })).toBeDisabled();
    await page.keyboard.press("ArrowUp");
    await expect(row(page, "m-plain")).toHaveAttribute("aria-current", "true");
  });

  test("a draft the search keeps is still walked first", async ({ page }) => {
    await openCut(page, "?q=Fall");
    await row(page, "d-new").click();
    const panel = drawer(page);
    await expect(panel.getByText("1 / 1", { exact: true })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(row(page, "m-scored")).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("ArrowUp");
    await expect(row(page, "d-new")).toHaveAttribute("aria-current", "true");
  });

  test("a deep link to a draft the cut hides lands closed", async ({
    page,
  }) => {
    await openCut(page, "?q=Riley&draft=d-new");
    await expect(row(page, "m-plain")).toHaveCount(1);
    await expect(drawer(page)).toHaveCount(0);
  });
});

test.describe("a workspace with drafts and no matches keeps the list", () => {
  for (const scope of ["personal", "team"] as const) {
    test(`${scope}: the drafts list, and one opens and continues`, async ({
      page,
    }) => {
      const team = scope === "team" ? "&scope=team" : "";
      await openCut(page, `?draftsOnly=1${team}`);

      await expect(
        page.getByText(
          scope === "team"
            ? "No matches on the program yet"
            : "Send your first match",
        ),
      ).toHaveCount(0);
      await expect(listedRows(page)).toHaveCount(2);
      await expect(tableCard(page).getByRole("columnheader")).not.toHaveCount(
        0,
      );

      await row(page, "d-new").click();
      const panel = drawer(page);
      await expect(panel.getByText("1 / 2", { exact: true })).toBeVisible();
      await expect(
        panel.getByRole("link", { name: /Continue/ }).last(),
      ).toHaveAttribute(
        "href",
        scope === "team"
          ? "/dashboard/team/upload?draft=d-new"
          : "/dashboard/matches/new?draft=d-new",
      );
      await page.keyboard.press("ArrowDown");
      await expect(row(page, "d-other")).toHaveAttribute(
        "aria-current",
        "true",
      );
    });
  }

  test("nothing claims the list is empty, and no footer pages nothing", async ({
    page,
  }) => {
    await openCut(page, "?draftsOnly=1");
    await expect(page.getByText("Show all matches")).toHaveCount(0);
    await expect(page.getByText(/^No matches/)).toHaveCount(0);
    await expect(footer(page)).toHaveCount(0);
    await expect(strip(page)).toHaveCount(0);
  });

  test("the strip counts the drafts, not zero of zero matches", async ({
    page,
  }) => {
    await openCut(page, "?draftsOnly=1&q=Sam%20Ortiz");
    await expect(listedRows(page)).toHaveCount(1);
    await expect(strip(page)).toHaveText("1 of 2 drafts");

    await openCut(page, "?draftsOnly=1&q=Nobody");
    await expect(listedRows(page)).toHaveCount(0);
    await expect(strip(page)).toHaveText("0 of 2 drafts");
    await expect(
      tableCard(page).getByText("No matches for “Nobody”"),
    ).toHaveCount(1);

    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect(listedRows(page)).toHaveCount(2);
    await expect(strip(page)).toHaveCount(0);
  });

  test("a view with no matches says so and leads back to the drafts", async ({
    page,
  }) => {
    await openCut(page, "?draftsOnly=1&lifecycle=new");
    await expect(listedRows(page)).toHaveCount(0);
    await expect(tableCard(page).getByText("No new matches")).toHaveCount(1);
    await tableCard(page)
      .getByRole("button", { name: "Show all matches" })
      .click();
    await expect(listedRows(page)).toHaveCount(2);
  });
});

// The harness loads no stylesheet, so both layouts draw and the cards can be
// driven directly: the table's rows and these cards answer the same drafts.
test.describe("the cards below lg list the drafts too", () => {
  function card(page: Page, id: string) {
    return page.locator(`a#match-card-${id}`);
  }

  test("a card reads back the draft and opens the rail", async ({ page }) => {
    await openCut(page, "?draftsOnly=1");
    const first = card(page, "d-new");
    await expect(first).toContainText("vs Sam Ortiz");
    await expect(first).toContainText("Fall Classic · R16");
    await expect(first).toContainText("Video check");
    await expect(first).toHaveAttribute(
      "href",
      "/dashboard/matches/new?draft=d-new",
    );
    await expect(card(page, "d-other")).toContainText("No event yet");

    await first.click();
    await expect(
      drawer(page).getByText("Stopped at Video check", { exact: true }),
    ).toBeVisible();
    expect(await page.evaluate(() => location.search)).toContain("draft=d-new");
  });

  test("beside matches a standalone draft gets a card, a folded one none", async ({
    page,
  }) => {
    await open(page);
    await expect(card(page, "d-new")).toHaveCount(1);
    await expect(card(page, "d-folded")).toHaveCount(0);
  });

  test("the cards drop the empty sentence only while a draft lists", async ({
    page,
  }) => {
    await openCut(page, "?draftsOnly=1&q=Nobody");
    await expect(card(page, "d-new")).toHaveCount(0);
    await expect(page.getByText("No matches for “Nobody”")).toHaveCount(2);

    await openCut(page, "?draftsOnly=1&q=Sam%20Ortiz");
    await expect(card(page, "d-new")).toHaveCount(1);
    await expect(page.getByText(/^No matches for/)).toHaveCount(0);
  });
});

test.describe("the subtitle describes the list", () => {
  function subtitle(page: Page) {
    return page.locator("h1 + div span").first();
  }

  test("team: every recorded match counts, analysed or not", async ({
    page,
  }) => {
    await openCut(page, "?scope=team&queued=1");
    await expect(subtitle(page)).toHaveText("2 on the program");
  });

  test("team: a mix counts both", async ({ page }) => {
    await openCut(page, "?scope=team&job=1");
    await expect(subtitle(page)).toContainText("2 on the program");
  });

  test("team: nothing recorded only when nothing is", async ({ page }) => {
    await openCut(page, "?scope=team&empty=1");
    await expect(subtitle(page)).toHaveText("Nothing recorded yet.");
  });

  test("personal: still counts what is analyzed", async ({ page }) => {
    await openCut(page, "?queued=1");
    await expect(subtitle(page)).toHaveText("Nothing analyzed yet.");
    await openCut(page, "?job=1");
    await expect(subtitle(page)).toContainText("1 analyzed");
  });
});
