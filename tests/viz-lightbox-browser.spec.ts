import { expect, test, type Locator, type Page } from "@playwright/test";
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
  const card = page.getByRole("link", { name: /^All serves, Avery Kim/ });
  await card.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "All serves" });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/cut=serve/);
  await expect(dialog).toContainText(
    /Serve placement · You · \d+ (of \d+ )?in, \d+ of those \d+ won/,
  );
  // Dialog v3 geometry at 1512 × 982, centred on both axes: the old
  // top-anchored height budget (982 − 96 − 32 = 854), split evenly.
  const box = (await dialog.boundingBox())!;
  expect(Math.round(box.width)).toBe(1212);
  expect(Math.round(box.height)).toBe(854);
  expect(Math.round(box.x)).toBe(150);
  expect(Math.round(box.y)).toBe(64);
  await page.waitForTimeout(800);
  await page.screenshot({ path: test.info().outputPath("lightbox.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/cut=/);
  await expect(card).toBeFocused();
  expect(errors).toEqual([]);
});

test("a reader who is not the player sees two surnames, never You: the wall's chips, the card's chips and its subtitle", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&observer=1`);
  const wallChips = page.locator('[role="group"][aria-label="Player"] button');
  await expect(wallChips).toHaveText(["Kim", "Rivera"]);
  await expect(page.getByRole("button", { name: "You" })).toHaveCount(0);
  await expect(wallChips.first()).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("link", { name: /^All serves, Avery Kim/ }).click();
  const dialog = page.getByRole("dialog", { name: "All serves" });
  await expect(dialog).toContainText("Serve placement · Kim ·");
  await expect(
    dialog.locator('[role="group"][aria-label="Player"] button'),
  ).toHaveText(["Kim", "Rivera"]);
  await dialog.getByRole("button", { name: "Rivera" }).click();
  await expect(page).toHaveURL(/player=opponent/);
  await expect(dialog).toContainText("Serve placement · Rivera ·");
});

test("a player switched inside the lightbox does not leak onto the wall", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first`);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Rivera" }).click();
  await expect(page).toHaveURL(/player=opponent/);
  await expect(dialog).toContainText("Serve placement · Rivera");
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
  // Every serve is the All serves card itself: the label is the card's name.
  expect(url.searchParams.get("pnl")).toBe("All serves");
  // Narrowed to first serves, the card's name and the filter beyond it.
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first&fixture=watch`);
  await page.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  expect(new URL(page.url()).searchParams.get("pnl")).toBe("All serves · 1st");
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

test("zooming shows the level; 0 comes back to 100%; lines are 1.3× and scale with the court", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Drag to move around/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await expect(dialog.getByText(/^\d+% · Drag to move around$/)).toBeVisible();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: test.info().outputPath("lightbox-zoomed.png"),
  });
  await page.locator("[data-court-stage] [data-viz-mark]").first().focus();
  await page.keyboard.press("0");
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
  // A card opens on Statistics; Points is the second pane.
  await expect(
    dialog.getByRole("button", { name: "Statistics" }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Points", exact: true }).click();
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
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  // The card (every serve) holds no filter, so nothing is "applied".
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Serve");
  await expect(panel).toContainText("Court");
  await expect(panel).toContainText("Zone");
  // The season's own groups are the profile's alone: one match has one
  // opponent.
  await expect(panel).not.toContainText("Opponent plays");
  await expect(panel.getByRole("checkbox", { name: /^vs / })).toHaveCount(0);
  await panel.getByRole("radio", { name: "Deuce" }).click();
  await expect(page).toHaveURL(/vcourt=deuce|court=deuce/);
  await page.screenshot({ path: test.info().outputPath("filters.png") });
  await page.keyboard.press("Escape");
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText("Deuce");
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL(/cut=serve/);
  await expect(page).not.toHaveURL(/deuce/);
});

test("Statistics: rows over 4px bars, no average tick; hover outlines a zone, a click keeps only its marks", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Statistics" }).click();
  // No "Average N%" label in a group's header (2026-11-10).
  await expect(
    dialog.getByRole("button", { name: /% of \d+ points won$/ }).first(),
  ).toBeVisible();
  await expect(dialog.getByText(/^Average \d+%$/)).toHaveCount(0);
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
  await dialog.getByRole("button", { name: "Rivera" }).click();
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
  await expect(
    dialog.getByRole("button", { name: /% of \d+ points won$/ }).first(),
  ).toBeVisible();
});

/* ── Gate fixes (PR #684 review, round 2) ─────────────────────────────── */

test("1 · a filter edit or a player switch keeps the lightbox mounted: popover, picks, pane and focus return survive", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots`);
  const card = page.getByRole("link", { name: /^All serves, Avery Kim/ });
  await card.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "All serves" });
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
  await dialog.getByRole("button", { name: "Rivera" }).click();
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
  await expect(page).toHaveURL(/cut=serve/);
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
  await page.getByRole("link", { name: /^All serves, Avery Kim/ }).click();
  await page.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  await expect(page.getByTestId("remainder")).toHaveText("none");
});

test("3 · narrowing the All serves card: the title stays the card's, the denominator stays every serve, the count never passes it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "All serves" }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "Points", exact: true }).click();
  const count = dialog.getByLabel(/^\d+ of \d+ points$/);
  const read = async () =>
    (await count.getAttribute("aria-label"))!.match(/\d+/g)!.map(Number);
  const [n1, m1] = await read();
  // On the card, the denominator is the card's own points: all of them.
  expect(n1).toBe(m1);
  await dialog.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  const serve = panel.getByRole("radiogroup").first();
  await serve.getByRole("radio", { name: "1st" }).click();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/ball=first/);
  // The card holds no filter of its own, so it is still the card, with the
  // first-serve filter named in the strip.
  await expect(
    dialog.getByRole("heading", { name: "All serves" }),
  ).toBeVisible();
  await expect(dialog.locator("[data-viz-filter-strip]")).toContainText("1st");
  const [n2, m2] = await read();
  expect(m2).toBe(m1);
  expect(n2).toBeLessThanOrEqual(m2);
  expect(n2).toBeLessThan(n1);
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
  await dialog.getByRole("button", { name: "Rivera" }).click();
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
  await dialog.getByRole("button", { name: "Rivera" }).click();
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
  const dialog = page.getByRole("dialog", { name: "All serves" });
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
  const dialog = page.getByRole("dialog", { name: "All serves" });
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
  await dialog.getByRole("button", { name: "Rivera" }).click();
  await expect(page).toHaveURL(/player=opponent/);
  await dialog.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  expect(new URL(page.url()).searchParams.get("pnl")).toBe(
    "All serves · Blake Rivera · 1st",
  );
  // The viewer's own points carry no name.
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first&fixture=watchall`);
  await page.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  expect(new URL(page.url()).searchParams.get("pnl")).toBe("All serves · 1st");
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
  await page.getByRole("button", { name: "Rivera" }).click();
  await page.getByRole("link", { name: /^All serves, Blake Rivera/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /^Watch these/ }).click();
  await expect(page).toHaveURL(/tab=film/);
  await settle();
  await expect(page.getByText("Video tab")).toBeVisible();
  await page.goBack();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Rivera" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // An edited saved view (no `view=` left in its URL) still closes on Saved.
  await page.getByRole("button", { name: "Saved", exact: true }).click();
  // The Saved wall shows one player's views: "Saved serve" is one of yours.
  await page.getByRole("button", { name: "You", exact: true }).click();
  await page.getByRole("link", { name: /Saved serve/ }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Rivera" }).click();
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
  // Everything that is the view's own: a pick, a zoom, the Points pane.
  await first
    .getByRole("group", { name: "Filter by outcome" })
    .getByRole("button", { name: /^Won/ })
    .click();
  await first.getByRole("button", { name: "Zoom in" }).click();
  await first.getByRole("button", { name: "Points", exact: true }).click();
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
  await expect(
    second.getByRole("button", { name: "Statistics" }),
  ).toHaveAttribute("aria-pressed", "true");
  // Back at its 100% framing: no zoom level showing.
  await expect(second.getByText(/Drag to move around/)).toHaveCount(0);
  await expect(second.locator("[data-viz-filter-strip]")).toHaveCount(0);
  // Back to the first: fresh as well.
  await page.goBack();
  await expect(first).toBeVisible();
  await expect(
    first.getByRole("button", { name: "Statistics" }),
  ).toHaveAttribute("aria-pressed", "true");
  // Back at its 100% framing: no zoom level showing.
  await expect(first.getByText(/Drag to move around/)).toHaveCount(0);
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
  const lightbox = page.getByRole("dialog", { name: "All serves" });
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
  const dialog = page.getByRole("dialog", { name: "All serves" });
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
  await dialog.getByRole("button", { name: "Rivera" }).click();
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

/* ── Pass 1: chart icons, the menu surface, Advanced filters ──────────── */

test("every chart row in the chart menu carries its leading icon", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "All serves" });
  await dialog.getByRole("button", { name: "Scatter" }).click();
  const menu = page.getByRole("menu", { name: "Chart" });
  await expect(menu).toBeVisible();
  // Let the menu's open animation (a 95% zoom) settle before measuring.
  await page.waitForTimeout(300);
  const labels: number[] = [];
  for (const name of ["Scatter", "Heat", "Zones"]) {
    const row = menu.getByRole("menuitemradio", {
      name: new RegExp(`^${name}`),
    });
    await expect(row.locator("svg")).toHaveCount(
      name === "Scatter" ? 2 : 1, // Scatter is chosen: its check is the second.
    );
    // The icon leads the row, so the three labels start on one line.
    labels.push((await row.getByText(name, { exact: true }).boundingBox())!.x);
  }
  expect(new Set(labels.map(Math.round)).size).toBe(1);
});

/** Open the lightbox's Filters and pick its "Advanced filters" row. */
async function openAdvancedDrawer(page: Page, dialog: Locator) {
  await dialog.getByRole("button", { name: "Filters", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await panel.getByRole("button", { name: /^Advanced filters/ }).click();
  // The popover's exit animation runs over the court for ~150ms; a click
  // aimed at the dimmed court must not land on it.
  await expect(page.locator("[data-radix-popper-content-wrapper]")).toHaveCount(
    0,
  );
  return dialog.getByRole("complementary", { name: "Advanced filters" });
}

/** Whether focus is inside the advanced filters drawer. */
function focusInDrawer(page: Page) {
  return page.evaluate(
    () =>
      document
        .getElementById("viz-advanced-drawer")
        ?.contains(document.activeElement) === true,
  );
}

test("the lightbox's Filters takes the float-menu surface, and its Advanced filters row closes it and opens the sheet over the box", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "All serves" });
  const trigger = dialog.getByRole("button", { name: "Filters", exact: true });
  await trigger.click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await expect(panel).toBeVisible();
  // FloatMenu geometry: 10px radius, 5px inset.
  await expect(panel).toHaveCSS("border-top-left-radius", "10px");
  await expect(panel).toHaveCSS("padding-top", "5px");

  // The row sits at the foot, above the footer, with a quiet summary.
  const row = panel.getByRole("button", { name: /^Advanced filters/ });
  await expect(row).toContainText("Score, return, result…");
  await row.click();

  // The popover closes; the drawer opens over the box, on the window's
  // right edge and the window's whole height, 340px once its slide has run.
  await expect(panel).toHaveCount(0);
  const drawer = dialog.getByRole("complementary", {
    name: "Advanced filters",
  });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveCSS("animation-name", "roster-drawer-in");
  await expect
    .poll(async () => Math.round((await drawer.boundingBox())!.width))
    .toBe(340);
  const rail = (await drawer.boundingBox())!;
  expect(Math.round(rail.x + rail.width)).toBe(1512);
  expect(Math.round(rail.y)).toBe(0);
  expect(Math.round(rail.height)).toBe(982);
  // The whole window dims, not just the box.
  const scrim = (await dialog
    .locator("[data-lightbox-drawer-scrim]")
    .boundingBox())!;
  expect([scrim.x, scrim.y, scrim.width, scrim.height].map(Math.round)).toEqual(
    [0, 0, 1512, 982],
  );
  await expect(
    drawer.getByRole("heading", { name: "Advanced filters" }),
  ).toBeVisible();
  // The Video tab's accordion: section headers that expand.
  expect(await drawer.locator("[data-section]").count()).toBeGreaterThan(0);

  // Focus moves in, and Tab stays in: the rest of the box is inert.
  await expect.poll(() => focusInDrawer(page)).toBe(true);
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  expect(
    await dialog.locator("[inert]").count(),
    "header and body inert",
  ).toBeGreaterThanOrEqual(2);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(await focusInDrawer(page)).toBe(true);
  }
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await focusInDrawer(page)).toBe(true);
  }

  // The X (aria-labelled, dark tooltip) closes it; focus is back on Filters.
  await drawer.getByRole("button", { name: "Close advanced filters" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(dialog.locator("[inert]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the advanced drawer closes on a click in the dimmed box and on Esc; a second Esc closes the lightbox", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "All serves" });
  const trigger = dialog.getByRole("button", { name: "Filters", exact: true });

  // The dimmed court: a click there closes the drawer, not the lightbox.
  let drawer = await openAdvancedDrawer(page, dialog);
  await expect(drawer).toBeVisible();
  const scrim = dialog.locator("[data-lightbox-drawer-scrim]");
  await expect(scrim).toHaveCSS("background-color", /0\.2\)$/);
  const box = (await dialog.boundingBox())!;
  await page.mouse.click(box.x + 300, box.y + box.height / 2);
  await expect(drawer).toHaveCount(0);
  await expect(scrim).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/cut=serve/);
  await expect(trigger).toBeFocused();

  // Esc closes the drawer first, then the lightbox.
  drawer = await openAdvancedDrawer(page, dialog);
  await expect.poll(() => focusInDrawer(page)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(trigger).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page).not.toHaveURL(/cut=/);
  expect(errors).toEqual([]);
});

test("a pick in the advanced drawer and Show writes vf=, closes the drawer and the strip names the cut", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "All serves" });
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toHaveCount(0);
  const drawer = await openAdvancedDrawer(page, dialog);
  const sections = drawer.locator("[data-section]");
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
  // The report counts the court's marks under the draft, client-side.
  const show = drawer.getByRole("button", { name: /^Show \d+ serves?$/ });
  await expect(show).toBeEnabled();
  await expect(drawer).toContainText(/\d+ of \d+/);
  await show.click();
  await expect(page).toHaveURL(/[?&]vf=/);
  await expect(drawer).toHaveCount(0);
  await expect(strip).toBeVisible();
  await expect(strip).not.toHaveText("");
  await expect(
    dialog.getByRole("button", { name: "Filters", exact: true }),
  ).toBeFocused();
  // The row now says what is in it.
  await dialog.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(
    page
      .getByRole("dialog", { name: "Filter the court" })
      .getByRole("button", { name: /^Advanced filters/ }),
  ).toContainText("1 applied");
  expect(errors).toEqual([]);
});

test("under reduced motion the advanced drawer does not slide: full width on its first frame, gone at once on close", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "All serves" });
  await dialog.getByRole("button", { name: "Filters", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Filter the court" })
    .getByRole("button", { name: /^Advanced filters/ })
    .click();
  // The first frame the drawer is drawn on: already 340px, no animation.
  const first = await page.evaluate(
    () =>
      new Promise<{ width: number; animation: string }>((resolve) => {
        const look = () => {
          const el = document.getElementById("viz-advanced-drawer");
          if (!el) return requestAnimationFrame(look);
          resolve({
            width: el.getBoundingClientRect().width,
            animation: getComputedStyle(el).animationName,
          });
        };
        look();
      }),
  );
  expect(first.animation).toBe("none");
  expect(Math.round(first.width)).toBe(340);
  await page.keyboard.press("Escape");
  await expect(page.locator("#viz-advanced-drawer")).toHaveCount(0);
  await expect(dialog).toBeVisible();
});

/* ── Pass 2: half court is 100%, Full court, the glide ───────────────────── */

/** The pan layer's transform: z from its width (art is 652 px wide at z=1),
 *  px/py from its translate. */
async function courtTransform(page: import("@playwright/test").Page) {
  return page.locator("[data-court]").evaluate((el) => {
    const style = (el as HTMLElement).style;
    const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(style.transform);
    return {
      z: parseFloat(style.width) / 652,
      px: m ? parseFloat(m[1]) : NaN,
      py: m ? parseFloat(m[2]) : NaN,
    };
  });
}

test("a landing cut opens at 100% on the far half, net along the stage's bottom; Full court zooms out below 100%; 0 returns", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  for (const cut of ["serve", "returnPlacement"]) {
    await page.goto(`${origin}/?tab=shots&cut=${cut}`);
    const dialog = page.getByRole("dialog");
    const stage = page.locator("[data-court-stage]");
    await expect(stage).toBeVisible();
    await expect(dialog.getByText(/Drag to move around/)).toHaveCount(0);
    const s = (await stage.boundingBox())!;
    const home = await courtTransform(page);
    // The net (VIEWER_COURT.netY 236, viewBox minY −117, h 706 → art y) sits
    // just above the stage's bottom edge.
    const netArtY = ((236 + 117) / 706) * 1258;
    const netStageY = home.py + netArtY * home.z;
    expect(netStageY).toBeLessThan(s.height);
    // Every landing cut, the serve too, keeps the net at the edge.
    expect(s.height - netStageY).toBeLessThan(80);

    const full = dialog.getByRole("button", { name: "Full court" });
    await expect(full).toBeEnabled();
    await full.hover();
    await expect(page.getByRole("tooltip")).toContainText("Full court");
    await full.click();
    const level = dialog.getByText(/^\d+% · Drag to move around$/);
    await expect(level).toBeVisible();
    const pct = Number((await level.textContent())!.match(/^(\d+)%/)![1]);
    expect(pct).toBeLessThan(100);
    await expect(full).toBeDisabled();
    const out = await courtTransform(page);
    expect(out.z).toBeLessThan(home.z);
    // The whole court frame (far baseline 14 → near baseline 458) is on stage.
    const artY = (y: number) => ((y + 117) / 706) * 1258;
    expect(out.py + artY(14) * out.z).toBeGreaterThanOrEqual(0);
    expect(out.py + artY(458) * out.z).toBeLessThanOrEqual(s.height);

    // `0` from anywhere on the court's keyboard (a zoom button here: the
    // returns fixture has few marks).
    await dialog.getByRole("button", { name: "Zoom in" }).focus();
    await page.keyboard.press("0");
    await expect(dialog.getByText(/Drag to move around/)).toHaveCount(0);
    const back = await courtTransform(page);
    expect(back.z).toBeCloseTo(home.z, 4);
    expect(back.py).toBeCloseTo(home.py, 1);
  }
});

test("contact cuts keep their framing: 1.6× the whole court's fit, near baseline at 500/950 of the stage", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=returnContact`);
  const stage = page.locator("[data-court-stage]");
  await expect(stage).toBeVisible();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Drag to move around/)).toHaveCount(0);
  const s = (await stage.boundingBox())!;
  const t = await courtTransform(page);
  const pxPerUnit = 652 / 366;
  const fit = Math.min(
    s.width / (334 * pxPerUnit),
    s.height / (532 * pxPerUnit),
  );
  expect(t.z).toBeCloseTo(fit * 1.6, 3);
  const nearBaselineArtY = ((458 + 117) / 706) * 1258;
  expect(t.py + nearBaselineArtY * t.z).toBeCloseTo(s.height * (500 / 950), 0);
});

test("clicking a mark glides it to the stage centre at 150%; a click on the empty court deselects and stays put", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  const stage = page.locator("[data-court-stage]");
  const mark = stage.locator("[data-viz-mark]").first();
  await expect(mark).toBeVisible();
  const home = await courtTransform(page);
  await mark.dispatchEvent("click");
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  // Mid-glide the court has not arrived yet.
  await page.waitForTimeout(420);
  const s = (await stage.boundingBox())!;
  const m = (await mark.locator('circle[fill="transparent"]').boundingBox())!;
  expect(Math.abs(m.x + m.width / 2 - (s.x + s.width / 2))).toBeLessThan(12);
  expect(Math.abs(m.y + m.height / 2 - (s.y + s.height / 2))).toBeLessThan(12);
  const after = await courtTransform(page);
  expect(after.z / home.z).toBeCloseTo(1.5, 2);
  await expect(dialog.getByText("150% · Drag to move around")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("lightbox-glided.png"),
  });
  // A second click on the selected mark is a watch, not a deselect — and
  // this match has no video, so it does nothing at all.
  await mark.dispatchEvent("click");
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  // A click on the empty court deselects, and does not move the court.
  await stage.dispatchEvent("click");
  await expect(mark).toHaveAttribute("aria-pressed", "false");
  await page.waitForTimeout(400);
  const still = await courtTransform(page);
  expect(still.px).toBeCloseTo(after.px, 1);
  expect(still.py).toBeCloseTo(after.py, 1);
  expect(still.z).toBeCloseTo(after.z, 4);
});

test("the glide animates over ~320ms, and a drag mid-glide cancels it cleanly", async ({
  page,
}) => {
  // The glide is a requestAnimationFrame tween on performance.now(), both of
  // which Playwright's clock owns: pausing it holds the glide mid-way for as
  // long as the drag takes, however slow the runner is.
  await page.clock.install();
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const stage = page.locator("[data-court-stage]");
  const mark = stage.locator("[data-viz-mark]").first();
  await expect(mark).toBeVisible();
  const home = await courtTransform(page);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
  await mark.dispatchEvent("click");
  await page.clock.runFor(96);
  await expect
    .poll(async () => (await courtTransform(page)).z)
    .toBeGreaterThan(home.z);
  const early = await courtTransform(page);
  // Moving, not yet there.
  expect(early.z / home.z).toBeLessThan(1.5);
  // A drag from an empty patch of court takes over.
  const s = (await stage.boundingBox())!;
  await page.mouse.move(s.x + 30, s.y + 30);
  await page.mouse.down();
  await page.mouse.move(s.x + 90, s.y + 70, { steps: 4 });
  await page.mouse.up();
  const dragged = await courtTransform(page);
  await page.clock.runFor(600);
  await page.waitForTimeout(100);
  const settled = await courtTransform(page);
  // Nothing moved once the drag ended: the glide did not resume.
  expect(settled.px).toBeCloseTo(dragged.px, 1);
  expect(settled.py).toBeCloseTo(dragged.py, 1);
  expect(settled.z).toBeCloseTo(dragged.z, 4);
  // …and it stopped short of the glide's 150%.
  expect(settled.z / home.z).toBeLessThan(1.49);
});

test("with reduced motion the glide is a jump; a Points row glides the court too", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const stage = page.locator("[data-court-stage]");
  const mark = stage.locator("[data-viz-mark]").first();
  await expect(mark).toBeVisible();
  const home = await courtTransform(page);
  await mark.dispatchEvent("click");
  // Within a frame or two, not a 320ms tween.
  await page.waitForTimeout(40);
  const s = (await stage.boundingBox())!;
  const m = (await mark.locator('circle[fill="transparent"]').boundingBox())!;
  expect(Math.abs(m.x + m.width / 2 - (s.x + s.width / 2))).toBeLessThan(12);
  expect(Math.abs(m.y + m.height / 2 - (s.y + s.height / 2))).toBeLessThan(12);
  expect((await courtTransform(page)).z / home.z).toBeCloseTo(1.5, 2);

  // Deselect (a click on the empty court), back to 100%, then pick from the
  // Points list.
  await stage.dispatchEvent("click");
  await expect(mark).toHaveAttribute("aria-pressed", "false");
  await mark.focus();
  await page.keyboard.press("0");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Points", exact: true })
    .click();
  const list = page.getByRole("dialog").getByRole("list", { name: "Points" });
  const row = list.locator("[data-point-id]").last();
  await row.click();
  const pointId = await row.getAttribute("data-point-id");
  const selected = stage.locator('[data-viz-mark][aria-pressed="true"]');
  await expect(selected).toHaveCount(1);
  expect(pointId).not.toBeNull();
  await page.waitForTimeout(40);
  const sm = (await selected
    .locator('circle[fill="transparent"]')
    .boundingBox())!;
  expect(Math.abs(sm.x + sm.width / 2 - (s.x + s.width / 2))).toBeLessThan(12);
  expect(Math.abs(sm.y + sm.height / 2 - (s.y + s.height / 2))).toBeLessThan(
    12,
  );
});

/* ── Pass 3: the second click, the hint, the Statistics row's readout ──── */

test("the readout's hint: focus then watch, the pinned readout's watch, and the focus alone without video", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  const hint = page.locator("[data-viz-readout] [data-viz-readout-hint]");

  // No playable video: the focus alone, before and after selecting.
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const stage = page.locator("[data-court-stage]");
  let mark = stage.locator("[data-viz-mark]").first();
  await mark.hover({ force: true });
  await expect(hint).toHaveText("Click to focus");
  await mark.dispatchEvent("click");
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  await expect(hint).toHaveText("Click to focus");

  // Every point playable: focus then watch, then — pinned — watch.
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watchall`);
  mark = stage.locator("[data-viz-mark]").first();
  await mark.hover({ force: true });
  await expect(hint).toHaveText("Click to focus · Click again to watch");
  // The hint sits under a 1px hairline at 12% white.
  const border = await hint.evaluate((el) => {
    const cs = getComputedStyle(el);
    return [cs.borderTopWidth, cs.borderTopColor, cs.paddingTop];
  });
  expect(border).toEqual(["1px", "rgba(255, 255, 255, 0.12)", "6px"]);
  await mark.dispatchEvent("click");
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  await page.mouse.move(5, 5);
  await expect(hint).toHaveText("Click again to watch");
});

test("a second click on the selected mark watches that one point in the Video tab; Enter does too", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  for (const how of ["click", "enter"] as const) {
    await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watchall`);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Points", exact: true })
      .click();
    const stage = page.locator("[data-court-stage]");
    const mark = stage.locator("[data-viz-mark]").first();
    await mark.dispatchEvent("click");
    await expect(mark).toHaveAttribute("aria-pressed", "true");
    // The lit row is this mark's point: its number is what the URL carries.
    const row = page
      .getByRole("dialog")
      .locator('[data-point-id][data-playing="true"]');
    await expect(row).toHaveCount(1);
    expect(new URL(page.url()).searchParams.get("tab")).not.toBe("film");
    if (how === "click") await mark.dispatchEvent("click");
    else {
      await mark.focus();
      await page.keyboard.press("Enter");
    }
    await expect(page).toHaveURL(/tab=film/);
    const url = new URL(page.url());
    expect(url.searchParams.get("pn")).toMatch(/^\d+$/);
    expect(url.searchParams.get("pnl")).toBe("All serves");
  }
});

test("a click on the empty court deselects; a drag across it does not", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const stage = page.locator("[data-court-stage]");
  const mark = stage.locator("[data-viz-mark]").first();
  await mark.dispatchEvent("click");
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  const s = (await stage.boundingBox())!;
  // A drag from a corner of the apron keeps the selection.
  await page.mouse.move(s.x + 20, s.y + 20);
  await page.mouse.down();
  await page.mouse.move(s.x + 80, s.y + 60, { steps: 4 });
  await page.mouse.up();
  await expect(mark).toHaveAttribute("aria-pressed", "true");
  // A plain click there lets it go.
  await page.mouse.click(s.x + 20, s.y + 20);
  await expect(mark).toHaveAttribute("aria-pressed", "false");
});

test("a Points row: the lit row says click again to watch, and its second click watches", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watchall`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Points", exact: true })
    .click();
  const list = page.getByRole("dialog").getByRole("list", { name: "Points" });
  const row = list.locator("[data-point-id]").first();
  await expect(row).not.toContainText("Click again to watch");
  await row.click();
  await expect(row).toHaveAttribute("data-playing", "true");
  // The grey second line, ending with the hint (the mono score follows it).
  await expect(row).toContainText(/\S · Click again to watch/);
  // No icon joined it: the row's buttons are its own (none on this report).
  await expect(row.locator("svg.lucide-play")).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("tab")).not.toBe("film");
  await row.click();
  await expect(page).toHaveURL(/tab=film/);
  expect(new URL(page.url()).searchParams.get("pn")).toMatch(/^\d+$/);

  // Without video the lit row says nothing more, and a second click stays.
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Points", exact: true })
    .click();
  const plain = list.locator("[data-point-id]").first();
  await plain.click();
  await expect(plain).toHaveAttribute("data-playing", "true");
  await expect(plain).not.toContainText("Click again to watch");
  await plain.click();
  await expect(page).not.toHaveURL(/tab=film/);
  await plain.press("Enter");
  await expect(page).not.toHaveURL(/tab=film/);
});

test("a Statistics row's tooltip hangs beside it with the row's own numbers, and never takes the pointer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Statistics" }).click();
  const rows = dialog.locator("button[aria-pressed]:not([disabled])", {
    hasText: /%/,
  });
  const row = rows.first();
  const label = (await row.getAttribute("aria-label"))!;
  // "Deuce T: 60% of 5 points won"
  const [, name, pct, count] = label.match(
    /^(.+): (\d+)% of (\d+) points won$/,
  )!;
  await row.hover();
  const tip = dialog.locator("[data-stat-tooltip]");
  await expect(tip).toBeVisible();
  await expect(tip).toContainText(name);
  await expect(tip).toContainText(`${pct}%`);
  await expect(tip).toContainText(new RegExp(`\\d+ of ${count} serves? won`));
  await expect(tip).toContainText(/Average \d+% across the court/);
  await expect(tip).toContainText(`Click to keep these ${count} points`);
  // Beside the row, to its left, vertically centred on it.
  const r = (await row.boundingBox())!;
  const t = (await tip.boundingBox())!;
  expect(t.x + t.width).toBeLessThanOrEqual(r.x);
  expect(Math.abs(t.y + t.height / 2 - (r.y + r.height / 2))).toBeLessThan(3);
  // A label, not a control.
  const events = await tip.evaluate(
    (el) =>
      getComputedStyle(el.closest("[data-stat-tooltip-anchor] > span")!)
        .pointerEvents,
  );
  expect(events).toBe("none");
  // The court outline still answers the hover.
  await expect(page.locator("[data-viz-outline]")).toHaveCount(1);
  // Kept, the hint turns to letting go.
  await row.click();
  await expect(tip).toContainText("Click to show all again");
  await page.screenshot({
    path: test.info().outputPath("lightbox-stat-tooltip.png"),
  });
});

/** The stage's box and the court's pan/zoom (`[data-court]`'s translate and
 *  size, `z` × the art), read two frames after the last change so a stage
 *  resize — and the re-fit it triggers — has had its turn. */
async function courtState(page: Page) {
  return page.evaluate(async () => {
    await new Promise((done) =>
      requestAnimationFrame(() => requestAnimationFrame(done)),
    );
    const stage = document.querySelector("[data-court-stage]")!;
    const court = stage.querySelector<HTMLElement>("[data-court]")!;
    const r = stage.getBoundingClientRect();
    return {
      stage: [r.x, r.y, r.width, r.height],
      transform: court.style.transform,
      width: court.style.width,
      height: court.style.height,
    };
  });
}

test("R7·1 · a chart switch keeps the court exactly where it is — at 100%, and panned and zoomed: Scatter → Heat → Zones → Scatter", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "All serves" });
  const stage = dialog.locator("[data-court-stage]");
  await expect(stage.locator("[data-viz-mark]").first()).toBeVisible();

  async function cycle(expected: Awaited<ReturnType<typeof courtState>>) {
    for (const [from, to] of [
      ["Scatter", "Heat"],
      ["Heat", "Zones"],
      ["Zones", "Scatter"],
    ]) {
      await dialog.getByRole("button", { name: from, exact: true }).click();
      await page
        .getByRole("menuitemradio", { name: new RegExp(`^${to}`) })
        .click();
      await expect(
        dialog.getByRole("button", { name: to, exact: true }),
      ).toBeVisible();
      expect(await courtState(page), `on ${to}`).toEqual(expected);
    }
  }

  // At 100%: no reflow of the stage, no re-fit.
  await cycle(await courtState(page));

  // Zoomed in and dragged off-centre: the same pan and zoom on every chart.
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await expect(dialog.getByText(/^\d+% · Drag to move around$/)).toBeVisible();
  const s = (await stage.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 - 120, s.y + s.height / 2 + 60, {
    steps: 8,
  });
  await page.mouse.up();
  const moved = await courtState(page);
  await cycle(moved);
});

test("R7·2 · a stage that resizes keeps a zoomed, panned court: the filter strip appearing and going does not re-fit it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "All serves" });
  const stage = dialog.locator("[data-court-stage]");
  await expect(stage.locator("[data-viz-mark]").first()).toBeVisible();
  // Zoom in and drag off-centre.
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await expect(dialog.getByText(/^\d+% · Drag to move around$/)).toBeVisible();
  const s = (await stage.boundingBox())!;
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2);
  await page.mouse.down();
  await page.mouse.move(s.x + s.width / 2 - 120, s.y + s.height / 2 + 60, {
    steps: 8,
  });
  await page.mouse.up();
  const before = await courtTransform(page);
  const centreArt = (t: { z: number; px: number; py: number }, h: number) => ({
    x: (s.width / 2 - t.px) / t.z,
    y: (h / 2 - t.py) / t.z,
  });
  const beforeCentre = centreArt(before, s.height);
  // A Statistics row keeps its points: the filter strip appears over the
  // stage and the stage gets shorter.
  await dialog.getByRole("button", { name: "Statistics" }).click();
  await dialog.locator("[data-viz-stat-row], li button").first().click();
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toBeVisible();
  await expect
    .poll(async () => (await stage.boundingBox())!.height)
    .not.toBe(s.height);
  // The strip unfolds (`.filter-strip-reveal`), so the stage shrinks
  // over a few frames: read it once it has come to rest.
  await expect
    .poll(() => page.evaluate(() => document.getAnimations().length))
    .toBe(0);
  const shorter = (await stage.boundingBox())!;
  const during = await courtTransform(page);
  // Same zoom, and the same spot of court at the stage's centre.
  expect(during.z).toBeCloseTo(before.z, 4);
  const duringCentre = centreArt(during, shorter.height);
  expect(duringCentre.x).toBeCloseTo(beforeCentre.x, 0);
  expect(duringCentre.y).toBeCloseTo(beforeCentre.y, 0);
  // And back.
  await strip.getByRole("button").first().click();
  await expect(strip).toHaveCount(0);
  await expect
    .poll(async () => (await stage.boundingBox())!.height)
    .toBeCloseTo(s.height, 0);
  const after = await courtTransform(page);
  expect(after.z).toBeCloseTo(before.z, 4);
  const afterCentre = centreArt(after, s.height);
  expect(afterCentre.x).toBeCloseTo(beforeCentre.x, 0);
  expect(afterCentre.y).toBeCloseTo(beforeCentre.y, 0);
});

test("R7·3 · at Full court, a stage that resizes re-fits the whole court: the filter strip appearing leaves Full court spent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog", { name: "All serves" });
  const stage = dialog.locator("[data-court-stage]");
  await expect(stage.locator("[data-viz-mark]").first()).toBeVisible();
  const full = dialog.getByRole("button", { name: "Full court" });
  await full.click();
  await expect(full).toBeDisabled();
  const before = (await stage.boundingBox())!;
  // A Statistics row keeps its points: the filter strip appears and the
  // stage gets shorter.
  await dialog.getByRole("button", { name: "Statistics" }).click();
  await dialog.locator("[data-viz-stat-row], li button").first().click();
  await expect(dialog.locator("[data-viz-filter-strip]")).toBeVisible();
  await expect
    .poll(async () => (await stage.boundingBox())!.height)
    .not.toBe(before.height);
  // Still the whole court, fitted to the new stage: Full court stays spent.
  await expect(full).toBeDisabled();
});

test("Reset view puts a zoomed, dragged court back as it opened, and is spent there", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  const dialog = page.getByRole("dialog");
  const reset = dialog.getByRole("button", { name: "Reset view" });
  await expect(reset).toBeDisabled();
  const home = await courtTransform(page);
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await page.keyboard.press("ArrowRight");
  await expect(dialog.getByText(/Drag to move around/)).toBeVisible();
  await expect(reset).toBeEnabled();
  await reset.click();
  await expect(dialog.getByText(/Drag to move around/)).toHaveCount(0);
  await expect(reset).toBeDisabled();
  const back = await courtTransform(page);
  expect(back.z).toBeCloseTo(home.z, 4);
});
