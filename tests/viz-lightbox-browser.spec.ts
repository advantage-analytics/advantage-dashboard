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
