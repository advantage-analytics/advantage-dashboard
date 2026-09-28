import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

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
  const outputPath = mkdtempSync(join(tmpdir(), "schedule-score-outcomes-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve(
          "tests/fixtures/schedule-score-flow-outcomes-harness.tsx",
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
            // The lineup's pickers, which name a blank opponent in the
            // score row, reach the roster actions through the name picker.
            "@/components/dashboard/team/roster-actions": resolve(
              "tests/fixtures/roster-actions-browser-mock.ts",
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

async function openFlow(page: import("@playwright/test").Page, url = "") {
  await page.goto(`${origin}/${url}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

async function changeLine(
  page: import("@playwright/test").Page,
  label: RegExp,
) {
  await page.getByRole("button", { name: "Change" }).click();
  await page.getByRole("button", { name: label }).click();
}

type Page = import("@playwright/test").Page;

async function stopped(page: Page, how: "Retired" | "Defaulted", who: string) {
  await page.getByRole("button", { name: how, exact: true }).click();
  await page.getByRole("radio", { name: who, exact: true }).click();
}

test("a line opens on the score, with no result menu and no forfeit", async ({
  page,
}) => {
  await openFlow(page);
  await expect(page.getByLabel("Jordan Lee, set 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Result type" })).toHaveCount(
    0,
  );
  await expect(page.getByText("Didn't finish?")).toBeVisible();
  await expect(page.getByText(/forfeit/i)).toHaveCount(0);
});

test("a played score saves as a match played out", async ({ page }) => {
  await openFlow(page);
  await page.getByLabel("Jordan Lee, set 1").fill("6");
  await page.getByLabel("Casey Chen, set 1").fill("4");
  await page.getByRole("button", { name: "Save and next line" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls))
    .toEqual([
      {
        action: "recordResult",
        input: expect.objectContaining({
          entryId: "entry-s1",
          ourGames: [6],
          theirGames: [4],
          ending: null,
        }),
      },
    ]);
  await expect(page.getByText("Line 2 of 3", { exact: true })).toBeVisible();
});

test("the score advances like the upload wizard, tiebreak included", async ({
  page,
}) => {
  await openFlow(page);
  await page.getByLabel("Jordan Lee, set 1").focus();
  await page.keyboard.type("7");
  await expect(page.getByLabel("Casey Chen, set 1")).toBeFocused();
  // 7-6 opens the tiebreak cells, and focus lands in ours.
  await page.keyboard.type("6");
  await expect(page.getByLabel("Jordan Lee, set 1 tiebreak")).toBeFocused();
  // Tiebreak cells are left on Enter, never on a digit.
  await page.keyboard.type("5");
  await expect(page.getByLabel("Jordan Lee, set 1 tiebreak")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Casey Chen, set 1 tiebreak")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Jordan Lee, set 2")).toBeFocused();
});

test("Retired keeps the score and asks who, in place of the line", async ({
  page,
}) => {
  await openFlow(page);
  await page.getByLabel("Jordan Lee, set 1").fill("3");
  await page.getByLabel("Casey Chen, set 1").fill("6");
  await page.getByLabel("Jordan Lee, set 2").fill("2");
  await page.getByLabel("Casey Chen, set 2").fill("1");

  await page.getByRole("button", { name: "Retired", exact: true }).click();
  await expect(page.getByText("Didn't finish?")).toHaveCount(0);
  await expect(page.getByText("Who retired?")).toBeVisible();

  // Who first is refused, and the digits stay.
  await page.getByRole("button", { name: "Save and next line" }).click();
  await expect(page.getByText("Choose who retired.")).toBeVisible();
  await expect(page.getByLabel("Jordan Lee, set 2")).toHaveValue("2");

  await page.getByRole("radio", { name: "Casey Chen", exact: true }).click();
  await expect(page.getByText("Jordan Lee wins the line")).toBeVisible();
  await page.getByRole("button", { name: "Save and next line" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
    .toEqual({
      action: "recordResult",
      input: expect.objectContaining({
        ourGames: [3, 2],
        theirGames: [6, 1],
        ending: { kind: "retired", side: "theirs" },
      }),
    });
});

test("a changed mind: Retired to Defaulted keeps who, and It finished goes back", async ({
  page,
}) => {
  await openFlow(page);
  await stopped(page, "Retired", "Jordan Lee");
  await page.getByText("Didn’t retire?").waitFor();
  await page.getByRole("button", { name: "Defaulted", exact: true }).click();
  await expect(page.getByText("Who defaulted?")).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Jordan Lee", exact: true }),
  ).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "It finished" }).click();
  await expect(page.getByText("Didn't finish?")).toBeVisible();
});

test("Defaulted with no score saves the default outcome and advances", async ({
  page,
}) => {
  await openFlow(page);
  await stopped(page, "Defaulted", "Casey Chen");
  await page.getByRole("button", { name: "Save and next line" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls))
    .toEqual([
      {
        action: "setOutcome",
        input: {
          entryId: "entry-s1",
          round: null,
          outcome: { kind: "default", side: "theirs" },
        },
      },
    ]);
  await expect(page.getByText("Line 2 of 3", { exact: true })).toBeVisible();
});

test("a saved default reopens as Defaulted, and a score replaces it", async ({
  page,
}) => {
  await openFlow(page, "?saved=true");
  await expect(page.getByText("Who defaulted?")).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Robin Shah", exact: true }),
  ).toHaveAttribute("aria-checked", "true");

  await page.getByLabel("Alex Kim, set 1").fill("6");
  await page.getByLabel("Robin Shah, set 1").fill("4");
  await page.getByRole("button", { name: "It finished" }).click();
  await page.getByRole("button", { name: "Save and next line" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls.map((c) => c.action)))
    .toEqual(["setOutcome", "recordResult"]);
  expect(await page.evaluate(() => window.actionCalls[0].input)).toEqual({
    entryId: "entry-s3",
    round: null,
    outcome: null,
  });
});

test("Remove this result takes a saved default off entirely", async ({
  page,
}) => {
  await openFlow(page, "?saved=true");
  await page.getByRole("button", { name: "Remove this result" }).click();
  await expect
    .poll(() => page.evaluate(() => window.actionCalls))
    .toEqual([
      {
        action: "setOutcome",
        input: { entryId: "entry-s3", round: null, outcome: null },
      },
    ]);
  await expect(page.getByText("Didn't finish?")).toBeVisible();
  await expect(page.getByText("3 lines still need a result")).toBeVisible();
});

test("a refused save keeps the answer and says why", async ({ page }) => {
  await openFlow(page);
  await stopped(page, "Defaulted", "Jordan Lee");
  await page.evaluate(() => {
    window.failNextOutcome = "Only a program's staff can change its schedule.";
  });
  await page.getByRole("button", { name: "Save and next line" }).click();
  await expect(
    page.getByText("Only a program's staff can change its schedule."),
  ).toBeVisible();
  await expect(page.getByText("Line 1 of 3", { exact: true })).toBeVisible();
  await expect(page.getByText("Who defaulted?")).toBeVisible();
});

test("changing lines reseeds the score and how it ended from that line", async ({
  page,
}) => {
  await openFlow(page);
  await page.getByLabel("Jordan Lee, set 1").fill("6");
  await stopped(page, "Retired", "Casey Chen");

  await changeLine(page, /S2Morgan Reed/);
  await expect(page.getByText("Line 2 of 3", { exact: true })).toBeVisible();
  await expect(page.getByText("Didn't finish?")).toBeVisible();
  await expect(page.getByLabel("Morgan Reed / Drew Park, set 1")).toHaveValue(
    "",
  );

  await changeLine(page, /S3Alex Kim/);
  await expect(page.getByText("Who defaulted?")).toBeVisible();
});

test.describe("an opponent the lineup left blank", () => {
  test("a singles line names them in the score row, from their saved roster", async ({
    page,
  }) => {
    await openFlow(page, "?unnamed=true");
    await page.getByRole("button", { name: "Name their player" }).click();
    await page.getByRole("option", { name: /Casey Chen/ }).click();
    await expect(page.getByLabel("Casey Chen, set 1")).toBeVisible();

    await page.getByLabel("Jordan Lee, set 1").fill("6");
    await page.getByLabel("Casey Chen, set 1").fill("2");
    await page.getByRole("button", { name: "Save and next line" }).click();
    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({ opponentLabels: ["Casey Chen"] }),
      });
  });

  test("a doubles line picks their pair like the lineup, and needs both", async ({
    page,
  }) => {
    await openFlow(page, "?unnamed=true");
    await changeLine(page, /S2Morgan Reed/);
    await page.getByRole("button", { name: "Their pair at S2" }).click();
    // Already on another doubles line: shown, and not pickable.
    await expect(
      page.getByRole("menuitemcheckbox", { name: /Sam Ortiz/ }),
    ).toHaveAttribute("aria-disabled", "true");
    await expect(
      page.getByRole("menuitemradio", { name: /No pair/ }),
    ).toHaveCount(0);
    await page.getByRole("menuitemcheckbox", { name: /Taylor Park/ }).click();

    await page.getByLabel("Morgan Reed / Drew Park, set 1").fill("6");
    await page.getByLabel("Taylor Park, set 1").fill("3");
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Save and next line" }).click();
    await expect(
      page.getByText("Choose both players in their pair."),
    ).toBeVisible();
  });
});

test("a dual line's lineup-named opponent stays read-only, and its forfeit routes to Edit dual", async ({
  page,
}) => {
  await openFlow(page);
  // Named by the lineup: plain text in the score row, no picker to change it.
  await expect(page.getByLabel("Casey Chen, set 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Casey Chen" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Name their player" }),
  ).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);

  await openFlow(page, "?forfeit=true");
  await changeLine(page, /S2Morgan Reed/);
  await expect(page.getByRole("link", { name: "Edit dual" })).toHaveAttribute(
    "href",
    "/dashboard/team/schedule/event-browser/edit",
  );
});

test.describe("a tournament entry", () => {
  test("asks the round, and changing it keeps what was typed without navigating", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament");
    await expect(page.getByText("Entry 1 of 2", { exact: true })).toBeVisible();
    const round = page.getByRole("button", { name: "Round", exact: true });
    await expect(round).toContainText("R32");

    await page.getByLabel("Jordan Lee, set 1").fill("6");
    await page.getByLabel("Opponent, set 1").fill("4");
    await stopped(page, "Retired", "Jordan Lee");

    await round.click();
    await page.getByRole("menuitemradio", { name: /^R16/ }).click();

    await expect(round).toContainText("R16");
    await expect(page.getByLabel("Jordan Lee, set 1")).toHaveValue("6");
    await expect(page.getByLabel("Opponent, set 1")).toHaveValue("4");
    await expect(page.getByText("Who retired?")).toBeVisible();
    await expect(
      page.getByRole("radio", { name: "Jordan Lee", exact: true }),
    ).toBeChecked();
    // No navigation: the router is never asked, the URL follows in place.
    expect(await page.evaluate(() => window.routerReplaces ?? [])).toEqual([]);
    const query = new URLSearchParams(
      await page.evaluate(() => window.location.search),
    );
    expect(query.get("entry")).toBe("entry-t1");
    expect(query.get("round")).toBe("R16");
    expect(await page.evaluate(() => window.actionCalls)).toEqual([]);
  });

  /**
   * T10: the ladder runs to two dozen codes across five draws, so the menu
   * writes each draw over its own rounds — in `ROUND_ORDER`, which is the
   * order the draws are played. Read off the DOM in document order, so a
   * heading that drifted away from its rounds fails here.
   */
  test("lists every round under its draw heading, in ladder order", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament");
    await page.getByRole("button", { name: "Round", exact: true }).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();

    const groups = await menu.evaluate((root) => {
      const out: { draw: string; rounds: string[] }[] = [];
      for (const el of root.querySelectorAll("p, [role=menuitemradio]")) {
        if (el.tagName === "P") {
          out.push({ draw: el.textContent ?? "", rounds: [] });
        } else {
          out
            .at(-1)
            ?.rounds.push(el.querySelector("span span")?.textContent ?? "");
        }
      }
      return out;
    });

    expect(groups).toEqual([
      { draw: "Prequalifying", rounds: ["PQ1", "PQ2", "PQ3", "PQ4"] },
      { draw: "PQ Consolation", rounds: ["PC1", "PC2", "PC3", "PC4"] },
      { draw: "Qualifying", rounds: ["Q1", "Q2", "Q3"] },
      {
        draw: "Main draw",
        rounds: ["R256", "R128", "R64", "R32", "R16", "QF", "SF", "F"],
      },
      { draw: "Consolation", rounds: ["C1", "C2", "C3", "C4", "C5"] },
    ]);

    // A grouped round still picks like any other row.
    await page.getByRole("menuitemradio", { name: /^PC1/ }).click();
    await expect(
      page.getByRole("button", { name: "Round", exact: true }),
    ).toContainText("PC1");
  });

  test("an untouched form reseeds from a recorded round and says it replaces it", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament&recorded=true");
    const round = page.getByRole("button", { name: "Round", exact: true });
    await expect(round).toContainText("R16");
    await expect(page.getByLabel("Jordan Lee, set 1")).toHaveValue("");
    await expect(
      page.getByText("Replaces the R32 result already recorded."),
    ).toHaveCount(0);

    await round.click();
    await page.getByRole("menuitemradio", { name: /^R32/ }).click();

    await expect(round).toContainText("R32");
    await expect(page.getByLabel("Jordan Lee, set 1")).toHaveValue("6");
    await expect(page.getByLabel("Casey Chen, set 1")).toHaveValue("3");
    await expect(
      page.getByLabel("Jordan Lee, set 2", { exact: true }),
    ).toHaveValue("7");
    await expect(
      page.getByLabel("Casey Chen, set 2", { exact: true }),
    ).toHaveValue("6");
    await expect(page.getByLabel("Casey Chen, set 2 tiebreak")).toHaveValue(
      "4",
    );
    await expect(
      page.getByText("Replaces the R32 result already recorded."),
    ).toBeVisible();
    expect(
      new URLSearchParams(
        await page.evaluate(() => window.location.search),
      ).get("round"),
    ).toBe("R32");
  });

  test("a typed-into form keeps its digits on a recorded round, and saves under the round shown", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament&recorded=true");
    const round = page.getByRole("button", { name: "Round", exact: true });
    // R16 holds no match, so it names nobody — the typed opponent row is
    // still "Opponent", and it is kept along with the digits.
    await page.getByLabel("Jordan Lee, set 1").fill("6");
    await page.getByLabel("Opponent, set 1").fill("2");

    await round.click();
    await page.getByRole("menuitemradio", { name: /^R32/ }).click();

    await expect(round).toContainText("R32");
    await expect(page.getByLabel("Jordan Lee, set 1")).toHaveValue("6");
    await expect(page.getByLabel("Opponent, set 1")).toHaveValue("2");
    await expect(
      page.getByText("Replaces the R32 result already recorded."),
    ).toBeVisible();

    // The kept form names nobody; the row is the picker, so name them here.
    await page.getByRole("button", { name: "Name their player" }).click();
    await page.getByRole("option", { name: /Casey Chen/ }).click();
    await expect(page.getByLabel("Casey Chen, set 1")).toHaveValue("2");

    await page.getByRole("button", { name: "Save and close" }).click();
    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({
          entryId: "entry-t1",
          round: "R32",
          opponentLabels: ["Casey Chen"],
          ourGames: [6],
          theirGames: [2],
        }),
      });
    expect(
      new URLSearchParams(
        await page.evaluate(() => window.location.search),
      ).get("round"),
    ).toBe("R32");
  });

  test("a round with no match of its own opens with no opponent, not the last one filed", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament&recorded=true");
    const round = page.getByRole("button", { name: "Round", exact: true });
    await expect(round).toContainText("R16");
    await expect(
      page.getByRole("button", { name: "Name their player" }),
    ).toBeVisible();
    await expect(page.getByLabel("Opponent, set 1")).toBeVisible();

    // Over to the recorded R32 and back: R32 opens on Casey Chen, R16 on
    // nobody again — the name never follows the round change.
    await round.click();
    await page.getByRole("menuitemradio", { name: /^R32/ }).click();
    await expect(
      page.getByRole("button", { name: "Casey Chen" }),
    ).toBeVisible();
    await round.click();
    await page.getByRole("menuitemradio", { name: /^R16/ }).click();
    await expect(
      page.getByRole("button", { name: "Name their player" }),
    ).toBeVisible();
    await expect(page.getByLabel("Casey Chen, set 1")).toHaveCount(0);
  });

  test("a recorded round's opponent opens in the picker and can be changed", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament&recorded=true");
    const round = page.getByRole("button", { name: "Round", exact: true });
    await round.click();
    await page.getByRole("menuitemradio", { name: /^R32/ }).click();

    // The recorded name sits in the picker itself, not a static label.
    const opponent = page.getByRole("button", { name: "Casey Chen" });
    await expect(opponent).toBeVisible();
    await opponent.click();
    // Scoped: the School field above the score is a combobox too.
    const field = page
      .getByRole("dialog", { name: "Add opposing name" })
      .getByRole("combobox");
    await expect(field).toHaveValue("Casey Chen");
    await field.fill("Taylor");
    await page.getByRole("option", { name: /Taylor Park/ }).click();

    await expect(
      page.getByRole("button", { name: "Taylor Park" }),
    ).toBeVisible();
    // The score stays as recorded; only the name moved.
    await expect(page.getByLabel("Taylor Park, set 1")).toHaveValue("3");

    await page.getByRole("button", { name: "Save and close" }).click();
    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({
          entryId: "entry-t1",
          round: "R32",
          opponentLabels: ["Taylor Park"],
          ourGames: [6, 7],
          theirGames: [3, 6],
        }),
      });
  });

  test("a legacy withdrawal reopens as Retired and a score replaces it", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament&saved=true");
    await expect(
      page.getByText("Replaces the QF result already recorded."),
    ).toBeVisible();
    await expect(page.getByText("Who retired?")).toBeVisible();

    await page.getByLabel("Alex Kim, set 1").fill("6");
    await page.getByLabel("Robin Shah, set 1").fill("4");
    await page.getByRole("button", { name: "It finished" }).click();
    await page.evaluate(() => {
      window.failNextScore =
        "Another coach saved this round. Refresh and review it.";
    });
    // 6-4, played out: a won QF, so (T9) the primary walks up the draw.
    await page.getByRole("button", { name: "Save and next round" }).click();
    await expect(
      page.getByText("Another coach saved this round. Refresh and review it."),
    ).toBeVisible();
    await expect(page.getByLabel("Alex Kim, set 1")).toHaveValue("6");

    await page.getByRole("button", { name: "Save and next round" }).click();
    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({ entryId: "entry-t2", round: "QF" }),
      });
    await expect(
      page.getByRole("button", { name: "Round", exact: true }),
    ).toContainText("SF");
  });

  test("a won round offers that entry's next round, and opens it blank after the save", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament&recorded=true");
    const round = page.getByRole("button", { name: "Round", exact: true });
    await expect(round).toContainText("R16");
    // Nothing typed yet: no win to follow, so the footer is as it was.
    await expect(
      page.getByRole("button", { name: "Save and next round" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Name their player" }).click();
    await page.getByRole("option", { name: /Taylor Park/ }).click();
    await page.getByLabel("Jordan Lee, set 1").fill("6");
    await page.getByLabel("Taylor Park, set 1").fill("3");
    await page.getByLabel("Jordan Lee, set 2").fill("6");
    await page.getByLabel("Taylor Park, set 2").fill("4");

    const primary = page.getByRole("button", { name: "Save and next round" });
    await expect(primary).toBeVisible();
    // The ghost stays beside it: closing is still a different choice.
    await expect(
      page.getByRole("button", { name: "Save and close" }),
    ).toBeVisible();
    await primary.click();

    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({
          entryId: "entry-t1",
          round: "R16",
          opponentLabels: ["Taylor Park"],
          ourGames: [6, 6],
          theirGames: [3, 4],
        }),
      });

    // Same entry, the next round of its draw, blank — score and opponent.
    await expect(round).toContainText("QF");
    await expect(page.getByText("Entry 1 of 2", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Jordan Lee, set 1")).toHaveValue("");
    await expect(page.getByLabel("Opponent, set 1")).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Name their player" }),
    ).toBeVisible();
    await expect(page.getByText("R16 saved", { exact: true })).toBeVisible();
    // A new round is a new opponent: the School starts blank again.
    await expect(schoolField(page)).toHaveValue("");
    expect(await page.evaluate(() => window.routerPushes)).toEqual([]);
    expect(
      new URLSearchParams(
        await page.evaluate(() => window.location.search),
      ).get("round"),
    ).toBe("QF");

    // The round just filed now counts as recorded.
    await round.click();
    await page.getByRole("menuitemradio", { name: /^R16/ }).click();
    await expect(
      page.getByText("Replaces the R16 result already recorded."),
    ).toBeVisible();
  });

  test("a lost round offers its consolation, and the primary opens it blank on the same entry", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament&recorded=true");
    const round = page.getByRole("button", { name: "Round", exact: true });
    await expect(round).toContainText("R16");
    await page.getByRole("button", { name: "Name their player" }).click();
    await page.getByRole("option", { name: /Taylor Park/ }).click();
    await page.getByLabel("Jordan Lee, set 1").fill("3");
    await page.getByLabel("Taylor Park, set 1").fill("6");
    await page.getByLabel("Jordan Lee, set 2").fill("4");
    await page.getByLabel("Taylor Park, set 2").fill("6");

    const primary = page.getByRole("button", {
      name: "Save and start consolation",
      exact: true,
    });
    await expect(primary).toBeVisible();
    // The declined answer is a text action in the ghost's slot — not a
    // second button, and not a "Save and close" beside it.
    await expect(
      page.getByRole("button", { name: "Save — they're out", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Save and close" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save and next round" }),
    ).toHaveCount(0);
    await primary.click();

    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({
          entryId: "entry-t1",
          round: "R16",
          opponentLabels: ["Taylor Park"],
          ourGames: [3, 4],
          theirGames: [6, 6],
        }),
      });

    // Same entry, the consolation's first round, blank — score and opponent.
    await expect(round).toContainText("C1");
    await expect(page.getByText("Entry 1 of 2", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Jordan Lee, set 1")).toHaveValue("");
    await expect(page.getByLabel("Opponent, set 1")).toHaveValue("");
    await expect(
      page.getByRole("button", { name: "Name their player" }),
    ).toBeVisible();
    await expect(page.getByText("R16 saved", { exact: true })).toBeVisible();
    // A new round is a new opponent: the School starts blank again.
    await expect(schoolField(page)).toHaveValue("");
    expect(await page.evaluate(() => window.routerPushes)).toEqual([]);
    expect(
      new URLSearchParams(
        await page.evaluate(() => window.location.search),
      ).get("round"),
    ).toBe("C1");
  });

  test('"Save — they\'re out" saves the lost round and walks on to the next open entry', async ({
    page,
  }) => {
    // Entry #2 at QF; entry #1 is still open, so a walk-on lands there.
    await openFlow(page, "?kind=tournament&saved=true");
    await page.getByLabel("Alex Kim, set 1").fill("3");
    await page.getByLabel("Robin Shah, set 1").fill("6");
    await page.getByLabel("Alex Kim, set 2").fill("2");
    await page.getByLabel("Robin Shah, set 2").fill("6");
    await page.getByRole("button", { name: "It finished" }).click();

    await expect(
      page.getByRole("button", {
        name: "Save and start consolation",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Save — they're out", exact: true })
      .click();

    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({
          entryId: "entry-t2",
          round: "QF",
          ourGames: [3, 2],
          theirGames: [6, 6],
        }),
      });
    await expect(page.getByText("Entry 1 of 2", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Round", exact: true }),
    ).toContainText("R32");
    expect(await page.evaluate(() => window.routerPushes)).toEqual([]);
  });

  test('a lost final has no consolation: the single "Save and next entry" stays', async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament&saved=true");
    const round = page.getByRole("button", { name: "Round", exact: true });
    await round.click();
    await page.getByRole("menuitemradio", { name: /^F/ }).click();
    await expect(round).toContainText("F");

    // F holds no match, so it opens naming nobody; name them to save.
    await page.getByRole("button", { name: "Name their player" }).click();
    await page.getByRole("option", { name: /Taylor Park/ }).click();
    await page.getByLabel("Alex Kim, set 1").fill("3");
    await page.getByLabel("Taylor Park, set 1").fill("6");
    await page.getByLabel("Alex Kim, set 2").fill("2");
    await page.getByLabel("Taylor Park, set 2").fill("6");

    await expect(
      page.getByRole("button", { name: "Save and start consolation" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save — they're out" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Save and next entry" }).click();

    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({
          entryId: "entry-t2",
          round: "F",
          opponentLabels: ["Taylor Park"],
          ourGames: [3, 2],
          theirGames: [6, 6],
        }),
      });
    await expect(page.getByText("Entry 1 of 2", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.routerPushes)).toEqual([]);
  });
});

/**
 * The directory, as `/api/programs/search` answers it: one row for "ridge",
 * nothing for anything else — the club side typed in the tests below.
 */
const RIDGELINE = {
  programKey: "ridgeline",
  schoolName: "Ridgeline University",
  team: "mens",
  division: "D1",
  conference: "Big Sky",
  state: "MT",
  status: "unclaimed",
  ownerDisplay: null,
};

async function serveDirectory(page: Page) {
  await page.route("**/api/programs/search**", async (route) => {
    const term = new URL(route.request().url()).searchParams.get("q") ?? "";
    await route.fulfill({
      json: {
        results: /ridge/i.test(term) ? [RIDGELINE] : [],
      },
    });
  });
}

const schoolField = (page: Page) =>
  page.getByRole("combobox", { name: "Their school" });

test.describe("the opponent's school on a tournament round", () => {
  test("a tournament asks the school above the opponent; a dual line does not", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament");
    // Seeded from the entry — "the last round filed" — with its roster behind it.
    await expect(schoolField(page)).toHaveValue("Rival State");
    await expect(
      page.getByText("On the directory · their saved roster is offered below."),
    ).toBeVisible();
    // Reading order: School, then the opponent's name in the score row.
    const school = await schoolField(page).boundingBox();
    const opponent = await page
      .getByRole("button", { name: "Name their player" })
      .boundingBox();
    expect(school!.y).toBeLessThan(opponent!.y);
    expect(await page.evaluate(() => window.rosterCalls)).toEqual([
      "rival-state",
    ]);

    // A dual names its school on the event, so its lines never ask.
    await openFlow(page, "?unnamed=true");
    await expect(schoolField(page)).toHaveCount(0);
    await expect(page.getByText("School", { exact: true })).toHaveCount(0);
  });

  test("a directory school re-points the picker at that school's roster, and saves with its key", async ({
    page,
  }) => {
    await serveDirectory(page);
    await openFlow(page, "?kind=tournament");
    const field = schoolField(page);
    await field.fill("Ridge");
    const option = page.getByRole("option", { name: /Ridgeline University/ });
    await expect(option).toContainText("D-I · Big Sky");
    // The typed text is always the last row, beside the directory's.
    await expect(
      page.getByRole("option", { name: /Use "Ridge" as typed/ }),
    ).toBeVisible();
    await option.click();

    await expect(field).toHaveValue("Ridgeline University");
    await expect
      .poll(() => page.evaluate(() => window.rosterCalls))
      .toEqual(["rival-state", "ridgeline"]);

    // Their roster now, not Rival State's.
    await page.getByRole("button", { name: "Name their player" }).click();
    await expect(page.getByRole("option", { name: /Lee Park/ })).toBeVisible();
    await expect(page.getByRole("option", { name: /Casey Chen/ })).toHaveCount(
      0,
    );
    await page.getByRole("option", { name: /Lee Park/ }).click();

    await page.getByLabel("Jordan Lee, set 1").fill("6");
    await page.getByLabel("Lee Park, set 1").fill("1");
    await page.getByRole("button", { name: "Save and close" }).click();
    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({
          entryId: "entry-t1",
          round: "R32",
          opponentLabels: ["Lee Park"],
          opponentSchool: "Ridgeline University",
          opponentProgramKey: "ridgeline",
        }),
      });
  });

  test("a typed school has no roster: the opponent is plain text, and the save carries no key", async ({
    page,
  }) => {
    await serveDirectory(page);
    await openFlow(page, "?kind=tournament&noschool=true");
    const field = schoolField(page);
    await expect(field).toHaveValue("");
    await expect(
      page.getByText("Decides whose roster their player is picked from."),
    ).toBeVisible();
    // No school, no fetch.
    expect(await page.evaluate(() => window.rosterCalls)).toEqual([]);

    await field.fill("Valley Club");
    await expect(
      page.getByRole("option", { name: /Use "Valley Club" as typed/ }),
    ).toBeVisible();
    await field.press("Enter");
    await expect(field).toHaveValue("Valley Club");
    await expect(
      page.getByText("Typed · no saved roster, so their player is typed too."),
    ).toBeVisible();
    expect(await page.evaluate(() => window.rosterCalls)).toEqual([]);

    // The picker with nothing to pick from: a field, and Enter commits it.
    await page.getByRole("button", { name: "Name their player" }).click();
    const name = page
      .getByRole("dialog", { name: "Add opposing name" })
      .getByRole("combobox");
    await expect(page.getByRole("option")).toHaveCount(0);
    await name.fill("Pat Doe");
    await name.press("Enter");
    await expect(page.getByRole("button", { name: "Pat Doe" })).toBeVisible();

    await page.getByLabel("Jordan Lee, set 1").fill("6");
    await page.getByLabel("Pat Doe, set 1").fill("4");
    await page.getByRole("button", { name: "Save and close" }).click();
    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({
          opponentLabels: ["Pat Doe"],
          opponentSchool: "Valley Club",
          opponentProgramKey: null,
        }),
      });
    expect(await page.evaluate(() => window.savedPlayers)).toEqual([]);
  });

  test("a new two-token name against a directory school is offered to that school's roster", async ({
    page,
  }) => {
    await serveDirectory(page);
    await openFlow(page, "?kind=tournament");
    await schoolField(page).fill("Ridge");
    await page.getByRole("option", { name: /Ridgeline University/ }).click();

    await page.getByRole("button", { name: "Name their player" }).click();
    const name = page
      .getByRole("dialog", { name: "Add opposing name" })
      .getByRole("combobox");
    await name.fill("Avery Stone");
    await page
      .getByRole("option", { name: /Avery Stone.*Save as a different player/ })
      .click();
    await expect(
      page.getByRole("button", { name: "Avery Stone" }),
    ).toBeVisible();
    // To Ridgeline's key — the school chosen above, never the entry's old one.
    await expect
      .poll(() => page.evaluate(() => window.savedPlayers))
      .toEqual([{ opponentProgramKey: "ridgeline", name: "Avery Stone" }]);
  });
});

test.describe("the links into the upload wizard", () => {
  const uploadInstead = (page: import("@playwright/test").Page) =>
    page.getByRole("link", { name: "Upload it instead" });

  test("a line with no result offers its video, until a digit is typed", async ({
    page,
  }) => {
    await openFlow(page);
    await expect(page.getByText("Have the match video?")).toBeVisible();
    await expect(uploadInstead(page)).toHaveAttribute(
      "href",
      "/dashboard/team/upload?entry=entry-s1",
    );

    // The digits would not travel to the wizard, so the offer goes rather
    // than drop them.
    await page.getByLabel("Jordan Lee, set 1").fill("6");
    await expect(uploadInstead(page)).toHaveCount(0);
    await page.getByLabel("Jordan Lee, set 1").fill("");
    await expect(uploadInstead(page)).toBeVisible();

    // Not once it stopped: that line is about how it ended.
    await page.getByRole("button", { name: "Retired", exact: true }).click();
    await expect(uploadInstead(page)).toHaveCount(0);
  });

  test("a doubles line offers no upload", async ({ page }) => {
    await openFlow(page);
    await changeLine(page, /S2Morgan Reed/);
    await expect(
      page.getByLabel("Morgan Reed / Drew Park, set 1"),
    ).toBeVisible();
    await expect(uploadInstead(page)).toHaveCount(0);
    await expect(page.getByText(/^Have the .* (file|video)\?$/)).toHaveCount(0);
  });

  test("not offered on a saved outcome, a tournament, or to a viewer who cannot upload", async ({
    page,
  }) => {
    await openFlow(page, "?saved=true");
    await expect(page.getByLabel("Alex Kim, set 1")).toBeVisible();
    await expect(uploadInstead(page)).toHaveCount(0);

    await openFlow(page, "?kind=tournament");
    await expect(page.getByLabel("Jordan Lee, set 1")).toBeVisible();
    await expect(uploadInstead(page)).toHaveCount(0);

    await openFlow(page, "?upload=false");
    await expect(page.getByLabel("Jordan Lee, set 1")).toBeVisible();
    await expect(uploadInstead(page)).toHaveCount(0);
  });

  test("saving a played score and moving on offers that line's video in the footer", async ({
    page,
  }) => {
    await openFlow(page, "?open3=true");
    await page.getByLabel("Jordan Lee, set 1").fill("6");
    await page.getByLabel("Casey Chen, set 1").fill("4");
    await page.getByRole("button", { name: "Save and next line" }).click();

    await expect(page.getByText("Line 2 of 3", { exact: true })).toBeVisible();
    await expect(page.getByText("S1 saved", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add video", exact: true }),
    ).toHaveAttribute(
      "href",
      "/dashboard/team/upload?entry=entry-s1&match=match-browser",
    );

    // The next save clears it: S2 stands in for a doubles line, which is
    // score-only and offers nothing to upload.
    await page.getByLabel("Morgan Reed / Drew Park, set 1").fill("6");
    await page.getByLabel("Taylor Park / Sam Ortiz, set 1").fill("2");
    await page.getByRole("button", { name: "Save and next line" }).click();
    await expect(page.getByText("Line 3 of 3", { exact: true })).toBeVisible();
    await expect(page.getByText("S1 saved", { exact: true })).toHaveCount(0);
    await expect(page.getByText("S2 saved", { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Add file", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Add video", exact: true }),
    ).toHaveCount(0);
  });

  test("an outcome saved next clears the offer, and a viewer who cannot upload never gets one", async ({
    page,
  }) => {
    await openFlow(page, "?open3=true");
    await page.getByLabel("Jordan Lee, set 1").fill("6");
    await page.getByLabel("Casey Chen, set 1").fill("4");
    await page.getByRole("button", { name: "Save and next line" }).click();
    await expect(page.getByText("S1 saved", { exact: true })).toBeVisible();

    await stopped(page, "Defaulted", "Taylor Park / Sam Ortiz");
    await page.getByRole("button", { name: "Save and next line" }).click();
    await expect(page.getByText("Line 3 of 3", { exact: true })).toBeVisible();
    await expect(page.getByText("S1 saved", { exact: true })).toHaveCount(0);

    await openFlow(page, "?upload=false");
    await page.getByLabel("Jordan Lee, set 1").fill("6");
    await page.getByLabel("Casey Chen, set 1").fill("4");
    await page.getByRole("button", { name: "Save and next line" }).click();
    await expect(page.getByText("Line 2 of 3", { exact: true })).toBeVisible();
    await expect(page.getByText("S1 saved", { exact: true })).toHaveCount(0);
  });
});
