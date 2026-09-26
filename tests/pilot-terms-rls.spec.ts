import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ANON_KEY,
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  SUPABASE_URL,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import { clearPoolLeftovers, poolLogins } from "./fixtures/live-db-pool";

/**
 * `*_pilot_terms_acceptances.sql` (the table, applied) and
 * `*_pilot_terms_enforcement.sql` (the RPC gate, applied only at deploy with
 * the terms screen), proven against the live database rather than the
 * migrations' own claims:
 *
 *  1. Table RLS — a session can insert its own acceptance and read it back;
 *     it cannot insert a row under another `user_id`; a stranger reads zero
 *     rows; anon gets nothing.
 *  2. Enforcement — `create_custom_program` fails with `TA001`
 *     (`TERMS_NOT_ACCEPTED_SQLSTATE`) while the session holds no acceptance
 *     for `current_pilot_terms_version()`, succeeds once it inserts one, and
 *     stamps the new program's id onto that row.
 *
 * Two probes gate the two halves. `beforeAll` first asks for the table and,
 * if PostgREST reports `PGRST205` (not in the schema cache — it does not
 * exist), skips everything and creates no fixture. Then it asks whether
 * enforcement is live by calling `create_custom_program` for a session with
 * NO acceptance: `TA001` means the gate is on; a created program means it is
 * not yet applied in this database — that program is deleted through the
 * service role on the spot and the enforcement tests skip with a reason.
 *
 * The two logins are reused pool users (`fixtures/live-db-pool`), never
 * deleted: `afterAll` deletes this run's programs and acceptance rows by id
 * through the service role, and `beforeAll` sweeps what a crashed run left.
 *
 * A crashed run is findable by hand:
 * `select * from programs where school_name like 'ZZ RLS pilot_terms%'`.
 *
 * Run on demand:  npx playwright test pilot-terms-rls
 */

/** Mirrors `TERMS_NOT_ACCEPTED_SQLSTATE` in src/lib/services/programs/pilot-terms.ts. */
const TERMS_NOT_ACCEPTED = "TA001";
/** PostgREST's code when a table isn't in its schema cache — including when
 *  it does not exist yet, which is how this spec detects the migration has
 *  not been applied. */
const UNDEFINED_TABLE = "PGRST205";

const { mark: MARK } = runMarker("pilot-terms-rls");
const PROGRAM_NAME = `ZZ RLS pilot_terms ${MARK}`;

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = ["pilot-terms-rls-coach", "pilot-terms-rls-stranger"];

test.describe("pilot_terms_acceptances RLS + RPC gate (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  /** Set by the table probe; every test and the cleanup consult it. */
  let tableMissing: string | null = null;
  /** Set by the enforcement probe; the RPC tests consult it. */
  let enforcementMissing: string | null = null;

  let coach: Session;
  let stranger: Session;
  let poolUserIds: string[] = [];

  /** The version the database enforces, read from the SQL function. */
  let currentVersion: string;

  /** Everything this run creates, deleted by id in `afterAll`. */
  const programIds: string[] = [];

  async function deletePrograms(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await admin.from("program_members").delete().in("program_id", ids);
    const gone = await admin.from("programs").delete().in("id", ids);
    if (gone.error) throw new Error(`programs delete: ${gone.error.message}`);
  }

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    // Never create a fixture before knowing the table exists.
    const probe = await admin
      .from("pilot_terms_acceptances")
      .select("id")
      .limit(1);
    if (probe.error?.code === UNDEFINED_TABLE) {
      tableMissing =
        "public.pilot_terms_acceptances does not exist yet — the " +
        "*_pilot_terms_acceptances.sql migration has not been applied to " +
        "this database. Re-run this spec after it lands.";
      return;
    }
    if (probe.error) {
      throw new Error(`pilot_terms_acceptances probe: ${probe.error.message}`);
    }

    const version = await admin.rpc("current_pilot_terms_version");
    if (version.error) {
      throw new Error(`current_pilot_terms_version: ${version.error.message}`);
    }
    currentVersion = version.data as string;
    expect(typeof currentVersion).toBe("string");
    expect(currentVersion.length).toBeGreaterThan(0);

    // Pool users outlive the run: sweep last run's programs (owned by the
    // pool users, so the pool sweep takes them) and acceptance rows.
    const leftoverIds = await clearPoolLeftovers(admin, SLOTS);
    if (leftoverIds.length > 0) {
      const swept = await admin
        .from("pilot_terms_acceptances")
        .delete()
        .in("user_id", leftoverIds);
      if (swept.error) {
        throw new Error(`acceptances sweep: ${swept.error.message}`);
      }
    }

    [coach, stranger] = await poolLogins(admin, SLOTS);
    poolUserIds = [coach, stranger].map((s) => s.userId);

    // Enforcement probe — the coach holds no acceptance at this point.
    const bare = await coach.client.rpc("create_custom_program", {
      p_name: `${PROGRAM_NAME} probe`,
      p_org_type: "club",
    });
    if (bare.error?.code === TERMS_NOT_ACCEPTED) {
      return; // gate is live
    }
    if (bare.error) {
      throw new Error(`enforcement probe: ${bare.error.message}`);
    }
    // The gate is not applied here: the RPC created a program. Remove it now
    // rather than in afterAll, so a crash between here and there leaves
    // nothing behind either.
    const created = (bare.data as { program_id?: string } | null)?.program_id;
    if (created) await deletePrograms([created]);
    enforcementMissing =
      "create_custom_program created a program with no acceptance — the " +
      "*_pilot_terms_enforcement.sql migration is not applied to this " +
      "database (by decision it lands at deploy, with the terms screen).";
  });

  test.beforeEach(() => {
    test.skip(tableMissing !== null, tableMissing ?? "");
  });

  test.afterAll(async () => {
    if (!admin || tableMissing !== null) return;
    await deletePrograms(programIds);
    if (poolUserIds.length > 0) {
      await admin
        .from("pilot_terms_acceptances")
        .delete()
        .in("user_id", poolUserIds);
    }
  });

  // ── table RLS ──────────────────────────────────────────────────────────

  test("a session cannot insert an acceptance under another user_id", async () => {
    const insert = await stranger.client
      .from("pilot_terms_acceptances")
      .insert({
        user_id: coach.userId,
        terms_version: currentVersion,
      });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("a session cannot stamp program_id itself (column privilege)", async () => {
    const insert = await coach.client.from("pilot_terms_acceptances").insert({
      user_id: coach.userId,
      terms_version: currentVersion,
      program_id: null,
    });
    expect(insert.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("a session can insert and read back its own acceptance", async () => {
    const insert = await coach.client
      .from("pilot_terms_acceptances")
      .insert({ user_id: coach.userId, terms_version: currentVersion })
      .select("id, program_id, accepted_at")
      .single();
    expect(insert.error).toBeNull();
    expect(insert.data?.program_id).toBeNull();
    expect(insert.data?.accepted_at).toBeTruthy();

    const select = await coach.client
      .from("pilot_terms_acceptances")
      .select("id")
      .eq("user_id", coach.userId);
    expect(select.error).toBeNull();
    expect(select.data).toHaveLength(1);
  });

  test("a stranger reads zero rows of another user's acceptances", async () => {
    const select = await stranger.client
      .from("pilot_terms_acceptances")
      .select("id")
      .eq("user_id", coach.userId);
    expect(select.error).toBeNull();
    expect(select.data).toHaveLength(0);
  });

  test("an acceptance cannot be updated or deleted by its own user", async () => {
    const update = await coach.client
      .from("pilot_terms_acceptances")
      .update({ terms_version: "forged" })
      .eq("user_id", coach.userId);
    expect(update.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const del = await coach.client
      .from("pilot_terms_acceptances")
      .delete()
      .eq("user_id", coach.userId);
    expect(del.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("an anonymous client cannot read acceptances", async () => {
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const select = await anon
      .from("pilot_terms_acceptances")
      .select("id")
      .limit(1);
    if (select.error) {
      expect(select.error.code).toBeTruthy();
    } else {
      expect(select.data).toHaveLength(0);
    }
  });

  // ── RPC gate ───────────────────────────────────────────────────────────
  // The coach now holds one un-stamped acceptance of the current version
  // (inserted above); the stranger holds none.

  test("create_custom_program refuses a session with no acceptance (TA001)", async () => {
    test.skip(enforcementMissing !== null, enforcementMissing ?? "");
    const attempt = await stranger.client.rpc("create_custom_program", {
      p_name: `${PROGRAM_NAME} refused`,
      p_org_type: "club",
    });
    expect(attempt.error?.code).toBe(TERMS_NOT_ACCEPTED);
    expect(attempt.data).toBeNull();
  });

  test("an acceptance of a stale version does not count", async () => {
    test.skip(enforcementMissing !== null, enforcementMissing ?? "");
    const stale = await stranger.client.from("pilot_terms_acceptances").insert({
      user_id: stranger.userId,
      terms_version: `${currentVersion}-old`,
    });
    expect(stale.error).toBeNull();

    const attempt = await stranger.client.rpc("create_custom_program", {
      p_name: `${PROGRAM_NAME} stale`,
      p_org_type: "club",
    });
    expect(attempt.error?.code).toBe(TERMS_NOT_ACCEPTED);
  });

  test("create_custom_program succeeds after the same session accepts, and stamps program_id", async () => {
    test.skip(enforcementMissing !== null, enforcementMissing ?? "");
    const created = await coach.client.rpc("create_custom_program", {
      p_name: `${PROGRAM_NAME} accepted`,
      p_org_type: "club",
    });
    expect(created.error).toBeNull();
    const programId = (created.data as { program_id?: string } | null)
      ?.program_id;
    expect(programId).toBeTruthy();
    programIds.push(programId!);

    const stamped = await admin
      .from("pilot_terms_acceptances")
      .select("program_id, terms_version")
      .eq("user_id", coach.userId)
      .eq("terms_version", currentVersion);
    expect(stamped.error).toBeNull();
    expect(stamped.data).toHaveLength(1);
    expect(stamped.data?.[0].program_id).toBe(programId);
  });
});
