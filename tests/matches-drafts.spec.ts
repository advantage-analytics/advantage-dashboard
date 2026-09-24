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
 * draft `d-new`.
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
