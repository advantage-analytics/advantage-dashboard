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

/* ── T16: the opening frame and a selection keep every mark on the stage ── */

const PAIRS = ["pair-a", "pair-b", "pair-d"] as const;

/** The dialog as it opens — no "Full court" click — with the glide jumping
 *  straight to its end (`prefers-reduced-motion`), so a box read after a
 *  selection is where the court comes to rest. */
async function openAtHome(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/`);
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  const stage = dialog.locator("[data-court-stage]");
  await expect(stage.locator("[data-viz-mark]")).toHaveCount(4);
  return { dialog, stage, errors };
}

type Box = { x: number; y: number; width: number; height: number };

function inside(mark: Box, stage: Box): boolean {
  return (
    mark.x >= stage.x &&
    mark.y >= stage.y &&
    mark.x + mark.width <= stage.x + stage.width &&
    mark.y + mark.height <= stage.y + stage.height
  );
}

/** Every glyph under `marks`, as `{ id, part, inside }` against the stage. */
async function glyphsInStage(
  stage: ReturnType<Page["locator"]>,
  selector: string,
) {
  const stageBox = (await stage.boundingBox())!;
  const glyphs = stage.locator(selector);
  const n = await glyphs.count();
  const out: { label: string; inside: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const glyph = glyphs.nth(i);
    const label = await glyph.evaluate((node) => {
      const part = node.closest("[data-viz-mark-part]");
      const mark = node.closest("[data-viz-mark]");
      return `${mark?.getAttribute("data-viz-mark")}:${part?.getAttribute("data-viz-mark-part") ?? "solo"}`;
    });
    out.push({ label, inside: inside((await glyph.boundingBox())!, stageBox) });
  }
  return out;
}

test("the court opens on its full length: every contact and placement is on the stage before any click", async ({
  page,
}) => {
  const { stage, errors } = await openAtHome(page);
  const glyphs = await glyphsInStage(
    stage,
    "[data-viz-mark] [data-viz-mark-glyph]",
  );
  // Three pairs (two marks each) and one placement drawn alone.
  expect(glyphs.map((g) => g.label).sort()).toEqual(
    [
      "pair-a:contact",
      "pair-a:placement",
      "pair-b:contact",
      "pair-b:placement",
      "pair-d:contact",
      "pair-d:placement",
      "solo-c:solo",
    ].sort(),
  );
  for (const g of glyphs) expect(g, g.label).toMatchObject({ inside: true });
  expect(errors).toEqual([]);
});

for (const id of PAIRS) {
  for (const part of ["contact", "placement"] as const) {
    test(`selecting ${id} by its ${part} keeps both its marks on the stage`, async ({
      page,
    }) => {
      const { stage, errors } = await openAtHome(page);
      const mark = stage.locator(`[data-viz-mark="${id}"]`);
      await mark.locator(`[data-viz-mark-part="${part}"]`).click();
      await expect(mark).toHaveAttribute("aria-pressed", "true");
      await expect
        .poll(async () =>
          (
            await glyphsInStage(
              stage,
              `[data-viz-mark="${id}"] [data-viz-mark-glyph]`,
            )
          ).map((g) => g.inside),
        )
        .toEqual([true, true]);
      expect(errors).toEqual([]);
    });
  }
}

test("a pair selected from a zoomed-in court is zoomed back out until both its marks show", async ({
  page,
}) => {
  const { dialog, stage, errors } = await openAtHome(page);
  const zoomIn = dialog.getByRole("button", { name: "Zoom in" });
  for (let i = 0; i < 8; i++) await zoomIn.click();
  // Selected from the keyboard: at this zoom the pair is off the stage.
  const a = stage.locator('[data-viz-mark="pair-a"]');
  await a.focus();
  await page.keyboard.press("Enter");
  await expect(a).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(async () =>
      (
        await glyphsInStage(
          stage,
          '[data-viz-mark="pair-a"] [data-viz-mark-glyph]',
        )
      ).map((g) => g.inside),
    )
    .toEqual([true, true]);
  expect(errors).toEqual([]);
});
