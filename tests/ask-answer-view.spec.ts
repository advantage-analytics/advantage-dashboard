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

/** The footer's sentence for a question that asked what to do. */
const NO_ADVICE =
  "Ask reports what your matches show; it does not recommend what to work on.";

const figures = (page: Page) => page.locator("[data-ask-figure]");
const answer = (page: Page) => page.locator("[data-ask-answer]");
const signature = (page: Page) => page.locator("[data-ask-signature]");
const visual = (page: Page) => page.locator("figure[data-ask-visual]");
// The sources' rows: the one list inside a section. The figures are a list
// too, and over one match a figure may be a link of its own.
const sourceLinks = (page: Page) =>
  page.locator("section").getByRole("list").getByRole("link");
const allControl = (page: Page) => page.getByRole("button", { name: /^All / });

async function expectNoProgress(page: Page) {
  await expect(page.getByRole("progressbar")).toHaveCount(0);
  await expect(page.locator("progress, meter, svg.animate-spin")).toHaveCount(
    0,
  );
}

test.describe("a full answer", () => {
  test("opens on the headline, then three figures and the evidence", async ({
    page,
  }) => {
    await openFixture(page, "?case=full");

    await expect(page.getByText(HEADLINE)).toBeVisible();
    // No byline: the claim is the first thing in the answer.
    await expect(answer(page).locator("> *").first()).toHaveText(HEADLINE);

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

    // Finished: the one live region is silent (an answer reopened, not one
    // that arrived here), and nothing failed.
    await expect(page.getByRole("status")).toHaveText("");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expectNoProgress(page);
  });

  test("is signed in the footer, under the sources, and nowhere above", async ({
    page,
  }) => {
    await openFixture(page, "?case=full");

    // The name appears once, and that once is the footer.
    await expect(
      page.getByText("Advantage Intelligence", { exact: false }),
    ).toHaveCount(1);
    await expect(signature(page)).toHaveText("Advantage Intelligence");

    const heading = await page
      .getByRole("heading", { name: "Computed from 4 matches" })
      .boundingBox();
    const claim = await page.getByText(HEADLINE).boundingBox();
    const foot = await signature(page).boundingBox();
    expect(claim!.y).toBeLessThan(heading!.y);
    expect(heading!.y).toBeLessThan(foot!.y);

    // No engine mark and no gutter: the only drawings in the answer are the
    // source rows' own marks.
    await expect(
      answer(page).locator("svg:not(li svg), img, [data-engine-mark]"),
    ).toHaveCount(0);
    const column = await answer(page).boundingBox();
    expect(claim!.x).toBe(column!.x);

    // Nothing asked for advice, so the footer is the name alone.
    await expect(page.getByText(NO_ADVICE)).toHaveCount(0);
  });

  test("a question that asked for advice is told so in the footer, not the body", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&advice=1");

    await expect(signature(page)).toHaveText(
      `Advantage Intelligence · ${NO_ADVICE}`,
    );
    // Once: in the footer, and in none of the evidence paragraphs.
    await expect(page.getByText(NO_ADVICE, { exact: false })).toHaveCount(1);
    await expect(
      answer(page).locator("p:not([data-ask-signature])", {
        hasText: NO_ADVICE,
      }),
    ).toHaveCount(0);
  });

  test("an answer saved before the notice keeps the sentence in its body, untouched", async ({
    page,
  }) => {
    await openFixture(page, "?case=old");

    await expect(
      answer(page).locator("p:not([data-ask-signature])", {
        hasText: NO_ADVICE,
      }),
    ).toHaveText(NO_ADVICE);
    // Not said twice, and nothing stripped: the footer is the name alone.
    await expect(signature(page)).toHaveText("Advantage Intelligence");
    await expect(visual(page)).toHaveCount(0);
  });

  test("over one match, a figure whose measure is a Video filter is a link to the film", async ({
    page,
  }) => {
    await openFixture(page, "?case=one");
    const links = figures(page).locator("a");
    await expect(links).toHaveCount(1);
    const href = await links.first().getAttribute("href");
    expect(href).toMatch(/^\/dashboard\/matches\/match-sep-28\?tab=film&f=/);
    await expect(links.first().locator("[data-ask-figure-value]")).toHaveText(
      "55%",
    );
    await expect(links.first()).toContainText("· Watch");
    // The baseline figure and the one with no column are plain tiles.
    await expect(figures(page).nth(1).locator("a")).toHaveCount(0);
    await expect(figures(page).nth(2).locator("a")).toHaveCount(0);
    await expect(page.locator("[data-ask-figure-watch]")).toHaveCount(1);
  });

  test("over several matches, no figure is a link", async ({ page }) => {
    await openFixture(page, "?case=full");
    await expect(figures(page).locator("a")).toHaveCount(0);
    await expect(page.locator("[data-ask-figure-watch]")).toHaveCount(0);
  });

  test("figures sit in tabular numerals, in the tiles and in the prose", async ({
    page,
  }) => {
    await openFixture(page, "?case=full");
    for (const value of await figures(page)
      .locator("[data-ask-figure-value]")
      .all()) {
      await expect(value).toHaveClass(/tabular-nums/);
    }
    const prose = page.locator("p", { hasText: "The gap is on the ad court." });
    await expect(prose).toHaveClass(/tabular-nums/);
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
      // Nothing signs an answer that has not finished.
      await expect(signature(page)).toHaveCount(0);
      await expect(page.getByText("Advantage Intelligence")).toHaveCount(0);
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

  test("a block that has arrived is drawn while the rest is still coming", async ({
    page,
  }) => {
    await openFixture(page, "?case=streaming&stage=writing&visual=bars");
    await expect(visual(page)).toHaveCount(1);
    await expect(page.getByRole("status")).toHaveText("Writing the answer");
    await expect(signature(page)).toHaveCount(0);
  });

  test("no block has arrived: nothing holds its place", async ({ page }) => {
    await openFixture(page, "?case=streaming&stage=writing");
    await expect(visual(page)).toHaveCount(0);
    await expect(page.locator("figure")).toHaveCount(0);
    // The answer itself says it is busy; nothing inside it holds a place.
    await expect(page.locator("[data-ask-answer]")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.locator("[data-ask-answer] [aria-busy]")).toHaveCount(0);
  });
});

test.describe("a failed answer", () => {
  for (const [code, copy] of Object.entries(ERROR_COPY)) {
    test(`${code} renders its fixed copy and no figure tiles`, async ({
      page,
    }) => {
      // Whatever had arrived is dropped — a block and a notice included.
      await openFixture(page, `?case=error&code=${code}&visual=bars&advice=1`);

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
      await expect(page.getByRole("status")).toHaveText("");
      // No block, and no footer: a failed answer has nothing to sign.
      await expect(visual(page)).toHaveCount(0);
      await expect(signature(page)).toHaveCount(0);
      await expect(page.getByText(NO_ADVICE)).toHaveCount(0);
      await expect(answer(page).locator("> *")).toHaveCount(1);
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
    await expect(signature(page)).toHaveCount(0);
  });
});

test.describe("the visual block", () => {
  test("an answer with no block draws none", async ({ page }) => {
    await openFixture(page, "?case=full");
    await expect(visual(page)).toHaveCount(0);
    await expect(page.locator("figure, table, figcaption")).toHaveCount(0);
  });

  test("sits after the figures and before the evidence", async ({ page }) => {
    await openFixture(page, "?case=full&visual=bars");

    const tiles = await page
      .getByRole("list", { name: "Figures" })
      .boundingBox();
    const block = await visual(page).boundingBox();
    const prose = await page
      .getByText("On Sep 14 you won 55% of second-serve points", {
        exact: false,
      })
      .boundingBox();
    expect(tiles!.y).toBeLessThan(block!.y);
    expect(block!.y + block!.height).toBeLessThanOrEqual(prose!.y);
    await expect(visual(page)).toHaveCount(1);
  });

  test("bars: caption, both series named, and the server's text beside each bar", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=bars");
    const block = visual(page);

    await expect(block).toHaveAttribute("data-ask-visual", "bars");
    await expect(block.locator("figcaption")).toHaveText(
      "Share of points, from 4 matches against 22.",
    );
    await expect(block.getByText("First serves in")).toBeVisible();
    await expect(block.getByText("Break points saved")).toBeVisible();
    // Printed as sent — "37,5 %", not a client's own formatting of 37.5.
    for (const text of ["37,5 %", "58,2 %", "0 %", "100 %"]) {
      await expect(block).toContainText(text);
    }
    await expect(block).not.toContainText("37.5");
    // Each value says whose it is, in words as well as colour.
    const firstRow = block.locator("li", { hasText: "First serves in" });
    await expect(firstRow).toContainText("Against left-handers: 37,5 %");
    await expect(firstRow).toContainText("All matches: 58,2 %");
    const lastRow = block.locator("li", { hasText: "Break points saved" });
    await expect(lastRow).toContainText("Against left-handers: 0 %");
    await expect(lastRow).toContainText("All matches: 100 %");
    // Geometry from the value: an empty bar and a full one, inside the track.
    const widths = await block
      .locator("li", { hasText: "Break points saved" })
      .locator("[aria-hidden] > span")
      .evaluateAll((bars) =>
        bars.map((bar) => (bar as HTMLElement).style.width),
      );
    expect(widths).toEqual(["0%", "100%"]);
  });

  test("table: a real table with header cells, printing the cells as sent", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=table");
    const block = visual(page);

    await expect(block.locator("figcaption")).toHaveText(
      "From 1 match against 22.",
    );
    await expect(block.getByRole("table")).toHaveCount(1);
    await expect(block.locator('thead th[scope="col"]')).toHaveText([
      "Measure",
      "Sep 28",
      "All matches",
      "Difference",
    ]);
    await expect(block.locator('tbody th[scope="row"]')).toHaveText([
      "First serves in",
      "Double faults",
    ]);
    // The difference column is a Delta: the arrow says which way the number
    // moved and the colour whether that is good for the measure, so double
    // faults rising is a red ↑. The sign moves into the arrow.
    await expect(block.locator("tbody tr").nth(0).locator("td")).toHaveText([
      "37.5%",
      "58.2%",
      "↓ down 20.7",
    ]);
    await expect(block.locator("tbody tr").nth(1).locator("td")).toHaveText([
      "4",
      "2.3",
      "↑ up 1.7",
    ]);
    await expect(block.locator("[data-ask-delta]")).toHaveCount(2);
    const tones = await block
      .locator("[data-ask-delta]")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-ask-delta")),
      );
    expect(tones).toEqual(["bad", "bad"]);
    await expect(
      block.getByRole("columnheader", { name: "All matches" }),
    ).toHaveCount(1);
    await expect(
      block.getByRole("rowheader", { name: "Double faults" }),
    ).toHaveCount(1);
  });

  test("trend: every point in words, the ends on the axis, and no average printed", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=trend");
    const block = visual(page);

    await expect(block.locator("figcaption")).toHaveText(
      "First serves in, 3 matches since Jun 4.",
    );
    await expect(block.locator("ol li")).toHaveText([
      "Jun 4: 61,0 %",
      "Jul 9: 63,0 %",
      "Sep 28: 37,5 %",
    ]);
    // The drawing is not what a screen reader is given.
    await expect(block.locator("svg[aria-hidden]")).toHaveCount(1);
    // One series: no point is a match, so there are no links.
    await expect(block.locator("a")).toHaveCount(0);
    // The sparkline's grammar: a dot on the last point only, until one is
    // hovered.
    await expect(block.locator("svg circle")).toHaveCount(1);
    await expect(block.locator("[data-ask-trend-last]")).toHaveText("37,5 %");
    // The key names the dashed rule; nothing prints its value (53.83…).
    await expect(block.getByText("Your average")).toBeVisible();
    await expect(block).not.toContainText("53");
    await expect(block).not.toContainText("37.5");
  });

  test("trend: the arrival wipe is the wrapper's, never the SVG's own", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=trend");
    const block = visual(page);

    const wiped = block.locator("[data-ask-wipe]");
    await expect(wiped).toHaveCount(1);
    expect(await wiped.evaluate((node) => node.tagName)).toBe("DIV");
    await expect(block.locator("svg[data-ask-wipe]")).toHaveCount(0);
    // The wrapper holds both the drawing and the last value's label, so one
    // clip covers them and its end state has to clear the label.
    await expect(wiped.locator("> svg")).toHaveCount(1);
    await expect(wiped.locator("> [data-ask-trend-last]")).toHaveCount(1);
    await expect(wiped.locator("[data-ask-after]")).toHaveCount(1);
  });

  test("trend: a point that is a match links to it, and a second series replaces the mean", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=linked-trend");
    const block = visual(page);

    const links = block.locator("a[data-ask-trend-point]");
    await expect(links).toHaveCount(3);
    await expect(links.nth(0)).toHaveAttribute(
      "href",
      "/dashboard/matches/match-jun-4",
    );
    await expect(links.nth(2)).toHaveAttribute(
      "href",
      "/dashboard/matches/match-sep-28",
    );
    // The links carry the words; there is no second list of them.
    await expect(links.nth(0)).toHaveText(
      "Jun 4: 61,0 %; All matches 58,2 %, open match",
    );
    await expect(block.locator("ol")).toHaveCount(0);
    // Each link sits on its point: the dot's own place in the box, as a
    // share of the plot's width and height (the harness loads no stylesheet,
    // so the inline position is what can be read).
    const lefts = await links.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).style.left),
    );
    // The label's gutter is a fixed `pr-12` outside the box now.
    expect(lefts).toEqual(["0.9375%", "50%", "99.0625%"]);
    const tops = await links.evaluateAll((nodes) =>
      nodes.map((node) => parseFloat((node as HTMLElement).style.top)),
    );
    // 63 is the highest value, so its point is the highest on the plot;
    // 37.5 the lowest, and 61 between them.
    expect(tops[1]).toBeLessThan(tops[0]);
    expect(tops[0]).toBeLessThan(tops[2]);
    // The key names the second series, drawn dashed; the mean rule is gone.
    await expect(block.locator("ul").first()).toContainText("All matches");
    await expect(block).not.toContainText("Your average");
    await expect(block.locator("svg line")).toHaveCount(0);
    await expect(block.locator("svg path[stroke-dasharray]")).toHaveCount(1);
    await expect(block.locator("[data-ask-trend-last]")).toHaveText("37,5 %");
  });

  test("split: each part's count as sent, and no share of the whole", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=split");
    const block = visual(page);

    await expect(block.locator("figcaption")).toHaveText(
      "The 34 points you won, by how they ended.",
    );
    await expect(block.locator("ul > li")).toHaveText([
      "Winners8 pts",
      "Forced errors11 pts",
      "Unforced errors15 pts",
    ]);
    // A percentage here would be a number the database never returned.
    await expect(block).not.toContainText("%");
    const grows = await block
      .locator("[aria-hidden].flex > span")
      .evaluateAll((parts) =>
        parts.map((part) => (part as HTMLElement).style.flexGrow),
      );
    expect(grows).toEqual(["8", "11", "15"]);
  });

  test("serve: each court's three counts as sent, with no total and no share", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=serve");
    const block = visual(page);

    await expect(block.locator("figcaption")).toHaveText(
      "39 serves on break points.",
    );
    const courts = block.locator("ul").nth(1).locator("> li");
    await expect(courts).toHaveCount(2);
    await expect(courts.nth(0)).toContainText("First serves");
    await expect(courts.nth(0)).toContainText("T 9 srv");
    await expect(courts.nth(0)).toContainText("Body 3 srv");
    await expect(courts.nth(0)).toContainText("Wide 6 srv");
    await expect(courts.nth(1)).toContainText("Second serves");
    await expect(courts.nth(1)).toContainText("Wide 12 srv");
    await expect(block).not.toContainText("%");
    // 9 + 3 + 6 and 4 + 5 + 12: totals nobody queried.
    await expect(block).not.toContainText("18");
    await expect(block).not.toContainText("21");
  });

  test("serve: Deuce and Ad courts are drawn as the court, each zone's share in its box", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=court-serve");
    const block = visual(page);

    const court = block.locator("svg[data-ask-serve-court]");
    await expect(court).toHaveCount(1);
    await expect(court).toHaveAttribute("aria-hidden", "true");
    // Six zones, each with serves, each its own column; no bar track.
    await expect(court.locator("rect[data-ask-zone]")).toHaveCount(6);
    await expect(block.locator("[data-ask-grow]")).toHaveCount(0);
    const heights = await court
      .locator("rect[data-ask-side='deuce']")
      .evaluateAll((rects) =>
        rects.map((rect) => Number(rect.getAttribute("height"))),
      );
    // 9, 3 and 6 of 18: T is half the box deep, wide a third, body a sixth.
    expect(heights[0]).toBeCloseTo(heights[2] * 1.5, 0);
    expect(heights[0]).toBeCloseTo(heights[1] * 3, 0);
    // The court names its boxes in the model's words, and the counts are
    // still under it, as sent.
    await expect(court.locator("text")).toHaveText(["Deuce", "Ad"]);
    const courts = block.locator("ul").nth(1).locator("> li");
    await expect(courts).toHaveCount(2);
    await expect(courts.nth(0)).toContainText("T 9 srv");
    await expect(courts.nth(1)).toContainText("Wide 12 srv");
    await expect(block).not.toContainText("%");
    await expect(block).not.toContainText("18");
    // Its colours are the three blue steps, never an outcome colour.
    const fills = await court
      .locator("rect[data-ask-zone]")
      .evaluateAll((rects) => rects.map((rect) => rect.getAttribute("fill")));
    expect(new Set(fills)).toEqual(
      new Set(["var(--viz-you)", "var(--viz-you-mid)", "var(--viz-you-light)"]),
    );
  });

  test("serve: any other two courts stay bars", async ({ page }) => {
    await openFixture(page, "?case=full&visual=serve");
    await expect(visual(page).locator("svg[data-ask-serve-court]")).toHaveCount(
      0,
    );
    await expect(visual(page).locator("[data-ask-grow]")).toHaveCount(6);
  });

  test("form: the strip in words, and the record counted from it", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=form");
    const block = visual(page);

    await expect(block.locator("figcaption")).toHaveText(
      "8 matches against left-handed opponents, oldest first.",
    );
    await expect(block.getByText("Last 8: W L L W L W W W")).toHaveCount(1);
    await expect(block.locator("p .sr-only")).toHaveText("Won 5, lost 3");
    await expect(block.locator("p [aria-hidden]")).toHaveText([
      "5–3",
      " · Last 8",
    ]);
    // The one block that may use the outcome colours.
    const colours = await block
      .locator("[aria-hidden] > span")
      .evaluateAll((ticks) =>
        ticks.map((tick) => (tick as HTMLElement).style.background),
      );
    expect(colours).toHaveLength(8);
    expect(colours[0]).toContain("--viz-good");
    expect(colours[1]).toContain("--viz-bad");
  });

  test("momentum: the running difference as a line, sets as segments, marks as links to the film", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=momentum");
    const block = visual(page);
    await expect(block).toHaveAttribute("data-ask-visual", "momentum");

    // One line from level through twelve points; one divider between the
    // two sets; the level rule.
    const svg = block.locator("[data-ask-wipe] > svg");
    await expect(svg).toHaveAttribute("aria-hidden", "true");
    // The line twice — blue above the level rule, slate below, each clipped
    // to its side — and its wash on either side.
    await expect(svg.locator("path[data-ask-momentum-line]")).toHaveCount(2);
    await expect(svg.locator("path")).toHaveCount(4);
    await expect(svg.locator("line")).toHaveCount(2);
    await expect(svg.locator("circle[data-ask-mark]")).toHaveCount(4);
    // The marks wear the key-moment colour and nothing else does.
    const fills = await svg
      .locator("circle[data-ask-mark]")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("fill")));
    expect(new Set(fills)).toEqual(new Set(["var(--viz-key)"]));
    const markup = await block.evaluate((node) => node.outerHTML);
    expect(markup).not.toMatch(/viz-good|viz-bad/);
    // Each mark is a link to the match's film on that pressure.
    const links = block.locator("a[data-ask-momentum-mark]");
    await expect(links).toHaveCount(4);
    const hrefs = await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href")),
    );
    for (const href of hrefs) {
      expect(href).toMatch(/^\/dashboard\/matches\/match-sep-28\?tab=film&f=/);
    }
    expect(new Set(hrefs).size).toBe(3);
    await expect(links.first()).toHaveText(
      "Break point, point 3 of 12, open the film",
    );
    // The axis names the sets; the key names the line and the marks present.
    await expect(block.getByText("Set 1")).toHaveCount(1);
    await expect(block.getByText("Set 2")).toHaveCount(1);
    const key = block.locator("ul").first();
    await expect(key.locator("li")).toHaveText([
      "Ahead",
      "Behind",
      "Break, set and match points",
    ]);
    // No figure on the plot; the words count what is drawn.
    await expect(block.locator("p.sr-only")).toHaveText(
      "12 points, 7 won and 5 lost; 1 match point, 1 set point, 2 break points.",
    );
    expect(markup).not.toMatch(/NaN|Infinity|undefined/);
  });

  test("only the form strip names an outcome colour", async ({ page }) => {
    for (const kind of [
      "bars",
      "table",
      "trend",
      "split",
      "serve",
      "momentum",
      "tree",
    ]) {
      await openFixture(page, `?case=full&visual=${kind}`);
      // A table's difference column is the design system's Delta, whose
      // arrow is the one other green/red a row may carry.
      const markup = await visual(page).evaluate((node) => {
        const copy = node.cloneNode(true) as HTMLElement;
        copy.querySelectorAll("[data-ask-delta]").forEach((n) => n.remove());
        return copy.outerHTML;
      });
      expect(markup, kind).not.toMatch(/viz-good|viz-bad|success|danger/);
    }
  });

  for (const [name, kind] of [
    ["empty-split", "split"],
    ["empty-serve", "serve"],
    ["flat-trend", "trend"],
  ] as const) {
    test(`${name}: nothing to divide still draws, with no NaN`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      await openFixture(page, `?case=full&visual=${name}`);

      const block = visual(page);
      await expect(block).toHaveAttribute("data-ask-visual", kind);
      await expect(block.locator("figcaption")).toBeVisible();
      const markup = await block.evaluate((node) => node.outerHTML);
      expect(markup).not.toMatch(/NaN|Infinity|undefined/);
      expect(errors).toEqual([]);
    });
  }
});

test.describe("the play tree", () => {
  const branches = (page: Page) =>
    visual(page).locator("[data-ask-tree-branch]");

  test("branches grouped under their first step, a share bar each, the counts as sent", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=tree");
    const block = visual(page);
    await expect(block).toHaveAttribute("data-ask-visual", "tree");
    await expect(block.locator("figcaption")).toContainText(
      "Your serve-plus-one patterns",
    );
    // Two serves, drawn once each; three plus ones under them.
    const groups = block.locator("[data-ask-tree-group]");
    await expect(groups).toHaveCount(2);
    await expect(groups.nth(0).locator("> span")).toHaveText("T serve");
    await expect(groups.nth(1).locator("> span")).toHaveText("Wide serve");
    await expect(groups.nth(0).locator("[data-ask-tree-branch]")).toHaveCount(
      2,
    );
    await expect(branches(page)).toHaveCount(3);
    await expect(branches(page).nth(0)).toContainText("Forehand crosscourt");
    await expect(branches(page).nth(0)).toContainText("Points 29");
    await expect(branches(page).nth(0)).toContainText("Won 14");
    await expect(branches(page).nth(0)).toContainText("48,3 %");
    await expect(branches(page).nth(2)).toContainText("Forehand inside out");
    // The bar is the share, as geometry; the words are the server's text.
    const widths = await block
      .locator("[data-ask-grow]")
      .evaluateAll((bars) =>
        bars.map((bar) => (bar as HTMLElement).style.width),
      );
    expect(widths).toEqual(["48.3%", "70%", "37.5%"]);
    await expect(block).not.toContainText("48.3%");
    // The columns are named once, over the figures.
    await expect(block.locator("div[aria-hidden] > span")).toHaveText([
      "",
      "",
      "Points",
      "Won",
      "Won %",
    ]);
    // Over four matches no branch has a film to open.
    await expect(block.locator("a")).toHaveCount(0);
    await expect(page.locator("[data-ask-watch]")).toHaveCount(0);
  });

  test("over one match, a branch that carries its filter opens that match's film on its points", async ({
    page,
  }) => {
    await openFixture(page, "?case=one&visual=tree");
    const links = visual(page).locator("a[data-ask-tree-watch]");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute(
      "href",
      "/dashboard/matches/match-sep-28?tab=film&f=sv.y_sz.t_cp.y_cs.f_cd.cc_cr.3",
    );
    await expect(links.nth(0)).toContainText("Forehand crosscourt · Watch");
    await expect(links.nth(1)).toHaveAttribute(
      "href",
      "/dashboard/matches/match-sep-28?tab=film&f=sv.y_sz.w_cp.y_cs.f_cd.io_cr.3",
    );
    // The branch with no filter is words alone.
    await expect(branches(page).nth(1).locator("a")).toHaveCount(0);
  });
});

test.describe("a block that opens the film", () => {
  test("bars: over one match, a row that is a measure links to its points, and a hovered bar names its series", async ({
    page,
  }) => {
    await openFixture(page, "?case=one&visual=bars");
    const block = visual(page);
    const links = block.locator("a[data-ask-bar-watch]");
    // "First serves in" and "Break points saved" are both measures the
    // Video tab can filter on.
    await expect(links).toHaveCount(2);
    const hrefs = await links.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("href")),
    );
    for (const href of hrefs) {
      expect(href).toMatch(/^\/dashboard\/matches\/match-sep-28\?tab=film&f=/);
    }
    expect(hrefs[0]).toContain("vt.1");
    expect(hrefs[1]).toContain("st.bp");
    await expect(links.nth(0)).toContainText("First serves in · Watch");

    // The readout: a label over each bar, shown by its bar's hover (the
    // harness serves no stylesheet, so the class is what can be read), with
    // the series and the figure as sent.
    const readouts = block.locator("[data-ask-readout]");
    await expect(readouts).toHaveCount(4);
    await expect(readouts.nth(1)).toHaveText("All matches: 58,2 %");
    await expect(readouts.nth(1)).toHaveClass(/group-hover\/bar:opacity-100/);
    await expect(readouts.nth(1)).toHaveAttribute("aria-hidden", "true");
    await expect(readouts.nth(1)).toHaveClass(/pointer-events-none/);
  });

  test("bars: over several matches no row links", async ({ page }) => {
    await openFixture(page, "?case=full&visual=bars");
    await expect(visual(page).locator("a")).toHaveCount(0);
  });

  test("table: a row that is one match opens its film, on the answer's points when the source has them; a measure row opens the one match's", async ({
    page,
  }) => {
    await openFixture(page, "?case=one&visual=linked-table");
    const rows = visual(page).locator("tbody tr");
    await expect(rows.nth(0).locator("a")).toHaveAttribute(
      "href",
      "/dashboard/matches/match-sep-28?tab=film",
    );
    await expect(rows.nth(0)).toContainText("Theo Lindqvist · Watch");
    const measure = await rows.nth(1).locator("a").getAttribute("href");
    expect(measure).toMatch(/^\/dashboard\/matches\/match-sep-28\?tab=film&f=/);
    expect(measure).toContain("vt.1");
    await expect(rows.nth(2).locator("a")).toHaveCount(0);

    // The pattern answer's source carries the points it counted: the match
    // row opens exactly those.
    await openFixture(page, "?case=watch&visual=linked-table");
    await expect(
      visual(page).locator("tbody tr").nth(0).locator("a"),
    ).toHaveAttribute(
      "href",
      "/dashboard/matches/match-sep-28?tab=film&f=cp.y_cd.dl",
    );
    // Over four matches the measure row has no one film.
    await expect(
      visual(page).locator("tbody tr").nth(1).locator("a"),
    ).toHaveCount(0);
  });

  test("serve court: over one match each zone opens that side's serves there; otherwise the zones only read out", async ({
    page,
  }) => {
    await openFixture(page, "?case=one&visual=court-serve");
    const block = visual(page);
    const zones = block.locator("a[data-ask-zone-watch]");
    await expect(zones).toHaveCount(6);
    const deuceT = block.locator('a[data-ask-zone-watch="deuce-t"]');
    const href = await deuceT.getAttribute("href");
    expect(href).toMatch(/^\/dashboard\/matches\/match-sep-28\?tab=film&f=/);
    expect(href).toContain("sv.y");
    expect(href).toContain("ct.d");
    expect(href).toContain("vz.t");

    await expect(deuceT.locator(".sr-only")).toHaveText(
      "Deuce, T: 9 srv, open the film",
    );
    await expect(deuceT.locator("[data-ask-readout]")).toHaveText(
      "Deuce, T: 9 srv",
    );
    // Each hit area sits over its zone's third of the service box, as
    // shares of the drawing (no stylesheet here, so the inline place is
    // what can be read): the box runs from the service line to the net.
    const place = await deuceT.evaluate((node) => {
      const { left, top, width, height } = (node as HTMLElement).style;
      return { left, top, width, height };
    });
    expect(place.top).toMatch(/^44\.3/);
    expect(place.height).toBe("50%");
    expect(place.width).toMatch(/^10\.3/);
    expect(parseFloat(place.left)).toBeGreaterThan(39);

    await openFixture(page, "?case=full&visual=court-serve");
    await expect(visual(page).locator("a")).toHaveCount(0);
    await expect(visual(page).locator("[data-ask-zone-hover]")).toHaveCount(6);
  });

  test("trend: a hovered point reads out its date and figure, outside the wipe", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=trend");
    const block = visual(page);
    await expect(block.locator("[data-ask-readout]")).toHaveCount(0);
    const targets = block.locator("[data-ask-trend-hover]");
    await expect(targets).toHaveCount(3);
    // No stylesheet in the harness, so the hit areas have no size to hover:
    // the pointer's arrival is dispatched instead.
    await targets.nth(1).dispatchEvent("mouseover");
    const readout = block.locator("[data-ask-readout]");
    await expect(readout).toHaveText("Jul 9: 63,0 %");
    // Not inside the clipped wrapper.
    await expect(
      block.locator("[data-ask-wipe] [data-ask-readout]"),
    ).toHaveCount(0);
    await targets.nth(1).dispatchEvent("mouseout");
    await expect(block.locator("[data-ask-readout]")).toHaveCount(0);
  });

  test("form: ticks that carry their matches read out in words, and open the match when they can", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=labelled-form");
    const block = visual(page);
    const ticks = block.locator("[data-ask-form-tick]");
    await expect(ticks).toHaveCount(8);
    await expect(block.locator("p .sr-only")).toHaveText("Won 5, lost 3");
    await expect(block.locator("p [aria-hidden]")).toHaveText([
      "5–3",
      " · Last 8",
    ]);
    const links = block.locator("a");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveAttribute(
      "href",
      "/dashboard/matches/match-sep-28",
    );
    await expect(links.nth(0)).toHaveText(
      "Won against Theo Lindqvist, 6-4, 6-3, Sep 28, 2026, open match",
    );
    await expect(links.nth(1)).toHaveText(
      "Won against Jonah Reyes, 7-5, 6-4, May 20, 2026, open match",
    );

    // A tick with no match is words and a readout alone.
    await expect(ticks.nth(1)).toContainText(
      "Lost to Marcus Hale, 4-6, 3-6, Sep 14, 2026",
    );
    await expect(ticks.nth(3)).toContainText("Won against Priya Nair");
    await expect(ticks.nth(5).locator(".sr-only")).toHaveText("Won");

    await expect(ticks.nth(1).locator("[data-ask-readout]")).toHaveText(
      "Lost to Marcus Hale, 4-6, 3-6, Sep 14, 2026",
    );
    // Still the outcome colours, oldest left.
    const colours = await ticks
      .locator("[aria-hidden]:not([data-ask-readout])")
      .evaluateAll((bars) =>
        bars.map((bar) => (bar as HTMLElement).style.background),
      );
    expect(colours).toHaveLength(8);
    expect(colours[0]).toContain("--viz-good");
    expect(colours[1]).toContain("--viz-bad");
  });
});

test.describe("visual first", () => {
  test("when the question asked for a chart, the block follows the claim and the prose folds behind a disclosure", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&visual=bars&lead=1");
    const claim = await page.getByText(HEADLINE).boundingBox();
    const block = await visual(page).boundingBox();
    const tiles = await page
      .getByRole("list", { name: "Figures" })
      .boundingBox();
    expect(claim!.y).toBeLessThan(block!.y);
    expect(block!.y + block!.height).toBeLessThanOrEqual(tiles!.y);

    const details = page.locator("details[data-ask-prose]");
    await expect(details).toHaveCount(1);
    await expect(details).not.toHaveAttribute("open", "");
    const summary = details.locator("summary");
    await expect(summary).toHaveText("The numbers in full");
    // Folded: the sentences are in the page, not on it.
    const prose = page.getByText("The gap is on the ad court.");
    await expect(prose).toBeHidden();
    await summary.click();
    await expect(details).toHaveAttribute("open", "");
    await expect(prose).toBeVisible();
    const open = await prose.boundingBox();
    expect(open!.y).toBeGreaterThan(tiles!.y);
    // The sources and the footer stay under everything.
    const foot = await signature(page).boundingBox();
    expect(foot!.y).toBeGreaterThan(open!.y);
  });

  test("with no block the flag changes nothing, and without the flag the prose is open", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&lead=1");
    await expect(page.locator("details")).toHaveCount(0);
    await expect(page.getByText("The gap is on the ad court.")).toBeVisible();

    await openFixture(page, "?case=full&visual=bars");
    await expect(page.locator("details")).toHaveCount(0);
    await expect(page.getByText("The gap is on the ad court.")).toBeVisible();
  });

  test("a failed answer draws no disclosure", async ({ page }) => {
    await openFixture(page, "?case=error&code=no_data&visual=bars&lead=1");
    await expect(page.locator("details")).toHaveCount(0);
    await expect(visual(page)).toHaveCount(0);
  });
});

/**
 * The team page (`?scope=team`): the answer is about a program's matches, so
 * nothing in it says "your matches", and each source says whose match it was.
 */

test.describe("on the team page", () => {
  test("sources lead with the program's player; a match with none is the opponent alone", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&scope=team");

    await expect(sourceLinks(page).nth(0)).toContainText(
      "Ana Sokolov vs Theo Lindqvist",
    );
    await expect(sourceLinks(page).nth(1)).toContainText(
      "Ana Sokolov vs Marcus Hale",
    );
    // The link is still the match's own report.
    await expect(sourceLinks(page).nth(0)).toHaveAttribute(
      "href",
      "/dashboard/matches/match-sep-28",
    );

    await allControl(page).click();
    await expect(sourceLinks(page).nth(2)).toContainText(
      "Mia Dvorsky vs Daniel Okafor",
    );
    // No player and no opponent: the row does not invent either.
    await expect(sourceLinks(page).nth(3)).toContainText("Opponent");
    await expect(sourceLinks(page).nth(3)).not.toContainText(" vs ");
  });

  test("a personal answer's sources name the opponent alone", async ({
    page,
  }) => {
    await openFixture(page, "?case=full");
    await expect(sourceLinks(page).nth(0)).toContainText("Theo Lindqvist");
    await expect(sourceLinks(page).nth(0)).not.toContainText(" vs ");
  });

  test("the status line reads the program's matches", async ({ page }) => {
    await openFixture(page, "?case=streaming&stage=querying&scope=team");
    await expect(page.getByRole("status")).toHaveText(
      "Reading the program's matches",
    );
  });

  for (const [code, title, detail] of [
    [
      "cannot_answer",
      "The program's match data can't answer that",
      "Ask covers what the program's matches recorded: results and scores, serve and return numbers, points and shots.",
    ],
    [
      "no_data",
      "No matches in that scope",
      "None of the program's matches fit the player, match, opponent or period you asked about, so there was nothing to compute.",
    ],
    // Not about anyone's matches: the same in both scopes.
    [
      "llm_unavailable",
      ERROR_COPY.llm_unavailable.title,
      ERROR_COPY.llm_unavailable.detail,
    ],
    [
      "answer_failed",
      ERROR_COPY.answer_failed.title,
      ERROR_COPY.answer_failed.detail,
    ],
  ] as const) {
    test(`${code} never says “your matches”`, async ({ page }) => {
      await openFixture(page, `?case=error&code=${code}&scope=team`);

      const alert = page.getByRole("alert");
      await expect(alert.locator("p")).toHaveText([title, detail]);
      await expect(alert).not.toContainText(/your (own )?match/i);
    });
  }

  test("the no-advice notice is about the program's matches", async ({
    page,
  }) => {
    await openFixture(page, "?case=full&advice=1&scope=team");
    await expect(signature(page)).toHaveText(
      "Advantage Intelligence · Ask reports what the program's matches show; it does not recommend what to work on.",
    );
  });

  test("the trend's key says Average, not Your average", async ({ page }) => {
    await openFixture(page, "?case=full&visual=trend&scope=team");
    await expect(visual(page)).toContainText("Average");
    await expect(visual(page)).not.toContainText("Your average");

    await openFixture(page, "?case=full&visual=trend");
    await expect(visual(page)).toContainText("Your average");
  });
});

test.describe("a clarifying question", () => {
  test("asks in the claim's place, offers its choices, and is not an alert", async ({
    page,
  }) => {
    await openFixture(page, "?case=clarify");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(
      page.getByText("Whose forehand should this count?"),
    ).toHaveCount(1);
    const choices = page.getByRole("button");
    await expect(choices).toHaveText(["Ana Sokolov", "Theo Lindqvist"]);
    await expect(
      page.getByText("Asking doesn't use a question", { exact: false }),
    ).toHaveCount(1);
    // Nothing of an answer: no figures, no sources.
    await expect(figures(page)).toHaveCount(0);
    await expect(page.getByText(/Computed from/)).toHaveCount(0);

    await choices.nth(1).click();
    expect(
      await page.evaluate(
        () => (window as unknown as { __askChosen?: string }).__askChosen,
      ),
    ).toBe("Theo Lindqvist");
  });
});

test("a pattern answer's source row opens the Video view on its points", async ({
  page,
}) => {
  await openFixture(page, "?case=watch");
  const watch = page.getByRole("link", { name: /Watch 4 points/ });
  await expect(watch).toHaveCount(1);
  await expect(watch).toHaveAttribute(
    "href",
    "/dashboard/matches/match-sep-28?tab=film&f=cp.y_cd.dl",
  );
  // A row with no link opens its match report as before.
  await expect(page.getByRole("link", { name: /Marcus Hale/ })).toHaveAttribute(
    "href",
    "/dashboard/matches/match-sep-14",
  );
});

test.describe("feedback", () => {
  const rated = (page: Page) =>
    page.evaluate(
      () => (window as unknown as { __askRated?: unknown[] }).__askRated ?? [],
    );
  const up = (page: Page) => page.getByRole("button", { name: "Good answer" });
  const down = (page: Page) => page.getByRole("button", { name: "Bad answer" });

  test("an answer with no saved id draws no thumbs", async ({ page }) => {
    await openFixture(page);
    await expect(page.locator("[data-ask-feedback]")).toHaveCount(0);
  });

  test("a thumbs up is saved at once, and pressing it again takes it back", async ({
    page,
  }) => {
    await openFixture(page, "?case=rated");
    await up(page).click();
    await expect(up(page)).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("status").last()).toHaveText(
      "Thanks — kept to help improve Ask.",
    );
    // A thumbs up asks for nothing more.
    await expect(page.locator("[data-ask-feedback-detail]")).toHaveCount(0);
    await up(page).click();
    await expect(up(page)).toHaveAttribute("aria-pressed", "false");
    expect(await rated(page)).toEqual([
      { rating: "up", reasons: [], note: null },
      null,
    ]);
  });

  test("a thumbs down is saved, then reasons and a note update it", async ({
    page,
  }) => {
    await openFixture(page, "?case=rated");
    await down(page).click();
    const detail = page.locator("[data-ask-feedback-detail]");
    await expect(detail).toHaveCount(1);
    // What happens to it is said before it is sent.
    await expect(detail).toContainText("even if you delete the conversation");
    const send = detail.getByRole("button", { name: "Send" });
    await expect(send).toBeDisabled();

    await detail.getByRole("button", { name: "Wrong numbers" }).click();
    await detail.getByRole("textbox").fill("  The serve count is off  ");
    await send.click();
    await expect(detail).toHaveCount(0);
    await expect(down(page)).toHaveAttribute("aria-pressed", "true");
    expect(await rated(page)).toEqual([
      { rating: "down", reasons: [], note: null },
      {
        rating: "down",
        reasons: ["wrong_numbers"],
        note: "The serve count is off",
      },
    ]);
  });

  test("a save that fails says so", async ({ page }) => {
    await openFixture(page, "?case=rated&rate=fail");
    await down(page).click();
    await expect(page.getByRole("status").last()).toHaveText(
      "Could not save that. Try again.",
    );
    await expect(page.locator("[data-ask-feedback-detail]")).toHaveCount(0);
  });
});
