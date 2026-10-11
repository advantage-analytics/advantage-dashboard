import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * The Ask answer and its sources, rendered in a real browser.
 *
 * `tests/fixtures/ask-answer-harness.tsx` is bundled with webpack and served
 * from a throwaway port — the harness pattern of `ask-composer.spec.ts`. The
 * answer is mostly markup, but "All N" opening the rest of the sources in
 * place is a click, and "value over label" is a position.
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

const HEADLINE =
  "Your second serve held against Marcus. It breaks down against left-handers.";

/** The fixed copy, by the stream's error code. */
const ERROR_COPY = {
  cannot_answer: {
    title: "Your match data can't answer that",
    detail:
      "Ask covers what your own matches recorded: results and scores, serve and return numbers, points and shots.",
  },
  no_data: {
    title: "No matches in that scope",
    detail:
      "None of your matches fit the match, opponent or period you asked about, so there was nothing to compute.",
  },
  llm_unavailable: {
    title: "Advantage Intelligence didn't respond",
    detail: "Try again. Your question is kept.",
  },
  answer_failed: {
    title: "The answer couldn't be completed",
    detail: "Ask the question again.",
  },
} as const;

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "ask-answer-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/ask-answer-harness.tsx"),
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
          // A source row is a `next/link`; here it is the plain anchor it
          // renders to. No `next/navigation` alias, on purpose: the answer
          // must bundle without one.
          alias: {
            "@": resolve("src"),
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

async function openFixture(page: Page, query = "") {
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

const figures = (page: Page) => page.locator("[data-ask-figure]");
const sourceLinks = (page: Page) => page.getByRole("list").getByRole("link");
const allControl = (page: Page) => page.getByRole("button", { name: /^All / });

async function expectNoProgress(page: Page) {
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator("progress, meter, svg.animate-spin")).toHaveCount(
    0,
  );
}

test.describe("a full answer", () => {
  test("names the engine, then the headline, three figures and the evidence", async ({
    page,
  }) => {
    await openFixture(page, "?case=full");

    await expect(page.getByText("Advantage Intelligence")).toBeVisible();
    await expect(page.getByText(HEADLINE)).toBeVisible();

    // Four were sent; an answer carries at most three.
    await expect(figures(page)).toHaveCount(3);
    await expect(figures(page).locator("[data-ask-figure-value]")).toHaveText([
      "55%",
      "48%",
      "41%",
    ]);
    await expect(figures(page).locator("[data-ask-figure-label]")).toHaveText([
      "Sep 14 vs. Marcus",
      "All 22 matches",
      "8 matches vs. left-handers",
    ]);

    // Value over label.
    const first = figures(page).first();
    const value = await first.locator("[data-ask-figure-value]").boundingBox();
    const label = await first.locator("[data-ask-figure-label]").boundingBox();
    expect(value!.y).toBeLessThan(label!.y);

    await expect(
      page.getByText(
        "On Sep 14 you won 55% of second-serve points, 7 above your average.",
      ),
    ).toBeVisible();
    await expect(page.getByText("The gap is on the ad court.")).toBeVisible();

    // Finished: nothing says it is still working, and nothing failed.
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectNoProgress(page);
  });

  test("figure tiles are ink, never an outcome colour", async ({ page }) => {
    await openFixture(page, "?case=full");

    // No stylesheet is served here, so a computed colour would only be the
    // page default. What is pinned is that nothing on a tile names an
    // outcome colour.
    const classes = await figures(page).evaluateAll((nodes) =>
      nodes.map((node) => node.outerHTML).join(" "),
    );
    expect(classes).not.toMatch(/success|danger|viz-good|viz-bad|green|red/);
  });

  test("sources: two rows show, each a link to its match, and All N opens the rest in place", async ({
    page,
  }) => {
    await openFixture(page, "?case=full");

    await expect(
      page.getByRole("heading", { name: "Computed from 4 matches" }),
    ).toBeVisible();

    await expect(sourceLinks(page)).toHaveCount(2);
    await expect(sourceLinks(page).nth(0)).toHaveAttribute(
      "href",
      "/dashboard/matches/match-sep-28",
    );
    await expect(sourceLinks(page).nth(1)).toHaveAttribute(
      "href",
      "/dashboard/matches/match-sep-14",
    );

    // The outcome is a mark with the word as its accessible name; the
    // opponent and the score sit beside it.
    await expect(sourceLinks(page).nth(0)).toContainText("Won");
    await expect(sourceLinks(page).nth(0)).toContainText("Theo Lindqvist");
    await expect(sourceLinks(page).nth(0)).toContainText("6-4, 6-3");
    await expect(sourceLinks(page).nth(0).locator("svg").first()).toBeVisible();
    await expect(sourceLinks(page).nth(1)).toContainText("Lost");
    await expect(sourceLinks(page).nth(1)).toContainText("Marcus Hale");

    const headingBefore = await page
      .getByRole("heading", { name: "Computed from 4 matches" })
      .boundingBox();

    await expect(allControl(page)).toHaveText("All 4");
    await expect(allControl(page)).toHaveAttribute("aria-expanded", "false");
    await allControl(page).click();

    await expect(sourceLinks(page)).toHaveCount(4);
    await expect(sourceLinks(page).nth(2)).toHaveAttribute(
      "href",
      "/dashboard/matches/match-aug-30",
    );
    await expect(sourceLinks(page).nth(3)).toHaveAttribute(
      "href",
      "/dashboard/matches/match-unscored",
    );
    // In place: the heading has not moved and the page has not navigated.
    const headingAfter = await page
      .getByRole("heading", { name: "Computed from 4 matches" })
      .boundingBox();
    expect(headingAfter).toEqual(headingBefore);
    expect(new URL(page.url()).search).toBe("?case=full");
    await expect(page.getByRole("button", { name: "First 2" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  test("a match the score cannot decide carries the unfinished mark, never a loss", async ({
    page,
  }) => {
    await openFixture(page, "?case=full");
    await allControl(page).click();

    const stopped = sourceLinks(page).nth(2);
    await expect(stopped).toContainText("Unfinished");
    await expect(stopped).toContainText("Daniel Okafor");
    await expect(stopped).toContainText("6-4, 3-6");
    // A date outside this year carries its year, read off the string.
    await expect(stopped).toContainText("Aug 30, 2025");
    await expect(stopped).not.toContainText("Lost");
    await expect(stopped).not.toContainText("Won");
    await expect(stopped).not.toContainText("Level");

    // No opponent, score or date: the row still opens its match.
    const bare = sourceLinks(page).nth(3);
    await expect(bare).toContainText("Unfinished");
    await expect(bare).toContainText("Opponent");
    await expect(bare).toContainText("No score");
    await expect(bare).toContainText("Undated");
    await expect(bare).not.toContainText("Lost");
  });

  test("there is no Open Statistics link", async ({ page }) => {
    await openFixture(page, "?case=full");
    await allControl(page).click();

    await expect(page.getByRole("link", { name: /statistics/i })).toHaveCount(
      0,
    );
    await expect(page.getByText(/open statistics/i)).toHaveCount(0);
    await expect(page.locator('a[href*="statistics"]')).toHaveCount(0);
    // Every link on the answer is a source row.
    await expect(page.getByRole("link")).toHaveCount(4);
  });
});

test("a one-match answer reads Computed from 1 match, with no All control", async ({
  page,
}) => {
  await openFixture(page, "?case=one");

  await expect(
    page.getByRole("heading", { name: "Computed from 1 match", exact: true }),
  ).toBeVisible();
  await expect(sourceLinks(page)).toHaveCount(1);
  await expect(sourceLinks(page).first()).toHaveAttribute(
    "href",
    "/dashboard/matches/match-sep-28",
  );
  await expect(allControl(page)).toHaveCount(0);
  await expect(page.getByRole("button")).toHaveCount(0);
});

test.describe("in flight", () => {
  for (const [stage, label] of [
    ["planning", "Planning the query"],
    ["querying", "Reading your matches"],
    ["writing", "Writing the answer"],
  ] as const) {
    test(`the status line names the ${stage} step`, async ({ page }) => {
      await openFixture(page, `?case=streaming&stage=${stage}`);

      await expect(page.getByRole("status")).toHaveText(label);
      await expect(page.getByText("Advantage Intelligence")).toBeVisible();
      // The real step, in words: no bar, no percentage, no spinner.
      await expectNoProgress(page);
      await expect(page.getByRole("status")).not.toContainText("%");
      await expect(page.getByRole("status").locator("svg")).toHaveCount(0);
    });
  }

  test("before the route's first event the line says the question is on its way", async ({
    page,
  }) => {
    await openFixture(page, "?case=streaming");
    await expect(page.getByRole("status")).toHaveText("Sending your question");
    await expectNoProgress(page);
  });
});

test.describe("a failed answer", () => {
  for (const [code, copy] of Object.entries(ERROR_COPY)) {
    test(`${code} renders its fixed copy and no figure tiles`, async ({
      page,
    }) => {
      await openFixture(page, `?case=error&code=${code}`);

      const alert = page.getByRole("alert");
      await expect(alert).toHaveCount(1);
      await expect(alert.locator("p")).toHaveText([copy.title, copy.detail]);
      // The stream's own sentence is not what the player reads.
      await expect(page.getByText("The connection dropped")).toHaveCount(0);

      // Nothing of the answer that never finished: no claim, no figures, no
      // sources, and nothing still claiming to be at work.
      await expect(figures(page)).toHaveCount(0);
      await expect(page.getByRole("list")).toHaveCount(0);
      await expect(page.getByText(HEADLINE)).toHaveCount(0);
      await expect(page.getByText(/Computed from/)).toHaveCount(0);
      await expect(page.getByRole("link")).toHaveCount(0);
      await expect(page.getByRole("status")).toHaveCount(0);
      await expect(
        page.getByText("Advantage Intelligence").first(),
      ).toBeVisible();
    });
  }

  test("the four codes read differently from one another", () => {
    const titles = Object.values(ERROR_COPY).map((copy) => copy.title);
    const details = Object.values(ERROR_COPY).map((copy) => copy.detail);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(details).size).toBe(details.length);
  });

  test("an interrupted stream shows the sentence the reader wrote, and no figure tiles", async ({
    page,
  }) => {
    await openFixture(page, "?case=error");

    await expect(page.getByRole("alert")).toHaveText(
      "The connection dropped before the answer finished.",
    );
    await expect(figures(page)).toHaveCount(0);
    await expect(page.getByRole("link")).toHaveCount(0);
  });
});
