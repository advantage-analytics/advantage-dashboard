import { expect, test, type Page } from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  SKIP_REASON,
  createAdminClient,
  createLogin,
  deleteAuthUsers,
  runMarker,
} from "./fixtures/live-db";

/**
 * The player onboarding flow, walked end to end in a real browser against a
 * local `next dev` and the live database behind it.
 *
 * What it protects: the real `finishOnboarding` server action, run as the
 * authenticated user it is for. The live intake spec proves the columns'
 * constraints from RLS-scoped clients, but nothing there calls the action —
 * so on 2026-09-26 a missing column grant (`permission denied for table
 * users`) failed every player's last onboarding step while every spec stayed
 * green. Here the action's write is the thing under test:
 *
 *  1. The full answer path — name, "I play", "No — …", SwingVision, then
 *     "Somewhere else" with a typed detail — lands on `/dashboard` and stores
 *     `recording_source`, `acquisition_source`, the detail, `role = player`
 *     and `onboarded_at`. "Somewhere else" is chosen over a named source on
 *     purpose: it is the one answer that writes all three intake columns.
 *  2. Skipping both intake steps still finishes — `onboarded_at` stamped, the
 *     three intake columns null.
 *  3. Back turns the page without clearing answers: from 1.4 it returns to
 *     1.3 with "I play" still selected, and from there to 1.2 with the typed
 *     first name still in the field. Step state is component state, not the
 *     URL, so the browser's own Back would leave the page.
 *
 * One throwaway user (`createLogin`, deleted in `afterAll`), one browser page
 * and one browser sign-in for the whole file; between the tests the service
 * role resets the row, which sends the dashboard layout back to `/onboarding`.
 *
 * Needs a dev server this spec does not start — the repo keeps `webServer`
 * out of the Playwright config — pointed at the same Supabase project as the
 * shell's keys. The base URL must be loopback.
 *
 * Run on demand:
 *   ONBOARDING_BROWSER_BASE_URL=http://localhost:3000 \
 *     npx playwright test --project=live-db tests/onboarding-flow-browser.spec.ts
 */

const baseURL = process.env.ONBOARDING_BROWSER_BASE_URL;

/** A crashed run's user is findable by hand:
 *  `select * from auth.users where email like 'onboarding-browser-%'`. */
const { mark: MARK, password: PASSWORD } = runMarker("onboarding-browser");

/** A cold `next dev` compiles each route on first hit. */
const NAV_TIMEOUT = 60_000;
const STEP_TIMEOUT = 30_000;

const DASHBOARD_URL = /\/dashboard(\/|\?|$)/;

test.describe("Player onboarding flow — browser, end to end (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });
  test.skip(
    !baseURL,
    "Set ONBOARDING_BROWSER_BASE_URL to a local dev server to walk onboarding in a browser.",
  );
  test.skip(!HAVE_ENV, SKIP_REASON);

  const authUserIds: string[] = [];
  let admin: SupabaseClient;
  let userId: string;
  let page: Page;

  async function readIntakeRow() {
    const { data, error } = await admin
      .from("users")
      .select(
        "role, onboarded_at, recording_source, acquisition_source, acquisition_source_detail",
      )
      .eq("id", userId)
      .single();
    if (error) throw new Error(`users read: ${error.message}`);
    return data;
  }

  /** Back to a never-onboarded row, which reopens the flow. */
  async function resetToOnboarding() {
    const { error } = await admin
      .from("users")
      .update({
        onboarded_at: null,
        recording_source: null,
        acquisition_source: null,
        acquisition_source_detail: null,
      })
      .eq("id", userId);
    if (error) throw new Error(`users reset: ${error.message}`);
    await page.goto(`${baseURL}/onboarding`, { timeout: NAV_TIMEOUT });
  }

  /** Steps 1.2 → 1.3 "I play" → 1.4 "No — …", leaving the page on 1.5. */
  async function walkToRecordingStep() {
    await page
      .locator("#onboarding-first-name")
      .fill("Onboarding", { timeout: NAV_TIMEOUT });
    await page.locator("#onboarding-last-name").fill("Browser");
    await page.getByRole("button", { name: "Continue" }).click();

    await page
      .getByRole("radio", { name: "I play" })
      .click({ timeout: STEP_TIMEOUT });
    await page.getByRole("button", { name: "Continue" }).click();

    await page
      .getByRole("radio", { name: "No — I play club, tournaments or juniors" })
      .click({ timeout: STEP_TIMEOUT });
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(
      page.getByRole("radiogroup", { name: "How do you record your matches?" }),
    ).toBeVisible({ timeout: STEP_TIMEOUT });
  }

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);

    admin = createAdminClient();
    ({ userId } = await createLogin(admin, "player", {
      mark: MARK,
      password: PASSWORD,
      authUserIds,
    }));

    page = await browser.newPage();
    await page.goto(`${baseURL}/login`, { timeout: NAV_TIMEOUT });
    await page.locator("#login-email").fill(`${MARK}-player@example.com`);
    await page.locator("#login-password").fill(PASSWORD);
    await page.locator('button[type="submit"]').click();
    // The dashboard layout bounces a user with no `onboarded_at` here.
    await page.waitForURL(/\/onboarding/, { timeout: NAV_TIMEOUT });
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    // Runs whether or not an assertion failed.
    await page?.close();
    if (admin) await deleteAuthUsers(admin, authUserIds);
  });

  test("the full answer path stores every intake answer and lands on the dashboard", async () => {
    await walkToRecordingStep();

    await page.getByRole("radio", { name: "SwingVision" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    await page
      .getByRole("radio", { name: "Somewhere else" })
      .click({ timeout: STEP_TIMEOUT });
    await page.locator("#onboarding-acquisition-detail").fill("Reddit thread");
    await page.getByRole("button", { name: "Go to my dashboard" }).click();

    await page.waitForURL(DASHBOARD_URL, { timeout: NAV_TIMEOUT });
    expect(page.url()).toMatch(DASHBOARD_URL);

    const row = await readIntakeRow();
    expect(row.recording_source).toBe("swing-vision");
    expect(row.acquisition_source).toBe("other");
    expect(row.acquisition_source_detail).toBe("Reddit thread");
    expect(row.role).toBe("player");
    expect(row.onboarded_at).not.toBeNull();
  });

  test("skipping both intake steps still finishes onboarding", async () => {
    await resetToOnboarding();

    await walkToRecordingStep();

    // Both Skips are <button>s in `onboarding-flow.tsx`, not links.
    await page.getByRole("button", { name: "Skip" }).click();
    await expect(
      page.getByRole("radiogroup", {
        name: "How did you hear about Advantage?",
      }),
    ).toBeVisible({ timeout: STEP_TIMEOUT });
    await page.getByRole("button", { name: "Skip" }).click();

    await page.waitForURL(DASHBOARD_URL, { timeout: NAV_TIMEOUT });
    expect(page.url()).toMatch(DASHBOARD_URL);

    const row = await readIntakeRow();
    expect(row.recording_source).toBeNull();
    expect(row.acquisition_source).toBeNull();
    expect(row.acquisition_source_detail).toBeNull();
    expect(row.onboarded_at).not.toBeNull();
  });

  test("Back keeps every answer already given", async () => {
    await resetToOnboarding();

    await page
      .locator("#onboarding-first-name")
      .fill("Onboarding", { timeout: NAV_TIMEOUT });
    await page.locator("#onboarding-last-name").fill("Browser");
    await page.getByRole("button", { name: "Continue" }).click();

    await page
      .getByRole("radio", { name: "I play" })
      .click({ timeout: STEP_TIMEOUT });
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.getByRole("radiogroup", {
        name: "Do you play for a college program?",
      }),
    ).toBeVisible({ timeout: STEP_TIMEOUT });

    // 1.4 → 1.3, persona still chosen.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(
      page.getByRole("heading", { name: "How do you use Advantage?" }),
    ).toBeVisible({ timeout: STEP_TIMEOUT });
    await expect(page.getByRole("radio", { name: "I play" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // 1.3 → 1.2, typed name still there.
    await page.getByRole("button", { name: "Back" }).click();
    await expect(page.locator("#onboarding-first-name")).toHaveValue(
      "Onboarding",
      { timeout: STEP_TIMEOUT },
    );
  });
});
