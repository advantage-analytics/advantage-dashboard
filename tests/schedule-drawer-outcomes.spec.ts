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
  const outputPath = mkdtempSync(join(tmpdir(), "schedule-drawer-outcomes-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/schedule-drawer-outcomes-harness.tsx"),
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

async function open(
  page: import("@playwright/test").Page,
  options: {
    kind?: "dual" | "tournament";
    role?: "owner" | "coach" | "staff" | "player";
    cleared?: boolean;
  } = {},
) {
  const params = new URLSearchParams({
    kind: options.kind ?? "dual",
    role: options.role ?? "owner",
    cleared: String(options.cleared ?? false),
  });
  await page.goto(`${origin}/?${params}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

function line(page: import("@playwright/test").Page, slot: string) {
  return page.getByText(slot, { exact: true }).locator("..");
}

test("dual outcomes use shared kind, side, score, and tick state without report links", async ({
  page,
}) => {
  await open(page);

  await expect(page.locator("[data-schedule-drawer-body]")).toContainText(
    "4–3",
  );

  for (const [slot, kind, side] of [
    ["S1", "Forfeited", "Won"],
    ["S2", "Forfeited", "Lost"],
    ["S3", "Defaulted", "Won"],
    ["S4", "Defaulted", "Lost"],
    ["S5", "Withdrawn", "Won"],
    ["S6", "Withdrawn", "Lost"],
  ] as const) {
    const row = line(page, slot);
    await expect(row.getByText(kind, { exact: true })).toBeVisible();
    await expect(row.getByText(side, { exact: true })).toHaveCount(1);
    await expect(row.getByRole("link")).toHaveCount(0);
  }

  // S1 deliberately has a stale ready match under its saved outcome. The
  // outcome wins, so the drawer must not leak a report link to that match.
  await expect(
    page.locator('a[href="/dashboard/matches/ignored-ready-match"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('a[href="/dashboard/matches/ready-played-match"]'),
  ).toHaveCount(1);

  const tickColors = await page
    .locator("[data-schedule-drawer-body] span")
    .evaluateAll((nodes) =>
      nodes
        .map((node) => (node as HTMLElement).style.background)
        .filter(Boolean),
    );
  expect(tickColors.filter((value) => value === "var(--success)")).toHaveLength(
    5,
  );
  expect(tickColors.filter((value) => value === "var(--danger)")).toHaveLength(
    4,
  );
});

test("the tournament summary advances to an outcome-only round and returns to the played report when cleared", async ({
  page,
}) => {
  await open(page, { kind: "tournament" });

  const outcome = line(page, "QF");
  await expect(outcome.getByText("Withdrawn", { exact: true })).toBeVisible();
  await expect(outcome.getByText("Lost", { exact: true })).toHaveCount(1);
  await expect(outcome.getByRole("link")).toHaveCount(0);
  await expect(
    page.locator('a[href="/dashboard/matches/played-r16"]'),
  ).toHaveCount(0);

  await open(page, { kind: "tournament", cleared: true });
  const played = line(page, "R16");
  await expect(played.getByText("6-2, 6-3", { exact: true })).toBeVisible();
  await expect(played.getByText("Won", { exact: true })).toHaveCount(1);
  await expect(played).toHaveAttribute("href", "/dashboard/matches/played-r16");
});

test("recording and clearing outcomes preserve the player footer and staff action policy", async ({
  page,
}) => {
  await open(page, { role: "player" });
  await expect(page.getByRole("link", { name: "Open dual" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Enter results" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Event actions" })).toHaveCount(
    0,
  );

  await open(page, { role: "player", cleared: true });
  await expect(page.getByRole("link", { name: "Open dual" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Enter results" })).toHaveCount(
    0,
  );

  for (const role of ["owner", "coach", "staff"] as const) {
    await open(page, { role });
    await expect(
      page.getByRole("button", { name: "Event actions" }),
    ).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Enter results" })).toHaveCount(
      0,
    );

    await open(page, { role, cleared: true });
    await expect(
      page.getByRole("button", { name: "Event actions" }),
    ).toHaveCount(1);
    await expect(page.getByRole("link", { name: "Enter results" })).toHaveCount(
      1,
    );
  }

  await open(page, { kind: "tournament", role: "player" });
  await expect(page.getByRole("link", { name: "Open tournament" })).toHaveCount(
    1,
  );
  await open(page, { kind: "tournament", role: "staff" });
  await expect(page.getByRole("link", { name: "Enter results" })).toHaveCount(
    1,
  );
});
