import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

/**
 * The card ↔ lightbox court morph (`viz-court-morph.ts`) in a real browser:
 * a clicked card's court grows into the lightbox's stage, shrinks back into
 * the card on close, and is only an opacity fade under reduced motion. Times
 * are sampled inside the page (one `evaluate` clicks and measures), so a
 * slow test runner does not blur them.
 */

type Box = { x: number; y: number; w: number; h: number };

const GHOST = "[data-viz-court-morph-ghost]";
const SERVE_CARD = 'a[aria-label^="All serves, Avery Kim"]';

/** Clicks `selector` (or presses Esc) in the page, then measures the card's
 *  court, the flying copy and the lightbox's stage after `ms`. */
async function sampleAfter(
  page: Page,
  action: { click: string } | { escape: true },
  ms: number,
) {
  return page.evaluate(
    async ({ action, ms, ghostSel, cardSel }) => {
      const box = (el: Element | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      };
      if ("click" in action) {
        // Focused first, as a real click would leave it: the lightbox gives
        // focus back to whatever had it.
        const target = document.querySelector(action.click) as HTMLElement;
        target.focus();
        target.click();
      } else {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
      }
      await new Promise((done) => setTimeout(done, ms));
      const dialog = document.querySelector<HTMLElement>(
        '[role="dialog"]:not([data-testid="lightbox-chunk-pending"])',
      );
      return {
        card: box(
          document.querySelector(`${cardSel} [data-viz-court-art] svg`),
        ),
        ghost: box(document.querySelector(`${ghostSel} > div`)),
        ghosts: document.querySelectorAll(ghostSel).length,
        stage: box(
          document.querySelector("[role=dialog] [data-court-morph-target]"),
        ),
        dialogOpacity: dialog ? Number(getComputedStyle(dialog).opacity) : null,
        flying: document.documentElement.hasAttribute("data-viz-court-morph"),
      };
    },
    { action, ms, ghostSel: GHOST, cardSel: SERVE_CARD },
  );
}

/** One frame of `traceAfter`: the boxes and opacity `sampleAfter` reads. */
type Frame = {
  card: Box | null;
  ghost: Box | null;
  ghosts: number;
  stage: Box | null;
  dialogOpacity: number | null;
  flying: boolean;
};

/**
 * Clicks `selector` (or presses Esc) in the page, then records every
 * animation frame for `ms`. A fixed-time sample says "at 120ms the copy is
 * mid-flight", which a slow CI runner breaks by starting the animation late;
 * a trace asks whether the copy was EVER mid-flight, which is the claim.
 */
async function traceAfter(
  page: Page,
  action: { click: string } | { escape: true },
  ms: number,
): Promise<Frame[]> {
  return page.evaluate(
    async ({ action, ms, ghostSel, cardSel }) => {
      const box = (el: Element | null | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      };
      const frame = () => {
        const dialog = document.querySelector<HTMLElement>(
          '[role="dialog"]:not([data-testid="lightbox-chunk-pending"])',
        );
        return {
          card: box(
            document.querySelector(`${cardSel} [data-viz-court-art] svg`),
          ),
          ghost: box(document.querySelector(`${ghostSel} > div`)),
          ghosts: document.querySelectorAll(ghostSel).length,
          stage: box(
            document.querySelector("[role=dialog] [data-court-morph-target]"),
          ),
          dialogOpacity: dialog
            ? Number(getComputedStyle(dialog).opacity)
            : null,
          flying: document.documentElement.hasAttribute("data-viz-court-morph"),
        };
      };
      if ("click" in action) {
        const target = document.querySelector(action.click) as HTMLElement;
        target.focus();
        target.click();
      } else {
        document.activeElement?.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
      }
      const frames = [frame()];
      const end = performance.now() + ms;
      while (performance.now() < end) {
        await new Promise((done) => requestAnimationFrame(done));
        frames.push(frame());
      }
      return frames;
    },
    { action, ms, ghostSel: GHOST, cardSel: SERVE_CARD },
  );
}

/** A frame whose copy has grown past the card but not past the stage —
 *  the copy part way through its flight. */
const growing = (f: Frame) =>
  f.ghosts === 1 &&
  f.ghost !== null &&
  f.card !== null &&
  f.ghost.w > f.card.w * 1.05 &&
  (f.stage === null || f.ghost.w < f.stage.w + 1);

const centre = (b: Box) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
/** `v` lies between `a` and `b` (either order), with a pixel of slack. */
const between = (v: number, a: number, b: number) =>
  v >= Math.min(a, b) - 1 && v <= Math.max(a, b) + 1;

test.describe("the match report", () => {
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

  /** The wall, with the lightbox's chunk already loaded (one open and close
   *  through a link), so the click below is the common case. */
  async function wallWarm(page: Page) {
    await page.setViewportSize({ width: 1512, height: 982 });
    await page.goto(`${origin}/?tab=shots&cut=serve`);
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator(SERVE_CARD)).toBeVisible();
  }

  test("a card's court grows into the stage, then only the lightbox's court is left; Esc shrinks it back into the card", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await wallWarm(page);
    const card = page.locator(SERVE_CARD);

    // During the flight one copy is part way from the card to the stage.
    const opening = await traceAfter(page, { click: SERVE_CARD }, 900);
    const mid = opening.find((f) => growing(f) && f.stage !== null);
    expect(mid, "a frame with the copy mid-flight").toBeDefined();
    expect(mid!.flying).toBe(true);
    const g = mid!.ghost!;
    const s = mid!.stage!;
    // The card's own court is hidden while its copy is away, so measure the
    // card's art box from the layout (visibility keeps its box).
    const c = mid!.card!;
    expect(between(centre(g).x, centre(c).x, centre(s).x)).toBe(true);
    expect(between(centre(g).y, centre(c).y, centre(s).y)).toBe(true);

    // Then the copy is gone, the dialog is fully opaque, and the stage —
    // the lightbox's own court — shows.
    await expect(page.locator(GHOST)).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() =>
          Number(
            getComputedStyle(document.querySelector('[role="dialog"]')!)
              .opacity,
          ),
        ),
      )
      .toBe(1);
    const settled = await page.evaluate(
      ({ ghostSel }) => ({
        ghosts: document.querySelectorAll(ghostSel).length,
        flying: document.documentElement.hasAttribute("data-viz-court-morph"),
        dialog: Number(
          getComputedStyle(document.querySelector('[role="dialog"]')!).opacity,
        ),
        stage: Number(
          getComputedStyle(document.querySelector("[data-court-stage]")!)
            .opacity,
        ),
      }),
      { ghostSel: GHOST },
    );
    expect(settled).toEqual({ ghosts: 0, flying: false, dialog: 1, stage: 1 });
    const dialog = page.getByRole("dialog", { name: "All serves" });
    await expect(dialog.locator("[data-viz-mark]").first()).toBeVisible();

    // Esc: the copy starts on the stage and shrinks toward the card while
    // the dialog fades.
    await dialog.getByRole("heading").first().focus();
    const closing = await traceAfter(page, { escape: true }, 600);
    const closingAt = closing.find(
      (f) =>
        f.ghosts === 1 &&
        f.ghost !== null &&
        f.dialogOpacity !== null &&
        f.dialogOpacity < 1 &&
        f.ghost.w < s.w &&
        f.ghost.w > c.w - 1,
    );
    expect(closingAt, "a frame with the copy shrinking").toBeDefined();
    const cg = closingAt!.ghost!;
    expect(between(centre(cg).x, centre(c).x, centre(s).x)).toBe(true);
    expect(between(centre(cg).y, centre(c).y, centre(s).y)).toBe(true);

    // It ends on the card: no dialog, no copy, the card's court back, and
    // focus on the card.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(GHOST)).toHaveCount(0);
    await expect(card).toBeFocused();
    await expect(card.locator("[data-viz-court-art]")).toHaveCSS(
      "visibility",
      "visible",
    );
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
    expect(errors).toEqual([]);
  });

  test("the frame enters with the court: the box opens out of the card on the flight's curve, then the rows rise in, header first", async ({
    page,
  }) => {
    await wallWarm(page);
    // Every frame for 900ms after the click: the copy, the box's clip and
    // opacity, the scrim, and each entering row's opacity by its step.
    const frames = await page.evaluate(
      async ({ ghostSel, cardSel }) => {
        const card = document.querySelector<HTMLElement>(cardSel)!;
        const cardBox = card
          .querySelector("[data-viz-court-art]")!
          .parentElement!.getBoundingClientRect();
        const read = () => {
          const box = document.querySelector<HTMLElement>(
            "[data-lightbox-box]",
          );
          const scrim = document.querySelector("[data-lightbox-scrim]");
          const step = (n: number) => {
            const els = box?.querySelectorAll(`[data-lightbox-enter="${n}"]`);
            if (!els || els.length === 0) return null;
            return Math.min(
              ...[...els].map((el) => Number(getComputedStyle(el).opacity)),
            );
          };
          const r = box?.getBoundingClientRect();
          return {
            ghosts: document.querySelectorAll(ghostSel).length,
            box: r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null,
            clip: box ? getComputedStyle(box).clipPath : null,
            boxOpacity: box ? Number(getComputedStyle(box).opacity) : null,
            scrim: scrim ? Number(getComputedStyle(scrim).opacity) : null,
            steps: [step(0), step(1), step(2)],
          };
        };
        card.focus();
        card.click();
        const out = [read()];
        const end = performance.now() + 900;
        while (performance.now() < end) {
          await new Promise((done) => requestAnimationFrame(done));
          out.push(read());
        }
        return {
          frames: out,
          card: {
            x: cardBox.left,
            y: cardBox.top,
            w: cardBox.width,
            h: cardBox.height,
          },
        };
      },
      { ghostSel: GHOST, cardSel: SERVE_CARD },
    );
    const { card } = frames;
    const shown = frames.frames.filter(
      (f) => f.box !== null && f.boxOpacity !== null,
    );
    // Never a frame with the whole box on screen while the copy has just
    // left the card: the box is revealed from the card's corner outward —
    // some frame clips it to a rect that starts inside it, near the card.
    const parse = (clip: string) =>
      /^inset\((-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px (-?[\d.]+)px/
        .exec(clip)
        ?.slice(1)
        .map(Number) ?? null;
    const opening = shown.find((f) => {
      const inset = f.clip ? parse(f.clip) : null;
      return (
        f.ghosts === 1 &&
        f.boxOpacity! > 0 &&
        inset !== null &&
        inset[1] > 1 &&
        inset[2] > 1
      );
    });
    expect(opening, "a frame with the box part way open").toBeDefined();
    // No flash: the first frame the box shows at all, it is already clipped
    // to the opening rect — never whole for a frame before the reveal.
    const first = shown.find((f) => f.boxOpacity! > 0)!;
    expect(first.clip).toMatch(/^inset\(/);
    const [top, , , left] = parse(opening!.clip!)!;
    // The open edge's top-left lies between the card's and the box's.
    expect(opening!.box!.y + top).toBeLessThanOrEqual(card.y + 1);
    expect(opening!.box!.x + left).toBeLessThanOrEqual(card.x + 1);
    // The scrim was part way in at some frame (it fades with the flight).
    expect(
      frames.frames.some((f) => f.scrim !== null && f.scrim > 0 && f.scrim < 1),
      "a frame with the scrim part way in",
    ).toBe(true);
    // The rows come after the box: some frame has the box whole and the
    // header still on its way in.
    expect(
      shown.some((f) => f.boxOpacity === 1 && (f.steps[0] ?? 1) < 1),
      "a frame with the box shown and the header still rising in",
    ).toBe(true);
    // In order, never ahead of the step before.
    for (const f of shown) {
      const [a, b, c] = f.steps;
      if (a !== null && b !== null) expect(b).toBeLessThanOrEqual(a + 0.001);
      if (b !== null && c !== null) expect(c).toBeLessThanOrEqual(b + 0.001);
    }
    // It ends whole: no clip, everything opaque, no copy.
    const last = frames.frames.at(-1)!;
    expect(last).toMatchObject({
      ghosts: 0,
      clip: "none",
      boxOpacity: 1,
      scrim: 1,
      steps: [1, 1, 1],
    });
  });

  test("the first open, before the lightbox's chunk has loaded, still sets off at once and lands on the stage", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 982 });
    // Hold the chunk back so the copy has no stage to aim at yet.
    await page.route("**/*.js", async (route) => {
      if (route.request().url().endsWith("/bundle.js")) return route.continue();
      await new Promise((done) => setTimeout(done, 250));
      await route.continue();
    });
    await page.goto(`${origin}/?tab=shots`);
    await expect(page.locator(SERVE_CARD)).toBeVisible();
    const frames = await traceAfter(page, { click: SERVE_CARD }, 400);
    // It set off before there was a stage to aim at.
    expect(
      frames.some((f) => growing(f) && f.stage === null),
      "a frame with the copy flying and no stage yet",
    ).toBe(true);
    await expect(
      page.getByRole("dialog", { name: "All serves" }),
    ).toBeVisible();
    await expect(page.locator(GHOST)).toHaveCount(0);
    await expect(page.locator("[data-court-stage]")).toHaveCSS("opacity", "1");
  });

  test("Esc mid-open closes cleanly: no copy, no scrim, no inert page, focus on the card", async ({
    page,
  }) => {
    await wallWarm(page);
    const card = page.locator(SERVE_CARD);
    await sampleAfter(page, { click: SERVE_CARD }, 90);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(GHOST)).toHaveCount(0);
    expect(
      await page.evaluate(() =>
        document.documentElement.hasAttribute("data-viz-court-morph"),
      ),
    ).toBe(false);
    await expect(page.locator("body")).not.toHaveCSS("pointer-events", "none");
    await expect(card).toBeFocused();
    await expect(card.locator("[data-viz-court-art]")).toHaveCSS(
      "visibility",
      "visible",
    );
    // And it opens again.
    await card.click();
    await expect(
      page.getByRole("dialog", { name: "All serves" }),
    ).toBeVisible();
  });

  test("a switch inside the open lightbox does not morph", async ({ page }) => {
    await wallWarm(page);
    await page.locator(SERVE_CARD).click();
    const dialog = page.getByRole("dialog", { name: "All serves" });
    await expect(dialog).toBeVisible();
    await expect(page.locator(GHOST)).toHaveCount(0);
    await dialog.getByRole("button", { name: "Opponent" }).click();
    const after = await page.evaluate(
      async ({ ghostSel }) => {
        let seen = 0;
        for (let i = 0; i < 10; i++) {
          seen += document.querySelectorAll(ghostSel).length;
          await new Promise((done) => setTimeout(done, 30));
        }
        return seen;
      },
      { ghostSel: GHOST },
    );
    expect(after).toBe(0);
  });

  test("reduced motion: no copy, a fade in and a fade out", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await wallWarm(page);
    const card = page.locator(SERVE_CARD);
    const fadeIn = await traceAfter(page, { click: SERVE_CARD }, 500);
    expect(fadeIn.every((f) => f.ghosts === 0 && !f.flying)).toBe(true);
    // The fade in (150ms) was under way at some frame.
    expect(
      fadeIn.some(
        (f) =>
          f.dialogOpacity !== null &&
          f.dialogOpacity > 0 &&
          f.dialogOpacity < 1,
      ),
      "a frame part way through the fade in",
    ).toBe(true);
    const dialog = page.getByRole("dialog", { name: "All serves" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("heading").first().focus();
    const fadeOut = await traceAfter(page, { escape: true }, 500);
    expect(fadeOut.every((f) => f.ghosts === 0)).toBe(true);
    expect(
      fadeOut.some((f) => f.dialogOpacity !== null && f.dialogOpacity < 1),
      "a frame part way through the fade out",
    ).toBe(true);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(card).toBeFocused();
  });
});

test.describe("the season", () => {
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

  test("a card morphs into the pending lightbox before the server answers, and the court arrives in it", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1512, height: 982 });
    await page.goto(
      `${origin}/dashboard/team/roster/p-avery?tab=visualizations&delay=1500`,
    );
    await expect(page.locator(SERVE_CARD)).toBeVisible();
    const frames = await traceAfter(page, { click: SERVE_CARD }, 700);
    // The target is the pending frame's loading bar, not a stage, so the
    // claim is only that the copy grew past the card on its way.
    expect(
      frames.some(
        (f) =>
          f.ghosts === 1 &&
          f.ghost !== null &&
          f.card !== null &&
          f.ghost.w > f.card.w * 1.05,
      ),
      "a frame with the copy grown past the card",
    ).toBe(true);
    // Landed on the loading frame: the copy is gone, the bar shows.
    await expect(page.locator(GHOST)).toHaveCount(0);
    await expect(
      page.locator("[role=dialog] [data-court-morph-target]").last(),
    ).toHaveCSS("opacity", "1");
    // The court arrives in the same dialog.
    await expect(
      page.locator("[data-court-stage] [data-viz-mark]").first(),
    ).toBeVisible({ timeout: 5_000 });
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(GHOST)).toHaveCount(0);
    await expect(page.locator(SERVE_CARD)).toBeFocused();
  });
});
