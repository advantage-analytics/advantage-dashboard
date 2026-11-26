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
    name: /^All serves, Avery Kim/,
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
  const serve = page.getByRole("dialog", { name: "All serves" });
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
  // shell (its chunk cached now, so with an entrance of its own) pending for
  // THAT cut — never the serve court under the rally card's filters — then
  // the rally court in the same dialog, and Esc lands focus on the rally
  // card. Opening draws no animation, so no frame of it shows one.
  await page.evaluate(() => {
    const w = window as unknown as { sawEnter: boolean; enterDone: boolean };
    w.sawEnter = false;
    w.enterDone = false;
    const end = performance.now() + 800;
    const look = () => {
      const box = document.querySelector("[data-lightbox-box]");
      if (
        box !== null &&
        (box.getAnimations().length > 0 || box.classList.contains("animate-in"))
      )
        w.sawEnter = true;
      if (performance.now() < end) requestAnimationFrame(look);
      else w.enterDone = true;
    };
    requestAnimationFrame(look);
  });
  await rallyCard.click();
  const loadingRally = shellPending(page, "Rally placement");
  await expect(loadingRally).toBeVisible();
  await page.waitForFunction(
    () => (window as unknown as { enterDone: boolean }).enterDone,
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { sawEnter: boolean }).sawEnter,
    ),
  ).toBe(false);
  await expect(page.getByRole("dialog", { name: "All serves" })).toHaveCount(0);
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
    name: /^All serves, Avery Kim/,
  });
  await serveCard.click();
  const serve = page.getByRole("dialog", { name: "All serves" });
  await expect(serve).toBeVisible({ timeout: 8_000 });
  const all = await marks(serve).count();
  expect(all).toBeGreaterThan(0);

  // Tick Zone T in the Filters panel: the option reads ticked at once and
  // the court stays (no pending frame — this court was asked for too),
  // then follows the server.
  await serve.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await expect(panel).toBeVisible();
  // Zone is one lane at a time: a segmented row, Any · Wide · Body · T.
  const zoneT = panel.getByRole("radio", { name: "T", exact: true });
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

test("two options held against the option order still land: the store's order and the server's sorted echo are the same court", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  // Wide before T: the store holds [wide, t], the server echoes [t, wide].
  // The Filters menu picks one lane at a time now, so two arrive the way a
  // Statistics row or a shared link brings them: in the URL.
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&cut=serve&zone=wide&zone=t&delay=600`,
  );
  const serve = page.getByRole("dialog", { name: "All serves" });
  await expect(serve).toBeVisible({ timeout: 8_000 });

  // The server's answer for both lands as this card's court: never stuck
  // pending, and the strip names both.
  await expect(serve.locator("[data-viz-filter-strip]")).toContainText("T", {
    timeout: 8_000,
  });
  await expect(serve.locator("[data-viz-filter-strip]")).toContainText("Wide");
  await expect(shellPending(page, "Serve placement")).toHaveCount(0);
  await expect(page.locator("[data-court-stage]")).toHaveCount(1);
  await expect
    .poll(() => marks(serve).count(), { timeout: 8_000 })
    .toBeGreaterThan(0);
  expect(new URL(page.url()).searchParams.getAll("zone").sort()).toEqual([
    "t",
    "wide",
  ]);

  // Two lanes are no one segment: Zone lights none of them, not even Any.
  await serve.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  const zone = panel.getByRole("radiogroup").first();
  for (const name of ["Any", "Wide", "Body", "T"])
    await expect(
      zone.getByRole("radio", { name, exact: true }),
    ).toHaveAttribute("aria-checked", "false");

  expect(errors).toEqual([]);
});

test("the wall reads busy until the server's cards are the chip's — after a chip click, and after closing a card whose player was switched inside it — and keeps the last cards for its player meanwhile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=700`);
  await expect(wallPressed(page)).toHaveText("Kim");
  await expect(wallBusy(page)).toHaveCount(0);

  // The chip: pressed at once; the cards dimmed and busy, still yours, with
  // one status naming what is on its way — until the server's cards are
  // the opponents'.
  await page
    .locator('#root [role="group"][aria-label="Player"]')
    .getByRole("button", { name: "Opponent" })
    .click();
  await expect(wallPressed(page)).toHaveText("Opponents");
  await expect(wallBusy(page)).toHaveAttribute("aria-busy", "true");
  await expect(wallBusy(page)).toHaveClass(/pointer-events-none/);
  await expect(
    wallList(page).locator('a[aria-label^="All serves, Avery Kim"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('#root [role="status"]', {
      hasText: "Loading the opponents’ courts",
    }),
  ).toHaveCount(1);
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(
    wallList(page).locator('a[aria-label^="All serves, Opponents"]'),
  ).toHaveCount(1);
  await expect(page.locator('#root [role="status"]')).toHaveCount(0);

  // Back to You, then open a card and switch its player inside: the wall
  // under the card keeps You AND your cards — the server's cards for the
  // opponents only mark it busy, hidden under the scrim.
  await page
    .locator('#root [role="group"][aria-label="Player"]')
    .getByRole("button", { name: "Kim", exact: true })
    .click();
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  const wall = page.getByRole("list", { name: "Default views" });
  const serveCard = wall.getByRole("link", {
    name: /^All serves, Avery Kim/,
  });
  await serveCard.click();
  const dialog = page.getByRole("dialog", { name: "All serves" });
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
  await expect(wallPressed(page)).toHaveText("Kim");
  await expect(wallBusy(page)).toHaveAttribute("aria-busy", "true");
  await expect(
    wallList(page).locator('a[aria-label^="All serves, Avery Kim"]'),
  ).toHaveCount(1);
  await expect(
    wallList(page).locator('a[aria-label^="All serves, Opponents"]'),
  ).toHaveCount(0);

  // Close: the wall on its own player, busy until its cards come back, then
  // settled on You with your cards; focus on the card that opened it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(wallPressed(page)).toHaveText("Kim");
  await expect(wallBusy(page)).toHaveAttribute("aria-busy", "true");
  const params = new URL(page.url()).searchParams;
  expect(params.get("cut")).toBeNull();
  expect(params.get("player")).toBeNull();
  expect(params.get("tab")).toBe("visualizations");
  await expect(serveCard).toBeFocused();
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(
    wall.getByRole("link", { name: /^All serves, Avery Kim/ }),
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
    name: /^All serves, Avery Kim/,
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
    wallList(page).locator('a[aria-label^="All serves"]'),
  ).toHaveCount(0);
  await page
    .locator('#root [role="group"][aria-label="Player"]')
    .getByRole("button", { name: "Kim", exact: true })
    .click();
  await expect(wallBusy(page)).toHaveCount(0, { timeout: 5_000 });
  await expect(serveCard).toBeVisible();

  // Your serve card, switched to Opponent inside: the court is honest about
  // the nothing, the wall under it still holds your serve card.
  await serveCard.click();
  const dialog = page.getByRole("dialog", { name: "All serves" });
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
    wallList(page).locator('a[aria-label^="All serves, Avery Kim"]'),
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
  await wall.getByRole("link", { name: /^All serves, Avery Kim/ }).click();

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
  const serve = page.getByRole("dialog", { name: "All serves" });
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

test("Saved: the workspace's views over the season; opening one names it, and closing lands back on Saved", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=50`);
  await expect(wallList(page)).toBeVisible();

  await page.getByRole("button", { name: "Saved" }).click();
  const saved = page.locator('#root [role="list"][aria-label="Saved views"]');
  await expect(saved).toBeVisible();
  // The Saved wall lists one player's views, the You | Opponent chip's.
  await expect(saved.getByRole("listitem")).toHaveCount(1);
  await expect(saved).toContainText("Second serves");
  await expect(saved).not.toContainText("Their rally shots");
  await page.getByRole("button", { name: "Opponents", exact: true }).click();
  await expect(saved.getByRole("listitem")).toHaveCount(1);
  await expect(saved).toContainText("Their rally shots");
  await page.getByRole("button", { name: "Kim", exact: true }).click();
  await expect(saved).toContainText("Second serves");
  if (process.env.SEASON_SAVED_SHOT)
    await page.screenshot({ path: process.env.SEASON_SAVED_SHOT });

  await saved.getByRole("link", { name: /^Second serves/ }).click();
  const dialog = page.getByRole("dialog", { name: /Second serves/ });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/view=v-second/);
  if (process.env.SEASON_SAVED_SHOT)
    await page.screenshot({
      path: process.env.SEASON_SAVED_SHOT.replace(/\.png$/, "-open.png"),
    });

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(saved).toBeVisible();
  await expect(page).not.toHaveURL(/view=/);
  expect(errors).toEqual([]);
});

test("Saved, a view's link: the page opens on Saved with the view's court; a workspace with none says so", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&delay=50&cut=serve&ball=second&view=v-second`,
  );
  await expect(
    page.getByRole("dialog", { name: /Second serves/ }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.locator('#root [role="list"][aria-label="Saved views"]'),
  ).toBeVisible();

  await page.goto(`${origin}${PROFILE}?tab=visualizations&nosaved=1`);
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(page.getByText("No saved views yet.")).toBeVisible();
});

test("Advanced filters on the season: the sheet over the box, the Video tab's panel without counts, and a Show reaches the server", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&delay=300`);
  const wall = page.getByRole("list", { name: "Default views" });
  await wall.getByRole("link", { name: /^All serves, Avery Kim/ }).click();
  const serve = page.getByRole("dialog", { name: "All serves" });
  await expect(serve).toBeVisible({ timeout: 8_000 });
  const trigger = serve.getByRole("button", { name: "Filters", exact: true });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await panel.getByRole("button", { name: /^Advanced filters/ }).click();
  // The popover closes and the drawer opens over the box, focus in it.
  await expect(panel).toHaveCount(0);
  const drawer = serve.getByRole("complementary", {
    name: "Advanced filters",
  });
  await expect(drawer).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document
            .getElementById("viz-advanced-drawer")
            ?.contains(document.activeElement) === true,
      ),
    )
    .toBe(true);
  const sections = drawer.locator("[data-section]");
  expect(await sections.count()).toBeGreaterThan(0);
  const header = sections.first().getByRole("button").first();
  // The accordion may open on its first section already.
  if ((await header.getAttribute("aria-expanded")) !== "true")
    await header.click();
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await sections
    .first()
    .locator('button[aria-pressed="false"]')
    .first()
    .click();
  // No count on the season: the primary names the noun alone, and the
  // footer carries no "N of M" line.
  const show = drawer.getByRole("button", { name: "Show serves" });
  await expect(show).toBeEnabled();
  await expect(drawer).not.toContainText(/\d+ of \d+/);
  await show.click();
  await expect(page).toHaveURL(/[?&]vf=/);
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(serve.locator("[data-viz-filter-strip]")).toBeVisible({
    timeout: 8_000,
  });
  expect(errors).toEqual([]);
});

test('a season mark names its match — "vs Jordan Lee · Nov 3" and where in it — and its second click opens that match\'s Video tab on that point; Back comes back to the card', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });

  // No video for the match: the focus alone, and a second click stays.
  await page.goto(`${origin}${PROFILE}?tab=visualizations&cut=serve&delay=50`);
  let dialog = page.getByRole("dialog", { name: "All serves" });
  let mark = marks(dialog).first();
  await expect(mark).toBeVisible();
  await mark.hover({ force: true });
  const readout = dialog.locator("[data-viz-readout]");
  // The hover pill: no play badge without video.
  await expect(readout.locator("[data-viz-readout-play]")).toHaveCount(0);
  await mark.dispatchEvent("click");
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  // The pinned card names the match and where in it.
  await expect(readout.locator("[data-viz-readout-match]")).toHaveText(
    "vs Jordan Lee · Nov 3",
  );
  await expect(readout).toContainText(
    /Set \d+ · Game \d+ · (Kim|Jordan Lee) serving/,
  );
  await expect(readout.locator("[data-viz-readout-no-video]")).toHaveText(
    "No video for this point",
  );
  await mark.dispatchEvent("click");
  await expect(page).toHaveURL(new RegExp(`${PROFILE}\\?`));
  await expect(mark).toHaveAttribute("aria-pressed", "true");

  // With video: focus, then watch — the match's own Video tab, one point.
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&cut=serve&delay=50&video=1`,
  );
  dialog = page.getByRole("dialog", { name: "All serves" });
  mark = marks(dialog).first();
  await mark.hover({ force: true });
  await expect(readout.locator("[data-viz-readout-play]")).toHaveCount(1);
  await mark.dispatchEvent("click");
  await page.mouse.move(5, 5);
  await expect(
    readout.getByRole("button", { name: "Watch point" }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("season-readout.png"),
  });
  await mark.dispatchEvent("click");
  await expect(page).toHaveURL(/\/dashboard\/matches\/m-1\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("tab")).toBe("film");
  expect(url.searchParams.get("pn")).toMatch(/^\d+$/);
  expect(url.searchParams.get("pnl")).toBe("All serves");
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${PROFILE}\\?.*cut=serve`));
  await expect(page.getByRole("dialog", { name: "All serves" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("the chart menu: Scatter · Heat · Zones in the season's card, no band rows; Heat reaches the server in the same dialog, and back", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&hands=1&delay=300`);
  const wall = page.getByRole("list", { name: "Default views" });
  await wall.getByRole("link", { name: /^All serves, Avery Kim/ }).click();
  const serve = page.getByRole("dialog", { name: "All serves" });
  await expect(serve).toBeVisible({ timeout: 8_000 });
  const all = await marks(serve).count();
  expect(all).toBeGreaterThan(0);
  await serve.evaluate((el) => el.setAttribute("data-mark", "first"));

  await serve.getByRole("button", { name: "Scatter" }).click();
  for (const name of ["Scatter", "Heat", "Zones"])
    await expect(
      page.getByRole("menuitemradio", { name: new RegExp(name) }),
    ).toBeVisible();
  // No band rows and no band editor on the season.
  await expect(page.getByText("Edit bands…")).toHaveCount(0);
  await page.getByRole("menuitemradio", { name: /Heat/ }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("chart"))
    .toBe("heat");
  // Heat draws the ramp, not the marks — once the server has answered.
  await expect.poll(() => marks(serve).count(), { timeout: 8_000 }).toBe(0);
  await expect(serve.getByRole("button", { name: "Heat" })).toBeVisible();
  // The same dialog throughout (one per opening, never remounted).
  await expect(serve).toHaveAttribute("data-mark", "first");
  await expect(page.getByRole("dialog")).toHaveCount(1);

  // Zones, then back to Scatter: every mark again.
  await serve.getByRole("button", { name: "Heat" }).click();
  await page.getByRole("menuitemradio", { name: /Zones/ }).click();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("chart"))
    .toBe("zones");
  await serve.getByRole("button", { name: "Zones" }).click();
  await page.getByRole("menuitemradio", { name: /Scatter/ }).click();
  await expect.poll(() => marks(serve).count(), { timeout: 8_000 }).toBe(all);
  expect(new URL(page.url()).searchParams.get("chart")).toBeNull();
  await expect(serve).toHaveAttribute("data-mark", "first");
  expect(errors).toEqual([]);
});

test("Matches: a row in Filters opens the Matches sheet; its Won, Opponent plays and Surface menus and ticks are a draft that Show applies, the strip names them, Clear filter lets go", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&hands=1&delay=300`);
  const wall = page.getByRole("list", { name: "Default views" });
  await wall.getByRole("link", { name: /^All serves, Avery Kim/ }).click();
  const serve = page.getByRole("dialog", { name: "All serves" });
  await expect(serve).toBeVisible({ timeout: 8_000 });
  const all = await marks(serve).count();

  // The panel holds shot filters only: no "Opponent plays", no checklist of
  // matches — one "Matches" row above "Advanced filters".
  await serve.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Opponent plays", { exact: true })).toHaveCount(
    0,
  );
  await expect(panel.getByRole("checkbox", { name: /^vs / })).toHaveCount(0);
  const matchesRow = panel.getByRole("button", { name: /^Matches/ });
  await expect(matchesRow).toContainText("All 3");
  const order = await panel.evaluate((el) => {
    const text = el.textContent ?? "";
    return [text.indexOf("Matches"), text.indexOf("Advanced filters")];
  });
  expect(order[0]).toBeGreaterThan(-1);
  expect(order[0]).toBeLessThan(order[1]);

  // The row opens the sheet: newest first under month headings, each row
  // "vs …", its result mark, score and short date.
  await matchesRow.click();
  const sheet = page.locator("#viz-matches-sheet");
  await expect(sheet).toBeVisible();
  await expect(panel).toHaveCount(0);
  const rows = sheet.getByRole("checkbox", { name: /^vs / });
  await expect(rows).toHaveCount(3);
  expect(
    (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()),
  ).toEqual([
    "vs Jordan Lee Won 6–3, 6–4 Nov 3",
    "vs Sam Ortiz Lost 4–6, 6–7 Oct 20",
    "vs Riley Park Won 7–5, 6–2 Oct 6",
  ]);
  await expect(sheet.getByText("November", { exact: true })).toBeVisible();
  await expect(sheet.getByText("October", { exact: true })).toBeVisible();
  await expect(sheet.getByText("All 3 matches")).toBeVisible();
  const show = sheet.getByRole("button", { name: /^Show / });
  await expect(show).toHaveText(`Show ${all} serves`);
  await expect(show).toBeDisabled();

  // Won (the result menu): Won leaves two matches; its count says so
  // before the pick.
  await sheet.getByRole("button", { name: "Won", exact: true }).click();
  const resultMenu = page.getByRole("menu", { name: "Won" });
  await expect(
    resultMenu.getByRole("menuitemradio", { name: /Won/ }),
  ).toContainText("2");
  await resultMenu.getByRole("menuitemradio", { name: /Won/ }).click();
  await expect(sheet.getByRole("button", { name: "Won" })).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(sheet.getByText("2 of 3 matches")).toBeVisible();
  // A draft: nothing has reached the court or the URL yet.
  expect(new URL(page.url()).searchParams.get("vres")).toBeNull();

  // Surface: Hard keeps both won matches (Outdoor and Indoor Hard Court).
  await sheet.getByRole("button", { name: "Surface" }).click();
  await page
    .getByRole("menu", { name: "Surface" })
    .getByRole("menuitemradio", { name: /^Hard/ })
    .click();
  await expect(rows).toHaveCount(2);

  // Tick one: only it counts; "Use all shown" would let it go.
  await rows.nth(1).click();
  await expect(rows.nth(1)).toBeChecked();
  await expect(sheet.getByText("1 of 2 picked")).toBeVisible();
  await expect(
    sheet.getByRole("button", { name: "Use all shown" }),
  ).toBeVisible();
  await expect(show).toBeEnabled();
  await show.click();

  await expect(sheet).toHaveCount(0);
  await expect
    .poll(() => {
      const q = new URL(page.url()).searchParams;
      return [q.get("vres"), q.get("vsurf"), q.getAll("vm").join(",")];
    })
    .toEqual(["won", "hard", "m-3"]);
  const strip = serve.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText("Won");
  await expect(strip).toContainText("Hard");
  await expect(strip).toContainText("1 match");
  await expect
    .poll(() => marks(serve).count(), { timeout: 8_000 })
    .toBeLessThan(all);

  // The Matches row sums it up the next time Filters opens.
  await serve.getByRole("button", { name: "Filters" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Filter the court" })
      .getByRole("button", { name: /^Matches/ }),
  ).toContainText("Won · Hard · 1 of 3");
  await page.keyboard.press("Escape");

  // Clear filter: every match again, no season key left in the URL.
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect.poll(() => marks(serve).count(), { timeout: 8_000 }).toBe(all);
  const url = new URL(page.url()).searchParams;
  for (const key of ["vopp", "vres", "vsurf", "vm"])
    expect(url.has(key)).toBe(false);

  // Closing drops them, and the wall's links never carry them.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  for (const href of await wall
    .getByRole("link")
    .evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? "")))
    expect(href).not.toMatch(/[?&](vopp|vres|vsurf|vm)=/);
  expect(errors).toEqual([]);
});

test("with the other side streamed in, the wall's You | Opponent swaps at once: no server answer, the URL still follows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  // A slow server (4s), so a switch that waited for it would show busy.
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&otherside=1&delay=4000`,
  );
  const wall = page.getByRole("list", { name: "Default views" });
  await expect(wall.getByRole("link").first()).toBeVisible();
  const landed = await page.locator("main").getAttribute("data-landed");
  // Let the streamed side land (50ms in the harness).
  await page.waitForTimeout(300);
  await wallPressed(page).waitFor();
  await page
    .locator('#root [role="group"][aria-label="Player"]')
    .getByRole("button", { name: "Opponent" })
    .click();
  // The opponents' cards, at once and not busy — long before the 4s answer.
  await expect(
    wall.getByRole("link", { name: /, Opponents:/ }).first(),
  ).toBeVisible({ timeout: 1_000 });
  await expect(wallBusy(page)).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("player")).toBe("opponent");
  // Nothing went back to the server for it.
  await expect(page.locator("main")).toHaveAttribute(
    "data-landed",
    landed ?? "",
  );
  // And back to You, as fast.
  await page
    .locator('#root [role="group"][aria-label="Player"]')
    .getByRole("button", { name: "Kim", exact: true })
    .click();
  await expect(
    wall.getByRole("link", { name: /, Avery Kim:/ }).first(),
  ).toBeVisible({ timeout: 1_000 });
  await expect(wallBusy(page)).toHaveCount(0);
});

test("the Matches sheet throws its draft away on Esc, and its search only finds a row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&hands=1&delay=100`);
  const wall = page.getByRole("list", { name: "Default views" });
  await wall.getByRole("link", { name: /^All serves, Avery Kim/ }).click();
  const serve = page.getByRole("dialog", { name: "All serves" });
  await expect(serve).toBeVisible({ timeout: 8_000 });
  await serve.getByRole("button", { name: "Filters" }).click();
  await page
    .getByRole("dialog", { name: "Filter the court" })
    .getByRole("button", { name: /^Matches/ })
    .click();
  const sheet = page.locator("#viz-matches-sheet");
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("searchbox", { name: "Search opponents" })
    .fill("ortiz");
  const rows = sheet.getByRole("checkbox", { name: /^vs / });
  await expect(rows).toHaveCount(1);
  // Search narrows the list, not what counts.
  await expect(sheet.getByText("All 3 matches")).toBeVisible();
  await sheet
    .getByRole("searchbox", { name: "Search opponents" })
    .fill("nobody");
  await expect(sheet.getByText("No opponent matches “nobody”.")).toBeVisible();
  await sheet.getByRole("searchbox", { name: "Search opponents" }).fill("");
  await rows.first().click();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  expect(new URL(page.url()).searchParams.getAll("vm")).toEqual([]);
});

test("the page's match scope (?sm=): the wall is drawn over the scoped matches, a card opens with its Matches row at that scope, and closing it leaves the scope in the URL", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  const wall = page.getByRole("list", { name: "Default views" });
  const serveCard = wall.getByRole("link", { name: /^All serves, Avery Kim/ });
  const serve = page.getByRole("dialog", { name: "All serves" });

  // The whole season first: what the card and the court count unscoped.
  await page.goto(`${origin}${PROFILE}?tab=visualizations&hands=1&delay=100`);
  const wholeCard = await serveCard.innerText();
  await serveCard.click();
  await expect(marks(serve).first()).toBeVisible({ timeout: 8_000 });
  const all = await marks(serve).count();

  // Two of the three matches picked on the page.
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&hands=1&delay=100&sm=m-1&sm=m-3`,
  );
  await expect(serveCard).toBeVisible({ timeout: 8_000 });
  expect(await serveCard.innerText()).not.toBe(wholeCard);
  // The card's link carries the scope as the opened card's own Matches row.
  const href = new URL((await serveCard.getAttribute("href"))!, origin);
  expect(href.searchParams.getAll("vm")).toEqual(["m-1", "m-3"]);
  expect(href.searchParams.getAll("sm")).toEqual(["m-1", "m-3"]);

  await serveCard.click();
  await expect(marks(serve).first()).toBeVisible({ timeout: 8_000 });
  await expect
    .poll(() => {
      const q = new URL(page.url()).searchParams;
      return [q.getAll("vm").join(","), q.getAll("sm").join(",")];
    })
    .toEqual(["m-1,m-3", "m-1,m-3"]);
  const scoped = await marks(serve).count();
  expect(scoped).toBeLessThan(all);
  await expect(serve.locator("[data-viz-filter-strip]")).toContainText(
    "2 matches",
  );
  await serve.getByRole("button", { name: "Filters" }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Filter the court" })
      .getByRole("button", { name: /^Matches/ }),
  ).toContainText("2 of 3");
  await page.keyboard.press("Escape");

  // Closing: the card's own row leaves the URL, the page's scope stays, and
  // the wall is still the scoped one.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect
    .poll(() => {
      const q = new URL(page.url()).searchParams;
      return [q.has("cut"), q.has("vm"), q.getAll("sm").join(",")];
    })
    .toEqual([false, false, "m-1,m-3"]);
  const scopedHref = new URL((await serveCard.getAttribute("href"))!, origin);
  expect(scopedHref.searchParams.getAll("vm")).toEqual(["m-1", "m-3"]);
  expect(errors).toEqual([]);
});

test("Clear filter on a card under the page's match scope returns its Matches row to the PAGE scope, not the whole season", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  const wall = page.getByRole("list", { name: "Default views" });
  const serveCard = wall.getByRole("link", { name: /^All serves, Avery Kim/ });
  const serve = page.getByRole("dialog", { name: "All serves" });

  // The page scoped to m-1 and m-3; the card narrowed further, to m-1 alone.
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&hands=1&delay=100&sm=m-1&sm=m-3`,
  );
  await expect(serveCard).toBeVisible({ timeout: 8_000 });
  const href = new URL((await serveCard.getAttribute("href"))!, origin);
  href.searchParams.delete("vm");
  href.searchParams.append("vm", "m-1");
  await page.goto(href.toString());
  await expect(marks(serve).first()).toBeVisible({ timeout: 8_000 });
  const strip = serve.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText("1 match");

  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect
    .poll(() => {
      const q = new URL(page.url()).searchParams;
      return [q.getAll("vm").join(","), q.getAll("sm").join(",")];
    })
    .toEqual(["m-1,m-3", "m-1,m-3"]);
  await expect(strip).toContainText("2 matches");
  expect(errors).toEqual([]);
});

test("the title row's \"N of M matches\" picker: a dialog of the sheet's own draft, Show writes the page scope and closes, and the facts line's Show all clears it", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1280, height: 860 });
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&hands=1&picker=1&delay=100`,
  );
  const trigger = page.getByRole("button", { name: "3 of 3 matches" });
  await expect(trigger).toBeVisible({ timeout: 8_000 });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Which matches" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Matches" })).toBeVisible();
  await expect(dialog).toContainText("For Statistics and Visualizations");
  // The sheet's three menus, and its rows by month: "vs", score, date.
  // The board's trigger words: Won · Opponent plays · Surface.
  for (const name of ["Won", "Opponent plays", "Surface"])
    await expect(
      dialog.getByRole("button", { name, exact: true }),
    ).toBeVisible();
  const rows = dialog.getByRole("checkbox");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("vs Jordan Lee");
  await expect(rows.first()).toContainText("6–3, 6–4");
  await expect(rows.first()).toContainText("Nov 3");
  await expect(dialog).toContainText("October");
  const show = dialog.getByRole("button", { name: /^Show \d+ match/ });
  await expect(show).toBeDisabled();
  await expect(
    dialog.getByRole("button", { name: "Clear all" }),
  ).toBeDisabled();

  // A menu inside the popover keeps it open: Won leaves two.
  await dialog.getByRole("button", { name: "Won", exact: true }).click();
  await page.getByRole("menuitemradio", { name: /^Won/ }).click();
  await expect(dialog).toBeVisible();
  await expect(rows).toHaveCount(2);
  await expect(dialog).toContainText("2 of 3 matches");
  await expect(show).toHaveText("Show 2 matches");
  await show.click();

  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("sres"))
    .toBe("won");
  await expect(
    page.getByRole("button", { name: "2 of 3 matches" }),
  ).toBeVisible();
  const facts = page.locator("[data-match-scope-facts-line]");
  await expect(facts).toContainText("Showing 2 of 3 analyzed matches");
  await expect(facts).toContainText("· Won");

  // Show all clears the scope; the tab and the rest of the URL stay.
  await facts.getByRole("button", { name: "Show all" }).click();
  await expect
    .poll(() => {
      const q = new URL(page.url()).searchParams;
      return [q.has("sres"), q.get("tab")];
    })
    .toEqual([false, "visualizations"]);
  await expect(
    page.getByRole("button", { name: "3 of 3 matches" }),
  ).toBeVisible();
  await expect(facts).not.toContainText("Showing");

  // Esc throws a draft away.
  await page.getByRole("button", { name: "3 of 3 matches" }).click();
  await dialog.getByRole("checkbox").first().click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(new URL(page.url()).searchParams.has("sm")).toBe(false);
  expect(errors).toEqual([]);
});

test("a ?vm= naming no match of the season is ignored: the card opens on the whole season, not stuck loading", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&hands=1&delay=200`);
  const wall = page.getByRole("list", { name: "Default views" });
  await wall.getByRole("link", { name: /^All serves, Avery Kim/ }).click();
  const serve = page.getByRole("dialog", { name: "All serves" });
  await expect(serve).toBeVisible({ timeout: 8_000 });
  const all = await marks(serve).count();
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&hands=1&delay=200&cut=serve&vm=ffff`,
  );
  await expect(serve).toBeVisible({ timeout: 8_000 });
  await expect.poll(() => marks(serve).count(), { timeout: 8_000 }).toBe(all);
  await expect(serve.locator("[data-viz-filter-strip]")).toHaveCount(0);
});

test("a chart switch keeps the season's court exactly where it is — at 100%, and panned and zoomed, through the server's answers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}${PROFILE}?tab=visualizations&hands=1&delay=50`);
  const wall = page.getByRole("list", { name: "Default views" });
  await wall.getByRole("link", { name: /^All serves, Avery Kim/ }).click();
  const serve = page.getByRole("dialog", { name: "All serves" });
  await expect(marks(serve).first()).toBeVisible({ timeout: 8_000 });
  const all = await marks(serve).count();
  const stage = serve.locator("[data-court-stage]");
  // The baseline is the stage at rest, once nothing is animating.
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length === 0))
    .toBe(true);

  // The stage's box and the court's pan/zoom, two frames after the last
  // change so a stage resize (and its re-fit) has had its turn.
  const read = () =>
    page.evaluate(async () => {
      await new Promise((done) =>
        requestAnimationFrame(() => requestAnimationFrame(done)),
      );
      const el = document.querySelector("[data-court-stage]")!;
      const court = el.querySelector<HTMLElement>("[data-court]")!;
      const r = el.getBoundingClientRect();
      return {
        stage: [r.x, r.y, r.width, r.height],
        transform: court.style.transform,
        width: court.style.width,
      };
    });

  async function cycle(expected: Awaited<ReturnType<typeof read>>) {
    for (const [from, to, count] of [
      ["Scatter", "Heat", 0],
      ["Heat", "Zones", 0],
      ["Zones", "Scatter", all],
    ] as const) {
      await serve.getByRole("button", { name: from, exact: true }).click();
      await page
        .getByRole("menuitemradio", { name: new RegExp(`^${to}`) })
        .click();
      // Once the server has answered for this chart.
      await expect(
        serve.getByRole("button", { name: to, exact: true }),
      ).toBeVisible({ timeout: 8_000 });
      await expect
        .poll(() => marks(serve).count(), { timeout: 8_000 })
        .toBe(count);
      expect(await read(), `on ${to}`).toEqual(expected);
    }
  }

  await cycle(await read());

  await serve.getByRole("button", { name: "Zoom in" }).click();
  const s = (await stage.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 - 120, s.y + s.height / 2 + 60, {
    steps: 8,
  });
  await page.mouse.up();
  await cycle(await read());
});

test("the season's opened Approaches court says it assumes right-handed beside its legend when a folded match has no opponent hand, with no filter ticked", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  // `?landing=some`: one folded match against Jordan Lee, no hand on it.
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&cut=approaches&landing=some&delay=50`,
  );
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible({ timeout: 8_000 });
  await expect(marks(dialog).first()).toBeVisible({ timeout: 5_000 });
  // No filter ticked: no strip, and the line still says it.
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  const line = dialog.locator("[data-viz-hand-assumed]");
  await expect(line).toHaveText("assumes right-handed");
  await expect(line).toBeVisible();
  await expect(dialog.getByText(/assumes right-handed/i)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("the season's opened Approaches court names its lanes Left · Middle · Right over opponents of different hands, and their wings over opponents who share one known hand", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  const lanes = async (nethands: string) => {
    await page.goto(
      `${origin}${PROFILE}?tab=visualizations&cut=approaches&nethands=${nethands}&delay=50`,
    );
    const dialog = page.getByRole("dialog", { name: "Approaches" });
    await expect(dialog).toBeVisible({ timeout: 8_000 });
    await expect(marks(dialog).first()).toBeVisible({ timeout: 5_000 });
    const lane = (side: string) =>
      dialog.locator(`[data-approach-lane="${side}"]`);
    return { dialog, lane };
  };

  // A right-hander and a left-hander: no one hand sides the apron, so the
  // thirds are the hitter's own.
  const mixed = await lanes("mixed");
  await expect(mixed.lane("left")).toHaveText("Left");
  await expect(mixed.lane("middle")).toHaveText("Middle");
  await expect(mixed.lane("right")).toHaveText("Right");
  await expect(mixed.dialog.getByText("Their FH", { exact: true })).toHaveCount(
    0,
  );
  await expect(mixed.dialog.getByText("Their BH", { exact: true })).toHaveCount(
    0,
  );
  // Each match still says which wing of THAT opponent an approach went to,
  // so the Statistics pane keeps its per-wing rows.
  await expect(
    mixed.dialog.getByRole("button", { name: /^Their backhand/ }),
  ).toBeVisible();
  await expect(
    mixed.dialog.getByRole("button", { name: /^Their forehand/ }),
  ).toBeVisible();

  // Both opponents left-handed: their backhand is the hitter's left third.
  const lefties = await lanes("left");
  await expect(lefties.lane("left")).toHaveText("Their BH");
  await expect(lefties.lane("middle")).toHaveText("Middle");
  await expect(lefties.lane("right")).toHaveText("Their FH");
  expect(errors).toEqual([]);
});

test("the season's opened Approaches court names the approaches it cannot draw: a season approach with no landing reads in the not-drawn line beside the drawn marks", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&cut=approaches&landing=some&delay=50`,
  );
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible({ timeout: 8_000 });
  // The fixture took the landing off two of the player's approaches.
  const line = dialog.locator("[data-viz-not-drawn]");
  await expect(line).toHaveText("2 not drawn: no landing recorded", {
    timeout: 5_000,
  });
  await expect(line).toBeVisible();
  await expect(marks(dialog).first()).toBeVisible();
  await expect(dialog).not.toContainText("No approaches recorded for");

  // Another cut over the same season: no line.
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&cut=rallyPlacement&landing=some&delay=50`,
  );
  const rally = page.getByRole("dialog").first();
  await expect(rally.locator("[data-court-stage]")).toBeVisible({
    timeout: 8_000,
  });
  await expect(rally.locator("[data-viz-not-drawn]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a season's Placement · Contact · Both switch writes vends in place and keeps focus; Clear keeps it; Serves has none", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(
    `${origin}${PROFILE}?tab=visualizations&cut=rallyPlacement&delay=50`,
  );
  const dialog = page.getByRole("dialog").first();
  await expect(marks(dialog).first()).toBeVisible({ timeout: 8_000 });
  const view = dialog.getByRole("radiogroup", { name: "Court view" });
  await expect(view.getByRole("radio")).toHaveCount(3);
  await expect(view.getByRole("radio", { name: "Placement" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  // Its tooltip: the DS dark tooltip's 12/500 title over an 11px detail.
  const contact = view.getByRole("radio", { name: "Contact" });
  await contact.hover();
  const tipLines = page.locator(
    '[data-slot="tooltip-content"] > span:not([role])',
  );
  await expect(tipLines).toHaveText(["Contact", "Where it was hit"]);
  await expect(tipLines.nth(0)).toHaveCSS("font-size", "12px");
  await expect(tipLines.nth(0)).toHaveCSS("font-weight", "500");
  await expect(tipLines.nth(1)).toHaveCSS("font-size", "11px");
  await contact.click();
  await expect(page).toHaveURL(/vends=contact/);
  await expect(contact).toHaveAttribute("aria-checked", "true");
  await expect(contact).toBeFocused();
  // The same dialog, through the server's answer for the new court.
  await expect(marks(dialog).first()).toBeVisible({ timeout: 8_000 });
  await expect(contact).toBeFocused();

  // A legend pick, then Clear: the view chosen stays.
  await dialog
    .getByRole("group", { name: "Filter by outcome" })
    .getByRole("button")
    .first()
    .click();
  await dialog
    .locator("[data-viz-filter-strip]")
    .getByRole("button", { name: "Clear filter" })
    .click();
  await expect(page).toHaveURL(/vends=contact/);
  await expect(contact).toHaveAttribute("aria-checked", "true");

  await page.goto(`${origin}${PROFILE}?tab=visualizations&cut=serve&delay=50`);
  const serve = page.getByRole("dialog").first();
  await expect(marks(serve).first()).toBeVisible({ timeout: 8_000 });
  await expect(serve.getByRole("group", { name: "Zoom" })).toBeVisible();
  await expect(
    serve.getByRole("radiogroup", { name: "Court view" }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});
