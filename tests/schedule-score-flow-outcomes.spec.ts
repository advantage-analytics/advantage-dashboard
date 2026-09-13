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

test.describe("a tournament entry", () => {
  test("asks the round, and changing it reloads the flow at that round", async ({
    page,
  }) => {
    await openFlow(page, "?kind=tournament");
    await expect(page.getByText("Entry 1 of 2", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Round" })).toContainText(
      "R32",
    );

    await page.getByRole("button", { name: "Round" }).click();
    await page.getByRole("menuitemradio", { name: /^QF/ }).click();
    expect(await page.evaluate(() => window.routerReplaces)).toEqual([
      "/dashboard/team/schedule/event-browser/score?entry=entry-t1&round=QF",
    ]);
    expect(await page.evaluate(() => window.actionCalls)).toEqual([]);
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
    await page.getByRole("button", { name: "Save and next entry" }).click();
    await expect(
      page.getByText("Another coach saved this round. Refresh and review it."),
    ).toBeVisible();
    await expect(page.getByLabel("Alex Kim, set 1")).toHaveValue("6");

    await page.getByRole("button", { name: "Save and next entry" }).click();
    await expect
      .poll(() => page.evaluate(() => window.actionCalls.at(-1)))
      .toEqual({
        action: "recordResult",
        input: expect.objectContaining({ entryId: "entry-t2", round: "QF" }),
      });
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

  test("a line the pipeline refuses asks for the SwingVision file", async ({
    page,
  }) => {
    await openFlow(page);
    await changeLine(page, /S2Morgan Reed/);
    await expect(page.getByText("Have the SwingVision file?")).toBeVisible();
    await expect(uploadInstead(page)).toHaveAttribute(
      "href",
      "/dashboard/team/upload?entry=entry-s2",
    );
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

    // The next save replaces it: S2 stands in for a doubles line.
    await page.getByLabel("Morgan Reed / Drew Park, set 1").fill("6");
    await page.getByLabel("Taylor Park / Sam Ortiz, set 1").fill("2");
    await page.getByRole("button", { name: "Save and next line" }).click();
    await expect(page.getByText("S2 saved", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Add file", exact: true }),
    ).toHaveAttribute(
      "href",
      "/dashboard/team/upload?entry=entry-s2&match=match-browser",
    );
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
