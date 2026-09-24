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
  demotePoolAdmin,
  clearPoolLeftovers,
  poolLogins,
} from "./fixtures/live-db-pool";

/**
 * `20260914100200_admin_program_rpcs.sql`'s admin-only RPC gates, proven
 * against the live database rather than the migration's own claims (T5,
 * following T4):
 *
 *  1. `set_program_member_role` treats a platform admin as the program's
 *     owner even on a program the admin does not belong to, while a
 *     non-member, non-admin session still gets `42501`.
 *  2. `admin_transfer_program_ownership` moves both `program_members.role`
 *     and `programs.owner_user_id` under one lock, and the
 *     `programs_one_owner` partial unique index still refuses a second
 *     `role='owner'` row afterward. It also copes with a program that has
 *     no owner row at all.
 *  3. `admin_create_program` refuses a non-admin and a college program
 *     missing its required fields, and creates a club program with
 *     `program_key` left null and `status='unclaimed'`.
 *
 * The eight logins are reused pool users (`fixtures/live-db-pool`), never
 * deleted: `afterAll` deletes this run's programs by id and demotes the admin
 * through the service role, and `beforeAll` sweeps what a crashed run left
 * under this file's marker.
 *
 * Run on demand:  npx playwright test admin-program-rpcs
 */

const INVALID_PARAMETER = "22023";
const UNIQUE_VIOLATION = "23505";

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'admin-rpc-%'`. */
const { mark: MARK } = runMarker("admin-rpc");

/** Pool slots, prefixed with this spec's name so no other spec draws them. */
const SLOTS = [
  "admin-program-rpcs-admin",
  "admin-program-rpcs-stranger",
  "admin-program-rpcs-owner-a",
  "admin-program-rpcs-coach-a",
  "admin-program-rpcs-owner-b",
  "admin-program-rpcs-coach-b",
  "admin-program-rpcs-player-b",
  "admin-program-rpcs-coach-c",
];

test.describe("Admin program RPC gates (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let adminSession: Session; // is_admin = true
  let stranger: Session; // no membership anywhere, not an admin

  let ownerA: Session;
  let coachA: Session;

  let ownerB: Session;
  let coachB: Session;
  let playerB: Session;

  let coachC: Session;

  const programIds: string[] = [];

  let programA: string;
  let programB: string;
  let programC: string;
  let createdProgram: string | null = null;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    // A crashed run's programs A and B are owned by pool users, which the
    // pool sweep takes whole; C (ownerless) and the admin-created club are
    // not, so they go by this file's marker — on `program_key` for A–C and on
    // `school_name` for the club, whose key is null. Members and audit rows
    // cascade with each program.
    await clearPoolLeftovers(admin, SLOTS);
    for (const column of ["program_key", "school_name"]) {
      const stale = await admin
        .from("programs")
        .delete()
        .like(column, "admin-rpc-%");
      if (stale.error) {
        throw new Error(`programs sweep (${column}): ${stale.error.message}`);
      }
    }

    [adminSession, stranger, ownerA, coachA, ownerB, coachB, playerB, coachC] =
      await poolLogins(admin, SLOTS);

    const flip = await admin
      .from("users")
      .update({ is_admin: true })
      .eq("id", adminSession.userId);
    if (flip.error) {
      throw new Error(`flip is_admin: ${flip.error.message}`);
    }

    // Program A — role-change gate: owner + one coach.
    const progA = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-a`,
        school_group: `${MARK}-a`,
        school_name: `Admin RPC School A ${MARK}`,
        team: "mens",
        status: "active",
        owner_user_id: ownerA.userId,
      })
      .select("id")
      .single();
    if (progA.error) throw new Error(`programA: ${progA.error.message}`);
    programA = progA.data.id;
    programIds.push(programA);

    const membersA = await admin.from("program_members").insert([
      { program_id: programA, user_id: ownerA.userId, role: "owner" },
      { program_id: programA, user_id: coachA.userId, role: "coach" },
    ]);
    if (membersA.error) {
      throw new Error(`membersA: ${membersA.error.message}`);
    }

    // Program B — ownership transfer + one-owner index, with a third member
    // to prove a *different* row still can't become a second owner.
    const progB = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-b`,
        school_group: `${MARK}-b`,
        school_name: `Admin RPC School B ${MARK}`,
        team: "womens",
        status: "active",
        owner_user_id: ownerB.userId,
      })
      .select("id")
      .single();
    if (progB.error) throw new Error(`programB: ${progB.error.message}`);
    programB = progB.data.id;
    programIds.push(programB);

    const membersB = await admin.from("program_members").insert([
      { program_id: programB, user_id: ownerB.userId, role: "owner" },
      { program_id: programB, user_id: coachB.userId, role: "coach" },
      { program_id: programB, user_id: playerB.userId, role: "player" },
    ]);
    if (membersB.error) {
      throw new Error(`membersB: ${membersB.error.message}`);
    }

    // Program C — ownerless: no owner_user_id, no owner-role member row.
    const progC = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-c`,
        school_group: `${MARK}-c`,
        school_name: `Admin RPC School C ${MARK}`,
        team: "mens",
        status: "active",
        owner_user_id: null,
      })
      .select("id")
      .single();
    if (progC.error) throw new Error(`programC: ${progC.error.message}`);
    programC = progC.data.id;
    programIds.push(programC);

    const membersC = await admin
      .from("program_members")
      .insert([
        { program_id: programC, user_id: coachC.userId, role: "coach" },
      ]);
    if (membersC.error) {
      throw new Error(`membersC: ${membersC.error.message}`);
    }
  });

  test.afterAll(async () => {
    if (!admin) return;
    const demoteError = await demotePoolAdmin(admin, adminSession);

    // By id, never through the users: B's owner changes mid-run, and the pool
    // users outlive it.
    if (createdProgram) programIds.push(createdProgram);
    for (const id of programIds) {
      await admin.from("program_audit_log").delete().eq("program_id", id);
      await admin.from("program_members").delete().eq("program_id", id);
      await admin.from("programs").delete().eq("id", id);
    }
    if (demoteError) throw new Error(demoteError);
  });

  // ── set_program_member_role — admin gate ──────────────────────────────────

  test("an admin can set_program_member_role on a program they are not a member of", async () => {
    const result = await adminSession.client.rpc("set_program_member_role", {
      p_program_id: programA,
      p_user_id: coachA.userId,
      p_role: "staff",
    });
    expect(result.error).toBeNull();

    const row = await admin
      .from("program_members")
      .select("role")
      .eq("program_id", programA)
      .eq("user_id", coachA.userId)
      .single();
    expect(row.data?.role).toBe("staff");
  });

  test("a non-member, non-admin session gets 42501 on the same call", async () => {
    const result = await stranger.client.rpc("set_program_member_role", {
      p_program_id: programA,
      p_user_id: coachA.userId,
      p_role: "player",
    });
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    // Unchanged by the refused call.
    const row = await admin
      .from("program_members")
      .select("role")
      .eq("program_id", programA)
      .eq("user_id", coachA.userId)
      .single();
    expect(row.data?.role).toBe("staff");
  });

  // ── admin_transfer_program_ownership ──────────────────────────────────────

  test("admin_transfer_program_ownership moves both the role and owner_user_id; a second owner row still fails 23505", async () => {
    const result = await adminSession.client.rpc(
      "admin_transfer_program_ownership",
      { p_program_id: programB, p_new_owner: coachB.userId },
    );
    expect(result.error).toBeNull();

    const members = await admin
      .from("program_members")
      .select("user_id, role")
      .eq("program_id", programB);
    const roleOf = (userId: string) =>
      members.data?.find((row) => row.user_id === userId)?.role;
    expect(roleOf(coachB.userId)).toBe("owner");
    expect(roleOf(ownerB.userId)).toBe("coach");
    expect(roleOf(playerB.userId)).toBe("player");

    const program = await admin
      .from("programs")
      .select("owner_user_id")
      .eq("id", programB)
      .single();
    expect(program.data?.owner_user_id).toBe(coachB.userId);

    const audit = await admin
      .from("program_audit_log")
      .select("actor_user_id, subject_id, details")
      .eq("program_id", programB)
      .eq("action", "ownership.transferred");
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_user_id: adminSession.userId,
      subject_id: coachB.userId,
      details: { from: ownerB.userId, to: coachB.userId, by_admin: true },
    });

    // A different member still cannot become a second owner row.
    const second = await admin
      .from("program_members")
      .update({ role: "owner" })
      .eq("program_id", programB)
      .eq("user_id", playerB.userId);
    expect(second.error?.code).toBe(UNIQUE_VIOLATION);

    const owners = await admin
      .from("program_members")
      .select("user_id")
      .eq("program_id", programB)
      .eq("role", "owner");
    expect(owners.data).toHaveLength(1);
    expect(owners.data![0].user_id).toBe(coachB.userId);
  });

  test("admin_transfer_program_ownership works when the program has no owner row at all", async () => {
    const before = await admin
      .from("program_members")
      .select("user_id, role")
      .eq("program_id", programC)
      .eq("role", "owner");
    expect(before.data).toHaveLength(0);

    const result = await adminSession.client.rpc(
      "admin_transfer_program_ownership",
      { p_program_id: programC, p_new_owner: coachC.userId },
    );
    expect(result.error).toBeNull();

    const row = await admin
      .from("program_members")
      .select("role")
      .eq("program_id", programC)
      .eq("user_id", coachC.userId)
      .single();
    expect(row.data?.role).toBe("owner");

    const program = await admin
      .from("programs")
      .select("owner_user_id")
      .eq("id", programC)
      .single();
    expect(program.data?.owner_user_id).toBe(coachC.userId);

    const audit = await admin
      .from("program_audit_log")
      .select("actor_user_id, subject_id, details")
      .eq("program_id", programC)
      .eq("action", "ownership.transferred");
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0]).toMatchObject({
      actor_user_id: adminSession.userId,
      subject_id: coachC.userId,
      details: { from: null, to: coachC.userId, by_admin: true },
    });
  });

  // ── admin_create_program ──────────────────────────────────────────────────

  test("admin_create_program refuses a non-admin caller", async () => {
    const result = await stranger.client.rpc("admin_create_program", {
      p_org_type: "club",
      p_school_name: `${MARK} Refused Club`,
      p_team: null,
      p_program_key: null,
      p_school_group: null,
      p_division: null,
      p_conference: null,
      p_city: null,
      p_state: null,
      p_primary_domain: null,
    });
    expect(result.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
  });

  test("admin_create_program refuses a college program missing key/group/team", async () => {
    const result = await adminSession.client.rpc("admin_create_program", {
      p_org_type: "college",
      p_school_name: `${MARK} Incomplete College`,
      p_team: null,
      p_program_key: null,
      p_school_group: null,
      p_division: null,
      p_conference: null,
      p_city: null,
      p_state: null,
      p_primary_domain: null,
    });
    expect(result.error?.code).toBe(INVALID_PARAMETER);
  });

  test("admin_create_program creates a club program with program_key null and status unclaimed", async () => {
    const result = await adminSession.client.rpc("admin_create_program", {
      p_org_type: "club",
      p_school_name: `${MARK} Created Club`,
      p_team: null,
      p_program_key: null,
      p_school_group: null,
      p_division: null,
      p_conference: null,
      p_city: "Austin",
      p_state: "TX",
      p_primary_domain: null,
    });
    expect(result.error).toBeNull();
    expect(typeof result.data).toBe("string");
    createdProgram = result.data as string;

    const row = await admin
      .from("programs")
      .select("program_key, status, org_type, school_name")
      .eq("id", createdProgram)
      .single();
    expect(row.data).toMatchObject({
      program_key: null,
      status: "unclaimed",
      org_type: "club",
      school_name: `${MARK} Created Club`,
    });
  });
});
