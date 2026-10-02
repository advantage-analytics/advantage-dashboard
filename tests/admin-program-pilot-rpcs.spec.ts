import { expect, test } from "@playwright/test";
import { type SupabaseClient } from "@supabase/supabase-js";

import {
  HAVE_ENV,
  INSUFFICIENT_PRIVILEGE,
  SKIP_REASON,
  type Session,
  createAdminClient,
  runMarker,
} from "./fixtures/live-db";
import {
  clearPoolLeftovers,
  demotePoolAdmin,
  poolLogins,
} from "./fixtures/live-db-pool";

/**
 * `20260926075216_admin_program_pilot.sql`'s two admin-only RPCs and its
 * rewritten audit vocabulary, proven against the live database (T1):
 *
 *  1. `admin_set_pilot_end` and `admin_end_pilot` refuse a non-admin with
 *     `42501` and leave the row untouched.
 *  2. An admin call writes the pilot columns, leaves `programs.status` alone
 *     (the header's decision — no fifth status value), and inserts exactly
 *     one `program_audit_log` row per effective call naming the admin as
 *     actor. A repeat `admin_end_pilot` is a no-op and logs nothing.
 *  3. The rewritten `program_audit_log_action_check` still accepts the
 *     actions the unmerged admin-console branch added live
 *     (`console.result_added`), and still rejects an unknown action — so the
 *     constraint was replaced, not dropped.
 *
 * Two pool logins (`fixtures/live-db-pool`), never deleted: `afterAll`
 * deletes this run's program by id and demotes the admin through the service
 * role; `beforeAll` sweeps what a crashed run left under this file's marker.
 *
 * Run on demand:  npx playwright test admin-program-pilot-rpcs
 */

const CHECK_VIOLATION = "23514";

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'admin-pilot-%'`. */
const { mark: MARK } = runMarker("admin-pilot");

const SLOTS = [
  "admin-program-pilot-rpcs-admin",
  "admin-program-pilot-rpcs-stranger",
];

/** The date the admin sets in test 2 — far enough out to differ from today. */
const NEW_END = "2027-03-31";

test.describe("Admin pilot RPC gates (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let adminSession: Session; // is_admin = true
  let stranger: Session; // not an admin, no membership anywhere

  let programId: string;

  const auditRows = (action: string) =>
    admin
      .from("program_audit_log")
      .select("actor_user_id, details")
      .eq("program_id", programId)
      .eq("action", action);

  const pilotRow = () =>
    admin
      .from("programs")
      .select("status, pilot_ends_on, pilot_ended_at")
      .eq("id", programId)
      .single();

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    await clearPoolLeftovers(admin, SLOTS);
    const stale = await admin
      .from("programs")
      .delete()
      .like("program_key", "admin-pilot-%");
    if (stale.error) throw new Error(`programs sweep: ${stale.error.message}`);

    [adminSession, stranger] = await poolLogins(admin, SLOTS);

    const flip = await admin
      .from("users")
      .update({ is_admin: true })
      .eq("id", adminSession.userId);
    if (flip.error) throw new Error(`flip is_admin: ${flip.error.message}`);

    // Ownerless on purpose: neither pool user belongs to it, so the stranger's
    // refusal is the admin gate and nothing else.
    const prog = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-a`,
        school_group: `${MARK}-a`,
        school_name: `Admin Pilot School ${MARK}`,
        team: "mens",
        status: "active",
        pilot_ends_on: "2026-12-31",
      })
      .select("id")
      .single();
    if (prog.error) throw new Error(`program: ${prog.error.message}`);
    programId = prog.data.id;
  });

  test.afterAll(async () => {
    if (!admin) return;
    const demoteError = await demotePoolAdmin(admin, adminSession);
    if (programId) {
      await admin
        .from("program_audit_log")
        .delete()
        .eq("program_id", programId);
      await admin.from("programs").delete().eq("id", programId);
    }
    if (demoteError) throw new Error(demoteError);
  });

  // ── Non-admin refusals ────────────────────────────────────────────────────

  test("a non-admin gets 42501 from admin_set_pilot_end and nothing changes", async () => {
    const result = await stranger.client.rpc("admin_set_pilot_end", {
      p_program_id: programId,
      p_ends_on: NEW_END,
    });
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const row = await pilotRow();
    expect(row.data?.pilot_ends_on).toBe("2026-12-31");
    expect(row.data?.pilot_ended_at).toBeNull();

    const audit = await auditRows("pilot.end_changed");
    expect(audit.data).toHaveLength(0);
  });

  test("a non-admin gets 42501 from admin_end_pilot and nothing changes", async () => {
    const result = await stranger.client.rpc("admin_end_pilot", {
      p_program_id: programId,
    });
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const row = await pilotRow();
    expect(row.data?.pilot_ended_at).toBeNull();

    const audit = await auditRows("pilot.ended");
    expect(audit.data).toHaveLength(0);
  });

  // ── admin_set_pilot_end ───────────────────────────────────────────────────

  test("an admin's admin_set_pilot_end updates the column and logs one pilot.end_changed row", async () => {
    const result = await adminSession.client.rpc("admin_set_pilot_end", {
      p_program_id: programId,
      p_ends_on: NEW_END,
    });
    expect(result.error).toBeNull();

    const row = await pilotRow();
    expect(row.data?.pilot_ends_on).toBe(NEW_END);
    expect(row.data?.pilot_ended_at).toBeNull();
    expect(row.data?.status).toBe("active");

    const audit = await auditRows("pilot.end_changed");
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_user_id: adminSession.userId,
      details: { from: "2026-12-31", to: NEW_END, by_admin: true },
    });
  });

  // ── admin_end_pilot ───────────────────────────────────────────────────────

  test("an admin's admin_end_pilot stamps pilot_ended_at, clamps pilot_ends_on, keeps status, logs one pilot.ended row", async () => {
    const result = await adminSession.client.rpc("admin_end_pilot", {
      p_program_id: programId,
    });
    expect(result.error).toBeNull();

    const row = await pilotRow();
    expect(row.data?.pilot_ended_at).not.toBeNull();
    // Clamped to the database's current date — no longer the far-out date.
    expect(row.data?.pilot_ends_on).not.toBe(NEW_END);
    expect(row.data!.pilot_ends_on < NEW_END).toBe(true);
    // The header's decision: no status change, no fifth status value.
    expect(row.data?.status).toBe("active");

    const audit = await auditRows("pilot.ended");
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_user_id: adminSession.userId,
      details: { from: NEW_END, to: row.data!.pilot_ends_on, by_admin: true },
    });
  });

  test("a repeat admin_end_pilot is a no-op and logs nothing more", async () => {
    const before = await pilotRow();

    const result = await adminSession.client.rpc("admin_end_pilot", {
      p_program_id: programId,
    });
    expect(result.error).toBeNull();

    const after = await pilotRow();
    expect(after.data?.pilot_ended_at).toBe(before.data?.pilot_ended_at);
    expect(after.data?.pilot_ends_on).toBe(before.data?.pilot_ends_on);

    const audit = await auditRows("pilot.ended");
    expect(audit.data).toHaveLength(1);
  });

  test("admin_set_pilot_end after an early end reopens the pilot and clears pilot_ended_at", async () => {
    const result = await adminSession.client.rpc("admin_set_pilot_end", {
      p_program_id: programId,
      p_ends_on: NEW_END,
    });
    expect(result.error).toBeNull();

    const row = await pilotRow();
    expect(row.data?.pilot_ends_on).toBe(NEW_END);
    expect(row.data?.pilot_ended_at).toBeNull();

    const audit = await auditRows("pilot.end_changed");
    expect(audit.data).toHaveLength(2);
  });

  // ── Audit vocabulary ──────────────────────────────────────────────────────

  test("the rewritten action check still accepts console.result_added and still rejects an unknown action", async () => {
    const kept = await admin.from("program_audit_log").insert({
      program_id: programId,
      actor_user_id: adminSession.userId,
      action: "console.result_added",
      details: { by_test: MARK },
    });
    expect(kept.error).toBeNull();

    const rejected = await admin.from("program_audit_log").insert({
      program_id: programId,
      actor_user_id: adminSession.userId,
      action: `pilot.${MARK}`,
      details: {},
    });
    expect(rejected.error?.code).toBe(CHECK_VIOLATION);
  });
});
