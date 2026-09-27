import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import {
  buildDualPayloadLines,
  filledDualLines,
  seedDualLines,
} from "@/components/dashboard/schedule/static/dual-build-step";
import {
  ADD_NAME_REQUIRED,
  ADD_ROW_LABEL,
} from "@/components/dashboard/schedule/static/lineup-name-picker";
import type { LadderPlayer } from "@/lib/data/roster-server";

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
  const outputPath = mkdtempSync(join(tmpdir(), "schedule-doubles-picker-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/schedule-doubles-picker-harness.tsx"),
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
              "tests/fixtures/schedule-doubles-actions-browser-mock.ts",
            ),
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

async function openFixture(page: import("@playwright/test").Page, query = "") {
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

/** Toggle one roster player in a doubles line's pick-two checklist. */
async function pick(
  page: import("@playwright/test").Page,
  slot: string,
  player: RegExp,
) {
  const trigger = page.getByRole("button", { name: `Our pair at ${slot}` });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await page.getByRole("menuitemcheckbox", { name: player }).click();
}

const ALEX_ONE = /Alex Kim.*roster 11111111/;
const ALEX_TWO = /Alex Kim.*roster 22222222/;
const CASEY = /^Casey Lee/;
const RILEY = /^Riley Chen/;
const DREW = /^Drew Park/;

test("the pair picker selects, clears, edits, and preserves sibling lines", async ({
  page,
}) => {
  await openFixture(page);

  await pick(page, "D1", RILEY);
  expect(await page.evaluate(() => window.doublesSelections)).toEqual([
    { key: "D1", ids: ["riley-chen"], labels: ["Riley Chen"] },
  ]);
  await expect(page.getByLabel("D1 roster ids")).toHaveText("riley-chen");

  // The second pick completes the pair and closes the checklist.
  await pick(page, "D1", DREW);
  await expect(page.getByLabel("D1 roster ids")).toHaveText(
    "riley-chen|drew-park",
  );
  await expect(page.getByLabel("D1 roster labels")).toHaveText(
    "Riley Chen|Drew Park",
  );
  await expect(
    page.getByRole("button", { name: "Our pair at D1" }),
  ).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByLabel("D2 roster ids")).toHaveText(
    "22222222-2222-4222-8222-222222222222|casey-lee",
  );

  // Unticking a partner leaves the other, in place.
  await pick(page, "D1", DREW);
  await expect(page.getByLabel("D1 roster ids")).toHaveText("riley-chen");
  await expect(page.getByLabel("D2 roster ids")).toHaveText(
    "22222222-2222-4222-8222-222222222222|casey-lee",
  );
});

test("a player already on another doubles line can't be picked, and says where", async ({
  page,
}) => {
  await openFixture(page);
  await pick(page, "D1", RILEY);

  for (const [player, slot] of [
    [CASEY, "D2"],
    [ALEX_TWO, "D2"],
    [ALEX_ONE, "D3"],
  ] as const) {
    const row = page.getByRole("menuitemcheckbox", { name: player });
    await expect(row).toHaveAttribute("aria-disabled", "true");
    await expect(row).toContainText(`on ${slot}`);
  }
  await page
    .getByRole("menuitemcheckbox", { name: CASEY })
    .click({ force: true });
  await expect(page.getByLabel("D1 roster ids")).toHaveText("riley-chen");
  await expect(
    page.getByText("A player can play one doubles line."),
  ).toBeVisible();
});

test("a player already on another singles line is left out of the list", async ({
  page,
}) => {
  await page.goto(`${origin}/?s2=1`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");

  const field = page.getByLabel("Our player at S1");
  // Cleared, so the list browses the whole roster rather than "Alex Kim".
  await field.fill("");
  const list = page.getByRole("listbox", { name: "Players for S1" });
  await expect(list).toBeVisible();
  await expect(list.getByRole("option", { name: /^Riley Chen/ })).toHaveCount(
    0,
  );
  // Singles plus doubles is allowed: Casey (on D2) is still offered.
  await expect(list.getByRole("option", { name: /^Casey Lee/ })).toHaveCount(1);
  await field.fill("Riley");
  await expect(list).toContainText("Riley Chen is on S2");
});

test("No player for the opponent records their forfeit, and a name takes it back", async ({
  page,
}) => {
  await page.goto(`${origin}/?s2=1`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");

  await page.getByRole("button", { name: "Opponent", exact: true }).click();
  const option = page.getByRole("option", { name: /^No player/ });
  await expect(option).toContainText("Counts as their forfeit");
  await option.click();

  let lines = JSON.parse(
    (await page.getByLabel("Lineup state").textContent())!,
  );
  expect(lines[1]).toMatchObject({
    key: "S2",
    theirNoPlayer: true,
    theirLabels: [],
    noPlayer: false,
    ourIds: ["riley-chen"],
  });
  await expect(page.getByText("No player · we win by forfeit")).toBeVisible();

  // Typing a name and pressing Enter names them — it never picks No player.
  await page.getByText("No player · we win by forfeit").click();
  await page.getByPlaceholder("Name", { exact: true }).last().fill("Sam Hill");
  await page.keyboard.press("Enter");
  lines = JSON.parse((await page.getByLabel("Lineup state").textContent())!);
  expect(lines[1]).toMatchObject({
    key: "S2",
    theirNoPlayer: false,
    theirLabels: ["Sam Hill"],
  });
});

test("same-name identities are disambiguated and settled doubles stay locked", async ({
  page,
}) => {
  await openFixture(page);

  await page.getByRole("button", { name: "Our pair at D1" }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: ALEX_ONE }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitemcheckbox", { name: ALEX_TWO }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await expect(page.getByText("Alex Kim / Jordan Lee")).toBeVisible();
  await expect(page.getByText("Played", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Our pair at D3" }),
  ).toHaveCount(0);
});

test("stable identities and labels reach payloads without blocking singles participation", () => {
  const ladder: LadderPlayer[] = [
    { userId: "same-one", name: "Alex Kim", ladderPosition: 1 },
    { userId: "same-two", name: "Alex Kim", ladderPosition: 2 },
  ];
  const lines = seedDualLines(ladder, {
    lines: [
      { key: "S1", ourIds: ["same-one"], ourLabels: ["Alex Kim"] },
      {
        key: "D1",
        ourIds: ["same-one", "same-two"],
        ourLabels: ["Alex / Kim", "Alex / Kim"],
      },
    ],
  });
  const payload = buildDualPayloadLines(filledDualLines(lines, {}), new Map());

  expect(payload.find((line) => line.slot === "S1")?.playerUserIds).toEqual([
    "same-one",
  ]);
  expect(payload.find((line) => line.slot === "D1")).toMatchObject({
    playerUserIds: ["same-one", "same-two"],
    playerLabels: ["Alex / Kim", "Alex / Kim"],
  });
});

test("the lineup asks who plays, never how a line finished", async ({
  page,
}) => {
  await openFixture(page);
  // Results and outcomes are recorded on the event page's score flow — the one
  // place they are written. Nothing on a lineup row offers to set one.
  await expect(page.getByRole("button", { name: /^Play choice/ })).toHaveCount(
    0,
  );
  // Only "No player" and "No pair" say forfeit, and only once chosen.
  await expect(page.getByText(/win by forfeit/)).toHaveCount(0);
});

test("No player on a singles line empties it and says what it means", async ({
  page,
}) => {
  await openFixture(page);
  await page.getByLabel("Our player at S1").focus();
  const option = page.getByRole("option", { name: /^No player/ });
  await expect(option).toContainText("Counts as a forfeit");
  await option.click();

  const lines = JSON.parse(
    (await page.getByLabel("Lineup state").textContent())!,
  );
  expect(lines[0]).toMatchObject({
    key: "S1",
    noPlayer: true,
    ourIds: [],
    ourLabels: [],
    theirLabels: [],
  });
  await expect(page.getByLabel("Our player at S1")).toHaveAttribute(
    "placeholder",
    "No player",
  );
  // Nobody to name across the net: the opponent well becomes the consequence.
  await expect(page.getByText("They win by forfeit")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Opponent at S1|Add opponent/ }),
  ).toHaveCount(0);
});

test("No pair on a doubles line is undone by picking a player", async ({
  page,
}) => {
  await openFixture(page);
  const trigger = page.getByRole("button", { name: "Our pair at D1" });
  await trigger.click();
  await page.getByRole("menuitemradio", { name: /^No pair/ }).click();
  await expect(trigger).toContainText("No pair");
  await expect(page.getByText("They win by forfeit")).toBeVisible();
  let lines = JSON.parse(
    (await page.getByLabel("Lineup state").textContent())!,
  );
  expect(lines[1]).toMatchObject({ key: "D1", noPlayer: true, ourIds: [] });

  await pick(page, "D1", RILEY);
  lines = JSON.parse((await page.getByLabel("Lineup state").textContent())!);
  expect(lines[1]).toMatchObject({
    key: "D1",
    noPlayer: false,
    ourIds: ["riley-chen"],
  });
  await expect(page.getByText("They win by forfeit")).toHaveCount(0);
});

test("a bench player is moved onto a singles line with the keyboard", async ({
  page,
}) => {
  await openFixture(page);
  const before = JSON.parse(
    (await page.getByLabel("Lineup state").textContent())!,
  );

  const grip = page.getByRole("button", {
    name: "Move Casey Lee, not in the lineup",
  });
  await grip.focus();
  await page.keyboard.press("Space");
  // Past Alex Kim (22222222), across the bench line, above S1's player.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Space");

  await expect(page.getByLabel("Singles roster ids")).toHaveText("casey-lee");
  const after = JSON.parse(
    (await page.getByLabel("Lineup state").textContent())!,
  );
  // Only our side moved: S1's opponent and every other line are untouched.
  expect(after[0].ourLabels).toEqual(["Casey Lee"]);
  expect(after[0].theirLabels).toEqual(before[0].theirLabels);
  expect(after.slice(1)).toEqual(before.slice(1));
  // The player it displaced is on the bench now, and can be moved back.
  await expect(
    page.getByRole("button", { name: /^Move Alex Kim, not in the lineup/ }),
  ).toHaveCount(2);
});

test("escape puts a lifted player back without changing the lineup", async ({
  page,
}) => {
  await openFixture(page);
  const original = await page.getByLabel("Lineup state").textContent();
  await page
    .getByRole("button", { name: "Move Jordan Lee, not in the lineup" })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Lineup state")).toHaveText(original!);
});

test("either saved forfeit remains read-only and explains the explicit clear path", async ({
  page,
}) => {
  for (const side of ["ours", "theirs"]) {
    await page.goto(`${origin}/?outcome=${side}`);
    await expect(
      page.getByText(
        side === "ours"
          ? "We lost — our side forfeited"
          : "We won — opponent forfeited",
        {
          exact: false,
        },
      ),
    ).toBeVisible();
    await expect(
      page.getByText("Clear the outcome on the event to edit."),
    ).toBeVisible();
  }
});

test("the progress pill counts the lineup and takes the coach to the line still to set", async ({
  page,
}) => {
  await openFixture(page);
  // S1, D2 and the settled D3 are set; D1 has nobody.
  const pill = page.getByRole("button", { name: /^3 of 4 lines set/ });
  await expect(pill).toContainText("3 of 4 lines set");
  await expect(pill).not.toHaveCSS("color", "rgb(229, 24, 55)");

  await pill.click();
  // A doubles line opens its pair picker where the cursor lands.
  await expect(
    page.getByRole("button", { name: "Our pair at D1" }),
  ).toHaveAttribute("aria-expanded", "true");
  await pick(page, "D1", RILEY);
  await pick(page, "D1", DREW);

  // Every line set: the count reads four of four.
  await expect(
    page.getByRole("button", { name: /^4 of 4 lines set/ }),
  ).toBeVisible();
});

test("the progress pill puts the cursor in an empty singles line", async ({
  page,
}) => {
  await openFixture(page);
  // Settle D1 as No pair, then clear S1's name: S1 is the one line left.
  await page.getByRole("button", { name: "Our pair at D1" }).click();
  await page.getByRole("menuitemradio", { name: /^No pair/ }).click();
  await page.keyboard.press("Escape");
  await page.getByLabel("Our player at S1").fill("");
  // Close S1's list first: the test page has no stylesheet, so an open list
  // sits in the flow and would move the pill between press and release.
  await page.keyboard.press("Escape");
  await page.getByLabel("Lineup state").click();
  await page.getByRole("button", { name: /lines set/ }).click();
  await expect(page.getByLabel("Our player at S1")).toBeFocused();
  await expect(
    page.getByRole("listbox", { name: "Players for S1" }),
  ).toBeVisible();
});

/** Toggle one name in their pair's pick-two checklist. */
async function pickTheirs(
  page: import("@playwright/test").Page,
  slot: string,
  name: RegExp,
) {
  const trigger = page.getByRole("button", { name: `Their pair at ${slot}` });
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await page.getByRole("menuitemcheckbox", { name }).click();
}

const lineState = async (page: import("@playwright/test").Page, key: string) =>
  JSON.parse((await page.getByLabel("Lineup state").textContent())!).find(
    (line: { key: string }) => line.key === key,
  );

test("their pair is picked like ours: singles names first, two picks, one line each", async ({
  page,
}) => {
  await page.goto(`${origin}/?roster=1`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");

  const trigger = page.getByRole("button", { name: "Their pair at D1" });
  await expect(trigger).toContainText("Reed / Ortiz");
  await trigger.click();
  const rows = page.getByRole("menuitemcheckbox");
  // S1's opponent leads, then the saved roster, then names on other doubles
  // lines — each name once.
  await expect(rows.first()).toHaveAccessibleName(/^Morgan Reed/);
  await expect(
    page.getByRole("menuitemcheckbox", { name: /^Sam Ortiz/ }),
  ).toHaveCount(1);
  // A name on another doubles line can't be picked, and says where.
  const taylor = page.getByRole("menuitemcheckbox", { name: /^Taylor Park/ });
  await expect(taylor).toHaveAttribute("aria-disabled", "true");
  await expect(taylor).toContainText("on D2");

  // Untick one: a half pair reads "Choose partner" and the line isn't set.
  await pickTheirs(page, "D1", /^Sam Ortiz/);
  await expect(trigger).toContainText("Reed / Choose partner");
  await expect(trigger).toHaveAttribute("data-line-unset", "D1");
  await pickTheirs(page, "D1", /^Sam Ortiz/);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(await lineState(page, "D1")).toMatchObject({
    theirLabels: ["Morgan Reed / Sam Ortiz"],
  });
});

test("a doubles-only opponent is added in place, and No pair is their forfeit", async ({
  page,
}) => {
  await openFixture(page);
  const trigger = page.getByRole("button", { name: "Their pair at D1" });
  await trigger.click();
  await pickTheirs(page, "D1", /^Sam Ortiz/);
  await page.getByRole("menuitem", { name: /Add a player/ }).click();
  const field = page.getByLabel("Add a player to their pair at D1");
  await field.fill("Riley");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Type a first and last name.")).toBeVisible();
  await field.fill("Riley Park");
  await page.keyboard.press("Enter");
  await expect(trigger).toContainText("Reed / Park");
  expect(await lineState(page, "D1")).toMatchObject({
    theirLabels: ["Morgan Reed / Riley Park"],
  });

  await trigger.click();
  await page.getByRole("menuitemradio", { name: /^No pair/ }).click();
  await expect(trigger).toContainText("No pair · we win by forfeit");
  expect(await lineState(page, "D1")).toMatchObject({
    theirLabels: [],
    theirNoPlayer: true,
  });
});

/* ── Adding our own player from a pair picker (T18) ─────────────────────── */

const addCalls = (page: import("@playwright/test").Page) =>
  page.evaluate(() => window.__addProgramPlayerCalls ?? []);

test("our pair picker offers the singles picker's add row, only while a seat is free", async ({
  page,
}) => {
  await openFixture(page);

  // D1 is empty: the row is offered, in the singles picker's own words.
  await page.getByRole("button", { name: "Our pair at D1" }).click();
  await expect(
    page.getByRole("menuitem", { name: ADD_ROW_LABEL, exact: true }),
  ).toBeVisible();
  // One partner picked still leaves a seat.
  await pick(page, "D1", RILEY);
  await expect(
    page.getByRole("menuitem", { name: ADD_ROW_LABEL, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // D2 already has two: no seat, no row.
  await page.getByRole("button", { name: "Our pair at D2" }).click();
  await expect(
    page.getByRole("menuitemcheckbox", { name: CASEY }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: ADD_ROW_LABEL, exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  // D3 is settled: drawn read-only, with no picker to offer the row at all.
  await expect(
    page.getByRole("button", { name: "Our pair at D3" }),
  ).toHaveCount(0);
});

test("a one-word name is refused before the server, and a refused add changes nothing", async ({
  page,
}) => {
  await openFixture(page);
  await pick(page, "D1", RILEY);
  await page.getByRole("menuitem", { name: ADD_ROW_LABEL }).click();
  const field = page.getByLabel("Add a player to our pair at D1");

  await field.fill("Sam");
  await page.keyboard.press("Enter");
  await expect(page.getByText(ADD_NAME_REQUIRED)).toBeVisible();
  expect(await addCalls(page)).toEqual([]);

  await page.evaluate(() => {
    window.__addProgramPlayer = { error: "That roster is full." };
  });
  await field.fill("Sam Hill");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("alert")).toHaveText("That roster is full.");
  expect(await addCalls(page)).toEqual([
    { firstName: "Sam", lastName: "Hill" },
  ]);
  await expect(page.getByLabel("D1 roster ids")).toHaveText("riley-chen");
  await expect(page.getByLabel("D1 roster labels")).toHaveText("Riley Chen");
});

test("an added player joins the pair by id and every other picker offers them", async ({
  page,
}) => {
  await openFixture(page);
  await page.evaluate(() => {
    window.__addProgramPlayer = { profileId: "sam-hill-id" };
  });
  await pick(page, "D1", RILEY);
  await page.getByRole("menuitem", { name: ADD_ROW_LABEL }).click();
  await page.getByLabel("Add a player to our pair at D1").fill("Sam  Hill");
  await page.keyboard.press("Enter");

  // Beside the partner already picked, by id — and the pair is complete.
  await expect(page.getByLabel("D1 roster ids")).toHaveText(
    "riley-chen|sam-hill-id",
  );
  await expect(page.getByLabel("D1 roster labels")).toHaveText(
    "Riley Chen|Sam Hill",
  );
  await expect(
    page.getByRole("button", { name: "Our pair at D1" }),
  ).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => window.doublesSelections.at(-1))).toEqual({
    key: "D1",
    ids: ["riley-chen", "sam-hill-id"],
    labels: ["Riley Chen", "Sam Hill"],
  });

  // Another doubles picker lists them — taken, and saying where.
  await page.getByRole("button", { name: "Our pair at D2" }).click();
  const row = page.getByRole("menuitemcheckbox", { name: /^Sam Hill/ });
  await expect(row).toHaveAttribute("aria-disabled", "true");
  await expect(row).toContainText("on D1");
  await page.keyboard.press("Escape");

  // And the singles picker offers them too.
  await page.getByLabel("Our player at S1").fill("Sam");
  await expect(
    page
      .getByRole("listbox", { name: "Players for S1" })
      .getByRole("option", { name: /^Sam Hill/ }),
  ).toHaveCount(1);
});

type StateLine = {
  key: string;
  discipline: string;
  ourIds: string[];
  ourLabels: string[];
  theirLabels: string[];
  theirNoPlayer: boolean;
};

async function lineupState(
  page: import("@playwright/test").Page,
): Promise<StateLine[]> {
  return JSON.parse((await page.getByLabel("Lineup state").textContent())!);
}

test("a doubles pair moves between courts with the keyboard, opponents stay", async ({
  page,
}) => {
  await openFixture(page, "?free=1");
  const before = await lineupState(page);
  const pairOn = (lines: StateLine[], key: string) =>
    lines.find((line) => line.key === key)!.ourIds;

  await expect(
    page.getByRole("button", { name: "Move Alex Kim / Casey Lee, line D2" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Move Alex Kim / Jordan Lee, line D3" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Move Riley Chen / Drew Park, line D1" })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  await expect(
    page.getByRole("button", { name: "Move Riley Chen / Drew Park, line D3" }),
  ).toBeFocused();
  const after = await lineupState(page);
  // The singles gesture exactly: each ↓ swaps with the next line, so D1's
  // pair travels to D3 and the two it passed each move up one court.
  expect(pairOn(after, "D3")).toEqual(pairOn(before, "D1"));
  expect(pairOn(after, "D2")).toEqual(pairOn(before, "D3"));
  expect(pairOn(after, "D1")).toEqual(pairOn(before, "D2"));
  // Every court keeps its opponent, and singles is untouched.
  expect(after.map((line) => [line.key, line.theirLabels])).toEqual(
    before.map((line) => [line.key, line.theirLabels]),
  );
  expect(after.filter((line) => line.discipline === "singles")).toEqual(
    before.filter((line) => line.discipline === "singles"),
  );
});

test("escape puts a lifted doubles pair back without changing the lineup", async ({
  page,
}) => {
  await openFixture(page, "?free=1");
  const original = await page.getByLabel("Lineup state").textContent();
  await page
    .getByRole("button", { name: "Move Riley Chen / Drew Park, line D1" })
    .focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("Lineup state")).toHaveText(original!);
  await expect(
    page.getByRole("button", { name: "Move Riley Chen / Drew Park, line D1" }),
  ).toBeFocused();
});

test("a settled doubles line leaves no doubles grip to drag", async ({
  page,
}) => {
  // The default fixture has D3 played.
  await openFixture(page);
  await expect(
    page.getByRole("button", { name: /^Move .*, line D\d$/ }),
  ).toHaveCount(0);
  // Singles are still reorderable — only the doubles block is frozen.
  await expect(
    page.getByRole("button", { name: /^Move .*, line 1$/ }),
  ).toHaveCount(1);
});
