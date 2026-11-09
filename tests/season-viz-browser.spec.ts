import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

/**
 * The season Visualizations tab in a real browser (`season-viz-harness.tsx`,
 * the page's Server Component played by a timer): what a reader sees
 * between a click and the server's answer, and what the wall is left on
 * after a card. The static spec (`player-season-viz.spec.ts`) pins what the
 * container hands the shell for one render; this pins the sequence, which
 * is where both findings lived.
 */

let origin: string;
let close: () => Promise<void>;

test.beforeAll(async () => {
  ({ origin, close } = await startStyledHarness(
    "tests/fixtures/season-viz-harness.tsx",
    {
      alias: {
        "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
      },
    },
  ));
});

test.afterAll(async () => {
  await close?.();
});

const PROFILE = "/dashboard/team/roster/p-avery";

/** The wall's own You | Opponent, by CSS: while a dialog is open Radix hides
 *  the rest of the page from the accessibility tree, and a role query would
 *  not find it. */
const wallPressed = (page: Page) =>
  page.locator(
    '#root [role="group"][aria-label="Player"] button[aria-pressed="true"]',
  );

test("opening a card draws the shell's frame as a loading status until the server answers — on the first open, and never the last card's court under the next card's cut", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=1200`);
  const wall = page.getByRole("list", { name: "Default views" });
  await expect(wall).toBeVisible();

  // The first open: the frame, named for the cut, the moment the card is
  // clicked — a status and a dialog, no court yet.
  await wall.getByRole("link", { name: /^First serves, Avery Kim/ }).click();
  const loadingServe = page.getByRole("dialog", {
    name: "Loading Serve placement",
  });
  await expect(loadingServe).toBeVisible();
  await expect(
    loadingServe.getByRole("status", { name: "Loading Serve placement" }),
  ).toBeVisible();
  await expect(page.locator("[data-court-stage]")).toHaveCount(0);
  await expect(
    loadingServe.getByRole("button", { name: "Close" }),
  ).toBeVisible();

  // Then the card's own court, and the frame is gone.
  const serve = page.getByRole("dialog", { name: "First serves" });
  await expect(serve).toBeVisible({ timeout: 5_000 });
  await expect(loadingServe).toHaveCount(0);
  await expect(
    serve.locator("[data-court-stage] [data-viz-mark]").first(),
  ).toBeVisible();

  // Close, then open another card before the server has answered the close:
  // the store's cut is the new card's while the last answer is still the
  // serve court. The frame for THAT cut — never the serve court drawn under
  // the rally card's filters.
  await page.keyboard.press("Escape");
  await expect(serve).toHaveCount(0);
  await wall.getByRole("link", { name: /^Rally shots, Avery Kim/ }).click();
  const loadingRally = page.getByRole("dialog", {
    name: "Loading Rally placement",
  });
  await expect(loadingRally).toBeVisible();
  await expect(page.getByRole("dialog", { name: "First serves" })).toHaveCount(
    0,
  );
  await expect(page.locator("[data-court-stage]")).toHaveCount(0);
  const rally = page.getByRole("dialog", { name: "Rally shots" });
  await expect(rally).toBeVisible({ timeout: 5_000 });
  await expect(loadingRally).toHaveCount(0);

  // Esc on the frame itself closes it too — a reader is never stuck behind
  // a server that has not answered.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await wall.getByRole("link", { name: /^First serves, Avery Kim/ }).click();
  await expect(loadingServe).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("cut")).toBeNull();

  expect(errors).toEqual([]);
});

test("a player switched inside the card stays in the card: the wall keeps You, and closing lands on it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations`);
  const wall = page.getByRole("list", { name: "Default views" });
  await expect(wallPressed(page)).toHaveText("You");

  await wall.getByRole("link", { name: /^First serves, Avery Kim/ }).click();
  const dialog = page.getByRole("dialog", { name: "First serves" });
  await expect(dialog).toBeVisible({ timeout: 5_000 });

  // Opponent, inside the card: the chip flips at once, the court and the
  // subtitle follow the server, the URL carries the card's player.
  const cardPlayer = dialog.getByRole("group", { name: "Player" });
  await cardPlayer.getByRole("button", { name: "Opponent" }).click();
  await expect(
    cardPlayer.getByRole("button", { name: "Opponent" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(dialog).toContainText("Serve placement · Opponents", {
    timeout: 5_000,
  });
  expect(new URL(page.url()).searchParams.get("player")).toBe("opponent");
  // The wall under it still says You.
  await expect(wallPressed(page)).toHaveText("You");

  // Close: the wall, on its own player — not the one switched to inside the
  // card — and the server recomputes the cards for it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(wallPressed(page)).toHaveText("You");
  const params = new URL(page.url()).searchParams;
  expect(params.get("cut")).toBeNull();
  expect(params.get("player")).toBeNull();
  expect(params.get("tab")).toBe("visualizations");
  await expect(
    wall.getByRole("link", { name: /^First serves, Avery Kim/ }),
  ).toBeVisible({ timeout: 5_000 });
  await expect(wall.getByRole("link", { name: /Opponents/ })).toHaveCount(0);

  // The wall's own switch still works, and is what a later open restores.
  await page
    .locator('#root [role="group"][aria-label="Player"]')
    .getByRole("button", { name: "Opponent" })
    .click();
  await expect(wallPressed(page)).toHaveText("Opponent");
  await expect(
    wall.getByRole("link", { name: /^First serves, Opponents/ }),
  ).toBeVisible({ timeout: 5_000 });
  await wall.getByRole("link", { name: /^First serves, Opponents/ }).click();
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  await dialog
    .getByRole("group", { name: "Player" })
    .getByRole("button", { name: "You" })
    .click();
  await expect(dialog).toContainText("Serve placement · Avery Kim", {
    timeout: 5_000,
  });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(wallPressed(page)).toHaveText("Opponent");
  expect(new URL(page.url()).searchParams.get("player")).toBe("opponent");

  expect(errors).toEqual([]);
});
