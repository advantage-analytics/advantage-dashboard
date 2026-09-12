import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

const webpack = (
  nextWebpack as unknown as {
    webpack: (
      config: unknown,
      callback: (error: Error | null, stats: WebpackStats) => void,
    ) => void;
  }
).webpack;

type WebpackStats = { toJson(): { errors?: unknown[] } };

let server: Server;
let origin: string;

test.beforeAll(async () => {
  const outputPath = mkdtempSync(join(tmpdir(), "schedule-drawer-actions-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/schedule-drawer-actions-harness.tsx"),
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
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
            "next/navigation": resolve(
              "tests/fixtures/next-navigation-browser-mock.ts",
            ),
            "@/lib/schedule/actions": resolve(
              "tests/fixtures/schedule-actions-browser-mock.ts",
            ),
            "@": resolve("src"),
          },
        },
      },
      (error: Error | null, stats: WebpackStats) => {
        if (error) reject(error);
        else done(stats.toJson());
      },
    );
  });
  expect(result.errors ?? []).toEqual([]);

  const bundle = readFileSync(join(outputPath, "bundle.js"));
  server = createServer((request, response) => {
    if (request.url?.startsWith("/bundle.js")) {
      response.setHeader("content-type", "text/javascript; charset=utf-8");
      response.end(bundle);
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(
      '<!doctype html><html><body><div id="root"></div><script src="/bundle.js"></script></body></html>',
    );
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  origin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  if (!server) return;
  await new Promise<void>((done, reject) =>
    server.close((error) => (error ? reject(error) : done())),
  );
});

async function openSchedule(
  page: import("@playwright/test").Page,
  role: "owner" | "coach" | "staff" | "player",
) {
  await page.goto(`${origin}/?role=${role}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

async function openEventWithKeyboard(
  page: import("@playwright/test").Page,
  name: string,
) {
  const row = page.getByRole("button", { name: new RegExp(name) });
  await row.focus();
  await row.press("Enter");
  await expect(page.getByRole("dialog")).toBeFocused();
}

test("an upload-entitled player gets one noun-specific footer through the full keyboard flow", async ({
  page,
}) => {
  await openSchedule(page, "player");
  await expect(page.locator("html")).toHaveAttribute(
    "data-upload-entitled",
    "true",
  );

  await openEventWithKeyboard(page, "Long Open Dual");
  await expect(page.getByRole("button", { name: "Event actions" })).toHaveCount(
    0,
  );
  const dualLink = page.getByRole("link", { name: "Open dual" });
  await expect(dualLink).toHaveCount(1);
  await expect(dualLink).toHaveAttribute(
    "href",
    "/dashboard/team/schedule/dual-open",
  );
  await expect(dualLink).toHaveAttribute("class", /\bw-full\b/);

  // Arrow stepping keeps keyboard focus inside the drawer and changes the
  // footer noun without creating a second route to the event.
  await page.getByRole("dialog").press("ArrowDown");
  await expect(
    page.getByRole("dialog", { name: "Browser Invitational" }),
  ).toBeFocused();
  await expect(page.getByRole("link", { name: "Open dual" })).toHaveCount(0);
  const tournamentLink = page.getByRole("link", {
    name: "Open tournament",
  });
  await expect(tournamentLink).toHaveCount(1);
  await expect(tournamentLink).toHaveAttribute(
    "href",
    "/dashboard/team/schedule/tournament-open",
  );

  const body = page.locator("[data-schedule-drawer-body]");
  await expect
    .poll(() => body.evaluate((node) => node.scrollHeight > node.clientHeight))
    .toBe(true);
  const [drawerBox, footerBox] = await Promise.all([
    page.locator("[data-schedule-drawer]").boundingBox(),
    page.locator("[data-schedule-drawer-footer]").boundingBox(),
  ]);
  expect(drawerBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y + footerBox!.height).toBeLessThanOrEqual(
    drawerBox!.y + drawerBox!.height,
  );
  await expect(tournamentLink).toBeVisible();

  await page.getByRole("dialog").press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Browser Invitational/ }),
  ).toBeFocused();
});

test("owner, coach, and staff retain the primary for open duals and tournaments", async ({
  page,
}) => {
  for (const role of ["owner", "coach", "staff"] as const) {
    await openSchedule(page, role);
    await openEventWithKeyboard(page, "Long Open Dual");

    const dualPrimary = page.getByRole("link", { name: "Enter results" });
    await expect(dualPrimary).toHaveCount(1);
    await expect(dualPrimary).toHaveAttribute("class", /\bw-full\b/);
    await expect(dualPrimary).toHaveAttribute("class", /bg-\[var\(--blue\)\]/);
    await expect(
      page.getByRole("button", { name: "Event actions" }),
    ).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Open dual" })).toHaveCount(0);

    await page.getByRole("dialog").press("ArrowDown");
    await expect(
      page.getByRole("dialog", { name: "Browser Invitational" }),
    ).toBeFocused();
    await expect(page.getByRole("link", { name: "Enter results" })).toHaveCount(
      1,
    );
    await expect(
      page.getByRole("link", { name: "Open tournament" }),
    ).toHaveCount(0);
  }
});

test("a settled dual has no substitute primary for staff-capable viewers", async ({
  page,
}) => {
  await openSchedule(page, "coach");
  await openEventWithKeyboard(page, "Settled Dual");

  await expect(page.getByRole("button", { name: "Event actions" })).toHaveCount(
    1,
  );
  await expect(page.getByRole("link", { name: "Enter results" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("link", { name: "Open dual" })).toHaveCount(0);
  await expect(page.locator("[data-schedule-drawer-footer]")).toHaveCount(0);
});

test("staff can open both existing edit-route branches while players see no write menu", async ({
  page,
}) => {
  await openSchedule(page, "staff");
  await openEventWithKeyboard(page, "Long Open Dual");

  const trigger = page.getByRole("button", { name: "Event actions" });
  await trigger.hover();
  const tooltip = page.getByRole("tooltip", { name: "Event actions" });
  await expect(tooltip).toBeVisible();
  await expect(page.locator('[data-slot="tooltip-content"]')).toHaveClass(
    /bg-\[var\(--ink-900\)\]/,
  );

  await trigger.focus();
  await trigger.press("Enter");
  const menu = page.getByRole("menu", { name: "Event actions" });
  await expect(menu).toBeVisible();
  const edit = menu.getByRole("menuitem", { name: "Edit event" });
  await expect(edit).toBeFocused();
  await expect(
    menu.getByRole("menuitem", { name: /Delete event/ }),
  ).toHaveCount(0);
  await edit.press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.routerPushes.at(-1)))
    .toBe("/dashboard/team/schedule/dual-open/edit");

  await page.getByRole("dialog").press("ArrowDown");
  const tournamentTrigger = page.getByRole("button", { name: "Event actions" });
  await tournamentTrigger.press("Enter");
  await page
    .getByRole("menu", { name: "Event actions" })
    .getByRole("menuitem", { name: "Edit event" })
    .press("Enter");
  await expect
    .poll(() => page.evaluate(() => window.routerPushes.at(-1)))
    .toBe("/dashboard/team/schedule/tournament-open/edit");
});

test("only owners and coaches are offered deletion, with named confirmation and focus return", async ({
  page,
}) => {
  for (const role of ["owner", "coach"] as const) {
    await openSchedule(page, role);
    await openEventWithKeyboard(page, "Long Open Dual");
    const trigger = page.getByRole("button", { name: "Event actions" });
    await trigger.press("Enter");
    await page
      .getByRole("menu", { name: "Event actions" })
      .getByRole("menuitem", { name: /Delete event/ })
      .press("Enter");

    const confirmation = page.getByRole("alertdialog");
    await expect(confirmation).toBeVisible();
    await expect(
      confirmation.getByRole("heading", { name: "Delete Long Open Dual?" }),
    ).toBeVisible();
    await expect(confirmation).toContainText(
      "permanently removes the event and its empty schedule lines",
    );
    await expect(
      confirmation.getByRole("button", { name: "Cancel" }),
    ).toBeFocused();

    await confirmation.getByRole("button", { name: "Cancel" }).press("Enter");
    await expect(confirmation).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
});

test("server refusal stays in the open confirmation and leaves drawer and list untouched", async ({
  page,
}) => {
  await openSchedule(page, "owner");
  await openEventWithKeyboard(page, "Long Open Dual");
  await page.evaluate(() => {
    window.failNextDelete =
      "This event has recorded matches or outcomes and cannot be deleted.";
  });

  await page.getByRole("button", { name: "Event actions" }).press("Enter");
  await page
    .getByRole("menu", { name: "Event actions" })
    .getByRole("menuitem", { name: /Delete event/ })
    .press("Enter");
  const confirmation = page.getByRole("alertdialog");
  await confirmation
    .getByRole("button", { name: "Delete event" })
    .press("Enter");

  await expect(confirmation).toBeVisible();
  await expect(confirmation.getByRole("alert")).toHaveText(
    "This event has recorded matches or outcomes and cannot be deleted.",
  );
  await expect(
    page.locator('[data-schedule-drawer] [role="dialog"]'),
  ).toHaveAttribute("aria-label", "vs Long Open Dual");
  await expect(page.locator("#schedule-row-dual-open")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.routerRefreshes)).toBe(0);
});

test("successful deletion closes the selection, removes the row, and refreshes server data", async ({
  page,
}) => {
  await openSchedule(page, "coach");
  await openEventWithKeyboard(page, "Long Open Dual");
  await page.getByRole("button", { name: "Event actions" }).press("Enter");
  await page
    .getByRole("menu", { name: "Event actions" })
    .getByRole("menuitem", { name: /Delete event/ })
    .press("Enter");
  const confirmation = page.getByRole("alertdialog");

  // A modal owns its arrow keys. The schedule's global drawer walker must not
  // step to Browser Invitational and silently retarget the pending action.
  await confirmation.getByRole("button", { name: "Cancel" }).press("ArrowDown");
  await expect(
    confirmation.getByRole("heading", { name: "Delete Long Open Dual?" }),
  ).toBeVisible();
  await expect(
    page.locator('[data-schedule-drawer] [role="dialog"]'),
  ).toHaveAttribute("aria-label", "vs Long Open Dual");

  await confirmation
    .getByRole("button", { name: "Delete event" })
    .press("Enter");

  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Long Open Dual/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("#schedule-row-tournament-open")).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.routerRefreshes)).toBe(1);
  await expect
    .poll(() => page.evaluate(() => window.actionCalls))
    .toEqual([{ action: "deleteEvent", input: "dual-open" }]);
});
