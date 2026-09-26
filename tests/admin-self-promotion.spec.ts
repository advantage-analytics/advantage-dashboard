import { expect, test } from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  type Session,
  createAdminClient,
} from "./fixtures/live-db";
import {
  POOL_USER_DEFAULTS,
  clearPoolLeftovers,
  poolLogins,
} from "./fixtures/live-db-pool";

/**
 * `users_block_admin_self_update`'s guarantee, proven against the live
 * database rather than the migration's own claims (T1,
 * `20260914100000_users_block_admin_self_update.sql`):
 *
 * a signed-in user cannot set `is_admin = true` on their own `public.users`
 * row — the trigger raises `42501` and `authenticated` holds no UPDATE
 * privilege on the column either way — while the service role, which the
 * trigger and grants deliberately leave untouched, still can. That asymmetry
 * is the point: the guard is role-scoped (blocks `authenticated`/`anon`
 * clients), not an absolute rule that would also break the admin console's
 * own service-role writes.
 *
 * The login is a reused pool user (`fixtures/live-db-pool`), never deleted.
 * A user that outlives the run is exactly where a stray `is_admin = true`
 * would matter, so `beforeAll` proves the slot starts as a non-admin and
 * `afterAll` puts the flag back through the service role — on top of the
 * pool's own reset on the next hand-out.
 *
 * Run on demand:  npx playwright test admin-self-promotion
 */

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = ["admin-self-promotion-user"];

test.describe("users.is_admin — self-promotion is blocked (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let user: Session;

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();

    // This spec creates no program or membership, but the pool refuses a slot
    // that has any, so a stray one is cleared rather than wedging the file.
    await clearPoolLeftovers(admin, SLOTS);
    [user] = await poolLogins(admin, SLOTS);

    // The first test asserts the flag is still false after a refused write.
    // Against a user that started as an admin that would pass for the wrong
    // reason, so the starting state is checked, not assumed from the reset.
    const start = await admin
      .from("users")
      .select("is_admin")
      .eq("id", user.userId)
      .single();
    if (start.error) throw new Error(`users read: ${start.error.message}`);
    if (start.data.is_admin !== false) {
      throw new Error(
        `pool user ${user.userId} was handed out with is_admin = ${start.data.is_admin}`,
      );
    }
  });

  test.afterAll(async () => {
    if (!admin) return;
    // Belt and suspenders: the service-role test flips the flag on and back
    // off, and a self-promotion attempt must fail — but the user outlives the
    // run, so put the flag back explicitly whatever happened above.
    if (user) {
      const reset = await admin
        .from("users")
        .update({ is_admin: POOL_USER_DEFAULTS.is_admin })
        .eq("id", user.userId);
      if (reset.error) {
        throw new Error(`is_admin reset: ${reset.error.message}`);
      }
    }
  });

  test("a session client cannot set is_admin = true on its own row", async () => {
    const result = await user.client
      .from("users")
      .update({ is_admin: true })
      .eq("id", user.userId);

    expect(result.error).not.toBeNull();
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const row = await admin
      .from("users")
      .select("is_admin")
      .eq("id", user.userId)
      .single();
    expect(row.data?.is_admin).toBe(false);
  });

  test("is_admin() still returns false for that session afterward", async () => {
    const result = await user.client.rpc("is_admin");
    expect(result.error).toBeNull();
    expect(result.data).toBe(false);
  });

  test("a service-role client can set is_admin = true on the same row", async () => {
    const result = await admin
      .from("users")
      .update({ is_admin: true })
      .eq("id", user.userId);
    expect(result.error).toBeNull();

    const row = await admin
      .from("users")
      .select("is_admin")
      .eq("id", user.userId)
      .single();
    expect(row.data?.is_admin).toBe(true);

    // Reset immediately so a later assertion (or the next spec to draw this
    // pool user) never observes it as an admin.
    const reset = await admin
      .from("users")
      .update({ is_admin: false })
      .eq("id", user.userId);
    expect(reset.error).toBeNull();
  });
});
