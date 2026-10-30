import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";

let server: Server;
let origin: string;
let outputPath: string;

test.beforeAll(async () => {
  outputPath = mkdtempSync(join(tmpdir(), "viz-fullscreen-filters-"));
  const webpack = (
    nextWebpack as unknown as {
      webpack: (
        config: unknown,
        cb: (
          error: Error | null,
          stats: { toJson(): { errors?: unknown[] } },
        ) => void,
      ) => void;
    }
  ).webpack;
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/viz-fullscreen-filters-harness.tsx"),
        output: { path: outputPath, filename: "bundle.js" },
        module: {
          rules: [
            {
              test: /\.tsx?$/,
              exclude: /node_modules/,
              use: resolve("tests/fixtures/tsx-transpile-loader.js"),
            },
          ],
        },
        resolve: {
          extensions: [".tsx", ".ts", ".jsx", ".js"],
          alias: {
            "@/app/dashboard/matches/(detail)/[matchId]/viz-bands-actions":
              resolve("tests/fixtures/viz-fullscreen-actions-browser-mock.ts"),
            "@/app/dashboard/matches/(detail)/[matchId]/saved-views-actions":
              resolve("tests/fixtures/viz-fullscreen-actions-browser-mock.ts"),
            "next/navigation": resolve(
              "tests/fixtures/viz-navigation-browser-mock.ts",
            ),
            "@": resolve("src"),
          },
        },
      },
      (error, stats) => (error ? reject(error) : done(stats.toJson())),
    );
  });
  expect(result.errors ?? []).toEqual([]);
  const bundle = readFileSync(join(outputPath, "bundle.js"));
  const stylesheet = (
    await postcss([tailwindcss()]).process(
      readFileSync(resolve("src/app/globals.css"), "utf8"),
      { from: resolve("src/app/globals.css") },
    )
  ).css;
  server = createServer((request, response) => {
    const path = request.url ?? "/";
    response.setHeader(
      "content-type",
      path.startsWith("/bundle.js")
        ? "text/javascript; charset=utf-8"
        : path.startsWith("/style.css")
          ? "text/css; charset=utf-8"
          : "text/html; charset=utf-8",
    );
    response.end(
      path.startsWith("/bundle.js")
        ? bundle
        : path.startsWith("/style.css")
          ? stylesheet
          : '<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (server?.listening)
    await new Promise<void>((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  if (outputPath) rmSync(outputPath, { recursive: true, force: true });
});

test("fullscreen selected points can open their timed video", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watch`);
  await page.getByRole("button", { name: "Open fullscreen" }).click();
  await page
    .getByRole("region", { name: "Serve placement fullscreen" })
    .locator('[data-viz-mark="p1-high-0-0"]')
    .hover();
  const watch = page.getByRole("button", { name: "Watch point" });
  await expect(watch).toBeVisible();
  await watch.click();
  await expect(page).toHaveURL(/tab=film.*point=p1-high-0-0/);
  await expect(page).not.toHaveURL(/fullscreen=1/);
});

test("fullscreen control tooltips are the site's chrome tooltip, above the viewer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  await page.getByRole("button", { name: "Open fullscreen" }).click();
  const viewer = page.getByRole("region", {
    name: "Serve placement fullscreen",
  });
  for (const [name, text] of [
    ["Exit fullscreen", "Exit fullscreenEsc"],
    ["Fit the court", "Fit the court"],
  ]) {
    await viewer.getByRole("button", { name, exact: true }).hover();
    const tip = page.locator('[data-slot="tooltip-content"]');
    await expect(tip).toBeVisible();
    await expect(tip).toContainText(text);
    const look = await tip.evaluate((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      const under = document.elementFromPoint(
        box.left + box.width / 2,
        box.top + box.height / 2,
      );
      return {
        radius: style.borderRadius,
        size: style.fontSize,
        weight: style.fontWeight,
        arrow: node.querySelector("svg") !== null,
        onTop: under !== null && node.contains(under),
        left: box.left,
        right: box.right,
        top: box.top,
        bottom: box.bottom,
      };
    });
    expect(look.onTop).toBe(true);
    expect(look.radius).toBe("12px");
    expect(look.size).toBe("12px");
    expect(look.weight).toBe("500");
    expect(look.arrow).toBe(false);
    expect(look.left).toBeGreaterThanOrEqual(0);
    expect(look.right).toBeLessThanOrEqual(320);
    expect(look.top).toBeGreaterThanOrEqual(0);
    expect(look.bottom).toBeLessThanOrEqual(700);
    // Radix closes on the move AFTER the pointer leaves its grace area.
    await page.screenshot({
      path: test.info().outputPath(`fullscreen-tooltip-${name}.png`),
    });
    await page.mouse.move(160, 350, { steps: 5 });
    await page.mouse.move(150, 340, { steps: 2 });
    await expect(tip).toHaveCount(0);
  }
  // Hovering the Exit button must not take Esc away from the viewer.
  await viewer.getByRole("button", { name: "Exit fullscreen" }).hover();
  await expect(page.locator('[data-slot="tooltip-content"]')).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
});

for (const [width, height] of [
  [1100, 800],
  [320, 568],
] as const) {
  test(`every fullscreen mark's readout stays on screen and above the chrome (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/?tab=shots&cut=serve&fixture=watch`);
    await page.getByRole("button", { name: "Open fullscreen" }).click();
    const viewer = page.getByRole("region", {
      name: "Serve placement fullscreen",
    });
    // Roving focus reaches marks at any edge, panned or not.
    await viewer.getByRole("button", { name: "Zoom in" }).click();
    await viewer.getByRole("button", { name: "Zoom in" }).click();
    const marks = viewer.locator("[data-viz-mark]");
    const count = await marks.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += Math.max(1, Math.floor(count / 12))) {
      await marks.nth(i).dispatchEvent("mouseover");
      const readout = viewer.locator("[data-viz-readout]");
      await expect(readout).toBeVisible();
      const box = await readout.evaluate((node) => {
        // A read-only readout is `pointer-events-none`, which would hide it
        // from the paint-order probe below.
        (node as HTMLElement).style.pointerEvents = "auto";
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        const under = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          radius: style.borderRadius,
          onTop: under !== null && node.contains(under),
        };
      });
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(width);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(height);
      expect(box.onTop).toBe(true);
      expect(box.radius).toBe("12px");
      await page.screenshot({
        path: test.info().outputPath(`fullscreen-readout-${width}-${i}.png`),
      });
      await marks.nth(i).dispatchEvent("mouseout");
      await expect(readout).toHaveCount(0);
    }
  });
}

test("a fullscreen serve zone answers with the dark readout, and a finger can pin it", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 768, height: 1024 },
  });
  const page = await context.newPage();
  await page.goto(`${origin}/?tab=shots&cut=serve&chart=zones`);
  await page.getByRole("button", { name: "Open fullscreen" }).tap();
  const viewer = page.getByRole("region", {
    name: "Serve placement fullscreen",
  });
  await viewer.waitFor();
  const readout = viewer.locator("[data-viz-readout]");
  const cell = viewer.locator("[data-serve-zone-cell]").first();
  await expect(viewer.locator("[data-serve-zone] title")).toHaveCount(0);
  await cell.tap();
  await expect(readout).toBeVisible();
  await expect(readout).toContainText("points won");
  await page.screenshot({
    path: test.info().outputPath("fullscreen-zone-readout-touch.png"),
  });
  await page.touchscreen.tap(8, 500);
  await expect(readout).toHaveCount(0);

  // A tap only performs; a hold names the control, on the shared primitive.
  const fit = viewer.getByRole("button", { name: "Fit the court" });
  await fit.tap();
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0);
  await fit.dispatchEvent("pointerdown", {
    pointerType: "touch",
    button: 0,
    isPrimary: true,
    pointerId: 7,
  });
  const tip = page.locator('[data-slot="tooltip-content"]');
  await expect(tip).toContainText("Fit the court");
  await page.screenshot({
    path: test.info().outputPath("fullscreen-hold-tooltip-touch.png"),
  });
  await context.close();
});

test("the focused court's serve zones answer with the dark readout, not a native title", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve&chart=zones`);
  const art = page.locator("[data-viz-focused-art]");
  const readout = page.locator("[data-viz-focused-readout]");
  const zone = art.locator('[data-serve-zone="deuce-wide"]');
  await expect(art.locator("[data-serve-zone]")).toHaveCount(6);
  await expect(art.locator("title")).toHaveCount(0);
  await expect(zone).toHaveAttribute(
    "aria-label",
    "deuce wide: 2 serves, 100% points won",
  );
  await zone.hover();
  await expect(readout).toContainText("Avery Kim — deuce wide");
  await expect(readout).toContainText("100% of 2 points won");
  await page.screenshot({
    path: test.info().outputPath("focused-zone-readout.png"),
  });
  const look = await readout.evaluate((node) => {
    const style = getComputedStyle(node);
    const box = node.getBoundingClientRect();
    return {
      radius: style.borderRadius,
      top: box.top,
      cardTop: node.closest("[data-viz-focused-card]")?.getBoundingClientRect()
        .top,
    };
  });
  expect(look.radius).toBe("12px");
  expect(look.top).toBeGreaterThanOrEqual(look.cardTop ?? 0);
  // Hover leaves; a click pins it until the next press anywhere.
  await page.mouse.move(2, 2);
  await expect(readout).toHaveCount(0);
  await zone.click();
  await page.mouse.move(2, 2);
  await expect(readout).toBeVisible();
  await page.mouse.down();
  await page.mouse.up();
  await expect(readout).toHaveCount(0);
});

test("a finger pins a focused zone's readout, and the card never clips it on a phone", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 700 },
  });
  const page = await context.newPage();
  await page.goto(`${origin}/?tab=shots&cut=serve&chart=zones`);
  const art = page.locator("[data-viz-focused-art]");
  const readout = page.locator("[data-viz-focused-readout]");
  const zones = art.locator("[data-serve-zone]");
  for (let i = 0; i < 6; i += 1) {
    await zones.nth(i).tap();
    await expect(readout).toBeVisible();
    const fits = await readout.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const card = node
        .closest("[data-viz-focused-card]")
        ?.getBoundingClientRect();
      return (
        card !== undefined &&
        box.left >= card.left &&
        box.right <= card.right &&
        box.top >= card.top &&
        box.bottom <= card.bottom
      );
    });
    expect(fits).toBe(true);
  }
  await page.screenshot({
    path: test.info().outputPath("focused-zone-readout-phone.png"),
  });
  await page.touchscreen.tap(4, 690);
  await expect(readout).toHaveCount(0);
  await context.close();
});

test("a pinned fullscreen readout stays until a click outside", async ({
  page,
}) => {
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  await page.getByRole("button", { name: "Open fullscreen" }).click();
  const viewer = page.getByRole("region", {
    name: "Serve placement fullscreen",
  });
  const readout = viewer.locator("[data-viz-readout]");
  await viewer.locator('[data-viz-mark="p1-high-0-0"]').click({ force: true });
  await page.mouse.move(4, 400);
  await page.waitForTimeout(300);
  await expect(readout).toBeVisible();
  await page.mouse.click(4, 400);
  await expect(readout).toHaveCount(0);
});

test("fullscreen chips scroll in one line, preserve controls and follow both subjects after reopening", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(
    `${origin}/?tab=shots&cut=serve&ball=first&ball=second&court=deuce&court=ad&zone=t&zone=body&zone=wide&result=won&result=lost&vset=1&vset=2`,
  );
  await page.getByRole("button", { name: "Open fullscreen" }).click();
  const avatar = page.getByTestId("fullscreen-subject-avatar");
  await expect(avatar).toHaveText("AK");
  const scoreboardBox = await page
    .getByTestId("fullscreen-scoreboard")
    .boundingBox();
  const exitBox = await page
    .getByRole("button", { name: "Exit fullscreen" })
    .boundingBox();
  expect(scoreboardBox).not.toBeNull();
  expect(exitBox).not.toBeNull();
  expect(exitBox?.y ?? 0).toBeGreaterThan(
    (scoreboardBox?.y ?? 0) + (scoreboardBox?.height ?? 0),
  );
  expect((exitBox?.x ?? 0) + (exitBox?.width ?? 0)).toBeLessThanOrEqual(320);
  const fullscreen = page.getByRole("region", {
    name: "Serve placement fullscreen",
  });
  const strip = fullscreen.getByRole("group", { name: "Applied filters" });
  const viewport = page.getByLabel("Applied filters, scroll horizontally");
  await expect(strip.locator("button").first()).toBeVisible();
  const chipLayout = await strip.evaluate((node) => ({
    height: node.getBoundingClientRect().height,
    scrollWidth: node.parentElement?.scrollWidth,
    clientWidth: node.parentElement?.clientWidth,
  }));
  expect(chipLayout.height).toBeLessThan(30);
  expect(chipLayout.scrollWidth).toBeGreaterThan(chipLayout.clientWidth ?? 0);
  await viewport.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => viewport.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  await strip.getByRole("button", { name: "Remove Wide" }).focus();
  await expect(
    strip.getByRole("button", { name: "Remove Wide" }),
  ).toBeInViewport();
  await page.keyboard.press("Enter");
  await expect(strip.getByRole("button", { name: "Remove Wide" })).toHaveCount(
    0,
  );
  for (const name of [
    "Serve placement",
    "Scatter",
    "Zoom out",
    "Zoom in",
    "Fit the court",
    "Exit fullscreen",
  ]) {
    const control = fullscreen.getByRole("button", { name });
    await control.focus();
    await expect(control).toBeInViewport();
  }
  await page.getByRole("button", { name: "Exit fullscreen" }).click();
  await page.getByRole("button", { name: "Open fullscreen" }).click();
  await expect(avatar).toHaveText("AK");
  await fullscreen.locator('[aria-haspopup="dialog"]').click();
  await page.getByRole("button", { name: /Blake Rivera/ }).click();
  await expect(avatar).toHaveText("BR");
  const scoreRows = page.getByTestId("fullscreen-scoreboard");
  await expect(scoreRows.getByText("Avery Kim", { exact: true })).toBeVisible();
  await expect(
    scoreRows.getByText("Blake Rivera", { exact: true }),
  ).toBeVisible();
  await expect(scoreRows.getByText("6", { exact: true })).toBeVisible();
  await expect(scoreRows.getByText("4", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [reducedMotion, width] of [
  ["no-preference", 1100],
  ["no-preference", 390],
  ["reduce", 390],
] as const) {
  test(`fullscreen reveals the whole viewer and returns focus (${reducedMotion}, ${width}px)`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion });
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`${origin}/?tab=shots&cut=serve`);
    // Next's CSS optimizer converts these tokens to seconds; the raw
    // PostCSS harness otherwise preserves ms and misses unit parsing bugs.
    await page.addStyleTag({
      content:
        ":root { --duration-reveal: .4s; --duration-hover: .2s; --duration-fast: .15s; }",
    });
    await page.evaluate(() => {
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        const animation = animate.apply(this, args);
        if (
          this.getAttribute("role") === "region" &&
          this.getAttribute("aria-label")?.endsWith("fullscreen")
        ) {
          animation.pause();
          animation.play = () => {};
        }
        return animation;
      };
    });
    await page.keyboard.press("f");
    const viewer = page.getByRole("region", {
      name: "Serve placement fullscreen",
    });
    await expect(viewer).toBeVisible();
    const entrance = await viewer.evaluate((element) => {
      const animation = element.getAnimations()[0];
      const effect = animation.effect as KeyframeEffect;
      animation.currentTime = Number(effect.getTiming().duration) / 2;
      return {
        frames: effect.getKeyframes(),
        duration: effect.getTiming().duration,
        progress: effect.getComputedTiming().progress,
      };
    });
    expect(entrance.duration).toBe(reducedMotion === "reduce" ? 150 : 200);
    expect(
      entrance.frames.every((frame) => !frame.clipPath && !frame.transform),
    ).toBe(true);
    expect(entrance.frames[0].opacity).toBe("0");
    expect(entrance.frames.at(-1)?.opacity).toBe("1");
    await page.screenshot({
      path: test
        .info()
        .outputPath(`fullscreen-midpoint-${reducedMotion}-${width}.png`),
    });
    await viewer.evaluate((element) =>
      element.getAnimations().forEach((animation) => animation.finish()),
    );
    await expect(viewer).toBeFocused();
    await page.keyboard.press("Escape");
    // The portal remains until its exit finishes, including on repeated Escape.
    await page.keyboard.press("Escape");
    await expect(viewer).toBeVisible();
    expect(
      await viewer.evaluate(
        (element) => element.getAnimations()[0].effect?.getTiming().duration,
      ),
    ).toBe(150);
    await viewer.evaluate((element) =>
      element.getAnimations().forEach((animation) => animation.finish()),
    );
    await expect(viewer).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open fullscreen", exact: true }),
    ).toBeFocused();
    await expect(page).not.toHaveURL(/fullscreen=1/);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
  });
}

test("Escape can interrupt the fullscreen entrance", async ({ page }) => {
  await page.goto(`${origin}/?tab=shots&cut=serve`);
  await page
    .getByRole("button", { name: "Open fullscreen", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("region", { name: "Serve placement fullscreen" }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Open fullscreen", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Serve placement fullscreen" }),
  ).toBeVisible();
});

test("a slow court mount does not consume the fullscreen entrance before paint", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(`${origin}/?tab=shots&cut=serve&slowMount=1`);
  await page
    .getByRole("button", { name: "Open fullscreen", exact: true })
    .click();
  const viewer = page.getByRole("region", {
    name: "Serve placement fullscreen",
  });
  const progress = await viewer.evaluate((element) => {
    const animation = element.getAnimations()[0];
    return animation ? Number(animation.currentTime) : null;
  });
  expect(progress).not.toBeNull();
  expect(progress!).toBeLessThan(200);
  await expect
    .poll(() => viewer.evaluate((element) => element.getAnimations().length))
    .toBe(0);
  await expect(viewer).toBeFocused();
});

for (const key of ["f", "F"]) {
  test(`the ${key} shortcut plays a live fullscreen entrance`, async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(`${origin}/?tab=shots&cut=serve`);
    await page.locator("#viz-focused-heading").focus();
    await page.keyboard.press(key);
    const viewer = page.getByRole("region", {
      name: "Serve placement fullscreen",
    });
    await expect(viewer).toBeVisible();
    const motion = await viewer.evaluate((element) => {
      const animation = element.getAnimations()[0];
      if (!animation) return null;
      return {
        duration: animation.effect?.getTiming().duration,
        time: Number(animation.currentTime),
        clip: getComputedStyle(element).clipPath,
      };
    });
    expect(motion).not.toBeNull();
    expect(motion?.duration).toBe(200);
    expect(motion!.time).toBeLessThan(200);
    expect(motion?.clip).toBe("none");
    await expect
      .poll(() => viewer.evaluate((element) => element.getAnimations().length))
      .toBe(0);
    await expect(viewer).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(viewer).toHaveCount(0);
    await page.keyboard.press(key);
    await expect(viewer).toBeVisible();
  });
}
