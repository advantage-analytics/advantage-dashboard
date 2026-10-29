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
 * `users_write_once_identity`'s guarantee, against a live database
 * (`20261026190849_users_write_once_identity.sql`):
 *
 * a signed-in user may FILL `dob`, `role`, `guardian_consent_at`,
 * `junior_player_name` and `junior_class_year` on their own row — which is
 * how onboarding, the join screens' age gate and Settings › Profile set them —
 * but cannot change or clear one once set, and cannot set a first `dob` under
 * 13. The service role, which support corrections and the join actions use,
 * still can. Same shape as `admin-self-promotion.spec.ts`.
 *
 * Needs the migration applied to the target project; it is deploy-time, so
 * against a project without it the refusals below do not happen and this
 * fails, which is the point of running it there.
 *
 * Run on demand:  npx playwright test users-write-once-identity
 */

const SLOTS = ["users-write-once-identity-user"];

const ADULT = "1990-01-01";
const OTHER_ADULT = "1985-06-15";
/** Eleven today, as a calendar day — under the gate's 13. */
function elevenToday(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${Number(today.slice(0, 4)) - 11}${today.slice(4)}`;
}

const CLEARED = {
  dob: null,
  role: null,
  guardian_consent_at: null,
  junior_player_name: null,
  junior_class_year: null,
};

test.describe("users identity fields — write-once for clients (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient;
  let user: Session;

  /** The service role empties all five, so each test starts from "never set". */
  async function clearAll() {
    const reset = await admin
      .from("users")
      .update(CLEARED)
      .eq("id", user.userId);
    if (reset.error) throw new Error(`clear: ${reset.error.message}`);
  }

  async function readRow() {
    const row = await admin
      .from("users")
      .select(
        "dob, role, guardian_consent_at, junior_player_name, junior_class_year",
      )
      .eq("id", user.userId)
      .single();
    if (row.error) throw new Error(`read: ${row.error.message}`);
    return row.data;
  }

  test.beforeAll(async () => {
    test.setTimeout(120_000);
    admin = createAdminClient();
    await clearPoolLeftovers(admin, SLOTS);
    [user] = await poolLogins(admin, SLOTS);
  });

  test.beforeEach(async () => {
    await clearAll();
  });

  test.afterAll(async () => {
    if (!admin || !user) return;
    // The pool resets `dob` itself on the next hand-out; the others it does
    // not track, so they go back to null here.
    const reset = await admin
      .from("users")
      .update({ ...CLEARED, dob: POOL_USER_DEFAULTS.dob })
      .eq("id", user.userId);
    if (reset.error) throw new Error(`reset: ${reset.error.message}`);
  });

  test("a client fills an empty date of birth, then cannot change or clear it", async () => {
    const fill = await user.client
      .from("users")
      .update({ dob: ADULT })
      .eq("id", user.userId);
    expect(fill.error).toBeNull();

    const change = await user.client
      .from("users")
      .update({ dob: OTHER_ADULT })
      .eq("id", user.userId);
    expect(change.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const clear = await user.client
      .from("users")
      .update({ dob: null })
      .eq("id", user.userId);
    expect(clear.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    expect((await readRow()).dob).toBe(ADULT);
  });

  test("a client cannot set a first date of birth under 13", async () => {
    const result = await user.client
      .from("users")
      .update({ dob: elevenToday() })
      .eq("id", user.userId);
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect((await readRow()).dob).toBeNull();
  });

  test("the persona: filled once by onboarding, then fixed", async () => {
    const fill = await user.client
      .from("users")
      .update({ role: "parent" })
      .eq("id", user.userId);
    expect(fill.error).toBeNull();

    const relabel = await user.client
      .from("users")
      .update({ role: "player" })
      .eq("id", user.userId);
    expect(relabel.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect((await readRow()).role).toBe("parent");
  });

  test("the guardian fields: filled together once, then fixed", async () => {
    // What `finishGuardianOnboarding` writes, as the session client.
    const fill = await user.client
      .from("users")
      .update({
        dob: ADULT,
        role: "parent",
        guardian_consent_at: new Date().toISOString(),
        junior_player_name: "Sam Lee",
        junior_class_year: "2030",
      })
      .eq("id", user.userId);
    expect(fill.error).toBeNull();

    for (const change of [
      { guardian_consent_at: null },
      { junior_player_name: "Someone Else" },
      { junior_class_year: "2031" },
    ]) {
      const result = await user.client
        .from("users")
        .update(change)
        .eq("id", user.userId);
      expect(result.error?.code, JSON.stringify(change)).toBe(
        INSUFFICIENT_PRIVILEGE,
      );
    }

    const row = await readRow();
    expect(row.guardian_consent_at).not.toBeNull();
    expect(row.junior_player_name).toBe("Sam Lee");
    expect(row.junior_class_year).toBe("2030");
  });

  test("writing the same value again is not a change", async () => {
    await user.client
      .from("users")
      .update({ dob: ADULT })
      .eq("id", user.userId);
    const same = await user.client
      .from("users")
      .update({ dob: ADULT, first_name: "Write Once" })
      .eq("id", user.userId);
    expect(same.error).toBeNull();
  });

  test("the service role still corrects a stored date", async () => {
    await user.client
      .from("users")
      .update({ dob: ADULT })
      .eq("id", user.userId);
    const fix = await admin
      .from("users")
      .update({ dob: OTHER_ADULT })
      .eq("id", user.userId);
    expect(fix.error).toBeNull();
    expect((await readRow()).dob).toBe(OTHER_ADULT);
  });
});
