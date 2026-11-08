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
  await expect(page).toHaveURL(/tab=film.*point=p1-high-0-0/);
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
  await expect(dialog.getByText(/drag to move around/)).toHaveCount(0);
  await dialog.getByRole("button", { name: "Zoom in" }).click();
  await expect(dialog.getByText(/^\d+% · drag to move around$/)).toBeVisible();
  await expect(fit).toBeEnabled();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: test.info().outputPath("lightbox-zoomed.png"),
  });
  await fit.click();
  await expect(dialog.getByText(/drag to move around/)).toHaveCount(0);
  const line = dialog.locator("[data-court] svg g[stroke] line").first();
  await expect(line).not.toHaveAttribute("vector-effect", /.*/);
  const width = await dialog
    .locator("[data-court] svg g[stroke]")
    .first()
    .getAttribute("stroke-width");
  expect(Number(width)).toBeCloseTo(1.6 * 1.3, 5);
});
