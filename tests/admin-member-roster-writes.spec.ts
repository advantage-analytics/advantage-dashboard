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
 * `20260926084422_admin_member_and_roster_writes.sql`'s widened gates on
 * `set_member_upload_enabled(p_program_id, p_user_id, p_enabled)` and
 * `add_program_player(p_program_id, …)`, proven against the live database
 * (T3). Both already took an explicit `p_program_id`; what moved is the gate,
 * from "staff of that program" to "staff of that program OR platform admin".
 *
 *  1. An admin who is a member of NOTHING succeeds on program B by passing
 *     `p_program_id` — the switch flips, the player row lands, and the
 *     `player.added` audit row says `by_admin: true`.
 *  2. A non-admin non-member raises `42501` on both, and nothing changes.
 *  3. Cross-tenant, the hole the widening could have opened: a coach of
 *     program A passing program B's id raises `42501` on both, B is untouched
 *     — and the same coach still succeeds on A (`by_admin: false`), so the
 *     member path is intact.
 *
 * Four pool logins (`fixtures/live-db-pool`), never deleted: `afterAll`
 * deletes this run's two programs and their rows by id and demotes the admin
 * through the service role; `beforeAll` sweeps what a crashed run left under
 * this file's marker.
 *
 * Run on demand:  npx playwright test admin-member-roster-writes
 */

/** A crashed run is findable by hand:
 *  `select * from programs where program_key like 'admin-roster-%'`. */
const { mark: MARK } = runMarker("admin-roster");

const SLOTS = [
  "admin-member-roster-writes-admin",
  "admin-member-roster-writes-coach-a",
  "admin-member-roster-writes-player-b",
  "admin-member-roster-writes-stranger",
];

test.describe("admin member + roster writes (live)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(!HAVE_ENV, SKIP_REASON);

  let admin: SupabaseClient; // service role
  let adminSession: Session; // is_admin = true, member of nothing
  let coachA: Session; // coach on program A only
  let playerB: Session; // player on program B — the switch the writes target
  let stranger: Session; // not an admin, member of nothing

  let programA: string;
  let programB: string;

  const uploadEnabled = async (programId: string, userId: string) => {
    const row = await admin
      .from("program_members")
      .select("upload_enabled")
      .eq("program_id", programId)
      .eq("user_id", userId)
      .single();
    if (row.error) throw new Error(`program_members: ${row.error.message}`);
    return row.data.upload_enabled as boolean;
  };

  const playersOn = (programId: string) =>
    admin
      .from("program_players")
      .select("id, first_name, last_name, created_by")
      .eq("program_id", programId);

  const addedAudit = (programId: string) =>
    admin
      .from("program_audit_log")
      .select("actor_user_id, subject_id, details")
      .eq("program_id", programId)
      .eq("action", "player.added");

  const seedProgram = async (suffix: string) => {
    const prog = await admin
      .from("programs")
      .insert({
        program_key: `${MARK}-${suffix}`,
        school_group: `${MARK}-${suffix}`,
        school_name: `Admin Roster School ${suffix.toUpperCase()} ${MARK}`,
        team: "mens",
        status: "active",
        seats: 5,
      })
      .select("id")
      .single();
    if (prog.error) throw new Error(`program ${suffix}: ${prog.error.message}`);
    return prog.data.id as string;
  };

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    admin = createAdminClient();

    await clearPoolLeftovers(admin, SLOTS);
    const stale = await admin
      .from("programs")
      .select("id")
      .like("program_key", "admin-roster-%");
    if (stale.error) throw new Error(`programs sweep: ${stale.error.message}`);
    for (const { id } of (stale.data ?? []) as { id: string }[]) {
      await admin.from("program_audit_log").delete().eq("program_id", id);
      await admin.from("program_players").delete().eq("program_id", id);
      await admin.from("program_members").delete().eq("program_id", id);
      await admin.from("programs").delete().eq("id", id);
    }

    [adminSession, coachA, playerB, stranger] = await poolLogins(admin, SLOTS);

    const flip = await admin
      .from("users")
      .update({ is_admin: true })
      .eq("id", adminSession.userId);
    if (flip.error) throw new Error(`flip is_admin: ${flip.error.message}`);

    // Both ownerless on purpose: the admin, the stranger and — on B — the
    // coach of A hold no row on the program they write to, so a refusal is
    // the gate and nothing else.
    programA = await seedProgram("a");
    programB = await seedProgram("b");

    const members = await admin.from("program_members").insert([
      { program_id: programA, user_id: coachA.userId, role: "coach" },
      { program_id: programB, user_id: playerB.userId, role: "player" },
    ]);
    if (members.error) throw new Error(`members: ${members.error.message}`);
  });

  test.afterAll(async () => {
    if (!admin) return;
    const demoteError = await demotePoolAdmin(admin, adminSession);
    for (const id of [programA, programB]) {
      if (!id) continue;
      await admin.from("program_audit_log").delete().eq("program_id", id);
      await admin.from("program_players").delete().eq("program_id", id);
      await admin.from("program_members").delete().eq("program_id", id);
      await admin.from("programs").delete().eq("id", id);
    }
    if (demoteError) throw new Error(demoteError);
  });

  // ── 1. Admin, member of nothing, by p_program_id ──────────────────────────

  test("an admin who is not a member flips a member's upload switch on program B", async () => {
    expect(await uploadEnabled(programB, playerB.userId)).toBe(true);

    const result = await adminSession.client.rpc("set_member_upload_enabled", {
      p_program_id: programB,
      p_user_id: playerB.userId,
      p_enabled: false,
    });
    expect(result.error).toBeNull();
    expect(await uploadEnabled(programB, playerB.userId)).toBe(false);
  });

  test("an admin who is not a member adds a player to program B and the audit row says by_admin", async () => {
    const result = await adminSession.client.rpc("add_program_player", {
      p_program_id: programB,
      p_first_name: "Admin",
      p_last_name: `Added ${MARK}`,
    });
    expect(result.error).toBeNull();
    expect(typeof result.data).toBe("string");

    const players = await playersOn(programB);
    expect(players.data).toHaveLength(1);
    expect(players.data![0]).toMatchObject({
      id: result.data,
      first_name: "Admin",
      created_by: adminSession.userId,
    });

    const audit = await addedAudit(programB);
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0].actor_user_id).toBe(adminSession.userId);
    expect(audit.data![0].subject_id).toBe(result.data);
    expect((audit.data![0].details as { by_admin: boolean }).by_admin).toBe(
      true,
    );
  });

  // ── 2. Non-admin non-member ───────────────────────────────────────────────

  test("a non-admin non-member gets 42501 on both and nothing changes", async () => {
    const flip = await stranger.client.rpc("set_member_upload_enabled", {
      p_program_id: programB,
      p_user_id: playerB.userId,
      p_enabled: true,
    });
    expect(flip.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await uploadEnabled(programB, playerB.userId)).toBe(false);

    const add = await stranger.client.rpc("add_program_player", {
      p_program_id: programB,
      p_first_name: "Stranger",
      p_last_name: `Refused ${MARK}`,
    });
    expect(add.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const players = await playersOn(programB);
    expect(players.data).toHaveLength(1);
    const audit = await addedAudit(programB);
    expect(audit.data).toHaveLength(1);
  });

  // ── 3. Cross-tenant: a coach of A passing B's id ──────────────────────────

  test("a coach of program A cannot write to program B by passing B's id", async () => {
    const flip = await coachA.client.rpc("set_member_upload_enabled", {
      p_program_id: programB,
      p_user_id: playerB.userId,
      p_enabled: true,
    });
    expect(flip.error?.code).toBe(INSUFFICIENT_PRIVILEGE);
    expect(await uploadEnabled(programB, playerB.userId)).toBe(false);

    const add = await coachA.client.rpc("add_program_player", {
      p_program_id: programB,
      p_first_name: "Cross",
      p_last_name: `Tenant ${MARK}`,
    });
    expect(add.error?.code).toBe(INSUFFICIENT_PRIVILEGE);

    const players = await playersOn(programB);
    expect(players.data).toHaveLength(1);
    expect(players.data![0].created_by).toBe(adminSession.userId);
    const audit = await addedAudit(programB);
    expect(audit.data).toHaveLength(1);
  });

  test("the same coach still succeeds on their own program A, logged as by_admin: false", async () => {
    // Their own membership row is the only one on A, so it is the switch.
    const flip = await coachA.client.rpc("set_member_upload_enabled", {
      p_program_id: programA,
      p_user_id: coachA.userId,
      p_enabled: false,
    });
    expect(flip.error).toBeNull();
    expect(await uploadEnabled(programA, coachA.userId)).toBe(false);

    const add = await coachA.client.rpc("add_program_player", {
      p_program_id: programA,
      p_first_name: "Coach",
      p_last_name: `Added ${MARK}`,
    });
    expect(add.error).toBeNull();

    const players = await playersOn(programA);
    expect(players.data).toHaveLength(1);
    expect(players.data![0].created_by).toBe(coachA.userId);

    const audit = await addedAudit(programA);
    expect(audit.data).toHaveLength(1);
    expect(audit.data![0].actor_user_id).toBe(coachA.userId);
    expect((audit.data![0].details as { by_admin: boolean }).by_admin).toBe(
      false,
    );
  });
});
