import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

/**
 * The season Visualizations tab in a real browser (`season-viz-harness.tsx`,
 * the page's Server Component played by a timer): what a reader sees
 * between a click and the server's answer, where focus goes, and what the
 * wall is left on after a card. The static spec (`player-season-viz.spec.ts`)
 * pins what the container hands the shell for one render; this pins the
 * sequence, which is where the findings lived.
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
 *  the rest of the page from the accessibility tree, and while the wall is
 *  busy it is `inert`, so a role query would not find it either way. */
const wallPressed = (page: Page) =>
  page.locator(
    '#root [role="group"][aria-label="Player"] button[aria-pressed="true"]',
  );
const wallList = (page: Page) =>
  page.locator('#root [role="list"][aria-label="Default views"]');
const wallBusy = (page: Page) => page.locator("#root [data-stale]");

/** Holds the shell's chunk back so the frame drawn before it is on screen
 *  long enough to look at; the page's own bundle is left alone. */
async function slowShellChunk(page: Page, ms: number) {
  await page.route("**/*.js", async (route) => {
    if (route.request().url().endsWith("/bundle.js")) return route.continue();
    await new Promise((done) => setTimeout(done, ms));
    await route.continue();
  });
}

test("one dialog per opening: the frame before the chunk, the shell pending, then the court — and Esc puts focus back on the card, on the first open and on a card switch", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await slowShellChunk(page, 900);
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=1500`);
  const wall = page.getByRole("list", { name: "Default views" });
  await expect(wall).toBeVisible();
  const serveCard = wall.getByRole("link", {
    name: /^First serves, Avery Kim/,
  });
  const rallyCard = wall.getByRole("link", { name: /^Rally shots, Avery Kim/ });

  // The first open of the session: before the shell's chunk has loaded, the
  // frame by hand — a status named for the cut, no dialog, and the card
  // keeps focus. Esc on it closes.
  await serveCard.click();
  const chunkFrame = page.getByTestId("lightbox-chunk-pending");
  await expect(chunkFrame).toBeVisible();
  await expect(
    chunkFrame.getByRole("status", { name: "Loading Serve placement" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(serveCard).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(chunkFrame).toHaveCount(0);
  await expect(serveCard).toBeFocused();
  expect(new URL(page.url()).searchParams.get("cut")).toBeNull();

  // Again, and this time let it land. The shell arrives pending: ONE
  // dialog, named for the cut, the status inside, no court, no enter fade
  // (it replaced the frame). The same dialog then shows the court.
  await serveCard.click();
  await expect(chunkFrame).toBeVisible();
  const loadingServe = page.getByRole("dialog", {
    name: "Loading Serve placement",
  });
  await expect(loadingServe).toBeVisible({ timeout: 5_000 });
  await expect(chunkFrame).toHaveCount(0);
  await expect(
    loadingServe.getByRole("status", { name: "Loading Serve placement" }),
  ).toBeVisible();
  await expect(
    loadingServe.locator("[data-pending-bar]").first(),
  ).toBeVisible();
  await expect(page.locator("[data-court-stage]")).toHaveCount(0);
  await expect(loadingServe).not.toHaveClass(/animate-in/);
  await loadingServe.evaluate((el) => el.setAttribute("data-opening", "one"));
  const serve = page.getByRole("dialog", { name: "First serves" });
  await expect(serve).toBeVisible({ timeout: 5_000 });
  await expect(serve).toHaveAttribute("data-opening", "one");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    serve.locator("[data-court-stage] [data-viz-mark]").first(),
  ).toBeVisible();
  await expect(page.locator("[data-pending-bar]")).toHaveCount(0);

  // Esc: focus returns to the card that opened it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(serveCard).toBeFocused();

  // A card switch before the server has answered the close: the store's cut
  // is the rally card's while the last answer is still the serve court. The
  // shell (its chunk cached now, so with its fade) pending for THAT cut —
  // never the serve court under the rally card's filters — then the rally
  // court in the same dialog, and Esc lands focus on the rally card.
  await rallyCard.click();
  const loadingRally = page.getByRole("dialog", {
    name: "Loading Rally placement",
  });
  await expect(loadingRally).toBeVisible();
  await expect(loadingRally).toHaveClass(/animate-in/);
  await expect(page.getByRole("dialog", { name: "First serves" })).toHaveCount(
    0,
  );
  await expect(page.locator("[data-court-stage]")).toHaveCount(0);
  await loadingRally.evaluate((el) => el.setAttribute("data-opening", "two"));
  const rally = page.getByRole("dialog", { name: "Rally shots" });
  await expect(rally).toBeVisible({ timeout: 5_000 });
  await expect(rally).toHaveAttribute("data-opening", "two");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rallyCard).toBeFocused();

  // Esc on the pending shell itself closes it, focus back on its card.
  await serveCard.click();
  await expect(loadingServe).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(serveCard).toBeFocused();
  expect(new URL(page.url()).searchParams.get("cut")).toBeNull();

  expect(errors).toEqual([]);
});

test("the wall reads busy until the server's cards are the chip's — after a chip click, and after closing a card whose player was switched inside it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=700`);
  await expect(wallPressed(page)).toHaveText("You");
  await expect(wallBusy(page)).toHaveCount(0);

  // The chip: pressed at once; the cards dimmed, inert and busy, still
  // yours, with one status naming what is on its way — until the server's
  // cards are the opponents'.
  await page
    .locator('#root [role="group"][aria-label="Player"]')
    .getByRole("button", { name: "Opponent" })
    .click();
  await expect(wallPressed(page)).toHaveText("Opponent");
  await expect(wallBusy(page)).toHaveAttribute("aria-busy", "true");
  await expect(wallBusy(page)).toHaveClass(/pointer-events-none/);
  await expect(
    wallList(page).locator('a[aria-label^="First serves, Avery Kim"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('#root [role="status"]', {
      hasText: "Loading the opponents’ courts",
    }),
  ).toHaveCount(1);
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(
    wallList(page).locator('a[aria-label^="First serves, Opponents"]'),
  ).toHaveCount(1);
  await expect(page.locator('#root [role="status"]')).toHaveCount(0);

  // Back to You, then open a card and switch its player inside: the wall
  // under the card keeps You, and once the server's cards are the
  // opponents' it reads busy there too — hidden under the scrim.
  await page
    .locator('#root [role="group"][aria-label="Player"]')
    .getByRole("button", { name: "You" })
    .click();
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  const wall = page.getByRole("list", { name: "Default views" });
  const serveCard = wall.getByRole("link", {
    name: /^First serves, Avery Kim/,
  });
  await serveCard.click();
  const dialog = page.getByRole("dialog", { name: "First serves" });
  await expect(dialog).toBeVisible({ timeout: 5_000 });
  const cardPlayer = dialog.getByRole("group", { name: "Player" });
  await cardPlayer.getByRole("button", { name: "Opponent" }).click();
  await expect(
    cardPlayer.getByRole("button", { name: "Opponent" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(dialog).toContainText("Serve placement · Opponents", {
    timeout: 5_000,
  });
  expect(new URL(page.url()).searchParams.get("player")).toBe("opponent");
  await expect(wallPressed(page)).toHaveText("You");
  await expect(wallBusy(page)).toHaveAttribute("aria-busy", "true");

  // Close: the wall on its own player, busy until its cards come back, then
  // settled on You with your cards; focus on the card that opened it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(wallPressed(page)).toHaveText("You");
  await expect(wallBusy(page)).toHaveAttribute("aria-busy", "true");
  const params = new URL(page.url()).searchParams;
  expect(params.get("cut")).toBeNull();
  expect(params.get("player")).toBeNull();
  expect(params.get("tab")).toBe("visualizations");
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(
    wall.getByRole("link", { name: /^First serves, Avery Kim/ }),
  ).toBeVisible();
  await expect(wall.getByRole("link", { name: /Opponents/ })).toHaveCount(0);
  await expect(serveCard).toBeFocused();

  expect(errors).toEqual([]);
});

test("a season with nothing analyzed opens nothing for a stale ?cut= link", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&cut=serve&ball=first&empty=1&delay=100`,
  );
  await expect(page.getByTestId("season-viz-empty")).toContainText(
    "No analyzed matches yet.",
  );
  // Give the lazy shell every chance to arrive: nothing opens, nothing
  // loads, nothing is busy.
  await page.waitForTimeout(800);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("lightbox-chunk-pending")).toHaveCount(0);
  await expect(
    page.locator('[role="status"]', { hasText: /^Loading/ }),
  ).toHaveCount(0);
  await expect(page.locator("[data-pending-bar]")).toHaveCount(0);
  await expect(wallBusy(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
