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

    // ~120ms in: one copy in flight, part way from the card to the stage.
    const mid = await sampleAfter(page, { click: SERVE_CARD }, 120);
    expect(mid.ghosts).toBe(1);
    expect(mid.flying).toBe(true);
    expect(mid.ghost).not.toBeNull();
    expect(mid.stage).not.toBeNull();
    const g = mid.ghost!;
    const s = mid.stage!;
    // The card's own court is hidden while its copy is away, so measure the
    // card's art box from the layout (visibility keeps its box).
    const c = mid.card!;
    expect(g.w).toBeGreaterThan(c.w * 1.05);
    expect(g.w).toBeLessThan(s.w + 1);
    expect(between(centre(g).x, centre(c).x, centre(s).x)).toBe(true);
    expect(between(centre(g).y, centre(c).y, centre(s).y)).toBe(true);

    // ~500ms: the copy is gone, the dialog is fully opaque, and the stage —
    // the lightbox's own court — shows.
    await page.waitForTimeout(400);
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
    const closingAt = await sampleAfter(page, { escape: true }, 130);
    expect(closingAt.ghosts).toBe(1);
    expect(closingAt.dialogOpacity).not.toBeNull();
    expect(closingAt.dialogOpacity!).toBeLessThan(1);
    const cg = closingAt.ghost!;
    expect(cg.w).toBeLessThan(s.w);
    expect(cg.w).toBeGreaterThan(c.w - 1);
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
    const mid = await sampleAfter(page, { click: SERVE_CARD }, 120);
    expect(mid.ghosts).toBe(1);
    expect(mid.stage).toBeNull();
    expect(mid.ghost!.w).toBeGreaterThan(mid.card!.w * 1.05);
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
    const mid = await sampleAfter(page, { click: SERVE_CARD }, 60);
    expect(mid.ghosts).toBe(0);
    expect(mid.flying).toBe(false);
    expect(mid.dialogOpacity).not.toBeNull();
    // The fade in (150ms), under way.
    expect(mid.dialogOpacity!).toBeLessThan(1);
    await page.waitForTimeout(300);
    const dialog = page.getByRole("dialog", { name: "All serves" });
    await dialog.getByRole("heading").first().focus();
    const out = await sampleAfter(page, { escape: true }, 60);
    expect(out.ghosts).toBe(0);
    expect(out.dialogOpacity!).toBeLessThan(1);
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
    const mid = await sampleAfter(page, { click: SERVE_CARD }, 120);
    expect(mid.ghosts).toBe(1);
    expect(mid.ghost!.w).toBeGreaterThan(mid.card!.w * 1.05);
    // Landed on the loading frame: the copy is gone, the bar shows.
    await page.waitForTimeout(450);
    expect(await page.locator(GHOST).count()).toBe(0);
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
