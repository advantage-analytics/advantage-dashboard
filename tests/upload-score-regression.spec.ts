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

  test("one-set SwingVision import retains sets 2 and 3 at submission", async ({
    page,
  }) => {
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
    await enterSecondAndThirdSets(page, "Riley Reproduction", "Casey Opponent");

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

  test("score cells keep corrections, ghost sets, tiebreaks, and the final cell focused", async ({
    page,
  }) => {
    await page.goto(`${baseURL}/wizard-reproduction?mode=new`);
    await chooseSource(page, "SwingVision export");
    await page
      .locator('input[type="file"]')
      .setInputFiles(await oneSetExport());
    await expect(page.getByText(/XLSX.*read/)).toBeVisible();
    await page.locator("[data-wizard-continue]").click();
    await setFormat(page, "Best of 3");

    const player = "Riley Reproduction";
    const opponent = "Casey Opponent";
    const playerFirst = page.getByLabel(`${player}, set 1`);
    const opponentFirst = page.getByLabel(`${opponent}, set 1`);

    await playerFirst.click();
    await expect
      .poll(() =>
        playerFirst.evaluate((input) => {
          const scoreInput = input as HTMLInputElement;
          return (
            scoreInput.selectionStart === 0 && scoreInput.selectionEnd === 1
          );
        }),
      )
      .toBe(true);
    await playerFirst.press("Backspace");
    await expect(playerFirst).toBeFocused();
    await playerFirst.press("8");
    await expect(playerFirst).toBeFocused();
    await playerFirst.press("Tab");
    await playerFirst.click();
    await playerFirst.press("6");
    await expect(opponentFirst).toBeFocused();

    await opponentFirst.press("Backspace");
    await expect(opponentFirst).toHaveValue("");
    await expect(opponentFirst).toBeFocused();
    await opponentFirst.press("4");
    const playerSecond = page.getByLabel(`${player}, set 2`);
    const opponentSecond = page.getByLabel(`${opponent}, set 2`);
    await expect(playerSecond).toBeFocused();
    await playerSecond.press("6");
    await expect(opponentSecond).toBeFocused();
    await opponentSecond.press("3");

    const playerThird = page.getByLabel(`${player}, set 3`);
    const opponentThird = page.getByLabel(`${opponent}, set 3`);
    await expect(playerThird).toBeFocused();
    await playerThird.press("6");
    await expect(opponentThird).toBeFocused();
    await opponentThird.press("2");
    await expect(opponentThird).toBeFocused();
    await opponentThird.press("Enter");
    await expect(opponentThird).toBeFocused();

    await playerFirst.click();
    await playerFirst.press("7");
    await expect(opponentFirst).toBeFocused();
    await opponentFirst.press("Backspace");
    await expect(opponentFirst).toHaveValue("");
    await opponentFirst.press("6");
    await expect(playerSecond).toBeFocused();

    const playerTiebreak = page.getByLabel(`${player}, set 1 tiebreak`);
    const opponentTiebreak = page.getByLabel(`${opponent}, set 1 tiebreak`);
    await playerTiebreak.click();
    await playerTiebreak.press("1");
    await expect(playerTiebreak).toBeFocused();
    await playerTiebreak.press("0");
    await expect(playerTiebreak).toHaveValue("10");
    await expect(playerTiebreak).toBeFocused();
    await opponentTiebreak.click();
    await opponentTiebreak.press("8");
    await expect(opponentTiebreak).toBeFocused();
  });

  test("reducing format keeps entered scores until the loss is confirmed", async ({
    page,
  }) => {
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
    await enterSecondAndThirdSets(page, "Riley Reproduction", "Casey Opponent");

    await page
      .getByRole("button", { name: "Best of 3", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Best of 1", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Remove entered set scores?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Keep current format" }).click();

    await expect(page.getByLabel("Riley Reproduction, set 3")).toHaveValue("6");
    await expect(page.getByLabel("Casey Opponent, set 3")).toHaveValue("2");
    expect(submissions).toHaveLength(0);

    await page
      .getByRole("button", { name: "Best of 3", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Best of 1", exact: true }).click();
    await page.getByRole("button", { name: "Remove set scores" }).click();

    await expect(page.getByLabel("Riley Reproduction, set 1")).toHaveValue("6");
    await expect(page.getByLabel("Riley Reproduction, set 2")).toHaveCount(0);
    await page.locator("[data-wizard-continue]").click();
    await expect.poll(() => submissions.length).toBe(1);
    expect(submissions[0]).toMatchObject({
      score: { player1: [6], player2: [4] },
    });
  });

  test("reducing an unpopulated format needs no confirmation", async ({
    page,
  }) => {
    await page.goto(`${baseURL}/wizard-reproduction?mode=new`);
    await chooseSource(page, "SwingVision export");
    await page
      .locator('input[type="file"]')
      .setInputFiles(await oneSetExport());
    await expect(page.getByText(/XLSX.*read/)).toBeVisible();
    await page.locator("[data-wizard-continue]").click();
    await setFormat(page, "Best of 3");

    await page
      .getByRole("button", { name: "Best of 3", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Best of 1", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Remove entered set scores?" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Riley Reproduction, set 1")).toHaveValue("6");
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
    await enterSecondAndThirdSets(page, "Riley Reproduction", "Casey Opponent");
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

  test("one-set schedule preset retains newly entered sets", async ({
    page,
  }) => {
    const submissions: unknown[] = [];
    await captureMatchSubmission(page, submissions);
    await page.goto(`${baseURL}/wizard-reproduction?mode=preset`);

    await page
      .locator('input[type="file"]')
      .setInputFiles(await oneSetExport());
    await expect(page.getByText(/XLSX.*read/)).toBeVisible();
    await page.locator("[data-wizard-continue]").click();
    await enterSecondAndThirdSets(page, "Riley Reproduction", "Casey Opponent");

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
) {
  await page.getByLabel(`${player}, set 2`).fill("6");
  await expect(page.getByLabel(`${opponent}, set 2`)).toBeFocused();
  await page.getByLabel(`${opponent}, set 2`).fill("3");
  const playerThirdSet = `${player}, set 3`;
  await expect(page.getByLabel(playerThirdSet)).toBeFocused();
  await page.getByLabel(playerThirdSet).fill("6");
  const thirdSet = `${opponent}, set 3`;
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
