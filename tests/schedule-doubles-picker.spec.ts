import { expect, test } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";
import {
  buildDualPayloadLines,
  filledDualLines,
  seedDualLines,
} from "@/components/dashboard/schedule/static/dual-build-step";
import type { LadderPlayer } from "@/lib/data/roster-server";

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
  const outputPath = mkdtempSync(join(tmpdir(), "schedule-doubles-picker-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/schedule-doubles-picker-harness.tsx"),
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
            "@/lib/schedule/actions": resolve(
              "tests/fixtures/schedule-doubles-actions-browser-mock.ts",
            ),
            "@/components/dashboard/team/roster-actions": resolve(
              "tests/fixtures/roster-actions-browser-mock.ts",
            ),
            "next/navigation": resolve(
              "tests/fixtures/next-navigation-browser-mock.ts",
            ),
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
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

async function openFixture(page: import("@playwright/test").Page) {
  await page.goto(origin);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

async function choose(
  page: import("@playwright/test").Page,
  trigger: string,
  option: string,
) {
  await page.getByRole("button", { name: trigger }).click();
  await page.getByRole("menuitemradio", { name: option, exact: true }).click();
}

test("real doubles pickers select, clear, edit, and preserve sibling lines", async ({
  page,
}) => {
  await openFixture(page);

  await choose(page, "Our partner 1 at D1", "Alex Kim · S1 · roster 11111111");
  expect(await page.evaluate(() => window.doublesSelections)).toEqual([
    {
      key: "D1",
      ids: ["11111111-1111-4111-8111-111111111111"],
      labels: ["Alex Kim"],
    },
  ]);
  await expect(page.getByLabel("D1 roster ids")).toHaveText(
    "11111111-1111-4111-8111-111111111111",
  );
  await expect(page.getByLabel("Singles roster ids")).toHaveText(
    "11111111-1111-4111-8111-111111111111",
  );

  await choose(page, "Our partner 2 at D1", "Casey Lee · S3");
  await expect(page.getByLabel("D1 roster ids")).toHaveText(
    "11111111-1111-4111-8111-111111111111|casey-lee",
  );
  await expect(page.getByLabel("D1 roster labels")).toHaveText(
    "Alex Kim|Casey Lee",
  );
  await expect(page.getByLabel("D2 roster ids")).toHaveText(
    "22222222-2222-4222-8222-222222222222|casey-lee",
  );

  await choose(page, "Our partner 2 at D1", "Choose player");
  await expect(page.getByLabel("D1 roster ids")).toHaveText(
    "11111111-1111-4111-8111-111111111111",
  );
  await expect(page.getByLabel("D2 roster ids")).toHaveText(
    "22222222-2222-4222-8222-222222222222|casey-lee",
  );

  await choose(page, "Our partner 1 at D1", "Alex Kim · S2 · roster 22222222");
  await expect(page.getByLabel("D1 roster ids")).toHaveText(
    "22222222-2222-4222-8222-222222222222",
  );
});

test("distinct and reversed-pair conflicts are unavailable with an explanation", async ({
  page,
}) => {
  await openFixture(page);
  await choose(page, "Our partner 1 at D1", "Alex Kim · S2 · roster 22222222");

  await page.getByRole("button", { name: "Our partner 2 at D1" }).click();
  await expect(
    page.getByRole("menuitemradio", {
      name: "Alex Kim · S2 · roster 22222222",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitemradio", { name: "Casey Lee · S3", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/same two-player pairing.*either order.*D2/i),
  ).toBeVisible();
});

test("same-name identities are disambiguated and settled doubles stay locked", async ({
  page,
}) => {
  await openFixture(page);

  await page.getByRole("button", { name: "Our partner 1 at D1" }).click();
  await expect(
    page.getByRole("menuitemradio", {
      name: "Alex Kim · S1 · roster 11111111",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitemradio", {
      name: "Alex Kim · S2 · roster 22222222",
      exact: true,
    }),
  ).toBeVisible();

  await expect(page.getByText("Alex Kim / Jordan Lee")).toBeVisible();
  await expect(page.getByText("Played", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /partner .* at D3/i }),
  ).toHaveCount(0);
});

test("stable identities and labels reach payloads without blocking singles participation", () => {
  const ladder: LadderPlayer[] = [
    { userId: "same-one", name: "Alex Kim", ladderPosition: 1 },
    { userId: "same-two", name: "Alex Kim", ladderPosition: 2 },
  ];
  const lines = seedDualLines(ladder, {
    lines: [
      { key: "S1", ourIds: ["same-one"], ourLabels: ["Alex Kim"] },
      {
        key: "D1",
        ourIds: ["same-one", "same-two"],
        ourLabels: ["Alex / Kim", "Alex / Kim"],
      },
    ],
  });
  const payload = buildDualPayloadLines(
    filledDualLines(lines, {}),
    new Map(),
    new Map(),
  );

  expect(payload.find((line) => line.slot === "S1")?.playerUserIds).toEqual([
    "same-one",
  ]);
  expect(payload.find((line) => line.slot === "D1")).toMatchObject({
    playerUserIds: ["same-one", "same-two"],
    playerLabels: ["Alex / Kim", "Alex / Kim"],
  });
});

test("forfeit menu distinguishes both sides from normal play and preserves the lineup", async ({
  page,
}) => {
  await openFixture(page);
  const original = await page.getByLabel("Lineup state").textContent();
  for (const [side, label] of [
    ["ours", "We lost — our side forfeited"],
    ["theirs", "We won — opponent forfeited"],
  ]) {
    await page.getByRole("button", { name: "Play choice for S1" }).click();
    await page
      .getByRole("menuitemradio", { name: new RegExp(`^${label}`) })
      .click();
    await expect(
      page.getByRole("button", { name: "Play choice for S1" }),
    ).toHaveText(label);
    const lines = JSON.parse(
      (await page.getByLabel("Lineup state").textContent())!,
    );
    expect(lines[0].forfeit).toBe(side);
    expect(lines.slice(1)).toEqual(JSON.parse(original!).slice(1));
    await expect(page.getByText("Morgan Reed", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Play choice for S1" }).click();
    await page.getByRole("menuitemradio", { name: /^Normal play/ }).click();
    await expect(page.getByLabel("Lineup state")).toHaveText(original!);
  }
});

test("either saved forfeit remains read-only and explains the explicit clear path", async ({
  page,
}) => {
  for (const side of ["ours", "theirs"]) {
    await page.goto(`${origin}/?outcome=${side}`);
    await expect(
      page.getByText(
        side === "ours"
          ? "We lost — our side forfeited"
          : "We won — opponent forfeited",
        {
          exact: false,
        },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Play choice for S1" }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Clear the outcome on the event to edit."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Play choice for D3" }),
    ).toHaveCount(0);
  }
});
