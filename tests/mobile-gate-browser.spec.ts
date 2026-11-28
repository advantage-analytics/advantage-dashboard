import { expect, test, type Browser } from "@playwright/test";
import { resolve } from "node:path";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

/**
 * The "Built for the bigger screen" gate must cover a phone at any viewport
 * width. Width alone let a phone through turned sideways (an iPhone is
 * 844–956px wide in landscape) and in "Request desktop site" mode (~980px),
 * which is how a match page was opened on a phone.
 *
 * The harness page has no viewport meta, so a mobile context lays out at
 * ~980px whatever `viewport` says, exactly as desktop-site mode does: every
 * phone case here would pass the old width-only gate. The real app does ship
 * a viewport meta, so a portrait phone there is also caught by the CSS.
 */

let origin: string;
let close: () => Promise<void>;

test.beforeAll(async () => {
  ({ origin, close } = await startStyledHarness(
    "tests/fixtures/mobile-gate-harness.tsx",
    {
      alias: {
        "next/image$": resolve("tests/fixtures/next-image-browser-mock.tsx"),
      },
    },
  ));
});

test.afterAll(async () => {
  await close?.();
});

async function gateVisible(
  browser: Browser,
  options: {
    viewport: { width: number; height: number };
    screen: { width: number; height: number };
    hasTouch: boolean;
    isMobile: boolean;
  },
  path = "/dashboard/matches/abc",
) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  await page.goto(`${origin}${path}`);
  await expect(page.getByText("Match report behind the gate")).toBeAttached();
  // Let the post-hydration phone check run.
  await page.waitForTimeout(200);
  const visible = await page
    .getByRole("alertdialog", { name: "Built for the bigger screen" })
    .isVisible();
  await context.close();
  return visible;
}

const iphoneScreen = { width: 430, height: 932 };

test("a phone in portrait sees the gate", async ({ browser }) => {
  expect(
    await gateVisible(browser, {
      viewport: { width: 430, height: 932 },
      screen: iphoneScreen,
      hasTouch: true,
      isMobile: true,
    }),
  ).toBe(true);
});

test("a phone in landscape sees the gate", async ({ browser }) => {
  expect(
    await gateVisible(browser, {
      viewport: { width: 932, height: 430 },
      screen: { width: 932, height: 430 },
      hasTouch: true,
      isMobile: true,
    }),
  ).toBe(true);
});

test("a phone asking for the desktop site sees the gate", async ({
  browser,
}) => {
  expect(
    await gateVisible(browser, {
      viewport: { width: 980, height: 2120 },
      screen: iphoneScreen,
      hasTouch: true,
      isMobile: true,
    }),
  ).toBe(true);
});

test("a tablet passes, portrait and landscape", async ({ browser }) => {
  for (const [w, h] of [
    [820, 1180],
    [1180, 820],
  ]) {
    expect(
      await gateVisible(browser, {
        viewport: { width: w, height: h },
        screen: { width: w, height: h },
        hasTouch: true,
        isMobile: true,
      }),
    ).toBe(false);
  }
});

test("a desktop passes", async ({ browser }) => {
  expect(
    await gateVisible(browser, {
      viewport: { width: 1440, height: 900 },
      screen: { width: 1440, height: 900 },
      hasTouch: false,
      isMobile: false,
    }),
  ).toBe(false);
});

test("Ask stays open on a phone", async ({ browser }) => {
  expect(
    await gateVisible(
      browser,
      {
        viewport: { width: 932, height: 430 },
        screen: { width: 932, height: 430 },
        hasTouch: true,
        isMobile: true,
      },
      "/dashboard/ask",
    ),
  ).toBe(false);
});
