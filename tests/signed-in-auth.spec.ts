import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as nextWebpack from "next/dist/compiled/webpack/webpack";

/**
 * `/login` and `/sign-up` for a browser that already holds a session draw
 * `SignedInCard` in place of the form, so nobody makes a second account by
 * picking a different Google account without noticing. Signed out, the
 * pages are exactly what they were: the form, and no auth call beyond the
 * cookie read.
 *
 * `SignedInGate` runs in a webpack bundle with the browser Supabase client
 * replaced by `signed-in-gate-supabase-mock.ts`, which takes the session
 * from `?session=` and records every call.
 */

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
  const outputPath = mkdtempSync(join(tmpdir(), "signed-in-gate-"));
  const result = await new Promise<{ errors?: unknown[] }>((done, reject) => {
    webpack(
      {
        mode: "development",
        devtool: false,
        entry: resolve("tests/fixtures/signed-in-gate-harness.tsx"),
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
            "@/lib/supabase/client": resolve(
              "tests/fixtures/signed-in-gate-supabase-mock.ts",
            ),
            "next/link": resolve("tests/fixtures/next-link-browser-mock.tsx"),
            "posthog-js": resolve(
              "tests/fixtures/signed-in-gate-posthog-mock.ts",
            ),
            "@/lib/posthog-client": resolve(
              "tests/fixtures/posthog-client-browser-mock.ts",
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

async function open(page: Page, query: string) {
  await page.goto(`${origin}/${query}`);
  await expect
    .poll(() => page.locator("html").getAttribute("data-hydrated"))
    .toBe("true");
}

const calls = (page: Page) =>
  page.evaluate(() => JSON.parse(sessionStorage.getItem("calls") ?? "[]"));

const card = (page: Page) =>
  page.getByRole("heading", { name: "You're Already Signed In." });

test("signed out: the form stays and the check costs only the cookie read", async ({
  page,
}) => {
  await open(page, "?session=none");
  await expect.poll(() => calls(page)).toEqual(["getSession"]);
  await expect(page.getByRole("form", { name: "Auth form" })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("a revoked session keeps the form, so Continue cannot loop back here", async ({
  page,
}) => {
  await open(page, "?session=revoked");
  await expect
    .poll(() => calls(page))
    .toEqual(["getSession", "getUser", "from:users"]);
  await expect(page.getByRole("form", { name: "Auth form" })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
});

test("signed in on /login: the card names the account and continues to the dashboard", async ({
  page,
}) => {
  await open(page, "?session=live");
  await expect(card(page)).toBeVisible();
  await expect(page.getByRole("form", { name: "Auth form" })).toHaveCount(0);
  await expect(page.getByText("Sign in", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Carry on where you left off, or sign out to use a different account.",
    ),
  ).toBeVisible();

  const account = page.getByTestId("signed-in-account");
  await expect(account).toContainText("JA");
  await expect(account).toContainText("Jordan Avery");
  await expect(account).toContainText("jordan.avery@university.edu");

  await expect(
    page.getByRole("link", { name: "Continue to Advantage" }),
  ).toHaveAttribute("href", "/dashboard");
  await expect(
    page.getByText("Signs you out on this device only."),
  ).toBeVisible();
});

test("signed in on /sign-up: the sign-up copy, and a safe next is where Continue goes", async ({
  page,
}) => {
  await open(
    page,
    `?session=live&mode=sign-up&next=${encodeURIComponent("/join/abc")}`,
  );
  await expect(card(page)).toBeVisible();
  await expect(page.getByText("Create account", { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      "Carry on with this account, or sign out first if you meant to make a separate one.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Continue to Advantage" }),
  ).toHaveAttribute("href", "/join/abc");
});

test("an off-site next never reaches Continue", async ({ page }) => {
  await open(
    page,
    `?session=live&next=${encodeURIComponent("https://evil.example/x")}`,
  );
  await expect(
    page.getByRole("link", { name: "Continue to Advantage" }),
  ).toHaveAttribute("href", "/dashboard");
});

test("an account with no name shows the email alone", async ({ page }) => {
  await open(page, "?session=live&profile=0");
  const account = page.getByTestId("signed-in-account");
  await expect(account.locator('[aria-hidden="true"]')).toHaveText("J");
  await expect(account.locator("span.truncate")).toHaveText([
    "jordan.avery@university.edu",
  ]);
});

test("Use a different account signs out locally and reloads the same address to the form", async ({
  page,
}) => {
  const query = "?session=live&mode=sign-up&next=%2Fjoin%2Fabc";
  await open(page, query);
  await expect(card(page)).toBeVisible();

  await page.getByRole("button", { name: "Use a different account" }).click();

  await expect(page.getByRole("form", { name: "Auth form" })).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  expect(new URL(page.url()).search).toBe(query);
  const made = await calls(page);
  expect(made).toContain("signOut:local");
  expect(made).toContain("posthog.reset");
});

test("a failed sign-out keeps the card and says so instead of reloading", async ({
  page,
}) => {
  await open(page, "?session=live&signOut=fail");
  await expect(card(page)).toBeVisible();

  await page.getByRole("button", { name: "Use a different account" }).click();

  await expect(page.getByRole("alert")).toHaveText(
    "Couldn't sign you out. Try again.",
  );
  await expect(card(page)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use a different account" }),
  ).toBeEnabled();
  expect(await calls(page)).not.toContain("posthog.reset");
});

test("only /login and /sign-up are gated", () => {
  for (const route of ["login", "sign-up"]) {
    expect(readFileSync(`src/app/(auth)/${route}/page.tsx`, "utf8")).toContain(
      "<SignedInGate",
    );
  }
  for (const route of [
    "callback",
    "confirm",
    "update-password",
    "forgot-password",
    "oauth",
  ]) {
    const dir = `src/app/(auth)/${route}`;
    const found = execSync(`grep -rl "SignedInGate" "${dir}" || true`, {
      encoding: "utf8",
    }).trim();
    expect(found, dir).toBe("");
  }
});
