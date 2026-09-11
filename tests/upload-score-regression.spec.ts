import { expect, test, type Page } from "@playwright/test";
import ExcelJS from "exceljs";

const baseURL = process.env.WIZARD_REPRODUCTION_BASE_URL;

/**
 * T1 runs against the actual UploadMatchFlow, not copied score-state logic.
 * The production-inaccessible harness supplies only the dashboard providers
 * normally supplied by the authenticated layout. This spec opts into a local
 * Next server because the normal suite has no browser or web-server fixture.
 */
test.describe("upload score regression reproduction", () => {
  test.skip(
    !baseURL,
    "Set WIZARD_REPRODUCTION_BASE_URL to run the local browser reproduction.",
  );

  test.beforeEach(async ({ page }) => {
    expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);
    await page.addInitScript(() => {
      localStorage.clear();
      const payload = btoa(
        JSON.stringify({ sub: "wizard-reproduction-user", exp: 4_102_444_800 }),
      )
        .replaceAll("+", "-")
        .replaceAll("/", "_")
        .replaceAll("=", "");
      const session = JSON.stringify({
        access_token: `eyJhbGciOiJub25lIn0.${payload}.fixture`,
        refresh_token: "fixture-refresh-token",
        token_type: "bearer",
        expires_at: 4_102_444_800,
        expires_in: 60 * 60,
        user: { id: "wizard-reproduction-user" },
      });
      const getItem = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        return String(key).endsWith("-auth-token")
          ? session
          : getItem.call(this, key);
      };
    });
    await blockExternalBoundaries(page);
  });

  test("one-set SwingVision import loses sets 2 and 3 at submission", async ({
    page,
  }, testInfo) => {
    const submissions: unknown[] = [];
    await captureMatchSubmission(page, submissions);
    await page.goto(`${baseURL}/wizard-reproduction?mode=new`);

    await chooseSource(page, "SwingVision export");
    await page
      .locator('input[type="file"]')
      .setInputFiles(await oneSetExport());
    await expect(page.getByText(/XLSX.*read/)).toBeVisible();
    await page.locator("[data-wizard-continue]").click();
    await setFormat(page, "Best of 3");
    await enterSecondAndThirdSets(
      page,
      "Riley Reproduction",
      "Casey Opponent",
      true,
    );

    // This is the explicit T1 intermediate result: keystrokes advance focus,
    // but short parsed arrays discard the second and third set values.
    testInfo.annotations.push({
      type: "expected failure",
      description:
        "Known T1: one-set import retains only set 1; sets 2 and 3 render blank after entry.",
    });
    expect(
      await observeScores(page, "Riley Reproduction", "Casey Opponent"),
    ).toEqual({
      player: ["6", "", ""],
      opponent: ["4", "", ""],
    });

    await page.locator("[data-wizard-continue]").click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({
      score: { player1: [6, 0, 0], player2: [4, 0, 0] },
    });
  });

  test("video form retains sets 2 and 3 and submits them", async ({ page }) => {
    const submissions: unknown[] = [];
    await mockVideoMetadata(page);
    await page.addInitScript(() =>
      localStorage.setItem(
        "uploadFormData",
        JSON.stringify({ playerName: "Riley Reproduction" }),
      ),
    );
    await captureMatchSubmission(page, submissions);
    await page.goto(`${baseURL}/wizard-reproduction?mode=new`);

    await chooseSource(page, "Advantage Intelligence");
    await page.locator('input[type="file"]').setInputFiles({
      name: "match.mp4",
      mimeType: "video/mp4",
      buffer: Buffer.from("fixture-video"),
    });
    await expect(page.getByText(/checked/)).toBeVisible();
    await page.locator("[data-wizard-continue]").click();
    await page.getByRole("radio", { name: "Fixed" }).click();
    await page.getByRole("radio", { name: "Top of frame" }).click();
    await page.locator("[data-wizard-continue]").click();
    await page
      .getByRole("textbox", { name: "Opponent", exact: true })
      .fill("Casey Opponent");
    await page
      .getByRole("button", { name: /New opponent.*Casey Opponent/ })
      .click();
    await page.getByRole("button", { name: "Choose", exact: true }).click();
    await page.getByRole("button", { name: "Ad", exact: true }).last().click();
    await page.getByLabel("Riley Reproduction, set 1").fill("6");
    await expect(page.getByLabel("Casey Opponent, set 1")).toBeFocused();
    await page.getByLabel("Casey Opponent, set 1").fill("4");
    await expect(page.getByLabel("Riley Reproduction, set 2")).toBeFocused();
    await enterSecondAndThirdSets(
      page,
      "Riley Reproduction",
      "Casey Opponent",
      false,
    );
    expect(
      await observeScores(page, "Riley Reproduction", "Casey Opponent"),
    ).toEqual({
      player: ["6", "6", "6"],
      opponent: ["4", "3", "2"],
    });

    await page.locator("[data-wizard-continue]").click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({
      score: { player1: [6, 6, 6], player2: [4, 3, 2] },
    });
  });

  test("one-set schedule preset reproduces the same lost entries", async ({
    page,
  }, testInfo) => {
    const submissions: unknown[] = [];
    await captureMatchSubmission(page, submissions);
    await page.goto(`${baseURL}/wizard-reproduction?mode=preset`);

    await page
      .locator('input[type="file"]')
      .setInputFiles(await oneSetExport());
    await expect(page.getByText(/XLSX.*read/)).toBeVisible();
    await page.locator("[data-wizard-continue]").click();
    await enterSecondAndThirdSets(
      page,
      "Riley Reproduction",
      "Casey Opponent",
      true,
    );

    testInfo.annotations.push({
      type: "expected failure",
      description:
        "Known T1: a one-set preset also drops sets 2 and 3 despite focus advancing through their inputs.",
    });
    expect(
      await observeScores(page, "Riley Reproduction", "Casey Opponent"),
    ).toEqual({
      player: ["6", "", ""],
      opponent: ["4", "", ""],
    });

    await page.locator("[data-wizard-continue]").click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({
      score: { player1: [6, 0, 0], player2: [4, 0, 0] },
    });
  });
});

async function chooseSource(page: Page, name: string) {
  await page.getByRole("button", { name: /Source:|Choose a source/ }).click();
  await page.getByRole("option", { name }).click();
  await page.locator("[data-wizard-continue]").click();
}

async function setFormat(page: Page, label: string) {
  await page.locator("button").filter({ hasText: "Best of 1" }).last().click();
  await page.getByRole("button", { name: label, exact: true }).click();
}

async function enterSecondAndThirdSets(
  page: Page,
  player: string,
  opponent: string,
  expectLoss: boolean,
) {
  await page.getByLabel(`${player}, set 2`).fill("6");
  await expect(page.getByLabel(`${opponent}, set 2`)).toBeFocused();
  await page.getByLabel(`${opponent}, set 2`).fill("3");
  const playerThirdSet = expectLoss
    ? `${player}, add set 3`
    : `${player}, set 3`;
  await expect(page.getByLabel(playerThirdSet)).toBeFocused();
  await page.getByLabel(playerThirdSet).fill("6");
  const thirdSet = expectLoss ? `${opponent}, add set 3` : `${opponent}, set 3`;
  await expect(page.getByLabel(thirdSet)).toBeFocused();
  await page.getByLabel(thirdSet).fill("2");
}

async function observeScores(page: Page, player: string, opponent: string) {
  const thirdSet = (name: string) =>
    page.getByLabel(`${name}, set 3`).or(page.getByLabel(`${name}, add set 3`));
  return {
    player: await Promise.all(
      [
        page.getByLabel(`${player}, set 1`),
        page.getByLabel(`${player}, set 2`),
        thirdSet(player),
      ].map((input) => input.inputValue()),
    ),
    opponent: await Promise.all(
      [
        page.getByLabel(`${opponent}, set 1`),
        page.getByLabel(`${opponent}, set 2`),
        thirdSet(opponent),
      ].map((input) => input.inputValue()),
    ),
  };
}

async function oneSetExport() {
  const workbook = new ExcelJS.Workbook();
  const settings = workbook.addWorksheet("Settings");
  settings.addRow([
    "Start Time",
    "End Time",
    "Host Team",
    "Guest Team",
    "Ad Scoring",
  ]);
  settings.addRow([
    "2026-09-10T10:00:00",
    "2026-09-10T10:30:00",
    "Riley Reproduction",
    "Casey Opponent",
    true,
  ]);
  const sets = workbook.addWorksheet("Sets");
  sets.addRow([
    "Set",
    "Host Score",
    "Guest Score",
    "Host Tiebreak",
    "Guest Tiebreak",
    "Set Winner",
    "Duration",
  ]);
  sets.addRow([1, 6, 4, null, null, "host", "00:30:00"]);
  return {
    name: "one-set-swingvision.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
  };
}

async function blockExternalBoundaries(page: Page) {
  await page.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const local = url.origin === new URL(baseURL!).origin;
    if (
      local &&
      (request.method() === "GET" || url.pathname.startsWith("/_next/"))
    )
      return route.continue();
    if (local && url.pathname === "/api/validate-file")
      return route.fulfill({ json: { success: true } });
    if (local && url.pathname === "/api/upload")
      return route.fulfill({ json: { success: true } });
    if (url.pathname.includes("/auth/v1/user")) {
      return route.fulfill({
        json: {
          id: "wizard-reproduction-user",
          aud: "authenticated",
          role: "authenticated",
          email: "wizard-reproduction@example.test",
          email_confirmed_at: "2026-09-10T00:00:00.000Z",
        },
      });
    }
    if (url.pathname.includes("/auth/v1/token")) {
      return route.fulfill({
        json: {
          access_token:
            "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ3aXphcmQtcmVwcm9kdWN0aW9uLXVzZXIiLCJleHAiOjQxMDI0NDQ4MDB9.fixture",
          refresh_token: "fixture-refresh-token",
          token_type: "bearer",
          expires_at: 4_102_444_800,
          expires_in: 60 * 60,
          user: { id: "wizard-reproduction-user" },
        },
      });
    }
    if (url.pathname.includes("/rest/v1/users"))
      return route.fulfill({
        json: [{ first_name: "Riley", last_name: "Reproduction" }],
      });
    if (url.pathname.includes("/rest/v1/processing_usage"))
      return route.fulfill({ json: [] });
    return route.abort("blockedbyclient");
  });
}

async function captureMatchSubmission(page: Page, submissions: unknown[]) {
  await page.route("**/rest/v1/matches*", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      submissions.push(request.postDataJSON());
      return route.fulfill({ json: [{ id: "wizard-reproduction-match" }] });
    }
    return route.abort("blockedbyclient");
  });
}

async function mockVideoMetadata(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperties(HTMLVideoElement.prototype, {
      videoWidth: { configurable: true, get: () => 1920 },
      videoHeight: { configurable: true, get: () => 1080 },
      duration: { configurable: true, get: () => 120 },
    });
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "src",
    );
    Object.defineProperty(HTMLMediaElement.prototype, "src", {
      configurable: true,
      get() {
        return descriptor?.get?.call(this) ?? "";
      },
      set(value) {
        descriptor?.set?.call(this, value);
        queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: () => Promise.resolve(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: () => undefined,
    });
  });
}
