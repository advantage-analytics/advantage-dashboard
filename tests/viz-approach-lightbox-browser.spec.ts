import { expect, test, type Locator, type Page } from "@playwright/test";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

/**
 * The Approaches cut in the opened court (`lightbox-court.tsx`'s mark
 * layer): each dot with a `pair` is ONE interactive mark drawn in two
 * places — its contact in the near half, its placement in the far half.
 * Driven through the real `VizLightboxShell` from a hand-built result
 * (`fixtures/viz-approach-lightbox-harness.tsx`).
 */

/** `lightbox-court.tsx`'s `UNSELECTED_OPACITY`: every other landing, while
 *  one mark is selected or (on a court of pairs) pointed at. */
const UNSELECTED_OPACITY = "0.4";
/** `UNSELECTED_CONTACT_OPACITY`: every other contact ring. */
const UNSELECTED_CONTACT_OPACITY = "0.6";

/** A mark set back: a pair's two ends each carry their own opacity, a mark
 *  drawn in one place carries it on its group. */
async function expectSetBack(stage: Locator, id: string) {
  const mark = stage.locator(`[data-viz-mark="${id}"]`);
  if ((await mark.locator("[data-viz-mark-part]").count()) === 0) {
    await expect(mark).toHaveAttribute("opacity", UNSELECTED_OPACITY);
    return;
  }
  await expect(
    mark.locator('[data-viz-mark-part="placement"]'),
  ).toHaveAttribute("opacity", UNSELECTED_OPACITY);
  await expect(mark.locator('[data-viz-mark-part="contact"]')).toHaveAttribute(
    "opacity",
    UNSELECTED_CONTACT_OPACITY,
  );
}

/** A mark at full strength: no opacity on its group or on either end. */
async function expectNotSetBack(stage: Locator, id: string) {
  const mark = stage.locator(`[data-viz-mark="${id}"]`);
  await expect(mark).not.toHaveAttribute("opacity", /.+/);
  for (const part of await mark.locator("[data-viz-mark-part]").all()) {
    await expect(part).not.toHaveAttribute("opacity", /.+/);
  }
}

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
  await expectNotSetBack(stage, "pair-a");
  // Every other landing sits back at 40%, every other contact ring at 60%.
  for (const id of ["pair-b", "solo-c", "pair-d"]) {
    await expectSetBack(stage, id);
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
  await expectSetBack(stage, "pair-b");
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

/* ── T17: the apron's words on the opened Approaches court ─────────────── */

/** The dialog at its opening frame (`openAtHome`), from `query`. */
async function openWith(page: Page, query: string, marks = 4) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?${query}`);
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  const stage = dialog.locator("[data-court-stage]");
  await expect(stage.locator("[data-viz-mark]")).toHaveCount(marks);
  return { stage, errors };
}

/** The apron's words, each with its box, the wing names sorted left to right. */
async function apronLabels(stage: ReturnType<Page["locator"]>) {
  const labels = stage.locator("[data-approach-labels] text");
  const n = await labels.count();
  const out: { text: string; lane: string | null; box: Box }[] = [];
  for (let i = 0; i < n; i++) {
    const label = labels.nth(i);
    out.push({
      text: (await label.evaluate((node) => node.textContent ?? "")).trim(),
      lane: await label.getAttribute("data-approach-lane"),
      box: (await label.boundingBox())!,
    });
  }
  const lanes = out
    .filter((l) => l.lane !== null)
    .sort((a, b) => a.box.x - b.box.x)
    .map((l) => l.text);
  return { all: out, lanes };
}

for (const hand of ["right", "unknown"] as const) {
  test(`the opened court names its apron, Their FH on the left, when the opponent's hand is ${hand}`, async ({
    page,
  }) => {
    const { stage, errors } = await openWith(page, `hand=${hand}`);
    const { all, lanes } = await apronLabels(stage);
    expect(all.map((l) => l.text)).toEqual(
      expect.arrayContaining(["Placement", "Contact"]),
    );
    expect(all).toHaveLength(5);
    expect(lanes).toEqual(["Their FH", "Middle", "Their BH"]);
    // Set in the mono face, in the court's white.
    const group = stage.locator("[data-approach-labels]");
    await expect(group).toHaveAttribute("font-family", "var(--font-mono)");
    await expect(group).toHaveAttribute("fill", "#FFFFFF");
    // Plan §5: the court's one type — every word at one size, white at
    // 78–90%.
    const words = stage.locator("[data-approach-labels] text");
    const sizes = new Set<string | null>();
    for (let i = 0; i < (await words.count()); i++) {
      sizes.add(await words.nth(i).getAttribute("font-size"));
      const opacity = Number(await words.nth(i).getAttribute("fill-opacity"));
      expect(opacity).toBeGreaterThanOrEqual(0.78);
      expect(opacity).toBeLessThanOrEqual(0.9);
    }
    expect(sizes.size).toBe(1);
    expect(errors).toEqual([]);
  });
}

test("a known left-handed opponent swaps the outer wing names", async ({
  page,
}) => {
  const { stage, errors } = await openWith(page, "hand=left");
  const { lanes } = await apronLabels(stage);
  expect(lanes).toEqual(["Their BH", "Middle", "Their FH"]);
  expect(errors).toEqual([]);
});

test("every apron word lies inside the stage at the opening frame", async ({
  page,
}) => {
  const { stage, errors } = await openWith(page, "hand=right");
  const stageBox = (await stage.boundingBox())!;
  const { all } = await apronLabels(stage);
  expect(all).toHaveLength(5);
  for (const label of all) {
    expect(
      { text: label.text, inside: inside(label.box, stageBox) },
      label.text,
    ).toEqual({ text: label.text, inside: true });
  }
  // On the apron, never on the court: "Placement" and the wings above the
  // far baseline's marks, "Contact" below every contact.
  const placement = all.find((l) => l.text === "Placement")!.box;
  const contact = all.find((l) => l.text === "Contact")!.box;
  expect(placement.y).toBeLessThan(contact.y);
  expect(errors).toEqual([]);
});

test("another cut's opened court draws no apron words", async ({ page }) => {
  const { stage, errors } = await openWith(
    page,
    "hand=right&cut=rallyPlacement",
  );
  await expect(stage.locator("[data-approach-labels]")).toHaveCount(0);
  for (const word of ["Placement", "Contact", "Their FH", "Their BH"]) {
    await expect(stage.locator("svg text", { hasText: word })).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

/* ── T23: the opened court's words open at the size Returns' do ────────── */

/**
 * The art's words are SVG `font-size`s in viewBox units, so their size on
 * screen is size × the opening zoom — and Approaches opens on the whole
 * length, about half the zoom a landing cut opens at. Measured on the real
 * shell with the cut's saved bands drawn (`?bands=1`), against Returns
 * (`returnPlacement`) opened at the same viewport.
 */
const VIEWPORTS = [
  { width: 1512, height: 982 },
  { width: 1180, height: 820 },
] as const;

/** The court at its opening frame, on `cut`, with its bands drawn. */
async function openBanded(
  page: Page,
  cut: "approaches" | "returnPlacement",
  viewport: { width: number; height: number },
) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize(viewport);
  await page.goto(`${origin}/?hand=right&bands=1&cut=${cut}`);
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  const stage = dialog.locator("[data-court-stage]");
  await expect(stage.locator("[data-viz-mark]")).toHaveCount(4);
  await expect(stage.locator("[data-viz-band-label]").first()).toBeVisible();
  return { stage, errors };
}

/** The first band's caps label — the same row on both cuts. */
async function firstBandLabel(stage: ReturnType<Page["locator"]>) {
  return (await stage.locator("[data-viz-band-label]").first().boundingBox())!;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

test("a depth band label opens at the same height on Approaches as on Returns", async ({
  page,
}) => {
  const viewport = VIEWPORTS[0];
  const returns = await openBanded(page, "returnPlacement", viewport);
  const returnsLabel = await firstBandLabel(returns.stage);
  const approaches = await openBanded(page, "approaches", viewport);
  const approachLabel = await firstBandLabel(approaches.stage);
  expect(returnsLabel.height).toBeGreaterThan(0);
  expect(Math.abs(approachLabel.height - returnsLabel.height)).toBeLessThan(
    0.5,
  );
  expect([...returns.errors, ...approaches.errors]).toEqual([]);
});

for (const viewport of VIEWPORTS) {
  test(`at ${viewport.width}×${viewport.height} every apron word opens no smaller than Returns' band label, and no two words or band labels overlap`, async ({
    page,
  }) => {
    const returns = await openBanded(page, "returnPlacement", viewport);
    const bandHeight = (await firstBandLabel(returns.stage)).height;
    const { stage, errors } = await openBanded(page, "approaches", viewport);
    const stageBox = (await stage.boundingBox())!;
    const { all } = await apronLabels(stage);
    expect(all.map((l) => l.text).sort()).toEqual(
      ["Contact", "Middle", "Placement", "Their BH", "Their FH"].sort(),
    );
    for (const label of all) {
      expect(label.box.height, label.text).toBeGreaterThanOrEqual(bandHeight);
      expect(inside(label.box, stageBox), label.text).toBe(true);
    }
    // No two apron words share any of the stage.
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        expect(
          overlaps(all[i].box, all[j].box),
          `${all[i].text} / ${all[j].text}`,
        ).toBe(false);
      }
    }
    // Nor does any word sit on a band's label or its rate.
    const bandTexts = stage.locator("[data-viz-bands] text");
    const n = await bandTexts.count();
    expect(n).toBeGreaterThan(0);
    for (let i = 0; i < n; i++) {
      const band = (await bandTexts.nth(i).boundingBox())!;
      for (const label of all) {
        expect(overlaps(label.box, band), `${label.text} / band ${i}`).toBe(
          false,
        );
      }
    }
    expect([...returns.errors, ...errors]).toEqual([]);
  });
}

/* ── Plan §5: the court prints names only ─────────────────────────────── */

test("a band label is its name with the range on its own line beneath, and no figures", async ({
  page,
}) => {
  const { stage, errors } = await openBanded(
    page,
    "returnPlacement",
    VIEWPORTS[0],
  );
  const bands = stage.locator("[data-viz-bands] [data-viz-band]");
  const n = await bands.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const band = bands.nth(i);
    const name = band.locator("[data-viz-band-label]");
    const range = band.locator("[data-viz-band-range]");
    const nameText = (await name.textContent()) ?? "";
    const rangeText = (await range.textContent()) ?? "";
    // "DEEP" / "0–9 FT": the name holds no figure, the range is its own line.
    expect(nameText).toMatch(/^[A-Z ]+$/);
    expect(rangeText).toMatch(/^\d+–\d+ FT$/);
    expect(await name.getAttribute("x")).toBe(await range.getAttribute("x"));
    const nameBox = (await name.boundingBox())!;
    const rangeBox = (await range.boundingBox())!;
    expect(rangeBox.y).toBeGreaterThanOrEqual(nameBox.y + nameBox.height - 1);
    // Right-aligned at the same edge.
    expect(
      Math.abs(nameBox.x + nameBox.width - (rangeBox.x + rangeBox.width)),
    ).toBeLessThan(1);
    // Mono caps at the 11px equivalent with 1.4px tracking, white at 78–90%.
    const type = name.locator("..");
    await expect(type).toHaveAttribute("font-family", "var(--font-mono)");
    expect(Number(await type.getAttribute("font-size"))).toBeCloseTo(
      (11 * 366) / 652,
      2,
    );
    expect(Number(await type.getAttribute("letter-spacing"))).toBeCloseTo(
      (1.4 * 366) / 652,
      2,
    );
    for (const text of [name, range]) {
      const opacity = Number(await text.getAttribute("fill-opacity"));
      expect(opacity).toBeGreaterThanOrEqual(0.78);
      expect(opacity).toBeLessThanOrEqual(0.9);
    }
  }
  // Nothing the bands print is a rate or a count.
  const words = await stage
    .locator("[data-viz-bands] text")
    .evaluateAll((nodes) => nodes.map((node) => node.textContent ?? ""));
  for (const word of words) expect(word, word).not.toMatch(/%|·/);
  expect(errors).toEqual([]);
});

/* ── T8: Placement · Contact · Both on every chart ───────────────────────
 * The same four dots on the Errors court (`?cut=errors`), under each view
 * (`?ends=`): three shots with a recorded contact and one (`solo-c`)
 * without. Errors has no contact court of its own, so all three views are
 * this one court's own drawing. */

/** What a mark's glyph at `end` is painted with. */
async function glyphPaint(mark: Locator, end: "placement" | "contact") {
  return mark
    .locator(`[data-viz-mark-glyph][data-viz-mark-end="${end}"] > *`)
    .evaluate((node) => ({
      tag: node.tagName.toLowerCase(),
      fill: node.getAttribute("fill"),
      fillOpacity: node.getAttribute("fill-opacity"),
      stroke: node.getAttribute("stroke"),
    }));
}

test("Errors in Both draws each shot's landing as a solid dot and its contact as a ring with a white middle", async ({
  page,
}) => {
  const { stage, errors } = await openWith(page, "cut=errors&ends=both");
  const stageBox = (await stage.boundingBox())!;

  for (const id of PAIRS) {
    const mark = stage.locator(`[data-viz-mark="${id}"]`);
    await expect(mark.locator("[data-viz-mark-part]")).toHaveCount(2);
    // Both ends are on the stage as the court opens: the whole length.
    for (const part of ["contact", "placement"] as const) {
      const box = (await mark
        .locator(`[data-viz-mark-part="${part}"] [data-viz-mark-glyph]`)
        .boundingBox())!;
      expect(inside(box, stageBox), `${id} ${part}`).toBe(true);
    }
    // The contact is drawn in the near half, below its landing.
    const landing = (await mark
      .locator('[data-viz-mark-part="placement"] [data-viz-mark-glyph]')
      .boundingBox())!;
    const contact = (await mark
      .locator('[data-viz-mark-part="contact"] [data-viz-mark-glyph]')
      .boundingBox())!;
    expect(contact.y).toBeGreaterThan(landing.y);
  }

  // A lost point's mark is red: its landing filled, its contact a red ring
  // round a white middle, in the mark's own shape (a backhand's triangle).
  const b = stage.locator('[data-viz-mark="pair-b"]');
  const landing = await glyphPaint(b, "placement");
  expect(landing.fill).toBe("var(--viz-bad)");
  expect(landing.fillOpacity).toBeNull();
  const ring = await glyphPaint(b, "contact");
  expect(ring.tag).toBe("polygon");
  expect(ring.stroke).toBe("var(--viz-bad)");
  expect(ring.fill).toBe("#fff");
  expect(Number(ring.fillOpacity)).toBeGreaterThanOrEqual(0.85);
  expect(Number(ring.fillOpacity)).toBeLessThanOrEqual(0.9);
  const circle = await glyphPaint(
    stage.locator('[data-viz-mark="pair-a"]'),
    "contact",
  );
  expect(circle.tag).toBe("circle");
  expect(circle.fill).toBe("#fff");
  expect(errors).toEqual([]);
});

test("Errors in Both: pointing at a shot joins its two ends with a dashed white line and sets the others back", async ({
  page,
}) => {
  const { stage, errors } = await openWith(page, "cut=errors&ends=both");
  const a = stage.locator('[data-viz-mark="pair-a"]');
  await expect(stage.locator("[data-viz-pair-link]")).toHaveCount(0);

  await a.locator('[data-viz-mark-part="placement"]').hover();
  const link = a.locator("[data-viz-pair-link]");
  await expect(link).toHaveCount(1);
  await expect(link).toHaveAttribute("stroke-dasharray", "4 3");
  await expect(link).toHaveAttribute("stroke", /^#fff(fff)?$/i);
  await expect(link).toHaveAttribute("vector-effect", "non-scaling-stroke");
  await expect(a.locator("[data-viz-pair-ring]")).toHaveCount(2);
  // The line runs from one end's centre to the other's.
  const ends = await a.evaluate((node) => {
    const centre = (part: string) => {
      const hit = node.querySelector(
        `[data-viz-mark-part="${part}"] circle[fill="transparent"]`,
      )!;
      return [hit.getAttribute("cx"), hit.getAttribute("cy")];
    };
    const line = node.querySelector("[data-viz-pair-link]")!;
    return {
      contact: centre("contact"),
      placement: centre("placement"),
      from: [line.getAttribute("x1"), line.getAttribute("y1")],
      to: [line.getAttribute("x2"), line.getAttribute("y2")],
    };
  });
  expect(ends.from).toEqual(ends.contact);
  expect(ends.to).toEqual(ends.placement);

  // Other landings at 40%, other contact rings at 60%; the one read, full.
  await expectNotSetBack(stage, "pair-a");
  for (const id of ["pair-b", "solo-c", "pair-d"]) {
    await expectSetBack(stage, id);
  }

  // Selecting keeps the line and the fade once the pointer has left.
  await a.locator('[data-viz-mark-part="contact"]').click();
  await page.mouse.move(2, 2);
  await expect(a).toHaveAttribute("aria-pressed", "true");
  await expect(a.locator("[data-viz-pair-link]")).toHaveCount(1);
  await expectSetBack(stage, "pair-b");
  expect(errors).toEqual([]);
});

test("Errors in Both: a shot with no recorded contact draws its landing alone, with no ring and no line", async ({
  page,
}) => {
  const { stage, errors } = await openWith(page, "cut=errors&ends=both");
  const c = stage.locator('[data-viz-mark="solo-c"]');
  await expect(c.locator("[data-viz-mark-glyph]")).toHaveCount(1);
  await expect(c.locator('[data-viz-mark-end="contact"]')).toHaveCount(0);
  await expect(c.locator("[data-viz-mark-part]")).toHaveCount(0);
  await c.hover();
  await expect(page.locator("[data-viz-readout]")).toBeVisible();
  await expect(stage.locator("[data-viz-pair-link]")).toHaveCount(0);
  await expect(c.locator("[data-viz-pair-ring]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("Errors in Both names its ends: PLACEMENT over the far baseline, CONTACT under the near one, in the court's label type", async ({
  page,
}) => {
  const { stage, errors } = await openWith(page, "cut=errors&ends=both");
  const stageBox = (await stage.boundingBox())!;
  const words = stage.locator("[data-court-end-labels] text");
  await expect(words).toHaveCount(2);
  // No lane names: those are Approaches' own.
  await expect(stage.locator("[data-approach-labels]")).toHaveCount(0);

  const placement = stage.locator('[data-court-end-label="placement"]');
  const contact = stage.locator('[data-court-end-label="contact"]');
  for (const [word, text] of [
    [placement, "PLACEMENT"],
    [contact, "CONTACT"],
  ] as const) {
    // Mono caps, the one court label size and tracking, white at 78–90%.
    const shown = await word.evaluate((node) => ({
      text: (node as SVGTextElement).textContent ?? "",
      transform: getComputedStyle(node).textTransform,
      family: node.parentElement!.getAttribute("font-family"),
      size: node.getAttribute("font-size"),
      tracking: node.parentElement!.getAttribute("letter-spacing"),
      opacity: Number(node.getAttribute("fill-opacity")),
    }));
    expect(shown.text.toUpperCase()).toBe(text);
    expect(shown.transform).toBe("uppercase");
    expect(shown.family).toBe("var(--font-mono)");
    expect(Number(shown.tracking) / Number(shown.size)).toBeCloseTo(
      1.4 / 11,
      3,
    );
    expect(shown.opacity).toBeGreaterThanOrEqual(0.78);
    expect(shown.opacity).toBeLessThanOrEqual(0.9);
    expect(inside((await word.boundingBox())!, stageBox), text).toBe(true);
  }

  // Either side of every mark: Placement above the highest landing, Contact
  // below the lowest contact.
  const glyphs = await stage
    .locator("[data-viz-mark] [data-viz-mark-glyph]")
    .evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { top: r.top, bottom: r.bottom };
      }),
    );
  const p = (await placement.boundingBox())!;
  const c = (await contact.boundingBox())!;
  expect(p.y + p.height).toBeLessThanOrEqual(
    Math.min(...glyphs.map((g) => g.top)),
  );
  expect(c.y).toBeGreaterThanOrEqual(Math.max(...glyphs.map((g) => g.bottom)));
  expect(errors).toEqual([]);
});

test("Errors in Placement draws landings only, and in Contact contact marks only", async ({
  page,
}) => {
  // Placement, the chart's default: four landings, nothing else.
  const placement = await openWith(page, "cut=errors");
  await expect(
    placement.stage.locator('[data-viz-mark-end="placement"]'),
  ).toHaveCount(4);
  await expect(
    placement.stage.locator('[data-viz-mark-end="contact"]'),
  ).toHaveCount(0);
  await expect(placement.stage.locator("[data-court-end-labels]")).toHaveCount(
    0,
  );

  // Contact: a ring for each shot whose contact was recorded. The one with
  // none is not drawn.
  const contact = await openWith(page, "cut=errors&ends=contact", 3);
  await expect(contact.stage.locator('[data-viz-mark="solo-c"]')).toHaveCount(
    0,
  );
  await expect(
    contact.stage.locator('[data-viz-mark-end="contact"]'),
  ).toHaveCount(3);
  await expect(
    contact.stage.locator('[data-viz-mark-end="placement"]'),
  ).toHaveCount(0);
  await expect(contact.stage.locator("[data-viz-mark-part]")).toHaveCount(0);
  const stageBox = (await contact.stage.boundingBox())!;
  for (const id of PAIRS) {
    const glyph = contact.stage.locator(
      `[data-viz-mark="${id}"] [data-viz-mark-glyph]`,
    );
    expect(inside((await glyph.boundingBox())!, stageBox), id).toBe(true);
  }
  await expect(
    contact.stage.locator("[data-court-end-labels] text"),
  ).toHaveText(["Contact"]);
  expect([...placement.errors, ...contact.errors]).toEqual([]);
});
