import { expect, test, type Page } from "@playwright/test";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

/**
 * The Approaches cut in the opened court (`lightbox-court.tsx`'s mark
 * layer): each dot with a `pair` is ONE interactive mark drawn in two
 * places — its contact in the near half, its placement in the far half.
 * Driven through the real `VizLightboxShell` from a hand-built result
 * (`fixtures/viz-approach-lightbox-harness.tsx`).
 */

/** `lightbox-court.tsx`'s `UNSELECTED_OPACITY`: a selection's siblings. */
const UNSELECTED_OPACITY = "0.4";

let origin: string;
let close: () => Promise<void>;

test.beforeAll(async () => {
  ({ origin, close } = await startStyledHarness(
    "tests/fixtures/viz-approach-lightbox-harness.tsx",
  ));
});

test.afterAll(async () => {
  await close?.();
});

async function open(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/`);
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  // Both halves on the stage, so every contact and placement can be pointed at.
  await dialog.getByRole("button", { name: "Full court" }).click();
  const stage = dialog.locator("[data-court-stage]");
  return { dialog, stage, errors };
}

test("a pair is one mark: hovering either half rings both, and the readout names the half", async ({
  page,
}) => {
  const { dialog, stage, errors } = await open(page);
  const a = stage.locator('[data-viz-mark="pair-a"]');
  await expect(stage.locator("[data-viz-mark]")).toHaveCount(4);
  // One group, two marks.
  await expect(a.locator("[data-viz-mark-part]")).toHaveCount(2);
  await expect(a.locator("[data-viz-pair-ring]")).toHaveCount(0);

  const readout = dialog.locator("[data-viz-readout]");
  const part = readout.locator("[data-viz-readout-part]");

  await a.locator('[data-viz-mark-part="contact"]').hover();
  await expect(a.locator("[data-viz-pair-ring]")).toHaveCount(2);
  await expect(part).toHaveText("Contact");
  // The other pairs are not lit.
  await expect(
    stage.locator('[data-viz-mark="pair-b"] [data-viz-pair-ring]'),
  ).toHaveCount(0);

  await a.locator('[data-viz-mark-part="placement"]').hover();
  await expect(a.locator("[data-viz-pair-ring]")).toHaveCount(2);
  await expect(part).toHaveText("Placement");

  // The card opens outward, into the apron beside the court: this pair sits
  // on the left half, so the card hangs to the left of its mark.
  await expect(readout).toHaveAttribute("data-viz-readout-side", "left");
  const card = (await readout.boundingBox())!;
  const mark = (await a
    .locator('[data-viz-mark-part="placement"] [data-viz-mark-glyph]')
    .boundingBox())!;
  expect(card.x + card.width).toBeLessThanOrEqual(mark.x);

  // A placement drawn alone (no measured contact) reads as before: no half named.
  await stage.locator('[data-viz-mark="solo-c"]').hover();
  await expect(readout).toBeVisible();
  await expect(part).toHaveCount(0);
  await expect(readout).not.toHaveAttribute("data-viz-readout-side", /.+/);
  expect(errors).toEqual([]);
});

test("selecting a pair rings both marks, draws it last and dims every other mark", async ({
  page,
}) => {
  const { stage, errors } = await open(page);
  const a = stage.locator('[data-viz-mark="pair-a"]');
  await a.locator('[data-viz-mark-part="contact"]').click();

  await expect(a).toHaveAttribute("aria-pressed", "true");
  await expect(a.locator("[data-viz-selected-ring]")).toHaveCount(2);
  await expect(a).not.toHaveAttribute("opacity", /.+/);
  for (const id of ["pair-b", "solo-c", "pair-d"]) {
    await expect(stage.locator(`[data-viz-mark="${id}"]`)).toHaveAttribute(
      "opacity",
      UNSELECTED_OPACITY,
    );
  }

  // Drawn last among the marks: the layer's final element is the selected
  // pair, raised — both its rings and marks — while its interactive group
  // keeps its place (and its focus).
  const last = await a.evaluate((node) => {
    const end = node.parentElement!.lastElementChild!;
    return {
      raised: end.getAttribute("data-viz-raised"),
      rings: end.querySelectorAll("circle[r]").length,
    };
  });
  expect(last.raised).toBe("pair-a");
  expect(last.rings).toBeGreaterThanOrEqual(2);

  // Hovering another pair while one is selected rings that one too, and
  // the selection keeps its rings.
  const b = stage.locator('[data-viz-mark="pair-b"]');
  await b.locator('[data-viz-mark-part="placement"]').hover();
  await expect(b.locator("[data-viz-pair-ring]")).toHaveCount(2);
  await expect(a.locator("[data-viz-selected-ring]")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("keyboard roving treats a pair as one stop, and Enter or Space selects it", async ({
  page,
}) => {
  const { stage, errors } = await open(page);
  const marks = stage.locator("[data-viz-mark]");
  // One tab stop for the whole court; nothing inside a pair is a stop of
  // its own.
  await expect(stage.locator('[data-viz-mark][tabindex="0"]')).toHaveCount(1);
  await expect(
    stage.locator(
      "[data-viz-mark-part][tabindex], [data-viz-mark-part] [tabindex]",
    ),
  ).toHaveCount(0);

  const a = marks.nth(0);
  await expect(a).toHaveAttribute("data-viz-mark", "pair-a");
  await a.focus();
  await page.keyboard.press("ArrowRight");
  const b = stage.locator('[data-viz-mark="pair-b"]');
  // One press crosses the whole pair, to the next dot.
  await expect(b).toBeFocused();
  await expect(b).toHaveAttribute("tabindex", "0");
  await page.keyboard.press("Enter");
  await expect(b).toHaveAttribute("aria-pressed", "true");
  await expect(b.locator("[data-viz-selected-ring]")).toHaveCount(2);
  await expect(b).toBeFocused();

  // The next stop is a placement drawn alone, then the next pair.
  await page.keyboard.press("ArrowRight");
  await expect(stage.locator('[data-viz-mark="solo-c"]')).toBeFocused();
  await page.keyboard.press("ArrowRight");
  const d = stage.locator('[data-viz-mark="pair-d"]');
  await expect(d).toBeFocused();
  // The keyboard reaches a pair at its placement.
  await expect(stage.page().locator("[data-viz-readout-part]")).toHaveText(
    "Placement",
  );
  await page.keyboard.press(" ");
  await expect(d).toHaveAttribute("aria-pressed", "true");
  await expect(d.locator("[data-viz-selected-ring]")).toHaveCount(2);
  await expect(b).toHaveAttribute("aria-pressed", "false");
  await expect(b).toHaveAttribute("opacity", UNSELECTED_OPACITY);
  expect(errors).toEqual([]);
});
