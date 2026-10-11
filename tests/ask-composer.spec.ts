import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The Ask composer and its `@` tag menu, driven in a real browser.
 *
 * `tests/fixtures/ask-composer-harness.tsx` is bundled with webpack and
 * served from a throwaway port — the same harness pattern as
 * `schedule-doubles-picker.spec.ts` — because everything pinned here is a key
 * event: `@` opening the menu, arrows and Enter choosing a row, Escape
 * closing it, Enter sending and Shift+Enter breaking the line. A static
 * render could assert none of it.
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

const PLACEHOLDER =
  "Ask about a match, an opponent or a stretch of the season. Type @ to tag one.";

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "ask-composer-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/ask-composer-harness.tsx"),
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
          // No `next/navigation` alias, on purpose: the composer must bundle
          // without one.
          alias: { "@": resolve("src") },
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

const question = (page: Page) => page.getByLabel("Your question");
const tagButton = (page: Page) =>
  page.getByRole("button", { name: "Tag a match or opponent" });
const tagMenu = (page: Page) =>
  page.getByRole("listbox", { name: "Tag a match or opponent" });
const send = (page: Page) =>
  page.getByRole("button", { name: "Send question" });
const count = (page: Page) => page.locator("[data-ask-count]");
const chips = (page: Page) =>
  page.getByRole("list", { name: "Tagged" }).getByRole("listitem");

async function draft(page: Page) {
  return JSON.parse(
    (await page.getByLabel("Draft").textContent()) ?? "null",
  ) as { text: string; tags: { kind: string; id: string; label: string }[] };
}

async function sent(page: Page) {
  return JSON.parse((await page.getByLabel("Sent").textContent()) ?? "[]") as {
    text: string;
    tags: unknown[];
  }[];
}

/** The option the keyboard is on, as the textarea names it. */
async function activeOption(page: Page) {
  const id = await question(page).getAttribute("aria-activedescendant");
  expect(id).toBeTruthy();
  return page.locator(`[id="${id}"]`);
}

test.describe("what the composer renders", () => {
  test("a labelled textarea, the tag button, the count and Send", async ({
    page,
  }) => {
    await openFixture(page);

    await expect(question(page)).toHaveJSProperty("tagName", "TEXTAREA");
    await expect(question(page)).toHaveAttribute("placeholder", PLACEHOLDER);
    await expect(tagButton(page)).toBeVisible();
    // Under the limit the count stands alone.
    await expect(count(page)).toHaveText(/12 \/ 20$/);
    await expect(count(page)).not.toContainText("Resets");

    await expect(send(page)).toHaveAttribute("aria-label", "Send question");
    await expect(send(page)).toHaveAttribute("type", "submit");
    // Built with `advButton()`: every class it gives a small primary is on
    // the button, bar the horizontal padding the square icon form replaces.
    const classes = (await send(page).getAttribute("class"))?.split(/\s+/);
    for (const name of advButton("primary", "sm").split(/\s+/)) {
      if (name === "px-3") continue;
      expect(classes, name).toContain(name);
    }
  });

  test("the engine is a static label: no button, no chevron, no menu", async ({
    page,
  }) => {
    await openFixture(page);

    const engine = page.locator("[data-ask-engine]");
    await expect(engine).toHaveText("Advantage Intelligence");
    await expect(engine).toHaveJSProperty("tagName", "SPAN");
    await expect(engine).not.toHaveAttribute("role");
    await expect(engine).not.toHaveAttribute("aria-haspopup");
    await expect(engine).not.toHaveAttribute("tabindex");
    // The mark is the only thing drawn beside the name.
    await expect(engine.locator("svg")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: /Advantage Intelligence/ }),
    ).toHaveCount(0);

    // Pressing it opens nothing.
    await engine.click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(page.getByRole("listbox")).toHaveCount(0);
  });

  test("no count is shown when the quota could not be read", async ({
    page,
  }) => {
    await openFixture(page, "?quota=none");

    await expect(count(page)).toHaveCount(0);
    await expect(page.getByText(/\d+ \/ \d+/)).toHaveCount(0);
    await question(page).fill("How is my second serve?");
    await expect(send(page)).toBeEnabled();
  });
});

test.describe("the tag menu", () => {
  test("typing @ opens a listbox of Opponents and Matches, and no Groups", async ({
    page,
  }) => {
    await openFixture(page);
    await expect(tagMenu(page)).toHaveCount(0);

    await question(page).pressSequentially("Compare @");

    await expect(tagMenu(page)).toBeVisible();
    await expect(tagButton(page)).toHaveAttribute("aria-expanded", "true");
    const groups = tagMenu(page).getByRole("group");
    await expect(groups).toHaveCount(2);
    await expect(
      tagMenu(page).getByRole("group", { name: "Opponents" }),
    ).toBeVisible();
    await expect(
      tagMenu(page).getByRole("group", { name: "Matches" }),
    ).toBeVisible();
    await expect(tagMenu(page).getByText("Groups")).toHaveCount(0);

    await expect(
      tagMenu(page)
        .getByRole("group", { name: "Opponents" })
        .getByRole("option"),
    ).toHaveText([
      /Theo Lindqvist.*4 matches · Left-handed/,
      /Daniel Okafor.*2 matches · Right-handed/,
      /Marcus Hale.*1 match$/,
    ]);
    await expect(
      tagMenu(page).getByRole("group", { name: "Matches" }).getByRole("option"),
    ).toHaveText([
      /Sep 28 · Theo Lindqvist.*Club ladder · 6-4 6-3/,
      /Sep 14 · Marcus Hale.*Fall Open · 4-6 3-6/,
      // An earlier season carries its year.
      /Aug 30, 2025 · Daniel Okafor/,
    ]);

    // Focus never left the question.
    await expect(question(page)).toBeFocused();
  });

  test("the text typed after @ filters both groups", async ({ page }) => {
    await openFixture(page);

    await question(page).pressSequentially("@marc");
    await expect(tagMenu(page).getByRole("option")).toHaveText([
      /^Marcus Hale/,
      /^Sep 14 · Marcus Hale/,
    ]);

    // A tournament finds its match; the opponents group drops out.
    await question(page).fill("");
    await question(page).pressSequentially("@fall open");
    await expect(tagMenu(page).getByRole("group")).toHaveCount(1);
    await expect(tagMenu(page).getByRole("option")).toHaveText([
      /^Sep 14 · Marcus Hale/,
    ]);
  });

  test("a filter that matches nothing says so, with no option to choose", async ({
    page,
  }) => {
    await openFixture(page);

    await question(page).pressSequentially("@zzz");

    await expect(tagMenu(page)).toHaveText(
      "No opponent or match matches “zzz”",
    );
    await expect(tagMenu(page).getByRole("option")).toHaveCount(0);

    // Enter neither chooses nor sends from under the open menu.
    await page.keyboard.press("Enter");
    expect(await sent(page)).toEqual([]);
    expect((await draft(page)).text).toBe("@zzz");
  });

  test("Enter chooses the active row: a chip is added and the @text goes", async ({
    page,
  }) => {
    await openFixture(page);

    await question(page).pressSequentially("How did I serve against @the");
    await expect(await activeOption(page)).toHaveText(/^Theo Lindqvist/);
    await page.keyboard.press("Enter");

    await expect(tagMenu(page)).toHaveCount(0);
    await expect(chips(page)).toHaveText(["Theo Lindqvist"]);
    await expect(question(page)).toHaveValue("How did I serve against ");
    expect(await draft(page)).toEqual({
      text: "How did I serve against ",
      tags: [
        { kind: "opponent", id: "theo lindqvist", label: "Theo Lindqvist" },
      ],
    });
    // Choosing a row did not send the question.
    expect(await sent(page)).toEqual([]);

    // The caret is where the tag text was, so typing carries on.
    await expect(question(page)).toBeFocused();
    await page.keyboard.type("last month");
    await expect(question(page)).toHaveValue(
      "How did I serve against last month",
    );
  });

  test("arrow keys move the active row, across the two groups and around", async ({
    page,
  }) => {
    await openFixture(page);

    await question(page).pressSequentially("@");
    await expect(await activeOption(page)).toHaveText(/^Theo Lindqvist/);
    await expect(await activeOption(page)).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await page.keyboard.press("ArrowDown");
    await expect(await activeOption(page)).toHaveText(/^Daniel Okafor/);
    await expect(
      tagMenu(page).getByRole("option", { selected: true }),
    ).toHaveCount(1);

    // Up from the first row wraps to the last, which is a match.
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(await activeOption(page)).toHaveText(
      /^Aug 30, 2025 · Daniel Okafor/,
    );

    // Down past the opponents lands on the first match.
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("ArrowDown");
    await expect(await activeOption(page)).toHaveText(
      /^Sep 28 · Theo Lindqvist/,
    );
    await page.keyboard.press("Enter");

    await expect(chips(page)).toHaveText(["Sep 28 · Theo Lindqvist"]);
    await expect(question(page)).toHaveValue("");
    expect((await draft(page)).tags).toEqual([
      { kind: "match", id: "match-sep-28", label: "Sep 28 · Theo Lindqvist" },
    ]);
  });

  test("a chip's remove button removes it", async ({ page }) => {
    await openFixture(page);

    await question(page).pressSequentially("@theo");
    await page.keyboard.press("Enter");
    await question(page).pressSequentially("@marcus");
    await page.keyboard.press("Enter");
    await expect(chips(page)).toHaveText(["Theo Lindqvist", "Marcus Hale"]);

    // Tagging the same opponent again adds no second chip.
    await question(page).pressSequentially("@theo");
    await page.keyboard.press("Enter");
    await expect(chips(page)).toHaveCount(2);

    await page.getByRole("button", { name: "Remove Theo Lindqvist" }).click();

    await expect(chips(page)).toHaveText(["Marcus Hale"]);
    expect((await draft(page)).tags.map((tag) => tag.id)).toEqual([
      "marcus hale",
    ]);

    await page.getByRole("button", { name: "Remove Marcus Hale" }).click();
    await expect(page.getByRole("list", { name: "Tagged" })).toHaveCount(0);
  });

  test("Escape closes the menu and leaves the text as typed", async ({
    page,
  }) => {
    await openFixture(page);

    await question(page).pressSequentially("@the");
    await expect(tagMenu(page)).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(tagMenu(page)).toHaveCount(0);
    await expect(tagButton(page)).toHaveAttribute("aria-expanded", "false");
    await expect(question(page)).toHaveValue("@the");
    await expect(question(page)).toBeFocused();
    expect((await draft(page)).tags).toEqual([]);

    // Typing on in the same word does not bring it back; a new @ does.
    await page.keyboard.type("o");
    await expect(tagMenu(page)).toHaveCount(0);
    await page.keyboard.type(" and @dan");
    await expect(tagMenu(page).getByRole("option")).toHaveText([
      /^Daniel Okafor/,
      /Daniel Okafor$/,
    ]);
  });

  test("the tag button types the @ and opens the same menu", async ({
    page,
  }) => {
    await openFixture(page);

    await question(page).pressSequentially("Against");
    await tagButton(page).click();

    await expect(tagMenu(page)).toBeVisible();
    await expect(question(page)).toHaveValue("Against @");
    await expect(question(page)).toBeFocused();

    await page.keyboard.type("oka");
    await expect(await activeOption(page)).toHaveText(/^Daniel Okafor/);

    // A row can be chosen with the pointer too.
    await tagMenu(page)
      .getByRole("option", { name: /^Daniel Okafor/ })
      .click();
    await expect(chips(page)).toHaveText(["Daniel Okafor"]);
    await expect(question(page)).toHaveValue("Against ");

    // Pressed while open, the button closes it.
    await tagButton(page).click();
    await expect(tagMenu(page)).toBeVisible();
    await tagButton(page).click();
    await expect(tagMenu(page)).toHaveCount(0);
  });

  test("an @ inside a word — an email address — opens nothing", async ({
    page,
  }) => {
    await openFixture(page);

    await question(page).pressSequentially("mail coach@theo");

    await expect(tagMenu(page)).toHaveCount(0);
  });
});

test.describe("sending", () => {
  test("Enter sends; Shift+Enter breaks the line", async ({ page }) => {
    await openFixture(page);

    await question(page).pressSequentially("First line");
    await page.keyboard.press("Shift+Enter");
    await expect(question(page)).toHaveValue("First line\n");
    expect(await sent(page)).toEqual([]);

    await page.keyboard.type("second line");
    await page.keyboard.press("Enter");

    expect(await sent(page)).toEqual([
      { text: "First line\nsecond line", tags: [] },
    ]);
    // The harness clears the draft the way the thread does.
    await expect(question(page)).toHaveValue("");
  });

  test("Send carries the tags with the question", async ({ page }) => {
    await openFixture(page);

    await question(page).pressSequentially("Break points against @theo");
    await page.keyboard.press("Enter");
    await send(page).click();

    expect(await sent(page)).toEqual([
      {
        text: "Break points against ",
        tags: [
          { kind: "opponent", id: "theo lindqvist", label: "Theo Lindqvist" },
        ],
      },
    ]);
  });

  test("Send is disabled while the question is empty", async ({ page }) => {
    await openFixture(page);

    await expect(send(page)).toBeDisabled();
    await question(page).fill("   ");
    await expect(send(page)).toBeDisabled();
    // Enter on an empty question sends nothing.
    await question(page).press("Enter");
    expect(await sent(page)).toEqual([]);

    await question(page).fill("How is my second serve?");
    await expect(send(page)).toBeEnabled();
  });

  test("Send is disabled while an answer is in flight", async ({ page }) => {
    await openFixture(page, "?pending=1&text=How+is+my+second+serve%3F");

    await expect(question(page)).toHaveValue("How is my second serve?");
    await expect(send(page)).toBeDisabled();
    await question(page).press("Enter");
    expect(await sent(page)).toEqual([]);
  });

  test("at the limit Send is disabled and the reset date sits beside the count", async ({
    page,
  }) => {
    await openFixture(page, "?used=20&text=How+is+my+second+serve%3F");

    await expect(send(page)).toBeDisabled();
    await expect(count(page)).toHaveText(/20 \/ 20 · Resets Nov 1$/);
    await expect(count(page).locator("time")).toHaveAttribute(
      "datetime",
      "2026-11-01",
    );
    await question(page).press("Enter");
    expect(await sent(page)).toEqual([]);
  });

  test("one question short of the limit can still be sent", async ({
    page,
  }) => {
    await openFixture(page, "?used=19&text=How+is+my+second+serve%3F");

    await expect(send(page)).toBeEnabled();
    await expect(count(page)).toHaveText(/19 \/ 20$/);
    await expect(count(page)).not.toContainText("Resets");
  });
});
