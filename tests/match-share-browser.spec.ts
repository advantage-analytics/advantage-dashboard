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
 * The public match report (`/m/[token]`) in a real browser against a local
 * `next dev` and the live database behind it, signed OUT the whole way:
 *
 *  1. A bad token lands on "That link isn't valid" — never on `/login`.
 *  2. A live token renders the report: the rail scoreboard with both
 *     players, and none of the dashboard's controls (no Share button).
 *  3. The token's Open Graph image answers `200 image/png`.
 *  4. Once the link row is deleted, the same URL is not-found again.
 *
 * One throwaway user (the match needs a `created_by`), one match, one link
 * row, all seeded through the service role and removed in `afterAll`.
 *
 * Needs a dev server this spec does not start, pointed at the same Supabase
 * project as the shell's keys. The base URL must be loopback.
 *
 * Run on demand:
 *   MATCH_SHARE_BROWSER_BASE_URL=http://localhost:3000 \
 *     npx playwright test --project=live-db tests/match-share-browser.spec.ts
 */

const baseURL = process.env.MATCH_SHARE_BROWSER_BASE_URL;

/** A crashed run's user is findable by hand:
 *  `select * from auth.users where email like 'match-share-browser-%'`. */
const { mark: MARK, password: PASSWORD } = runMarker("match-share-browser");

/** A cold `next dev` compiles each route on first hit. */
const NAV_TIMEOUT = 60_000;

test.describe("Public match report — browser, signed out (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });
  test.skip(
    !baseURL,
    "Set MATCH_SHARE_BROWSER_BASE_URL to a local dev server to open a shared match in a browser.",
  );
  test.skip(!HAVE_ENV, SKIP_REASON);

  const authUserIds: string[] = [];
  let admin: SupabaseClient;
  let userId: string;
  let matchId: string;
  let page: Page;
  const token = `${MARK}-token`;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180_000);
    expect(new URL(baseURL!).hostname).toMatch(/^(localhost|127\.0\.0\.1)$/);

    admin = createAdminClient();
    ({ userId } = await createLogin(admin, "sharer", {
      mark: MARK,
      password: PASSWORD,
      authUserIds,
    }));

    const match = await admin
      .from("matches")
      .insert({
        created_by: userId,
        player1_id: userId,
        player1_name: "Share Browser",
        player2_name: "Share Opponent",
        date: new Date().toISOString(),
        tournament_name: `${MARK}-open`,
        score: { player1: [6, 6], player2: [3, 4] },
        source_provider: "swing-vision",
      })
      .select("id")
      .single();
    if (match.error) throw new Error(`match: ${match.error.message}`);
    matchId = match.data.id as string;

    const link = await admin
      .from("match_share_links")
      .insert({ match_id: matchId, token, created_by: userId });
    if (link.error) throw new Error(`link: ${link.error.message}`);

    page = await browser.newPage();
  });

  test.afterAll(async () => {
    test.setTimeout(180_000);
    await page?.close();
    if (!admin) return;
    if (matchId) {
      await admin.from("match_share_links").delete().eq("match_id", matchId);
      await admin.from("matches").delete().eq("id", matchId);
    }
    await deleteAuthUsers(admin, authUserIds);
  });

  test("a bad token lands on the not-found pane, not on sign-in", async () => {
    await page.goto(`${baseURL}/m/${MARK}-nope`, { timeout: NAV_TIMEOUT });
    await expect(
      page.getByRole("heading", { name: "That link isn't valid" }),
    ).toBeVisible({ timeout: NAV_TIMEOUT });
    expect(page.url()).not.toMatch(/\/login/);
  });

  test("a live token renders the read-only report", async () => {
    await page.goto(`${baseURL}/m/${token}`, { timeout: NAV_TIMEOUT });
    const rail = page.locator('aside[aria-label="Match summary"]');
    await expect(rail).toBeVisible({ timeout: NAV_TIMEOUT });
    await expect(rail).toContainText("Share Browser");
    await expect(rail).toContainText("Share Opponent");
    await expect(page.getByRole("button", { name: "Share" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "More" })).toHaveCount(0);
    expect(page.url()).not.toMatch(/\/login/);
  });

  test("the Open Graph image answers with a PNG", async () => {
    const response = await page.request.get(
      `${baseURL}/m/${token}/opengraph-image`,
      { timeout: NAV_TIMEOUT },
    );
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/png");
  });

  test("turning the link off makes the same URL not-found", async () => {
    const { error } = await admin
      .from("match_share_links")
      .delete()
      .eq("match_id", matchId);
    if (error) throw new Error(`link delete: ${error.message}`);
    await page.goto(`${baseURL}/m/${token}`, { timeout: NAV_TIMEOUT });
    await expect(
      page.getByRole("heading", { name: "That link isn't valid" }),
    ).toBeVisible({ timeout: NAV_TIMEOUT });
  });
});
