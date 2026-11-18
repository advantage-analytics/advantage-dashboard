import { expect, test, type Locator, type Page } from "@playwright/test";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

/**
 * The Approaches cut's Filters panel and applied sentence (plan step 9),
 * through the real `ShotsTab` → `VizLightbox` over the shared net-point
 * match (`fixtures/viz-approach-filters-harness.tsx`): the panel's three
 * checklist groups, the card's baseline (`entry: ["approach"]`) kept out of
 * the strip, Clear going back to approaches only, and the right-handed
 * caveat.
 */

let origin: string;
let close: () => Promise<void>;

test.beforeAll(async () => {
  ({ origin, close } = await startStyledHarness(
    "tests/fixtures/viz-approach-filters-harness.tsx",
  ));
});

test.afterAll(async () => {
  await close?.();
});

const APPROACH_SECTIONS = ["How you came in", "Approach to", "Direction"];

/** Opens the Approaches wall card, as a reader does. */
async function openApproaches(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots${query}`);
  await page.getByRole("link", { name: /^Approaches, / }).click();
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  return { dialog, errors };
}

async function openPanel(page: Page) {
  await page
    .getByRole("dialog")
    .first()
    .getByRole("button", { name: "Filters" })
    .click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await expect(panel).toBeVisible();
  return panel;
}

test("the approaches cut's panel has three checklist groups; no other cut has them", async ({
  page,
}) => {
  const { errors } = await openApproaches(page);
  const panel = await openPanel(page);
  const labels = panel.locator("[data-filter-panel-sections] p");
  for (const label of APPROACH_SECTIONS)
    await expect(
      labels.filter({ hasText: new RegExp(`^${label}$`) }),
    ).toHaveCount(1);

  // Checklists, not segmented rows: every option is a checkbox, none a radio.
  for (const name of [
    /^Approach\b/,
    /^Serve and volley\b/,
    /^Drawn in\b/,
    /^Their backhand\b/,
    /^Middle\b/,
    /^Their forehand\b/,
    /^Crosscourt\b/,
    /^Down the line\b/,
  ])
    await expect(panel.getByRole("checkbox", { name })).not.toHaveCount(0);
  await expect(panel.getByRole("checkbox", { name: /^Middle\b/ })).toHaveCount(
    2,
  );
  for (const name of ["Their backhand", "Crosscourt", "Approach"])
    await expect(panel.getByRole("radio", { name })).toHaveCount(0);
  // The card is approaches: its own tick is on, the others off.
  await expect(
    panel.getByRole("checkbox", { name: /^Approach\b/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    panel.getByRole("checkbox", { name: /^Serve and volley\b/ }),
  ).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");

  // Every other cut: none of the three.
  for (const cut of [
    "serve",
    "returnPlacement",
    "returnContact",
    "rallyPlacement",
    "errors",
  ]) {
    await page.goto(`${origin}/?tab=shots&cut=${cut}`);
    const other = await openPanel(page);
    for (const label of APPROACH_SECTIONS)
      await expect(other).not.toContainText(label);
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});

test("the card's baseline is not an applied filter; Serve and volley is, and Clear returns to approaches only", async ({
  page,
}) => {
  const { dialog, errors } = await openApproaches(page, "&hand=known");
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(page).toHaveURL(/ventry=approach/);
  // Approaches only is the card itself: nothing applied, nothing to clear.
  await expect(strip).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Filters" }),
  ).not.toHaveAttribute("data-engaged", "true");

  // Narrowed on the baseline: the strip names the narrowing alone.
  let panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their backhand\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("To their backhand");
  await expect(strip).not.toContainText("Approach ·");
  await expect(strip).not.toContainText(/^Approach\b/);
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL(/ventry=approach/);
  await expect(page).not.toHaveURL(/vto=/);

  // Serve and volley ticked: an applied filter, named in the strip.
  panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Serve and volley\b/ }).click();
  await expect(page).toHaveURL(/ventry=serve-volley/);
  await page.keyboard.press("Escape");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Serve and volley");

  // Clear: back to approaches only — not every net point.
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL(/ventry=approach(&|$)/);
  await expect(page).not.toHaveURL(/serve-volley/);
  panel = await openPanel(page);
  await expect(
    panel.getByRole("checkbox", { name: /^Approach\b/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    panel.getByRole("checkbox", { name: /^Serve and volley\b/ }),
  ).toHaveAttribute("aria-checked", "false");

  // Approach unticked (every way in): named, and Clear undoes it too.
  await panel.getByRole("checkbox", { name: /^Approach\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(strip).toContainText("How you came in: any");
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL(/ventry=approach/);
  expect(errors).toEqual([]);
});

test("opened by URL with no ventry, the cut is on its baseline: no strip, Filters not engaged, Approach ticked", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=approaches&hand=known`);
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  await expect(page).not.toHaveURL(/ventry=/);
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Filters" }),
  ).not.toHaveAttribute("data-engaged", "true");
  const panel = await openPanel(page);
  await expect(
    panel.getByRole("checkbox", { name: /^Approach\b/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    panel.getByRole("checkbox", { name: /^Serve and volley\b/ }),
  ).toHaveAttribute("aria-checked", "false");

  // Every way in survives a reload under its own spelling.
  await panel.getByRole("checkbox", { name: /^Approach\b/ }).click();
  await expect(page).toHaveURL(/ventry=any/);
  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "Approaches" });
  await expect(reloaded.locator("[data-viz-filter-strip]")).toContainText(
    "How you came in: any",
  );
  expect(errors).toEqual([]);
});

test("opened by URL for a player with no approaches, the stage says none are recorded, not that filters hid them", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=approaches&net=never`);
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/No approaches recorded for .+ yet/);
  await expect(dialog).not.toContainText("No approaches match these filters");
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the applied sentence says it assumes right-handed only where a shown approach assumed the hand", async ({
  page,
}) => {
  // The opponent's hand is not on the match: the wing words assume it.
  const assumed = await openApproaches(page);
  const strip = assumed.dialog.locator("[data-viz-filter-strip]");
  let panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their backhand\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(strip).toContainText("To their backhand");
  await expect(strip).toContainText(/assumes right-handed/i);
  // A caveat closes a sentence; it never opens a strip of its own.
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  expect(assumed.errors).toEqual([]);

  // The hand is on the match: no caveat.
  const known = await openApproaches(page, "&hand=known");
  const knownStrip = known.dialog.locator("[data-viz-filter-strip]");
  panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their backhand\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(knownStrip).toContainText("To their backhand");
  await expect(knownStrip).not.toContainText(/assumes right-handed/i);
  expect(known.errors).toEqual([]);
});

/** The Statistics column's approaches KPI tile: "6 approaches" → 6. */
async function kpiCount(dialog: Locator): Promise<number> {
  const label = await dialog
    .locator("[data-stat-summary] p")
    .first()
    .locator(".sr-only")
    .textContent();
  const match = /^(\d+) .*approach/.exec(label?.trim() ?? "");
  expect(match, `KPI tile reads "${label}"`).not.toBeNull();
  return Number(match![1]);
}

const notDrawn = (dialog: Locator) => dialog.locator("[data-viz-not-drawn]");
const courtMarks = (dialog: Locator) =>
  dialog.locator("[data-court-stage] [data-viz-mark]");

test("approaches with no landing anywhere: the stage says how many are not drawn — the Statistics count — never that none are recorded or filtered", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=approaches&landing=none`);
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  await expect(courtMarks(dialog)).toHaveCount(0);
  const n = await kpiCount(dialog);
  expect(n).toBeGreaterThan(0);
  await expect(notDrawn(dialog)).toHaveCount(1);
  await expect(notDrawn(dialog)).toHaveText(
    `${n} not drawn: no landing recorded`,
  );
  await expect(dialog).not.toContainText("No approaches recorded for");
  await expect(dialog).not.toContainText("match these filters");
  expect(errors).toEqual([]);
});

test("some approaches drawn, some not: the line names the undrawn ones beside the drawn marks, and is gone when every approach draws", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=approaches&landing=some`);
  const some = page.getByRole("dialog", { name: "Approaches" });
  await expect(some).toBeVisible();
  // The fixture took the landing off two of your approaches.
  await expect(notDrawn(some)).toHaveText("2 not drawn: no landing recorded");
  await expect(notDrawn(some)).toBeVisible();
  await expect(courtMarks(some).first()).toBeVisible();
  const n = await kpiCount(some);
  expect(n).toBeGreaterThan(2);
  // Not the honest-zero card: the court has marks on it.
  await expect(some).not.toContainText("No approaches recorded for");
  await expect(some).not.toContainText("match these filters");

  // Every counted approach drawn: no line at all.
  await page.goto(`${origin}/?tab=shots&cut=approaches`);
  const all = page.getByRole("dialog", { name: "Approaches" });
  await expect(all).toBeVisible();
  await expect(courtMarks(all).first()).toBeVisible();
  await expect(notDrawn(all)).toHaveCount(0);
  await expect(all).not.toContainText("not drawn");
  expect(errors).toEqual([]);
});

test("another cut's opened court never carries the not-drawn line, even over a match with no landings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  for (const cut of ["serve", "rallyPlacement", "errors"]) {
    await page.goto(`${origin}/?tab=shots&cut=${cut}&landing=none`);
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-court-stage]")).toBeVisible();
    await expect(notDrawn(dialog)).toHaveCount(0);
    await expect(dialog).not.toContainText("not drawn");
  }
  expect(errors).toEqual([]);
});
