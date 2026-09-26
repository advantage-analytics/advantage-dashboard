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
 * `20260926082507_admin_update_program_details.sql`'s admin-only RPC and its
 * rewritten audit vocabulary, proven against the live database (T2):
 *
 *  1. `admin_update_program_details` refuses a non-admin with `42501`, leaves
 *     the row untouched and logs nothing.
 *  2. An admin's patch writes every one of the twelve listed columns, moves
 *     the two companion columns (`players_can_upload`,
 *     `primary_domain_inferred`) with their primaries, and writes exactly one
 *     `program_audit_log` row naming the admin as actor with the per-column
 *     diff in `details.changed`.
 *  3. An invalid `upload_policy` is rejected with `22023` before anything is
 *     written — no column moves, no audit row. So is an unknown key.
 *  4. Present-with-null clears a nullable column; the whole run leaves
 *     exactly the audit rows the two successful calls wrote.
 *  5. The rebuilt `program_audit_log_action_check` still accepts the live
 *     `console.*` and T1's `pilot.*` actions and still rejects an unknown one.
 *
 * Two pool logins (`fixtures/live-db-pool`), never deleted: `afterAll`
 * deletes this run's program by id and demotes the admin through the service
 * role; `beforeAll` sweeps what a crashed run left under this file's marker.
 *
 * Run on demand:  npx playwright test admin-program-details-rpc
 */

const INVALID_PARAMETER = "22023";
const CHECK_VIOLATION = "23514";
const ACTION = "program.details_changed";

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'admin-details-%'`. */
const { mark: MARK } = runMarker("admin-details");

const SLOTS = [
  "admin-program-details-rpc-admin",
  "admin-program-details-rpc-stranger",
];

const COLUMNS =
  "school_name, team, city, state, staff_page_url, primary_domain, primary_domain_inferred, home_venue, default_surface, time_zone, upload_policy, players_can_upload, events_policy, roster_public";

/** Every column the RPC covers, each moved off the seeded value. */
const FULL_PATCH = {
  school_name: `Admin Details University ${MARK}`,
  team: "womens",
  city: "Palo Alto",
  state: "CA",
  staff_page_url: "https://athletics.example.edu/staff",
  primary_domain: "example.edu",
  home_venue: "Taube Tennis Center",
  default_surface: "clay",
  time_zone: "America/Los_Angeles",
  upload_policy: "owner_coaches",
  events_policy: "owner",
  roster_public: false,
} as const;

test.describe("admin_update_program_details (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let adminSession: Session; // is_admin = true
  let stranger: Session; // not an admin, no membership anywhere

  let programId: string;

  const auditRows = () =>
    admin
      .from("program_audit_log")
      .select("actor_user_id, details")
      .eq("program_id", programId)
      .eq("action", ACTION);

  const programRow = () =>
    admin.from("programs").select(COLUMNS).eq("id", programId).single();

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    await clearPoolLeftovers(admin, SLOTS);
    const stale = await admin
      .from("programs")
      .delete()
      .like("program_key", "admin-details-%");
    if (stale.error) throw new Error(`programs sweep: ${stale.error.message}`);

    [adminSession, stranger] = await poolLogins(admin, SLOTS);

    const flip = await admin
      .from("users")
      .update({ is_admin: true })
      .eq("id", adminSession.userId);
    if (flip.error) throw new Error(`flip is_admin: ${flip.error.message}`);

    // Ownerless on purpose: neither pool user belongs to it, so the stranger's
    // refusal is the admin gate and nothing else. Collegiate, so the squad
    // rule (`programs_college_fields_check`) is in play.
    const prog = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-a`,
        school_group: `${MARK}-a`,
        school_name: `Admin Details School ${MARK}`,
        team: "mens",
        status: "active",
        city: "Seed City",
        state: "TX",
        primary_domain: "seed.example",
        primary_domain_inferred: true,
        default_surface: "hard",
        time_zone: "UTC",
        upload_policy: "everyone",
        players_can_upload: true,
        events_policy: "staff",
        roster_public: true,
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

  // ── Non-admin refusal ─────────────────────────────────────────────────────

  test("a non-admin gets 42501 and nothing changes", async () => {
    const result = await stranger.client.rpc("admin_update_program_details", {
      p_program_id: programId,
      p_patch: { city: "Nowhere" },
    });
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const row = await programRow();
    expect(row.data?.city).toBe("Seed City");

    const audit = await auditRows();
    expect(audit.data).toHaveLength(0);
  });

  // ── Admin: every column ───────────────────────────────────────────────────

  test("an admin updates every listed column and logs one program.details_changed row", async () => {
    const result = await adminSession.client.rpc(
      "admin_update_program_details",
      { p_program_id: programId, p_patch: FULL_PATCH },
    );
    expect(result.error).toBeNull();

    const row = await programRow();
    expect(row.data).toMatchObject({
      ...FULL_PATCH,
      // Companions move with their primaries.
      players_can_upload: false,
      primary_domain_inferred: false,
    });

    const audit = await auditRows();
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0].actor_user_id).toBe(adminSession.userId);
    const details = audit.data![0].details as {
      by_admin: boolean;
      changed: Record<string, { from: unknown; to: unknown }>;
    };
    expect(details.by_admin).toBe(true);
    expect(Object.keys(details.changed).sort()).toEqual(
      Object.keys(FULL_PATCH).sort(),
    );
    expect(details.changed.upload_policy).toEqual({
      from: "everyone",
      to: "owner_coaches",
    });
    expect(details.changed.time_zone).toEqual({
      from: "UTC",
      to: "America/Los_Angeles",
    });
  });

  // ── Validation ────────────────────────────────────────────────────────────

  test("an invalid upload_policy is rejected with 22023 and nothing is written", async () => {
    const result = await adminSession.client.rpc(
      "admin_update_program_details",
      {
        p_program_id: programId,
        p_patch: { upload_policy: "anyone", city: "Should Not Land" },
      },
    );
    expect(result.error?.code).toBe(INVALID_PARAMETER);
    expect(result.error?.message).toContain("unknown upload policy");

    const row = await programRow();
    expect(row.data?.upload_policy).toBe("owner_coaches");
    expect(row.data?.city).toBe("Palo Alto");

    const audit = await auditRows();
    expect(audit.data).toHaveLength(1);
  });

  test("an unknown key is rejected with 22023", async () => {
    const result = await adminSession.client.rpc(
      "admin_update_program_details",
      { p_program_id: programId, p_patch: { seats: 99 } },
    );
    expect(result.error?.code).toBe(INVALID_PARAMETER);
    expect(result.error?.message).toContain("seats");

    const audit = await auditRows();
    expect(audit.data).toHaveLength(1);
  });

  // ── Clearing ──────────────────────────────────────────────────────────────

  test("present-with-null clears a nullable column and logs exactly one more row", async () => {
    const result = await adminSession.client.rpc(
      "admin_update_program_details",
      { p_program_id: programId, p_patch: { home_venue: null } },
    );
    expect(result.error).toBeNull();

    const row = await programRow();
    expect(row.data?.home_venue).toBeNull();
    // Untouched keys stay put.
    expect(row.data?.city).toBe("Palo Alto");

    const audit = await auditRows();
    expect(audit.data).toHaveLength(2);
  });

  // ── Audit vocabulary ──────────────────────────────────────────────────────

  test("the rebuilt action check keeps console.* and pilot.* and still rejects an unknown action", async () => {
    for (const action of [
      "console.result_added",
      "console.analysis_attached",
      "pilot.end_changed",
      "pilot.ended",
    ]) {
      const kept = await admin.from("program_audit_log").insert({
        program_id: programId,
        actor_user_id: adminSession.userId,
        action,
        details: { by_test: MARK },
      });
      expect(kept.error, action).toBeNull();
    }

    const rejected = await admin.from("program_audit_log").insert({
      program_id: programId,
      actor_user_id: adminSession.userId,
      action: `program.${MARK}`,
      details: {},
    });
    expect(rejected.error?.code).toBe(CHECK_VIOLATION);
  });
});
