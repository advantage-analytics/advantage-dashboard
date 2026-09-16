import { expect, test } from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  type Session,
  createAdminClient,
  createLogins,
  deleteAuthUsers,
  runMarker,
} from "./fixtures/live-db";

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
 * Run on demand:  npx playwright test admin-self-promotion
 */

/** A crashed run is findable by hand:
 *  `select * from users where email like 'admin-selfpromo-%'`. */
const { mark: MARK, password: PASSWORD } = runMarker("admin-selfpromo");

test.describe("users.is_admin — self-promotion is blocked (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let user: Session;
  const authUserIds: string[] = [];

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();

    [user] = await createLogins(admin, ["user"], {
      mark: MARK,
      password: PASSWORD,
      authUserIds,
    });
  });

  test.afterAll(async () => {
    if (!admin) return;
    // Belt and suspenders: even though a self-promotion attempt must fail,
    // explicitly reset the flag before deleting the user so a bug here never
    // leaves a stray admin row behind, even transiently.
    if (user) {
      await admin
        .from("users")
        .update({ is_admin: false })
        .eq("id", user.userId);
    }
    await deleteAuthUsers(admin, authUserIds);
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

    // Reset immediately so a later assertion (or a re-run of this file)
    // never observes this fixture user as an admin.
    const reset = await admin
      .from("users")
      .update({ is_admin: false })
      .eq("id", user.userId);
    expect(reset.error).toBeNull();
  });
});
