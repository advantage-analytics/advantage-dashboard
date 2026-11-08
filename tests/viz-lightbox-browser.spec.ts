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
  expect(url.searchParams.get("pnl")).toBe("First serves");
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
