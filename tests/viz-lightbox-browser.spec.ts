import { expect, test } from "@playwright/test";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

let origin: string;
let close: () => Promise<void>;

test.beforeAll(async () => {
  ({ origin, close } = await startStyledHarness(
    "tests/fixtures/viz-lightbox-harness.tsx",
  ));
});

test.afterAll(async () => {
  await close?.();
});

test("a wall card opens the lightbox over the wall, and Esc puts focus back on the card", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots`);
  const card = page.getByRole("link", { name: /^First serves, Avery Kim/ });
  await card.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "First serves" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/cut=serve/);
  await expect(dialog).toContainText(
    /Serve placement · You · \d+ (of \d+ )?in, \d+ of those \d+ won/,
  );
  // Dialog v3 geometry at 1512 × 982.
  const box = (await dialog.boundingBox())!;
  expect(Math.round(box.width)).toBe(1212);
  expect(Math.round(box.y)).toBe(96);
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath("lightbox.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/cut=/);
  await expect(card).toBeFocused();
  expect(errors).toEqual([]);
});

test("a player switched inside the lightbox does not leak onto the wall", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Opponent" }).click();
  await expect(page).toHaveURL(/player=opponent/);
  await expect(dialog).toContainText("Serve placement · Opponent");
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/player=opponent/);
  await expect(page.getByRole("button", { name: "You" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("Watch these N points follows the marks and needs a playable video", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Watch/ })).toHaveCount(0);
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watch`);
  const watch = page.getByRole("button", { name: "Watch these 1 point" });
  await expect(watch).toBeEnabled();
  await watch.click();
  // The Video tab's point set: the matched points by number, named in the
  // lightbox's words.
  await expect(page).toHaveURL(/tab=film/);
  const url = new URL(page.url());
  expect(url.searchParams.get("pn")).toMatch(/^\d+$/);
  // This link is every serve, not the First serves card: the label is the
  // live filters' own name.
  expect(url.searchParams.get("pnl")).toBe("Serve placement");
  // On the card (first serves), the card's name.
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first&fixture=watch`);
  await page.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  expect(new URL(page.url()).searchParams.get("pnl")).toBe("First serves");
});

test("a mark's readout appears on hover and stays inside the court", async ({
  page,
}) => {
  for (const width of [1512, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${origin}/?tab=shots&cut=serve`);
    const stage = page.locator("[data-court-stage]");
    await expect(stage).toBeVisible();
    const mark = stage.locator("[data-viz-mark]").first();
    await mark.hover({ force: true });
    const readout = page.locator("[data-viz-readout]");
    await expect(readout).toBeVisible();
    const r = (await readout.boundingBox())!;
    const s = (await stage.boundingBox())!;
    expect(r.x).toBeGreaterThanOrEqual(s.x - 1);
    expect(r.x + r.width).toBeLessThanOrEqual(s.x + s.width + 1);
  }
});

test("click selects a mark: white ring, siblings at 40%, a control-free readout; Esc steps back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  const stage = page.locator("[data-court-stage]");
  const marks = stage.locator("[data-viz-mark]");
  const first = marks.first();
  const id = await first.getAttribute("data-viz-mark");
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first.locator("[data-viz-selected-ring]")).toHaveCount(1);
  const sibling = stage.locator(`[data-viz-mark]:not([data-viz-mark="${id}"])`);
  await expect(sibling.first()).toHaveAttribute("opacity", "0.4");
  const readout = page.locator("[data-viz-readout]");
  await expect(readout).toBeVisible();
  await expect(readout.locator("button, a")).toHaveCount(0);
  expect((await readout.boundingBox())!.width).toBeGreaterThanOrEqual(167);
  await expect(readout).toContainText(
    /Set \d+ · Game \d+ · (You|Opponent) serving/,
  );
  // Esc clears the selection first, then closes the lightbox.
  await page.keyboard.press("Escape");
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("zooming shows the level and frees Fit; lines are 1.3× and scale with the court", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  const fit = dialog.getByRole("button", { name: "Fit the court" });
  await expect(fit).toBeDisabled();
  await expect(dialog.getByText(/Drag to move around/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await expect(dialog.getByText(/^\d+% · Drag to move around$/)).toBeVisible();
  await expect(fit).toBeEnabled();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: test.info().outputPath("lightbox-zoomed.png"),
  });
  await fit.click();
  await expect(dialog.getByText(/Drag to move around/)).toHaveCount(0);
  const line = dialog.locator("[data-court] svg g[stroke] line").first();
  await expect(line).not.toHaveAttribute("vector-effect", /.*/);
  const width = await dialog
    .locator("[data-court] svg g[stroke]")
    .first()
    .getAttribute("stroke-width");
  expect(Number(width)).toBeCloseTo(1.6 * 1.3, 5);
});

test("the Points column lists the points behind the marks, headed by game; a row and its mark light together", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Points" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const list = dialog.getByRole("list", { name: "Points" });
  const rows = list.locator("[data-point-id]");
  const n = await rows.count();
  expect(n).toBeGreaterThan(0);
  await expect(
    dialog.getByLabel(new RegExp(`^${n} of \\d+ points$`)),
  ).toBeVisible();
  await expect(list).toContainText(/Set \d+ · Game \d+/);
  // A row selects its mark; the row takes the wash, with no progress rule.
  const row = rows.first();
  const id = await row.getAttribute("data-point-id");
  await row.click();
  await expect(row).toHaveAttribute("data-playing", "true");
  await expect(row.locator(".h-0\\.5")).toHaveCount(0);
  const selected = dialog.locator('[data-viz-mark][aria-pressed="true"]');
  await expect(selected).toHaveCount(1);
  // …and selecting a mark lights its row.
  await page.keyboard.press("Escape");
  await expect(selected).toHaveCount(0);
  await expect(row).not.toHaveAttribute("data-playing", "true");
  expect(id).toBeTruthy();
  await page.screenshot({ path: test.info().outputPath("points.png") });
  await dialog.getByRole("button", { name: "Statistics" }).click();
  await expect(list).toHaveCount(0);
});

test("the legend filters by outcome, one key at a time, and the strip says so", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  const legend = dialog.getByRole("group", { name: "Filter by outcome" });
  const marks = dialog.locator("[data-court-stage] [data-viz-mark]");
  const all = await marks.count();
  const won = legend.getByRole("button", { name: /^Won/ });
  const wonCount = Number((await won.textContent())!.replace(/\D/g, ""));
  await won.click();
  await expect(won).toHaveAttribute("aria-pressed", "true");
  await expect(marks).toHaveCount(wonCount);
  await expect(legend.getByRole("button", { name: /^Lost/ })).toHaveClass(
    /opacity-35/,
  );
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText("Won");
  await expect(strip).toContainText(/\d+ of \d+ points?/);
  await expect(
    strip.getByRole("button", { name: "Clear filter" }),
  ).toBeVisible();
  // The Filters trigger wears the engaged wash while any cut is on.
  const filtersButton = dialog.getByRole("button", { name: "Filters" });
  await expect(filtersButton).toHaveCSS(
    "background-color",
    "rgb(245, 245, 245)",
  );
  // Choosing it again clears it.
  await won.click();
  await expect(marks).toHaveCount(all);
  await expect(strip).toHaveCount(0);
  // Out alone on serves: no points to play, Watch disabled.
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watch`);
  const out = dialog.getByRole("button", { name: /^Out/ });
  if (await out.isEnabled()) {
    await out.click();
    await expect(dialog).toContainText("No points to play");
    await expect(
      dialog.getByRole("button", { name: "Watch points" }),
    ).toBeDisabled();
  }
});

test("the Filters panel is the Matches panel over the cut's own keys, and Clear filter returns to the card", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first`);
  const dialog = page.getByRole("dialog");
  // The card's own filter (first serves) is not "applied".
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Serve");
  await expect(panel).toContainText("Court");
  await expect(panel).toContainText("Zone");
  await panel.getByRole("radio", { name: "Deuce" }).click();
  await expect(page).toHaveURL(/vcourt=deuce|court=deuce/);
  await page.screenshot({ path: test.info().outputPath("filters.png") });
  await page.keyboard.press("Escape");
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText("Deuce");
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL(/ball=first/);
  await expect(page).not.toHaveURL(/deuce/);
});

test("Statistics: rows over 4px bars with the average tick; hover outlines a zone, a click keeps only its marks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Statistics" }).click();
  await expect(dialog.getByText(/^Average \d+%$/).first()).toBeVisible();
  const row = dialog
    .getByRole("button", { name: /% of \d+ points won$/ })
    .first();
  const marks = dialog.locator("[data-court-stage] [data-viz-mark]");
  const all = await marks.count();
  await row.hover();
  await expect(dialog.locator("[data-viz-outline]")).toHaveCount(1);
  await page.waitForTimeout(250);
  await page.screenshot({ path: test.info().outputPath("stats-hover.png") });
  const label = (await row.getAttribute("aria-label"))!;
  const count = Number(/of (\d+) points won$/.exec(label)![1]);
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(marks).toHaveCount(count);
  expect(count).toBeLessThan(all);
  // You stay in Statistics; the strip names the row.
  await expect(
    dialog.getByRole("button", { name: "Statistics" }),
  ).toHaveAttribute("aria-pressed", "true");
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText(label.split(":")[0]);
  await strip.getByRole("button", { name: "Back to all points" }).click();
  await expect(marks).toHaveCount(all);
  await expect(strip).toHaveCount(0);
});

test("Watch hands the Video tab exactly its set: the shared ?f= filters do not ride along", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watch&f=sp.y`);
  await page.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  const url = new URL(page.url());
  expect(url.searchParams.get("pn")).toMatch(/^\d+$/);
  expect(url.searchParams.has("f")).toBe(false);
});

test("the legend's pick survives a You / Opponent switch but not a cut change", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  const legend = dialog.getByRole("group", { name: "Filter by outcome" });
  await legend.getByRole("button", { name: /^Won/ }).click();
  await expect(legend.getByRole("button", { name: /^Won/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await dialog.getByRole("button", { name: "Opponent" }).click();
  await expect(legend.getByRole("button", { name: /^Won/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // A different cut under the same card (the chart menu's Placement →
  // Contact does this; a Back/Forward entry does too) lets go of it.
  await page.evaluate(() => {
    window.history.pushState(null, "", "/?tab=shots&cut=rallyPlacement");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(dialog).toContainText("Rally placement");
  await expect(legend.getByRole("button", { name: /^Won/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const marks = dialog.locator("[data-court-stage] [data-viz-mark]");
  await expect(marks).toHaveCount(6);
});

test("a read-only host leaves out Save as view and, without video, Watch — and draws no empty footer", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&readonly=1`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Save as view" }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: /^Watch/ })).toHaveCount(0);
  // The court and both columns still work.
  await expect(
    dialog.locator("[data-court-stage] [data-viz-mark]").first(),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Statistics" }).click();
  await expect(dialog.getByText(/^Average \d+%$/).first()).toBeVisible();
});

/* ── Gate fixes (PR #684 review, round 2) ─────────────────────────────── */

test("1 · a filter edit or a player switch keeps the lightbox mounted: popover, picks, pane and focus return survive", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots`);
  const card = page.getByRole("link", { name: /^First serves, Avery Kim/ });
  await card.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "First serves" });
  const legend = dialog.getByRole("group", { name: "Filter by outcome" });
  const won = legend.getByRole("button", { name: /^Won/ });
  await won.click();
  await dialog.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await panel.getByRole("radio", { name: "Deuce" }).click();
  // Still open, the same lightbox: the popover and the pick survive.
  await expect(panel).toBeVisible();
  await expect(won).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Statistics" }).click();
  await dialog.getByRole("button", { name: "Opponent" }).click();
  await expect(won).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByRole("button", { name: "Statistics" }),
  ).toHaveAttribute("aria-pressed", "true");
  // The strip still states the cut, and Clear filter returns to the card.
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText("Deuce");
  await strip.getByRole("button", { name: "Clear filter" }).click();
  // Settled before Esc: the strip goes once the clear has committed.
  await expect(strip).toHaveCount(0);
  await expect(page).not.toHaveURL(/deuce/);
  await expect(page).toHaveURL(/ball=first/);
  // The same lightbox, so Esc closes it and focus returns to the card that
  // opened it.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toBeFocused();
});

test("2 · Watch clears a landed statistic's Film remainder as well as ?f=", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&fixture=watch`);
  await page.getByRole("button", { name: "Seed remainder" }).click();
  await expect(page.getByTestId("remainder")).toHaveText("remainder");
  await page.getByRole("link", { name: /^First serves, Avery Kim/ }).click();
  await page.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  await expect(page.getByTestId("remainder")).toHaveText("none");
});

test("3 · loosening the card's own filter: the title and the denominator follow, the count never passes it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first`);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "First serves" }),
  ).toBeVisible();
  const count = dialog.getByLabel(/^\d+ of \d+ points$/);
  const read = async () =>
    (await count.getAttribute("aria-label"))!.match(/\d+/g)!.map(Number);
  const [n1, m1] = await read();
  // On the card, the denominator is the card's own points: all of them.
  expect(n1).toBe(m1);
  await dialog.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  const serve = panel.getByRole("radiogroup").first();
  await serve.getByRole("radio", { name: "Any" }).click();
  await page.keyboard.press("Escape");
  // Every serve now: the card's name gives way to the cut's own.
  await expect(
    dialog.getByRole("heading", { name: "Serve placement" }),
  ).toBeVisible();
  // Off it, the widest set: every serve the player hit.
  const [n2, m2] = await read();
  expect(n2).toBeLessThanOrEqual(m2);
  expect(m2).toBeGreaterThan(m1);
  expect(n2).toBeGreaterThanOrEqual(n1);
});

test("7 · a filter the panel doesn't edit (a link's Result) is named in the strip and cleared by it", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&result=won`);
  const dialog = page.getByRole("dialog");
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText("Won");
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).not.toHaveURL(/result=won/);
});

test("4 · a legend or Statistics pick is dropped on a switch, not hidden until you switch back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  const legend = dialog.getByRole("group", { name: "Filter by outcome" });
  await legend.getByRole("button", { name: /^Won/ }).click();
  const go = (q: string) =>
    page.evaluate((query) => {
      window.history.pushState(null, "", `/?tab=shots&${query}`);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }, q);
  await go("cut=rallyPlacement");
  await expect(dialog).toContainText("Rally placement");
  await go("cut=serve");
  await expect(dialog).toContainText("Serve placement");
  await expect(legend.getByRole("button", { name: /^Won/ })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  // A Statistics row, You → Opponent → You.
  await dialog.getByRole("button", { name: "Statistics" }).click();
  const row = dialog
    .getByRole("button", { name: /% of \d+ points won$/ })
    .first();
  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Opponent" }).click();
  await dialog.getByRole("button", { name: "You" }).click();
  await expect(
    dialog.locator('button[aria-pressed="true"][aria-label$="points won"]'),
  ).toHaveCount(0);
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
});

test("5 · a legend pick is let go on a switch to Heat, so nothing narrows the court unseen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  const marks = dialog.locator("[data-court-stage] [data-viz-mark]");
  const all = await marks.count();
  await dialog
    .getByRole("group", { name: "Filter by outcome" })
    .getByRole("button", { name: /^Won/ })
    .click();
  await dialog.getByRole("button", { name: "Scatter" }).click();
  await page.getByRole("menuitemradio", { name: /Heat/ }).click();
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Heat" }).click();
  await page.getByRole("menuitemradio", { name: /Scatter/ }).click();
  await expect(marks).toHaveCount(all);
});

test("6 · an edited saved view closes back onto the Saved collection", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&view=sv1`);
  const dialog = page.getByRole("dialog", { name: "Saved serve" });
  await expect(dialog).toBeVisible();
  // An edit writes viewId: null.
  await dialog.getByRole("button", { name: "Opponent" }).click();
  await expect(page).not.toHaveURL(/view=sv1/);
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("Esc closes the lightbox in one press even while an icon's tooltip is open", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  for (const name of ["Zoom in", "Close"]) {
    await expect(dialog).toBeVisible();
    // The pointer resting on an icon button: its tooltip is the top layer.
    await dialog.getByRole("button", { name }).hover();
    await expect(page.getByRole("tooltip")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.goto(`${origin}/?tab=shots&cut=serve`);
  }
  // With a point selected, the first Esc still only lets go of the point.
  await dialog.locator("[data-viz-mark]").first().focus();
  await page.keyboard.press("Enter");
  await dialog.getByRole("button", { name: "Zoom in" }).hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.locator('[data-viz-mark][aria-pressed="true"]'),
  ).toHaveCount(0);
});

test("Esc, Esc closes the Filters panel and then the lightbox, even while the panel is still fading out", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "Serve placement" });
  await dialog.getByRole("button", { name: "Filters" }).click();
  await expect(
    page.getByRole("dialog", { name: "Filter the court" }),
  ).toBeVisible();
  // Back to back: the second press lands inside the panel's exit animation.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/cut=/);
});

/* ── Gate fixes (PR #684 review, round 3) ─────────────────────────────── */

test("R3·1 · a selected point filtered off the court is let go: no ring when it returns, and one Esc closes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "Serve placement" });
  const marks = dialog.locator("[data-court-stage] [data-viz-mark]");
  const first = marks.first();
  const id = (await first.getAttribute("data-viz-mark"))!;
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  const selected = dialog.locator(`[data-viz-mark="${id}"]`);
  // A zone the selected point did not land in takes it off the court.
  await dialog.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  let gone = false;
  for (const zone of ["T", "Body", "Wide"]) {
    const box = panel.getByRole("checkbox", {
      name: new RegExp(`^${zone}\\s*\\d*$`),
    });
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "true");
    if ((await selected.count()) === 0) {
      gone = true;
      break;
    }
    await box.click();
    await expect(box).toHaveAttribute("aria-checked", "false");
  }
  expect(gone).toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await dialog
    .locator("[data-viz-filter-strip]")
    .getByRole("button", { name: "Clear filter" })
    .click();
  // Back on the court, and not selected: no ring, no faded siblings.
  await expect(selected).toHaveCount(1);
  await expect(selected).toHaveAttribute("aria-pressed", "false");
  await expect(dialog.locator("[data-viz-selected-ring]")).toHaveCount(0);
  await expect(page).not.toHaveURL(/zone=/);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("R3·6 · a Create view draft opens over Saved, from a hard load and from the wall", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&draft=1`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  const saved = page.getByRole("button", { name: "Saved", exact: true });
  await expect(saved).toHaveAttribute("aria-pressed", "true");
  // Opened on top of Default, it still closes onto Saved.
  await page.getByRole("button", { name: "Default", exact: true }).click();
  await page.evaluate(() => {
    window.history.pushState(null, "", "/?tab=shots&cut=serve&draft=1");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(saved).toHaveAttribute("aria-pressed", "true");
});

test("R3·5 · Watch names the player in the Video strip when the points are the opponent's", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first&fixture=watchall`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Opponent" }).click();
  await expect(page).toHaveURL(/player=opponent/);
  await dialog.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  expect(new URL(page.url()).searchParams.get("pnl")).toBe(
    "First serves · Blake Rivera",
  );
  // The viewer's own points carry no name.
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first&fixture=watchall`);
  await page.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  expect(new URL(page.url()).searchParams.get("pnl")).toBe("First serves");
});

test("R3·3 · Watch → Video → Back keeps the wall's player and collection", async ({
  page,
}) => {
  // Next's own router sees a pushState; the harness's mock needs a popstate.
  const settle = () =>
    page.evaluate(() => window.dispatchEvent(new PopStateEvent("popstate")));
  await page.goto(`${origin}/?tab=shots&fixture=watchall`);
  const dialog = page.getByRole("dialog");
  // The Opponent's wall, a card of theirs, and Watch.
  await page.getByRole("button", { name: "Opponent" }).click();
  await page.getByRole("link", { name: /^First serves, Blake Rivera/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  await settle();
  await expect(page.getByText("Video tab")).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Opponent" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // An edited saved view (no `view=` left in its URL) still closes on Saved.
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  await page.getByRole("link", { name: /Saved serve/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Opponent" }).click();
  await expect(page).not.toHaveURL(/view=sv1/);
  await dialog.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  await settle();
  await expect(page.getByText("Video tab")).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(
    page.getByRole("button", { name: "Saved", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("R3·4 · Back/Forward between two saved views starts each fresh: pane, zoom, selection and picks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&view=sv1`);
  const first = page.getByRole("dialog", { name: "Saved serve" });
  await expect(first).toBeVisible();
  // Everything that is the view's own: a pick, a zoom, the Statistics pane.
  await first
    .getByRole("group", { name: "Filter by outcome" })
    .getByRole("button", { name: /^Won/ })
    .click();
  await first.getByRole("button", { name: "Zoom in" }).click();
  await first.getByRole("button", { name: "Statistics" }).click();
  await page.evaluate(() => {
    window.history.pushState(
      null,
      "",
      "/?tab=shots&cut=returnPlacement&view=sv2",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  const second = page.getByRole("dialog", { name: "Saved returns" });
  await expect(second).toBeVisible();
  await expect(second.getByRole("button", { name: "Points" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    second.getByRole("button", { name: "Fit the court" }),
  ).toBeDisabled();
  await expect(second.locator("[data-viz-filter-strip]")).toHaveCount(0);
  // Back to the first: fresh as well.
  await page.goBack();
  await expect(first).toBeVisible();
  await expect(first.getByRole("button", { name: "Points" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    first.getByRole("button", { name: "Fit the court" }),
  ).toBeDisabled();
  await expect(
    first
      .getByRole("group", { name: "Filter by outcome" })
      .getByRole("button", { name: /^Won/ }),
  ).toHaveAttribute("aria-pressed", "false");
});

test("R3·7 · a saved view is its own baseline: nothing applied on open, and Clear returns to the view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&view=sv1`);
  const dialog = page.getByRole("dialog", { name: "Saved serve" });
  await expect(dialog).toBeVisible();
  const strip = dialog.locator("[data-viz-filter-strip]");
  const filtersButton = dialog.getByRole("button", { name: "Filters" });
  // The view's own filters are not "applied".
  await expect(strip).toHaveCount(0);
  await expect(filtersButton).not.toHaveCSS(
    "background-color",
    "rgb(245, 245, 245)",
  );
  // A filter of its own: the title stays the view's, the strip names only it.
  await filtersButton.click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await panel.getByRole("radio", { name: "Deuce" }).click();
  await page.keyboard.press("Escape");
  await expect(strip).toContainText("Deuce");
  await expect(
    dialog.getByRole("heading", { name: "Saved serve" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/view=sv1/);
  // …and a legend pick on top. Clear lets go of both, back on the view.
  await dialog
    .getByRole("group", { name: "Filter by outcome" })
    .getByRole("button", { name: /^Won/ })
    .click();
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL(/view=sv1/);
  await expect(page).not.toHaveURL(/deuce/);
  await expect(
    dialog.getByRole("heading", { name: "Saved serve" }),
  ).toBeVisible();
});

/* ── Gate fixes (PR #684 review, round 4) ─────────────────────────────── */

test("R4·1 · a view picked from a draft's menu is the baseline after an edit: Clear lands back on it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&draft=1`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Serve placement" }).click();
  await page.getByRole("menuitemradio", { name: /^Saved serve Serve/ }).click();
  await expect(page).toHaveURL(/view=sv1/);
  await dialog.getByRole("button", { name: "Filters" }).click();
  await page
    .getByRole("dialog", { name: "Filter the court" })
    .getByRole("radio", { name: "Deuce" })
    .click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/vfrom=sv1/);
  await expect(
    dialog.getByRole("heading", { name: "Saved serve" }),
  ).toBeVisible();
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText("Deuce");
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(page).toHaveURL(/view=sv1/);
  await expect(strip).toHaveCount(0);
});

test("R4·2 · an edited view stays the baseline through Watch → Video → Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&view=sv1&fixture=watchall`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Filters" }).click();
  await page
    .getByRole("dialog", { name: "Filter the court" })
    .getByRole("radio", { name: "Deuce" })
    .click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/vfrom=sv1/);
  await dialog.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  // Next's own router sees a pushState; the harness's mock needs a popstate.
  await page.evaluate(() =>
    window.dispatchEvent(new PopStateEvent("popstate")),
  );
  await expect(page.getByText("Video tab")).toBeVisible();
  await page.goBack();
  // Remounted, and still measured against the view.
  await expect(
    dialog.getByRole("heading", { name: "Saved serve" }),
  ).toBeVisible();
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText("Deuce");
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(page).toHaveURL(/view=sv1/);
  await expect(strip).toHaveCount(0);
});

test("R4·3 · loosening a view's own filter is named in the strip, and Clear puts back exactly that", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first&view=sv3`);
  const dialog = page.getByRole("dialog", { name: "Saved first serves" });
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toHaveCount(0);
  await dialog.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await panel
    .getByRole("radiogroup")
    .first()
    .getByRole("radio", { name: "Any" })
    .click();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/ball=first/);
  await expect(strip).toContainText("Serve: any");
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL(/ball=first/);
  await expect(page).toHaveURL(/view=sv3/);
});

test("R4·4 · Esc reaches a nested non-popper layer before the lightbox", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const lightbox = page.getByRole("dialog", { name: "Serve placement" });
  await expect(lightbox).toBeVisible();
  await page.evaluate(() =>
    (
      window as unknown as { __openNestedLayer: () => void }
    ).__openNestedLayer(),
  );
  const nested = page.getByRole("dialog", { name: "Nested layer" });
  await expect(nested).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(nested).toHaveCount(0);
  await expect(lightbox).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(lightbox).toHaveCount(0);
});

/* ── Gate fixes (PR #684 review, round 5) ─────────────────────────────── */

test("R5·1 · Esc, Esc closes the Chart menu and then the lightbox, even while the menu is fading out", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "Serve placement" });
  await dialog.getByRole("button", { name: "Scatter" }).click();
  await expect(page.getByRole("menuitemradio", { name: /Heat/ })).toBeVisible();
  // Back to back: the second press lands inside the menu's exit animation.
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(/cut=/);
});

test("R5·3 · Clear on an edited view puts back its chart too, with its id", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&view=sv1`);
  const dialog = page.getByRole("dialog", { name: "Saved serve" });
  await dialog.getByRole("button", { name: "Scatter" }).click();
  await page.getByRole("menuitemradio", { name: /Heat/ }).click();
  await expect(page).toHaveURL(/chart=heat/);
  await dialog.getByRole("button", { name: "Filters" }).click();
  await page
    .getByRole("dialog", { name: "Filter the court" })
    .getByRole("radio", { name: "Deuce" })
    .click();
  await page.keyboard.press("Escape");
  await dialog
    .locator("[data-viz-filter-strip]")
    .getByRole("button", { name: "Clear filter" })
    .click();
  await expect(page).toHaveURL(/view=sv1/);
  await expect(page).not.toHaveURL(/chart=heat/);
  await expect(dialog.getByRole("button", { name: "Scatter" })).toBeVisible();
});

test("R5·4 · a view stored as Unforced, hard-loaded on an unjudged match, is not read as an edit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=errors&view=sv4&verr=unforced`);
  const dialog = page.getByRole("dialog", { name: "Saved errors" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Filters" })).not.toHaveCSS(
    "background-color",
    "rgb(245, 245, 245)",
  );
});

/* ── Gate fixes (PR #684 review, round 6) ─────────────────────────────── */

test("R6·1 · a view stored as Unforced, picked from the menu on an unjudged match, is not read as an edit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&draft=1`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Serve placement" }).click();
  await page
    .getByRole("menuitemradio", { name: /^Saved errors Errors/ })
    .click();
  await expect(page).toHaveURL(/view=sv4/);
  await expect(
    dialog.getByRole("heading", { name: "Saved errors" }),
  ).toBeVisible();
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Filters" })).not.toHaveCSS(
    "background-color",
    "rgb(245, 245, 245)",
  );
});

test("R6·2 · Clear for the other player keeps the reader's chart: the view does not come back, so neither does its chart", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&view=sv1`);
  const dialog = page.getByRole("dialog", { name: "Saved serve" });
  await dialog.getByRole("button", { name: "Opponent" }).click();
  await dialog.getByRole("button", { name: "Scatter" }).click();
  await page.getByRole("menuitemradio", { name: /Heat/ }).click();
  await expect(page).toHaveURL(/chart=heat/);
  await dialog.getByRole("button", { name: "Filters" }).click();
  await page
    .getByRole("dialog", { name: "Filter the court" })
    .getByRole("radio", { name: "Deuce" })
    .click();
  await page.keyboard.press("Escape");
  const strip = dialog.locator("[data-viz-filter-strip]");
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).not.toHaveURL(/deuce/);
  await expect(page).not.toHaveURL(/view=sv1/);
  await expect(page).toHaveURL(/chart=heat/);
});
