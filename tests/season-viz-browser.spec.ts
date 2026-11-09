import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
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
 *  the rest of the page from the accessibility tree, so a role query would
 *  not find it. */
const wallPressed = (page: Page) =>
  page.locator(
    '#root [role="group"][aria-label="Player"] button[aria-pressed="true"]',
  );
const wallList = (page: Page) =>
  page.locator('#root [role="list"][aria-label="Default views"]');
const wallBusy = (page: Page) => page.locator("#root [data-stale]");
/** The frame drawn before the shell's chunk has loaded. */
const chunkFrame = (page: Page) => page.getByTestId("lightbox-chunk-pending");
/** The shell's own dialog while it is pending — named for the cut, like the
 *  chunk frame, which this leaves out. */
const shellPending = (page: Page, label: string) =>
  page
    .getByRole("dialog", { name: `Loading ${label}` })
    .and(page.locator(':not([data-testid="lightbox-chunk-pending"])'));
const marks = (dialog: Locator) =>
  dialog.locator("[data-court-stage] [data-viz-mark]");

/** The shell's chunk, as webpack splits it: its own file and a vendors file
 *  it shares; neither is the page's bundle. */
const isShellChunk = (url: string) =>
  url.endsWith(".js") && !url.endsWith("/bundle.js");

/** Holds the shell's chunk back so the frame drawn before it is on screen
 *  long enough to look at; the page's own bundle is left alone. */
async function slowShellChunk(page: Page, ms: number) {
  await page.route("**/*.js", async (route) => {
    if (!isShellChunk(route.request().url())) return route.continue();
    await new Promise((done) => setTimeout(done, ms));
    await route.continue();
  });
}

const focusIsOnBody = (page: Page) =>
  page.evaluate(() => document.activeElement === document.body);

test("one dialog per opening: the frame before the chunk (a modal, Esc and Tab kept inside), the shell pending, then the court — and Esc puts focus back on the card, on the first open and on a card switch", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await slowShellChunk(page, 1_500);
  // A slower server than the chunk, so the shell's pending frame is on
  // screen for a while between the chunk landing and the court.
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=4000`);
  const wall = page.getByRole("list", { name: "Default views" });
  await expect(wall).toBeVisible();
  const serveCard = wall.getByRole("link", {
    name: /^First serves, Avery Kim/,
  });
  const rallyCard = wall.getByRole("link", { name: /^Rally shots, Avery Kim/ });

  // The first open of the session: before the shell's chunk has loaded, the
  // frame by hand — a modal named for the cut with the status inside, and
  // the one dialog on the page. It takes focus.
  await serveCard.click();
  const frame = chunkFrame(page);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveAttribute("aria-modal", "true");
  await expect(
    frame.getByRole("status", { name: "Loading Serve placement" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(frame).toBeFocused();
  // A layer open above it keeps Esc (a header menu, say): the frame stays.
  await page.evaluate(() => {
    const layer = document.createElement("div");
    layer.id = "fake-layer";
    layer.setAttribute("role", "menu");
    layer.dataset.state = "open";
    document.body.append(layer);
  });
  await page.keyboard.press("Escape");
  await expect(frame).toBeVisible();
  await page.evaluate(() => document.getElementById("fake-layer")?.remove());
  // Tab stays inside, on Close, either way round.
  await page.keyboard.press("Tab");
  await expect(frame.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(frame.getByRole("button", { name: "Close" })).toBeFocused();
  // Esc — through Close's tooltip, open since Tab landed there — closes the
  // frame, and focus goes back to the card.
  await page.keyboard.press("Escape");
  await expect(frame).toHaveCount(0);
  await expect(serveCard).toBeFocused();
  expect(new URL(page.url()).searchParams.get("cut")).toBeNull();

  // Again, and this time let it land. The shell arrives pending: ONE
  // dialog, named for the cut, the status inside, no court, no enter fade
  // (it replaced the frame). The same dialog then shows the court.
  await serveCard.click();
  await expect(frame).toBeVisible();
  const loadingServe = shellPending(page, "Serve placement");
  await expect(loadingServe).toBeVisible({ timeout: 8_000 });
  await expect(frame).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(1);
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
  await expect(serve).toBeVisible({ timeout: 8_000 });
  await expect(serve).toHaveAttribute("data-opening", "one");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(marks(serve).first()).toBeVisible();
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
  const loadingRally = shellPending(page, "Rally placement");
  await expect(loadingRally).toBeVisible();
  await expect(loadingRally).toHaveClass(/animate-in/);
  await expect(page.getByRole("dialog", { name: "First serves" })).toHaveCount(
    0,
  );
  await expect(page.locator("[data-court-stage]")).toHaveCount(0);
  await loadingRally.evaluate((el) => el.setAttribute("data-opening", "two"));
  const rally = page.getByRole("dialog", { name: "Rally shots" });
  await expect(rally).toBeVisible({ timeout: 8_000 });
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

test("a filter ticked inside the card keeps the court (optimistic); the card closed with it on and reopened before the close lands is pending, never the filtered court as the default", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=1200`);
  const wall = page.getByRole("list", { name: "Default views" });
  const serveCard = wall.getByRole("link", {
    name: /^First serves, Avery Kim/,
  });
  await serveCard.click();
  const serve = page.getByRole("dialog", { name: "First serves" });
  await expect(serve).toBeVisible({ timeout: 8_000 });
  const all = await marks(serve).count();
  expect(all).toBeGreaterThan(0);

  // Tick Zone T in the Filters panel: the option reads ticked at once and
  // the court stays (no pending frame — this court was asked for too),
  // then follows the server.
  await serve.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await expect(panel).toBeVisible();
  // Zone is a checklist: each option a checkbox named for the zone and its
  // count ("T 8").
  const zoneT = panel.getByRole("checkbox", { name: /^T\b/ });
  await expect(zoneT).toBeVisible();
  await zoneT.click();
  await expect(zoneT).toBeChecked();
  await expect(page.getByRole("dialog", { name: /^Loading/ })).toHaveCount(0);
  expect(await marks(serve).count()).toBe(all);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(serve.locator("[data-viz-filter-strip]")).toContainText("T", {
    timeout: 8_000,
  });
  await expect
    .poll(() => marks(serve).count(), { timeout: 8_000 })
    .toBeLessThan(all);
  expect(new URL(page.url()).searchParams.get("zone")).toBe("t");

  // Close, and reopen the card before the close has landed: the server's
  // last answer is still the filtered court. Pending — then the card's own
  // court, every first serve, no filter named.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await serveCard.click();
  await expect(shellPending(page, "Serve placement")).toBeVisible();
  await expect(page.locator("[data-court-stage]")).toHaveCount(0);
  await expect(serve).toBeVisible({ timeout: 8_000 });
  await expect.poll(() => marks(serve).count(), { timeout: 8_000 }).toBe(all);
  await expect(serve.locator("[data-viz-filter-strip]")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("zone")).toBeNull();

  expect(errors).toEqual([]);
});

test("two options ticked against the option order still land: the store's click order and the server's sorted echo are the same court", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=600`);
  const wall = page.getByRole("list", { name: "Default views" });
  await wall.getByRole("link", { name: /^First serves, Avery Kim/ }).click();
  const serve = page.getByRole("dialog", { name: "First serves" });
  await expect(serve).toBeVisible({ timeout: 8_000 });
  const all = await marks(serve).count();
  expect(all).toBeGreaterThan(0);

  // Wide before T: the store holds [wide, t], the server echoes [t, wide].
  await serve.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await expect(panel).toBeVisible();
  const wide = panel.getByRole("checkbox", { name: /^Wide\b/ });
  const zoneT = panel.getByRole("checkbox", { name: /^T\b/ });
  await wide.click();
  await expect(wide).toBeChecked();
  await zoneT.click();
  await expect(zoneT).toBeChecked();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // The server's answer for both lands as this card's court: never stuck
  // pending, the strip names both, and the URL carries them in option order.
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll("zone").sort(), {
      timeout: 8_000,
    })
    .toEqual(["t", "wide"]);
  await expect(serve.locator("[data-viz-filter-strip]")).toContainText("T", {
    timeout: 8_000,
  });
  await expect(serve.locator("[data-viz-filter-strip]")).toContainText("Wide");
  await expect(shellPending(page, "Serve placement")).toHaveCount(0);
  await expect(page.locator("[data-court-stage]")).toHaveCount(1);
  await expect
    .poll(() => marks(serve).count(), { timeout: 8_000 })
    .toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test("the wall reads busy until the server's cards are the chip's — after a chip click, and after closing a card whose player was switched inside it — and keeps the last cards for its player meanwhile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=700`);
  await expect(wallPressed(page)).toHaveText("You");
  await expect(wallBusy(page)).toHaveCount(0);

  // The chip: pressed at once; the cards dimmed and busy, still yours, with
  // one status naming what is on its way — until the server's cards are
  // the opponents'.
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
  // under the card keeps You AND your cards — the server's cards for the
  // opponents only mark it busy, hidden under the scrim.
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
  await expect(dialog).toBeVisible({ timeout: 8_000 });
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
  await expect(
    wallList(page).locator('a[aria-label^="First serves, Avery Kim"]'),
  ).toHaveCount(1);
  await expect(
    wallList(page).locator('a[aria-label^="First serves, Opponents"]'),
  ).toHaveCount(0);

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
  await expect(serveCard).toBeFocused();
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(
    wall.getByRole("link", { name: /^First serves, Avery Kim/ }),
  ).toBeVisible();
  await expect(wall.getByRole("link", { name: /Opponents/ })).toHaveCount(0);
  await expect(serveCard).toBeFocused();

  expect(errors).toEqual([]);
});

test("a card the other side has nothing for: switched to Opponent inside, the empty court shows, the opener card stays on the wall, and Esc puts focus back on it — never on the body", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&p1serves=1&delay=600`,
  );
  const wall = page.getByRole("list", { name: "Default views" });
  const serveCard = wall.getByRole("link", {
    name: /^First serves, Avery Kim/,
  });
  await expect(serveCard).toBeVisible();

  // The fixture: the opponents served nothing, so their wall has no serve
  // card at all — only their rally shots.
  await page
    .locator('#root [role="group"][aria-label="Player"]')
    .getByRole("button", { name: "Opponent" })
    .click();
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(
    wallList(page).locator('a[aria-label^="Rally shots, Opponents"]'),
  ).toHaveCount(1);
  await expect(
    wallList(page).locator('a[aria-label^="First serves"]'),
  ).toHaveCount(0);
  await page
    .locator('#root [role="group"][aria-label="Player"]')
    .getByRole("button", { name: "You" })
    .click();
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(serveCard).toBeVisible();

  // Your serve card, switched to Opponent inside: the court is honest about
  // the nothing, the wall under it still holds your serve card.
  await serveCard.click();
  const dialog = page.getByRole("dialog", { name: "First serves" });
  await expect(dialog).toBeVisible({ timeout: 8_000 });
  await dialog
    .getByRole("group", { name: "Player" })
    .getByRole("button", { name: "Opponent" })
    .click();
  await expect(dialog).toContainText(
    /No serves (match these filters|recorded for Opponents yet)/,
    {
      timeout: 5_000,
    },
  );
  await expect(marks(dialog)).toHaveCount(0);
  await expect(
    wallList(page).locator('a[aria-label^="First serves, Avery Kim"]'),
  ).toHaveCount(1);

  // Esc: focus on that card, not on the body.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(serveCard).toBeFocused();
  expect(await focusIsOnBody(page)).toBe(false);
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(serveCard).toBeFocused();

  expect(errors).toEqual([]);
});

test("a shell chunk that fails to load reaches the boundary, and Try again loads it: the lazy forgets the failure", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  // Every request for the shell's chunk fails until the boundary has shown
  // its message; after that they go through. The requests are logged, so a
  // retry can be told from a cached failure.
  let blocking = true;
  const requested: string[] = [];
  await page.route("**/*.js", async (route) => {
    const url = route.request().url();
    if (!isShellChunk(url)) return route.continue();
    requested.push(url);
    if (!blocking) return route.continue();
    await route.abort("failed");
  });
  // A slow "server": its answer resets the boundary (new children, as a
  // server render does on the page), so it must not land before the
  // message has been seen.
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=3000`);
  const wall = page.getByRole("list", { name: "Default views" });
  await wall.getByRole("link", { name: /^First serves, Avery Kim/ }).click();

  // The page's own boundary (`WidgetBoundary`) takes the failed import.
  const retry = page.getByRole("status").filter({
    hasText: "Couldn’t load visualizations.",
  });
  await expect(retry).toBeVisible({ timeout: 8_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(chunkFrame(page)).toHaveCount(0);
  const failed = [...requested];
  expect(failed.length).toBeGreaterThan(0);
  blocking = false;

  // Try again: the page is rendered again for the same URL (the card is
  // still open in it), the import is asked for afresh — the same files,
  // requested again, not a rejection remembered — and the court lands.
  await retry.getByRole("button", { name: "Try again" }).click();
  const serve = page.getByRole("dialog", { name: "First serves" });
  await expect(serve).toBeVisible({ timeout: 10_000 });
  await expect(marks(serve).first()).toBeVisible();
  await expect(retry).toHaveCount(0);
  for (const url of failed) {
    expect(requested.filter((r) => r === url).length).toBeGreaterThanOrEqual(2);
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("list", { name: "Default views" })).toBeVisible();
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
  await expect(chunkFrame(page)).toHaveCount(0);
  await expect(
    page.locator('[role="status"]', { hasText: /^Loading/ }),
  ).toHaveCount(0);
  await expect(page.locator("[data-pending-bar]")).toHaveCount(0);
  await expect(wallBusy(page)).toHaveCount(0);
  expect(errors).toEqual([]);
});
